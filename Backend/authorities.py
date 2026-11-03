"""Authority (admin) list kept in the 'Admins' sheet tab. Seeded once from admins.py; the first admin edits it in the portal."""
import re
import time
from datetime import datetime, timezone
from typing import Dict, List

from tabs import ApiError, append_tab, ensure_tab, read_tab, update_tab

TAB = "Admins"
COLS = ["Email", "Name", "Added By", "Added At", "Active"]
EMAIL_RE = re.compile(r"^[a-z0-9._%+-]+@iitrpr\.ac\.in$")
_TTL = 30  # seconds the active list is cached (checked on every authority request)
_cache: Dict[str, object] = {"at": 0.0, "emails": None}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure(seed_emails: List[str]) -> None:
    ensure_tab(TAB, COLS, seed=[[e, "", "system", _now(), "Yes"] for e in seed_emails])


def invalidate() -> None:
    _cache["at"] = 0.0


def active_admins(fallback: List[str]) -> List[str]:
    """Emails of active authorities (cached). Falls back to the last good list / `fallback` if Sheets is unreachable."""
    if _cache["emails"] is not None and time.time() - float(_cache["at"]) < _TTL:
        return _cache["emails"]  # type: ignore[return-value]
    try:
        emails = [r["Email"].strip().lower() for r in read_tab(TAB, COLS)
                  if r["Email"].strip() and r["Active"].strip().lower() != "no"]
        _cache["emails"], _cache["at"] = emails, time.time()
        return emails
    except Exception as exc:
        print("WARNING: could not read the Admins tab:", repr(exc))
        return _cache["emails"] or fallback  # type: ignore[return-value]


def search(q: str, exclude: str, fallback: List[str], limit: int = 10) -> List[dict]:
    q = q.strip().lower()
    if not q:
        return []  # the list is never shown in full - the user must type
    names = {}
    try:
        names = {r["Email"].strip().lower(): r["Name"] for r in read_tab(TAB, COLS)}
    except Exception:
        pass
    hits = [e for e in active_admins(fallback) if e != exclude and (q in e or q in names.get(e, "").lower())]
    return [{"email": e, "name": names.get(e, "")} for e in dict.fromkeys(hits)][:limit]


def add(email: str, name: str, by: str) -> None:
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise ApiError("INVALID_INPUT", 422)
    for r in read_tab(TAB, COLS):
        if r["Email"].strip().lower() == email:
            if r["Active"].strip().lower() != "no":
                raise ApiError("ALREADY_EXISTS", 409)
            update_tab(TAB, COLS, [(r["_row"], {"Active": "Yes", "Name": name or r["Name"], "Added By": by,
                                                "Added At": _now()})])
            invalidate()
            return
    append_tab(TAB, COLS, [{"Email": email, "Name": name.strip(), "Added By": by, "Added At": _now(), "Active": "Yes"}])
    invalidate()


def remove(email: str) -> None:
    email = email.strip().lower()
    for r in read_tab(TAB, COLS):
        if r["Email"].strip().lower() == email and r["Active"].strip().lower() != "no":
            update_tab(TAB, COLS, [(r["_row"], {"Active": "No"})])
            invalidate()
            return
    raise ApiError("NOT_FOUND", 404)
