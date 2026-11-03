"""Small generic helpers for extra Google-Sheet tabs (Rooms, Allocations, Admins) + the shared ApiError."""
import os
from typing import Dict, List, Optional, Sequence, Tuple

from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

load_dotenv()

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "")
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE") or os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE") or "credentials.json"
_creds: Optional[Credentials] = None


class ApiError(Exception):
    def _init_(self, code: str, status: int):
        self.code, self.status = code, status


def _svc():
    """New client per call (googleapiclient services are not thread-safe); credentials are cached."""
    global _creds
    if _creds is None:
        _creds = Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=["https://www.googleapis.com/auth/spreadsheets"])
    return build("sheets", "v4", credentials=_creds, cache_discovery=False).spreadsheets()


def col_letter(i: int) -> str:
    s, i = "", i + 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def ensure_tab(title: str, header: List[str], seed: Optional[Sequence[Sequence[str]]] = None) -> None:
    """Create the tab + header if missing (rows in seed are written only when the tab is brand new / empty).
    If the existing header is a prefix of header, the missing column titles are appended (safe migration)."""
    svc = _svc()
    meta = svc.get(spreadsheetId=SPREADSHEET_ID, fields="sheets.properties.title").execute()
    if title not in [s["properties"]["title"] for s in meta.get("sheets", [])]:
        svc.batchUpdate(spreadsheetId=SPREADSHEET_ID,
                        body={"requests": [{"addSheet": {"properties": {"title": title}}}]}).execute()
    head = svc.values().get(spreadsheetId=SPREADSHEET_ID, range=f"'{title}'!1:1").execute().get("values", [])
    if not head:
        svc.values().update(spreadsheetId=SPREADSHEET_ID, range=f"'{title}'!A1", valueInputOption="RAW",
                            body={"values": [header] + [list(r) for r in (seed or [])]}).execute()
    elif head[0] != header:
        if header[:len(head[0])] == head[0]:
            svc.values().update(spreadsheetId=SPREADSHEET_ID, range=f"'{title}'!A1", valueInputOption="RAW",
                                body={"values": [header]}).execute()
        else:
            print(f"WARNING: tab '{title}' has an unexpected header; rename or clear it.")


def read_tab(title: str, header: List[str]) -> List[Dict[str, str]]:
    res = _svc().values().get(spreadsheetId=SPREADSHEET_ID,
                              range=f"'{title}'!A:{col_letter(len(header) - 1)}").execute()
    rows = []
    for i, row in enumerate(res.get("values", [])[1:], start=2):
        row = row + [""] * (len(header) - len(row))
        rec = dict(zip(header, row))
        rec["_row"] = i
        rows.append(rec)
    return rows


def append_tab(title: str, header: List[str], rows: List[Dict[str, str]]) -> None:
    _svc().values().append(
        spreadsheetId=SPREADSHEET_ID, range=f"'{title}'!A:A", valueInputOption="RAW", insertDataOption="INSERT_ROWS",
        body={"values": [[str(r.get(c, "")) for c in header] for r in rows]}).execute()


def update_tab(title: str, header: List[str], updates: List[Tuple[int, Dict[str, str]]]) -> None:
    """updates = [(row_number, {column: value}), ...] applied in one request."""
    data = [{"range": f"'{title}'!{col_letter(header.index(name))}{row}", "values": [[value]]}
            for row, cells in updates for name, value in cells.items()]
    if data:
        _svc().values().batchUpdate(spreadsheetId=SPREADSHEET_ID,
                                    body={"valueInputOption": "RAW", "data": data}).execute()