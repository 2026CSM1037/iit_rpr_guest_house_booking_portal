"""Room inventory + allocations (sheet tabs 'Rooms' and 'Allocations').

Source of truth for availability is the Allocations tab, never the Bookings tab:
  one row per (booking, room) with the window [From, To) it occupies.
  Status: Active (holds the room) | Completed (checked out; To = actual checkout) | Released (cancelled / re-allocated).
A room is free for [A, D) when no Active/Completed row overlaps it:  other.From < D  and  A < other.To.
  - a room whose guest checks out before A is therefore free for A;
  - a guest who is checked in but past the planned departure keeps the room until they actually check out;
  - early checkout shortens To, so the room is free earlier.
All writes happen under LOCK (single backend process) and are verified after writing, then rolled back on conflict.
"""
import threading
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from tabs import ApiError, append_tab, ensure_tab, read_tab, update_tab

ROOMS_TAB, ALLOC_TAB = "Rooms", "Allocations"
ROOM_COLS = ["Room No", "Official Only", "Active", "Notes"]
ALLOC_COLS = ["Allocation ID", "Booking ID", "Room No", "From", "To", "Status", "Checked In At",
              "Allocated By", "Allocated At", "Released At", "Release Reason"]

# 20 general rooms; 110 and 210 are kept for official visits only. Edit the Rooms tab to change this later.
_ROOM_NOS = [str(100 + i) for i in range(1, 11)] + [str(200 + i) for i in range(1, 11)]
OFFICIAL_ONLY = {"110", "210"}
DEFAULT_ROOMS = [[n, "Yes" if n in OFFICIAL_ONLY else "No", "Yes", ""] for n in _ROOM_NOS]

HOLDING = ("Active", "Completed")
LOCK = threading.Lock()
IST = timezone(timedelta(hours=5, minutes=30))  # booking times are entered as local (IST) datetime-local values


def local_now() -> datetime:
    return datetime.now(IST).replace(tzinfo=None)


def parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    return dt.astimezone(IST).replace(tzinfo=None) if dt.tzinfo else dt


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def ensure_tabs() -> None:
    ensure_tab(ROOMS_TAB, ROOM_COLS, seed=DEFAULT_ROOMS)
    ensure_tab(ALLOC_TAB, ALLOC_COLS)


def _interval(a: Dict[str, str], now: datetime):
    start, end = parse_dt(a["From"]), parse_dt(a["To"])
    if a["Status"] == "Active" and a["Checked In At"]:
        end = max(end, now)  # checked in and not out yet: the room stays occupied past the planned departure
    return start, end


def _blockers(allocs: List[Dict[str, str]], start: datetime, end: datetime, now: datetime, ignore: str = ""):
    """[(allocation, effective_end)] of rows overlapping [start, end)."""
    out = []
    for a in allocs:
        if a["Status"] not in HOLDING or a["Booking ID"] == ignore:
            continue
        try:
            s, e = _interval(a, now)
        except ValueError:
            print("WARNING: unreadable allocation row", a.get("_row"))
            continue
        if s < end and start < e:
            out.append((a, e))
    return out


def availability(start: datetime, end: datetime, needed: int, ignore: str = "") -> dict:
    now = local_now()
    allocs = read_tab(ALLOC_TAB, ALLOC_COLS)
    rooms, free = [], 0
    earliest: Optional[datetime] = None
    blockers = _blockers(allocs, start, end, now, ignore)
    for r in read_tab(ROOMS_TAB, ROOM_COLS):
        if not r["Room No"].strip() or r["Active"].strip().lower() == "no":
            continue
        mine = [(a, e) for a, e in blockers if a["Room No"] == r["Room No"]]
        busy_until = max((e for _, e in mine), default=None)
        if busy_until is None:
            free += 1
        elif earliest is None or busy_until < earliest:
            earliest = busy_until
        rooms.append({"roomNo": r["Room No"], "officialOnly": r["Official Only"].strip().lower() == "yes",
                      "available": busy_until is None, "busyUntil": _iso(busy_until) if busy_until else "",
                      "note": r["Notes"]})
    return {"needed": needed, "free": free, "full": free < needed, "rooms": rooms,
            "earliestFree": _iso(earliest) if earliest and free < needed else ""}


def active_rooms_of(booking_id: str) -> List[str]:
    return sorted(a["Room No"] for a in read_tab(ALLOC_TAB, ALLOC_COLS)
                  if a["Booking ID"] == booking_id and a["Status"] == "Active")


def allocate(booking: Dict[str, str], rooms: List[str], official: bool, by: str) -> List[str]:
    """Write the allocation rows for booking. Raises ApiError(NO_ROOMS / ROOM_BUSY / ROOM_OFFICIAL_ONLY / ...)."""
    needed = int(float(booking["Rooms"] or 1))
    rooms = [x.strip() for x in rooms]
    if len(rooms) != needed or len(set(rooms)) != needed:
        raise ApiError("WRONG_ROOM_COUNT", 422)
    try:
        start, end = parse_dt(booking["Arrival"]), parse_dt(booking["Departure"])
    except ValueError:
        raise ApiError("INVALID_INPUT", 422)
    bid = booking["Booking ID"]

    with LOCK:
        existing = active_rooms_of(bid)
        if existing:
            if sorted(rooms) == existing:
                return existing  # double click / retry: nothing to do
            raise ApiError("ALREADY_ALLOCATED", 409)
        info = {r["roomNo"]: r for r in availability(start, end, needed, ignore=bid)["rooms"]}
        for no in rooms:
            if no not in info:
                raise ApiError("UNKNOWN_ROOM", 422)
            if info[no]["officialOnly"] and not official:
                raise ApiError("ROOM_OFFICIAL_ONLY", 422)
            if not info[no]["available"]:
                raise ApiError("ROOM_BUSY", 409)
        stamp_now = _iso(local_now())
        append_tab(ALLOC_TAB, ALLOC_COLS, [
            {"Allocation ID": f"{bid}-{no}", "Booking ID": bid, "Room No": no, "From": booking["Arrival"],
             "To": booking["Departure"], "Status": "Active", "Allocated By": by, "Allocated At": stamp_now}
            for no in rooms])
        # verify after writing (guards against a second process / manual sheet edits); roll back on any clash
        allocs = read_tab(ALLOC_TAB, ALLOC_COLS)
        mine = [a for a in allocs if a["Booking ID"] == bid and a["Status"] == "Active"]
        clash = any(_blockers([a for a in allocs if a["Room No"] == m["Room No"]], start, end, local_now(), ignore=bid)
                    for m in mine)
        if clash:
            update_tab(ALLOC_TAB, ALLOC_COLS, [(m["_row"], {"Status": "Released", "Released At": stamp_now,
                                                            "Release Reason": "conflict detected"}) for m in mine])
            raise ApiError("ROOM_BUSY", 409)
    return sorted(rooms)


def release(booking_id: str, reason: str) -> List[str]:
    """Free every Active room of a booking (cancel / re-allocation)."""
    with LOCK:
        now = _iso(local_now())
        rows = [a for a in read_tab(ALLOC_TAB, ALLOC_COLS) if a["Booking ID"] == booking_id and a["Status"] == "Active"]
        update_tab(ALLOC_TAB, ALLOC_COLS, [(a["_row"], {"Status": "Released", "Released At": now,
                                                        "Release Reason": reason}) for a in rows])
        return sorted(a["Room No"] for a in rows)


def mark_checkin(booking_id: str) -> None:
    with LOCK:
        now = _iso(local_now())
        update_tab(ALLOC_TAB, ALLOC_COLS, [(a["_row"], {"Checked In At": now})
                                           for a in read_tab(ALLOC_TAB, ALLOC_COLS)
                                           if a["Booking ID"] == booking_id and a["Status"] == "Active"])


def mark_checkout(booking_id: str) -> None:
    """Actual checkout time becomes the end of the occupancy window (earlier = room free earlier)."""
    with LOCK:
        now = _iso(local_now())
        update_tab(ALLOC_TAB, ALLOC_COLS, [(a["_row"], {"Status": "Completed", "To": now})
                                           for a in read_tab(ALLOC_TAB, ALLOC_COLS)
                                           if a["Booking ID"] == booking_id and a["Status"] == "Active"])