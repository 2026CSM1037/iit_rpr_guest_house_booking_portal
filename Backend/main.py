"""
IIT Ropar Guest House Booking Portal - backend (FastAPI)

Three separate roles, each with its own Google sign-in, cookie and endpoints:
  user          /user/auth/*    booking form, own bookings
  authority     /auth/*         fixed list of admins (admins.py); every request goes to the first admin, who can
                                accept / reject / hold / forward it to any other admin; any admin may accept
  receptionist  /receptionist/* on-site check-in / check-out, PDF bill, payment status

Google Sheet tab = one row per booking. Files go to Drive, links go in the row.


"""
import io
import json
import math
import os
import re
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel

load_dotenv()

from admins import DEMO_ADMINS, OFFICIAL_ADMINS  # noqa: E402
from bill import build_bill_pdf  # noqa: E402
from mailer import send_mail  # noqa: E402

# ================================================================ config
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "")
DRIVE_FOLDER_ID = os.getenv("DRIVE_FOLDER_ID") or None
SHEET_NAME = os.getenv("SHEET_NAME", "Bookings")
SECRET_KEY = os.getenv("SECRET_KEY", "")
FRONTEND_ORIGINS = [o.strip() for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",") if o.strip()]
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE") or os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE") or "credentials.json"

ALLOWED_DOMAIN = "@iitrpr.ac.in"
SESSION_SECONDS = 8 * 3600
USER_COOKIE, AUTHORITY_COOKIE, RECEPTIONIST_COOKIE = "gh_user", "gh_authority", "gh_receptionist"

MAX_FILE_BYTES = 5 * 1024 * 1024
ALLOWED_FILES = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
MAGIC = {".pdf": b"%PDF", ".jpg": b"\xff\xd8", ".jpeg": b"\xff\xd8", ".png": b"\x89PNG"}

# Keyed by the category label before the " (" (matches CATEGORIES in Frontend/app/user/book/page.tsx).
# Prices are decided here, never by the browser.
RATES = {
    "Executive Suite — Category-A": 0,
    "Executive Suite — Category-B": 3500,
    "Business Room — Category-A": 0,
    "Business Room — Category B-1": 2000,
    "Business Room — Category B-2": 1200,
}

# ---- workflow --------------------------------------------------------------
PENDING = "Pending Approval"  # waiting for the admin named in 'Current Approver'
BOOKED = "Booked"            # any admin accepted
REJECTED = "Rejected"
ON_HOLD = "On Hold"
CANCELLED = "Cancelled"      # cancelled by the applicant
PAYMENT_PENDING, PAID = "Pending", "Paid"  # 'Payment Status' column, set at check-out / by the receptionist
OPEN_STATES = (PENDING, ON_HOLD)  # still inside the approval chain

COLUMNS = [
    # form fields
    "Booking ID", "Submitted At", "Name", "Email", "Designation", "Department", "Employee Code",
    "Mobile", "Category", "Payment", "Purpose", "Project", "Rooms", "Approver Email",
    "Arrival", "Departure", "Nights", "Room Charges", "Guests (JSON)", "Primary ID Link", "Approval Doc Link",
    # workflow
    "Status", "Current Approver", "Approval Trail (JSON)", "Approved By",
    "Onsite Check-in", "Onsite Check-out", "Bill Link", "Payment Status", "Payment Note",
    "Cancelled At", "Remarks",
]


def col_letter(i: int) -> str:
    s, i = "", i + 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


COL = {name: col_letter(i) for i, name in enumerate(COLUMNS)}


# Admins = demo admins + the official list in admins.py (+ optional EXTRA_ADMIN_EMAILS in .env). Order is kept for the dropdown.
_extra = [e.strip().lower() for e in os.getenv("EXTRA_ADMIN_EMAILS", "").split(",") if e.strip()]
ADMINS = list(dict.fromkeys(DEMO_ADMINS + OFFICIAL_ADMINS + _extra))
FIRST_ADMIN = (os.getenv("FIRST_ADMIN_EMAIL") or DEMO_ADMINS[0]).strip().lower()  # receives every new request
if FIRST_ADMIN not in ADMINS:
    raise RuntimeError("FIRST_ADMIN_EMAIL must be one of the admins")
RECEPTIONISTS = {e.strip().lower() for e in os.getenv("RECEPTIONIST_EMAILS", "2026aim1020@iitrpr.ac.in").split(",")
                 if e.strip()}

missing = [k for k, v in {"GOOGLE_CLIENT_ID": GOOGLE_CLIENT_ID, "SPREADSHEET_ID": SPREADSHEET_ID,
                          "SECRET_KEY": SECRET_KEY}.items() if not v]
if missing:
    raise RuntimeError(f"Missing environment variables: {', '.join(missing)} (see .env.example)")

serializer = URLSafeTimedSerializer(SECRET_KEY, salt="gh-session")


class ApiError(Exception):
    def __init__(self, code: str, status: int):
        self.code, self.status = code, status


# ================================================================ Google helpers
_creds_cache = {}


def _creds(scope: str) -> Credentials:
    if scope not in _creds_cache:
        _creds_cache[scope] = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=[scope])
    return _creds_cache[scope]


def sheets():
    return build("sheets", "v4", credentials=_creds("https://www.googleapis.com/auth/spreadsheets"),
                 cache_discovery=False)


def drive():
    return build("drive", "v3", credentials=_creds("https://www.googleapis.com/auth/drive"),
                 cache_discovery=False)


def ensure_sheet():
    """Create the tab + header row if missing. Never overwrites a tab that already holds data."""
    svc = sheets().spreadsheets()
    meta = svc.get(spreadsheetId=SPREADSHEET_ID, fields="sheets.properties.title").execute()
    titles = [s["properties"]["title"] for s in meta.get("sheets", [])]
    if SHEET_NAME not in titles:
        svc.batchUpdate(spreadsheetId=SPREADSHEET_ID,
                        body={"requests": [{"addSheet": {"properties": {"title": SHEET_NAME}}}]}).execute()
    head = svc.values().get(spreadsheetId=SPREADSHEET_ID, range=f"'{SHEET_NAME}'!1:2").execute().get("values", [])
    if not head or (len(head) == 1 and head[0] != COLUMNS):
        svc.values().update(spreadsheetId=SPREADSHEET_ID, range=f"'{SHEET_NAME}'!A1", valueInputOption="RAW",
                            body={"values": [COLUMNS]}).execute()
    elif head[0] != COLUMNS:
        print(f"WARNING: tab '{SHEET_NAME}' has data under a different header. "
              f"Set SHEET_NAME in .env to a new tab name.")


def read_rows() -> List[dict]:
    res = sheets().spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID, range=f"'{SHEET_NAME}'!A:{col_letter(len(COLUMNS) - 1)}").execute()
    rows = []
    for i, row in enumerate(res.get("values", [])[1:], start=2):
        row = row + [""] * (len(COLUMNS) - len(row))
        rec = dict(zip(COLUMNS, row))
        rec["_row"] = i
        rows.append(rec)
    return rows


def find_row(booking_id: str) -> dict:
    for r in read_rows():
        if r["Booking ID"] == booking_id:
            return r
    raise ApiError("NOT_FOUND", 404)


def update_cells(row_num: int, updates: dict):
    data = [{"range": f"'{SHEET_NAME}'!{COL[name]}{row_num}", "values": [[value]]} for name, value in updates.items()]
    sheets().spreadsheets().values().batchUpdate(
        spreadsheetId=SPREADSHEET_ID, body={"valueInputOption": "RAW", "data": data}).execute()


def upload_to_drive(name: str, data: bytes, mimetype: str) -> str:
    meta = {"name": name}
    if DRIVE_FOLDER_ID:
        meta["parents"] = [DRIVE_FOLDER_ID]
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=mimetype, resumable=False)
    f = drive().files().create(body=meta, media_body=media, fields="id, webViewLink",
                               supportsAllDrives=True).execute()
    return f["webViewLink"]


def read_upload(upload: UploadFile):
    """Validate extension, size and file signature -> (ext, mimetype, bytes)."""
    ext = os.path.splitext((upload.filename or "").lower())[1]
    if ext not in ALLOWED_FILES:
        raise ApiError("INVALID_FILE_TYPE", 422)
    data = upload.file.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise ApiError("FILE_TOO_LARGE", 413)
    if not data.startswith(MAGIC[ext]):
        raise ApiError("INVALID_FILE_TYPE", 422)
    return ext, ALLOWED_FILES[ext], data


# ================================================================ row helpers
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def stamp(email: str) -> str:
    return f"{email} @ {now_iso()}"


def split_stamp(cell: str, show_by: bool):
    if not cell:
        return None
    by, _, at = cell.partition(" @ ")
    return {"by": by, "at": at} if show_by else {"at": at}


def remark_line(role: str, email: str, action: str, text: str = "") -> str:
    return f"[{now_iso()}] {role} ({email}): {action}" + (f" - {text}" if text else "")


def add_remark(old: str, line: str) -> str:
    return f"{old}\n{line}" if old else line


def trail_of(r: dict) -> list:
    try:
        return json.loads(r["Approval Trail (JSON)"] or "[]")
    except ValueError:
        return []


def trail_add(r: dict, by: str, action: str, to: str = "", text: str = "") -> str:
    """New value for the 'Approval Trail (JSON)' cell: who did what, in order (forward chain, hold, approve ...)."""
    return json.dumps(trail_of(r) + [{"by": by, "action": action, "to": to, "at": now_iso(), "remarks": text}],
                      ensure_ascii=False)


def notify(bg: BackgroundTasks, to, subject: str, intro: str, r: dict, attachment=None):
    """Queue an e-mail (sent after the response, failures are only logged)."""
    body = (f"{intro}\n\nBooking ID: {r['Booking ID']}\nApplicant: {r['Name']} ({r['Email']})\n"
            f"Category: {r['Category']}, rooms: {r['Rooms']}\nStay: {r['Arrival']} to {r['Departure']} "
            f"({r['Nights']} night(s))\nPurpose: {r['Purpose']}\n\n-- IIT Ropar Guest House Booking Portal")
    bg.add_task(send_mail, list(to), subject, body, attachment)


def _int(v, default=0):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def to_api(r: dict, staff: bool) -> dict:
    """staff=False hides approver identities and e-mails inside remarks (used for the applicant)."""
    try:
        guests = json.loads(r["Guests (JSON)"] or "[]")
    except ValueError:
        guests = []
    remarks = r["Remarks"]
    trail = trail_of(r)
    if not staff:  # applicant never sees admin e-mails
        remarks = re.sub(r" -> \S+@\S+", "", re.sub(r" \([^)]*@[^)]*\)", "", remarks))
        trail = [{"action": t.get("action", ""), "at": t.get("at", ""), "remarks": t.get("remarks", "")} for t in trail]
    return {
        "bookingId": r["Booking ID"], "submittedAt": r["Submitted At"], "status": r["Status"],
        "name": r["Name"], "email": r["Email"], "designation": r["Designation"], "department": r["Department"],
        "employeeCode": r["Employee Code"], "mobile": r["Mobile"], "category": r["Category"],
        "payment": r["Payment"], "purpose": r["Purpose"], "project": r["Project"], "rooms": r["Rooms"],
        "approverEmail": r["Approver Email"], "arrival": r["Arrival"], "departure": r["Departure"],
        "nights": _int(r["Nights"]), "roomCharges": _int(r["Room Charges"]), "guests": guests,
        "primaryIdLink": r["Primary ID Link"] if staff else "",
        "approvalDocLink": r["Approval Doc Link"] if staff else "",
        "currentApprover": r["Current Approver"] if staff else "",
        "trail": trail,
        "approvedBy": split_stamp(r["Approved By"], staff),
        "checkIn": split_stamp(r["Onsite Check-in"], staff),
        "checkOut": split_stamp(r["Onsite Check-out"], staff),
        "paymentStatus": r["Payment Status"], "paymentNote": r["Payment Note"] if staff else "",
        "billLink": r["Bill Link"] if staff else "",
        "cancelledAt": r["Cancelled At"],
        "canCancel": r["Status"] in (PENDING, ON_HOLD, BOOKED) and not r["Onsite Check-in"],
        "remarks": remarks,
    }


# ================================================================ sessions + auth
def set_session(resp: Response, cookie: str, payload: dict):
    resp.set_cookie(cookie, serializer.dumps(payload), max_age=SESSION_SECONDS, httponly=True,
                    samesite="lax", secure=COOKIE_SECURE, path="/")


def read_session(request: Request, cookie: str) -> dict:
    token = request.cookies.get(cookie)
    if not token:
        raise ApiError("UNAUTHENTICATED", 401)
    try:
        return serializer.loads(token, max_age=SESSION_SECONDS)
    except BadSignature:
        raise ApiError("UNAUTHENTICATED", 401)


def verify_google(credential: str):
    try:
        info = id_token.verify_oauth2_token(credential, google_requests.Request(), GOOGLE_CLIENT_ID,
                                            clock_skew_in_seconds=10)
    except ValueError:
        raise ApiError("INVALID_TOKEN", 401)
    email = (info.get("email") or "").lower()
    if not info.get("email_verified") or not email.endswith(ALLOWED_DOMAIN):
        raise ApiError("NOT_AUTHORIZED", 403)
    return email, info.get("name") or email.split("@")[0]


def user_profile(email: str, name: str):
    return {"name": name, "email": email}


def authority_profile(email: str, name: str):
    return {"name": name, "email": email, "isFirst": email == FIRST_ADMIN} if email in ADMINS else None


def receptionist_profile(email: str, name: str):
    return {"name": name, "email": email} if email in RECEPTIONISTS else None


@asynccontextmanager
async def lifespan(_app):
    try:
        ensure_sheet()
    except Exception as exc:  # server still starts; the first request will show the real error
        print("WARNING: could not prepare the Google Sheet:", repr(exc))
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=FRONTEND_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(ApiError)
async def api_error_handler(_request, exc: ApiError):
    return JSONResponse({"code": exc.code}, status_code=exc.status)


class CredentialIn(BaseModel):
    credential: str


def make_auth(prefix: str, cookie: str, key: str, profile_fn):
    """Registers POST {prefix}/google, GET {prefix}/me, POST {prefix}/logout and returns the guard dependency."""

    def guard(request: Request):
        s = read_session(request, cookie)
        profile = profile_fn(s["email"], s["name"])  # re-checked every request: removing an id revokes access
        if not profile:
            raise ApiError("NOT_AUTHORIZED", 403)
        return profile

    @app.post(f"{prefix}/google", name=f"{key}_login")
    def login(body: CredentialIn):
        email, name = verify_google(body.credential)
        profile = profile_fn(email, name)
        if not profile:
            raise ApiError("NOT_AUTHORIZED", 403)
        resp = JSONResponse({key: profile})
        set_session(resp, cookie, {"email": email, "name": name})
        return resp

    @app.get(f"{prefix}/me", name=f"{key}_me")
    def me(profile: dict = Depends(guard)):
        return {key: profile}

    @app.post(f"{prefix}/logout", name=f"{key}_logout")
    def logout():
        resp = Response(status_code=204)
        resp.delete_cookie(cookie, path="/")
        return resp

    return guard


current_user = make_auth("/user/auth", USER_COOKIE, "user", user_profile)
current_authority = make_auth("/auth", AUTHORITY_COOKIE, "authority", authority_profile)  # path the frontend already uses
current_receptionist = make_auth("/receptionist/auth", RECEPTIONIST_COOKIE, "receptionist", receptionist_profile)


@app.get("/health")
def health():
    return {"ok": True}


# ================================================================ user: bookings
class Guest(BaseModel):
    name: str = ""
    gender: str = ""
    age: str = ""
    relation: str = ""
    idType: str = ""
    idNumber: str = ""
    arrival: str = ""
    departure: str = ""


class BookingIn(BaseModel):
    name: str = ""
    designation: str = ""
    department: str = ""
    employeeCode: str = ""
    mobile: str = ""
    category: str = ""
    payment: str = ""
    purpose: str = ""
    project: str = ""
    rooms: str = "1"
    approverEmail: str = ""
    guests: List[Guest] = []
    agreed: bool = False


def _dt(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise ApiError("INVALID_INPUT", 422)


def _dump(model: BaseModel) -> dict:
    return model.model_dump() if hasattr(model, "model_dump") else model.dict()


@app.post("/bookings")
def create_booking(
    background: BackgroundTasks,
    data: str = Form(...),
    primary_id_file: UploadFile = File(...),
    approval_file: Optional[UploadFile] = File(None),
    user: dict = Depends(current_user),
):
    """multipart/form-data: `data` = JSON of the booking form + the file(s)."""
    try:
        b = BookingIn(**json.loads(data))
    except (ValueError, TypeError):
        raise ApiError("INVALID_INPUT", 422)

    required = [b.name, b.designation, b.department, b.employeeCode, b.mobile, b.category, b.payment, b.purpose]
    rate = RATES.get(b.category.split(" (")[0].strip())
    rooms = _int(b.rooms)
    if not all(x.strip() for x in required) or not b.agreed or rate is None:
        raise ApiError("INVALID_INPUT", 422)
    if b.approverEmail and not b.approverEmail.lower().endswith(ALLOWED_DOMAIN):
        raise ApiError("INVALID_INPUT", 422)
    if not 1 <= rooms <= 10 or not 1 <= len(b.guests) <= 4:
        raise ApiError("INVALID_INPUT", 422)
    for g in b.guests:
        if not all([g.name.strip(), g.gender, g.age, g.relation, g.arrival, g.departure]):
            raise ApiError("INVALID_INPUT", 422)
        if _dt(g.departure) <= _dt(g.arrival):
            raise ApiError("INVALID_INPUT", 422)

    first = b.guests[0]
    nights = max(1, math.ceil((_dt(first.departure) - _dt(first.arrival)).total_seconds() / 86400))
    charges = rate * nights * rooms

    # validate every file before uploading anything
    pid_ext, pid_mime, pid_data = read_upload(primary_id_file)
    appr = read_upload(approval_file) if approval_file and approval_file.filename else None

    booking_id = f"GH{datetime.now().year}{secrets.randbelow(10 ** 6):06d}"
    primary_link = upload_to_drive(f"{booking_id}_primary_id{pid_ext}", pid_data, pid_mime)
    approval_link = upload_to_drive(f"{booking_id}_approval{appr[0]}", appr[2], appr[1]) if appr else ""

    values = {
        "Booking ID": booking_id, "Submitted At": now_iso(), "Name": b.name.strip(), "Email": user["email"],
        "Designation": b.designation, "Department": b.department, "Employee Code": b.employeeCode,
        "Mobile": b.mobile, "Category": b.category, "Payment": b.payment, "Purpose": b.purpose,
        "Project": b.project, "Rooms": rooms, "Approver Email": b.approverEmail,
        "Arrival": first.arrival, "Departure": first.departure, "Nights": nights, "Room Charges": charges,
        "Guests (JSON)": json.dumps([_dump(g) for g in b.guests], ensure_ascii=False),
        "Primary ID Link": primary_link, "Approval Doc Link": approval_link,
        "Status": PENDING, "Current Approver": FIRST_ADMIN,
    }
    # RAW (not USER_ENTERED) so text typed by users can never run as a spreadsheet formula
    sheets().spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID, range=f"'{SHEET_NAME}'!A:A", valueInputOption="RAW",
        insertDataOption="INSERT_ROWS", body={"values": [[values.get(c, "") for c in COLUMNS]]},
    ).execute()
    notify(background, [user["email"]], f"Booking {booking_id} submitted",
           "Your guest house request was submitted and is waiting for approval. We will e-mail you at every update.",
           values)
    notify(background, [FIRST_ADMIN], f"Action needed: guest house request {booking_id}",
           "A new guest house request is waiting for you. Sign in to the Authority Portal to accept, reject, "
           "hold or forward it.", values)
    return {"bookingId": booking_id, "status": PENDING, "submittedAt": values["Submitted At"],
            "nights": nights, "roomCharges": charges}


@app.get("/user/bookings")
def my_bookings(user: dict = Depends(current_user)):
    rows = [r for r in read_rows() if r["Email"].lower() == user["email"]]
    return {"bookings": [to_api(r, False) for r in reversed(rows)]}


@app.get("/user/bookings/{booking_id}")
def my_booking(booking_id: str, user: dict = Depends(current_user)):
    r = find_row(booking_id)
    if r["Email"].lower() != user["email"]:
        raise ApiError("NOT_FOUND", 404)
    return {"booking": to_api(r, False)}


class CancelIn(BaseModel):
    reason: str = ""


@app.post("/user/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: str, body: CancelIn, background: BackgroundTasks, user: dict = Depends(current_user)):
    """Applicant cancels while the request is pending / on hold / booked (not after check-in)."""
    r = find_row(booking_id)
    if r["Email"].lower() != user["email"]:
        raise ApiError("NOT_FOUND", 404)
    if r["Status"] not in (PENDING, ON_HOLD, BOOKED) or r["Onsite Check-in"]:
        raise ApiError("INVALID_STATE", 409)
    reason = body.reason.strip()
    update_cells(r["_row"], {
        "Status": CANCELLED, "Current Approver": "", "Cancelled At": now_iso(),
        "Approval Trail (JSON)": trail_add(r, user["email"], "cancel", text=reason),
        "Remarks": add_remark(r["Remarks"], remark_line("Applicant", user["email"], "cancelled", reason)),
    })
    admins = {FIRST_ADMIN, r["Current Approver"].lower(), r["Approved By"].partition(" @ ")[0].lower()} - {""}
    why = f"\nReason: {reason}" if reason else ""
    notify(background, [user["email"]], f"Booking {booking_id} cancelled",
           f"Your booking request was cancelled as requested.{why}", r)
    notify(background, admins, f"Cancelled by applicant: {booking_id}",
           f"The applicant cancelled this request (it was: {r['Status']}).{why}", r)
    return {"bookingId": booking_id, "status": CANCELLED}


# ================================================================ authority: first admin -> forward chain -> booked
class DecisionIn(BaseModel):
    decision: str  # approve | reject | hold | resume | forward
    remarks: str = ""
    forwardTo: str = ""  # admin e-mail, only for decision=forward


@app.get("/authority/admins")
def authority_admins(authority: dict = Depends(current_authority)):
    """Dropdown list for 'Forward': every official admin except me."""
    return {"admins": [a for a in ADMINS if a != authority["email"]]}


@app.get("/authority/bookings")
def authority_bookings(scope: str = "mine", authority: dict = Depends(current_authority)):
    """scope=mine: currently with me. history: I acted on it / it was forwarded to me. all: first admin only."""
    me = authority["email"]
    if scope == "all" and me != FIRST_ADMIN:
        raise ApiError("NOT_AUTHORIZED", 403)
    out = []
    for r in reversed(read_rows()):
        mine = r["Current Approver"].lower() == me and r["Status"] in OPEN_STATES
        if scope == "mine" and not mine:
            continue
        if scope == "history" and not any(me in (t.get("by"), t.get("to")) for t in trail_of(r)):
            continue
        item = to_api(r, True)
        item["canAct"] = mine
        out.append(item)
    return {"bookings": out}


@app.post("/authority/bookings/{booking_id}/decision")
def authority_decide(booking_id: str, body: DecisionIn, background: BackgroundTasks,
                     authority: dict = Depends(current_authority)):
    d, me = body.decision, authority["email"]
    if d not in ("approve", "reject", "hold", "resume", "forward"):
        raise ApiError("INVALID_INPUT", 422)
    r = find_row(booking_id)
    if r["Status"] not in OPEN_STATES:
        raise ApiError("ALREADY_DECIDED", 409)  # Booked / Rejected / Cancelled
    if r["Current Approver"].lower() != me:
        raise ApiError("NOT_AUTHORIZED", 403)  # only the admin the request is currently with can act
    text = body.remarks.strip()
    on_hold = r["Status"] == ON_HOLD
    if (d == "resume" and not on_hold) or (on_hold and d not in ("resume", "forward")):
        raise ApiError("INVALID_STATE", 409)
    if d in ("reject", "hold") and not text:
        raise ApiError("REMARKS_REQUIRED", 422)
    target = ""
    if d == "forward":
        target = body.forwardTo.strip().lower()
        if target not in ADMINS or target == me:
            raise ApiError("INVALID_INPUT", 422)

    status = {"approve": BOOKED, "reject": REJECTED, "hold": ON_HOLD, "resume": PENDING, "forward": PENDING}[d]
    updates = {
        "Status": status,
        "Approval Trail (JSON)": trail_add(r, me, d, target, text),
        "Remarks": add_remark(r["Remarks"], remark_line("Admin", me, d + (f" -> {target}" if target else ""), text)),
    }
    if d == "forward":
        updates["Current Approver"] = target
    elif d in ("approve", "reject"):
        updates["Current Approver"] = ""
        if d == "approve":
            updates["Approved By"] = stamp(me)
    update_cells(r["_row"], updates)

    # ---- e-mails: user hears about every update; the first admin about the outcome; a forward target when forwarded
    why = f"\nRemarks: {text}" if text else ""
    first = [FIRST_ADMIN] if FIRST_ADMIN != me else []
    if d == "forward":
        notify(background, [target], f"Action needed: guest house request {booking_id}",
               f"{me} forwarded this request to you for approval.{why}", r)
        notify(background, [r["Email"]], f"Booking {booking_id}: forwarded for approval",
               f"Your request was forwarded to {target} for approval.", r)
    elif d == "approve":
        notify(background, [r["Email"]] + first, f"Booking {booking_id} approved",
               "The request was approved and the booking is confirmed." + why, r)
    elif d == "reject":
        notify(background, [r["Email"]] + first, f"Booking {booking_id} rejected",
               "Unfortunately the request was rejected." + why, r)
    elif d == "hold":
        notify(background, [r["Email"]], f"Booking {booking_id} put on hold",
               "Your request is on hold for now." + why, r)
    else:  # resume
        notify(background, [r["Email"]], f"Booking {booking_id}: approval resumed",
               "Your request is back in the approval queue.", r)
    return {"bookingId": booking_id, "status": status}


# ================================================================ receptionist: on-site check-in / out
@app.get("/receptionist/bookings")
def receptionist_bookings(scope: str = "active", receptionist: dict = Depends(current_receptionist)):
    """Only fully approved (Booked) requests. scope=active hides stays that are checked out AND paid."""
    rows = [r for r in read_rows() if r["Status"] == BOOKED]
    if scope == "active":
        rows = [r for r in rows if not (r["Onsite Check-out"] and r["Payment Status"] == PAID)]
    return {"bookings": [to_api(r, True) for r in reversed(rows)]}


@app.post("/receptionist/bookings/{booking_id}/checkin")
def receptionist_checkin(booking_id: str, background: BackgroundTasks,
                         receptionist: dict = Depends(current_receptionist)):
    r = find_row(booking_id)
    if r["Status"] != BOOKED:
        raise ApiError("INVALID_STATE", 409)
    if r["Onsite Check-in"]:
        raise ApiError("ALREADY_DONE", 409)
    update_cells(r["_row"], {
        "Onsite Check-in": stamp(receptionist["email"]),
        "Remarks": add_remark(r["Remarks"], remark_line("Reception", receptionist["email"], "check-in")),
    })
    notify(background, [r["Email"]], f"Booking {booking_id}: checked in",
           "Your guest(s) have checked in at the Guest House.", r)
    return {"bookingId": booking_id, "checkedIn": True}


@app.post("/receptionist/bookings/{booking_id}/checkout")
def receptionist_checkout(booking_id: str, background: BackgroundTasks,
                          receptionist: dict = Depends(current_receptionist)):
    """Check-out: builds the PDF bill, stores it in Drive, e-mails it to the applicant. Payment is marked separately."""
    r = find_row(booking_id)
    if r["Status"] != BOOKED or not r["Onsite Check-in"]:
        raise ApiError("INVALID_STATE", 409)
    if r["Onsite Check-out"]:
        raise ApiError("ALREADY_DONE", 409)
    out_stamp = stamp(receptionist["email"])
    pdf = build_bill_pdf({**r, "Onsite Check-out": out_stamp})
    bill_name = f"{booking_id}_bill.pdf"
    try:
        bill_link = upload_to_drive(bill_name, pdf, "application/pdf")
    except Exception as exc:  # the bill can still be e-mailed / re-downloaded
        print("WARNING: could not store the bill in Drive:", repr(exc))
        bill_link = ""
    update_cells(r["_row"], {
        "Onsite Check-out": out_stamp, "Bill Link": bill_link, "Payment Status": PAYMENT_PENDING,
        "Remarks": add_remark(r["Remarks"], remark_line("Reception", receptionist["email"], "check-out, bill generated")),
    })
    notify(background, [r["Email"]], f"Booking {booking_id}: your bill",
           f"Thank you for staying with us. Your bill (Rs. {_int(r['Room Charges']):,}) is attached. "
           "Payment is collected at the Guest House reception.", r, (bill_name, pdf, "application/pdf"))
    return {"bookingId": booking_id, "checkedOut": True, "billLink": bill_link}


@app.get("/receptionist/bookings/{booking_id}/bill")
def receptionist_bill(booking_id: str, receptionist: dict = Depends(current_receptionist)):
    """Re-download the bill PDF of a checked-out stay."""
    r = find_row(booking_id)
    if not r["Onsite Check-out"]:
        raise ApiError("INVALID_STATE", 409)
    return Response(build_bill_pdf(r), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{booking_id}_bill.pdf"'})


class PaymentIn(BaseModel):
    note: str = ""  # e.g. mode / receipt no. - there is no online payment, the receptionist just records it


@app.post("/receptionist/bookings/{booking_id}/payment")
def receptionist_payment(booking_id: str, body: PaymentIn, background: BackgroundTasks,
                         receptionist: dict = Depends(current_receptionist)):
    """Receptionist marks the bill as paid (after collecting payment at the desk)."""
    r = find_row(booking_id)
    if r["Status"] != BOOKED or not r["Onsite Check-out"]:
        raise ApiError("INVALID_STATE", 409)
    if r["Payment Status"] == PAID:
        raise ApiError("ALREADY_DONE", 409)
    note = body.note.strip()
    update_cells(r["_row"], {
        "Payment Status": PAID, "Payment Note": f"{note} | {stamp(receptionist['email'])}" if note else stamp(receptionist["email"]),
        "Remarks": add_remark(r["Remarks"], remark_line("Reception", receptionist["email"], "payment received", note)),
    })
    notify(background, [r["Email"]], f"Booking {booking_id}: payment received",
           "We have recorded your payment. Thank you!", r)
    return {"bookingId": booking_id, "paymentStatus": PAID}
