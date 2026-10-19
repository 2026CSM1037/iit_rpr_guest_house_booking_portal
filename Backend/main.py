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
from fastapi import Depends, FastAPI, File, Form, Request, Response, UploadFile
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

# config
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


RATES = {
    "Executive Suite — Category-A": 0,
    "Executive Suite — Category-B": 3500,
    "Business Room — Category-A": 0,
    "Business Room — Category B-1": 2000,
    "Business Room — Category B-2": 1200,
}

# workflow
SUBMITTED = "Submitted"
BOOKED = "Booked"
REJECTED = "Rejected"
ON_HOLD = "On Hold"
STAGES = ("chairman", "warden", "dean")  # approval order
PENDING = {"chairman": "Pending at Chairman", "warden": "Pending at Warden", "dean": "Pending at Dean"}
NEXT_STATUS = {"chairman": PENDING["warden"], "warden": PENDING["dean"], "dean": BOOKED}
APPROVAL_COL = {"chairman": "Approved By Chairman", "warden": "Approved By Warden", "dean": "Approved By Dean"}

COLUMNS = [
    # form fields
    "Booking ID", "Submitted At", "Name", "Email", "Designation", "Department", "Employee Code",
    "Mobile", "Category", "Payment", "Purpose", "Project", "Rooms", "Approver Email",
    "Arrival", "Departure", "Nights", "Room Charges", "Guests (JSON)", "Primary ID Link", "Approval Doc Link",
    # workflow
    "Status", "Approved By Chairman", "Approved By Warden", "Approved By Dean",
    "Onsite Check-in", "Onsite Check-out", "Remarks",
]


def col_letter(i: int) -> str:
    s, i = "", i + 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


COL = {name: col_letter(i) for i, name in enumerate(COLUMNS)}


def parse_authorities(raw: str) -> dict:
    """'a@iitrpr.ac.in:chairman+warden+dean,b@iitrpr.ac.in:warden' -> {email: [roles]}"""
    out = {}
    for item in raw.split(","):
        item = item.strip().lower()
        if not item:
            continue
        email, _, roles = item.partition(":")
        role_list = [r for r in roles.split("+") if r in STAGES]
        if not role_list:
            raise RuntimeError(f"AUTHORITY_EMAILS entry '{item}' needs roles, e.g. {email}:chairman+warden")
        out[email] = role_list
    return out


AUTHORITIES = parse_authorities(
    os.getenv("AUTHORITY_EMAILS", "2026aim1020@iitrpr.ac.in:chairman+warden+dean"))
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


# Google helpers
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


# row helpers
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


def next_stage(r: dict) -> Optional[str]:
    for s in STAGES:
        if not r[APPROVAL_COL[s]]:
            return s
    return None


def stage_of(r: dict) -> Optional[str]:
    """Which authority role must act on this booking now (None = finished)."""
    st = r["Status"]
    if st in (SUBMITTED, PENDING["chairman"]):
        return "chairman"
    if st == PENDING["warden"]:
        return "warden"
    if st == PENDING["dean"]:
        return "dean"
    if st == ON_HOLD:
        return next_stage(r)
    return None


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
    if not staff:
        remarks = re.sub(r" \([^)]*@[^)]*\)", "", remarks)
    return {
        "bookingId": r["Booking ID"], "submittedAt": r["Submitted At"], "status": r["Status"],
        "stage": stage_of(r),
        "name": r["Name"], "email": r["Email"], "designation": r["Designation"], "department": r["Department"],
        "employeeCode": r["Employee Code"], "mobile": r["Mobile"], "category": r["Category"],
        "payment": r["Payment"], "purpose": r["Purpose"], "project": r["Project"], "rooms": r["Rooms"],
        "approverEmail": r["Approver Email"], "arrival": r["Arrival"], "departure": r["Departure"],
        "nights": _int(r["Nights"]), "roomCharges": _int(r["Room Charges"]), "guests": guests,
        "primaryIdLink": r["Primary ID Link"] if staff else "",
        "approvalDocLink": r["Approval Doc Link"] if staff else "",
        "approvals": {s: split_stamp(r[APPROVAL_COL[s]], staff) for s in STAGES},
        "checkIn": split_stamp(r["Onsite Check-in"], staff),
        "checkOut": split_stamp(r["Onsite Check-out"], staff),
        "remarks": remarks,
    }


# sessions + auth
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
    roles = AUTHORITIES.get(email)
    return {"name": name, "email": email, "roles": roles} if roles else None


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


#  user: bookings
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
        "Primary ID Link": primary_link, "Approval Doc Link": approval_link, "Status": SUBMITTED,
    }
    # RAW (not USER_ENTERED) so text typed by users can never run as a spreadsheet formula
    sheets().spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID, range=f"'{SHEET_NAME}'!A:A", valueInputOption="RAW",
        insertDataOption="INSERT_ROWS", body={"values": [[values.get(c, "") for c in COLUMNS]]},
    ).execute()
    return {"bookingId": booking_id, "status": SUBMITTED, "submittedAt": values["Submitted At"],
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


# authority: chairman -> warden -> dean
class DecisionIn(BaseModel):
    decision: str  # approve | reject | hold | resume
    remarks: str = ""


@app.get("/authority/bookings")
def authority_bookings(scope: str = "mine", authority: dict = Depends(current_authority)):
    """scope=mine: waiting for one of my roles. scope=all: every booking (read-only unless canAct)."""
    roles = authority["roles"]
    out = []
    for r in reversed(read_rows()):
        can_act = stage_of(r) in roles
        if scope == "mine" and not can_act:
            continue
        item = to_api(r, True)
        item["canAct"] = can_act
        out.append(item)
    return {"bookings": out}


@app.post("/authority/bookings/{booking_id}/decision")
def authority_decide(booking_id: str, body: DecisionIn, authority: dict = Depends(current_authority)):
    if body.decision not in ("approve", "reject", "hold", "resume"):
        raise ApiError("INVALID_INPUT", 422)
    r = find_row(booking_id)
    stage = stage_of(r)
    if stage is None:
        raise ApiError("ALREADY_DECIDED", 409)  # Booked or Rejected
    if stage not in authority["roles"]:
        raise ApiError("NOT_AUTHORIZED", 403)
    text = body.remarks.strip()
    on_hold = r["Status"] == ON_HOLD
    updates = {}

    if body.decision == "resume":
        if not on_hold:
            raise ApiError("INVALID_STATE", 409)
        updates["Status"] = PENDING[stage]
    else:
        if on_hold:
            raise ApiError("INVALID_STATE", 409)  # resume first
        if body.decision == "approve":
            updates[APPROVAL_COL[stage]] = stamp(authority["email"])
            updates["Status"] = NEXT_STATUS[stage]
        else:  # reject | hold need a reason
            if not text:
                raise ApiError("REMARKS_REQUIRED", 422)
            updates["Status"] = REJECTED if body.decision == "reject" else ON_HOLD

    updates["Remarks"] = add_remark(r["Remarks"], remark_line(stage.capitalize(), authority["email"],
                                                              body.decision, text))
    update_cells(r["_row"], updates)
    return {"bookingId": booking_id, "status": updates["Status"]}


# receptionist: on-site check-in / out
@app.get("/receptionist/bookings")
def receptionist_bookings(scope: str = "active", receptionist: dict = Depends(current_receptionist)):
    """Only fully approved (Booked) requests. scope=active hides ones already checked out."""
    rows = [r for r in read_rows() if r["Status"] == BOOKED]
    if scope == "active":
        rows = [r for r in rows if not r["Onsite Check-out"]]
    return {"bookings": [to_api(r, True) for r in reversed(rows)]}


@app.post("/receptionist/bookings/{booking_id}/checkin")
def receptionist_checkin(booking_id: str, receptionist: dict = Depends(current_receptionist)):
    r = find_row(booking_id)
    if r["Status"] != BOOKED:
        raise ApiError("INVALID_STATE", 409)
    if r["Onsite Check-in"]:
        raise ApiError("ALREADY_DONE", 409)
    update_cells(r["_row"], {
        "Onsite Check-in": stamp(receptionist["email"]),
        "Remarks": add_remark(r["Remarks"], remark_line("Reception", receptionist["email"], "check-in")),
    })
    return {"bookingId": booking_id, "checkedIn": True}


@app.post("/receptionist/bookings/{booking_id}/checkout")
def receptionist_checkout(booking_id: str, receptionist: dict = Depends(current_receptionist)):
    r = find_row(booking_id)
    if r["Status"] != BOOKED or not r["Onsite Check-in"]:
        raise ApiError("INVALID_STATE", 409)
    if r["Onsite Check-out"]:
        raise ApiError("ALREADY_DONE", 409)
    update_cells(r["_row"], {
        "Onsite Check-out": stamp(receptionist["email"]),
        "Remarks": add_remark(r["Remarks"], remark_line("Reception", receptionist["email"], "check-out")),
    })
    return {"bookingId": booking_id, "checkedOut": True}
