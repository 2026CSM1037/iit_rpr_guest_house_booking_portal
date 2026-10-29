"""Checkout bill (PDF). No online payment: the receptionist records payment in the portal afterwards."""
import io
import json
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _fmt(v: str) -> str:
    try:
        return datetime.fromisoformat(v).strftime("%d %b %Y, %H:%M")
    except (TypeError, ValueError):
        return v or "-"


def _stamp_time(cell: str) -> str:
    return _fmt(cell.partition(" @ ")[2]) if cell else "-"


def _int(v, default=0) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def build_bill_pdf(r: dict) -> bytes:
    """r = one sheet row (dict keyed by column name)."""
    nights, rooms, total = _int(r["Nights"]), max(1, _int(r["Rooms"], 1)), _int(r["Room Charges"])
    rate = total // (nights * rooms) if nights * rooms else 0
    try:
        guests = json.loads(r["Guests (JSON)"] or "[]")
    except ValueError:
        guests = []

    ss = getSampleStyleSheet()
    cell = ss["BodyText"]
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm, title=f"Bill {r['Booking ID']}")
    el = [
        Paragraph("Indian Institute of Technology Ropar", ss["Title"]),
        Paragraph("Guest House - Stay Bill", ss["Heading2"]),
        Spacer(1, 6),
    ]

    def kv(rows, widths=(48 * mm, 120 * mm)):
        t = Table([[Paragraph(f"<b>{escape(k)}</b>", cell), Paragraph(escape(str(v)), cell)] for k, v in rows],
                  colWidths=widths)
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey)]))
        return t

    el.append(kv([
        ("Booking ID", r["Booking ID"]),
        ("Billed to", f"{r['Name']} ({r['Email']})"),
        ("Designation / Dept.", f"{r['Designation']}, {r['Department']}"),
        ("Employee code / Mobile", f"{r['Employee Code']} / {r['Mobile']}"),
        ("Purpose / Project", f"{r['Purpose']}" + (f" / {r['Project']}" if r["Project"] else "")),
        ("Payment mode", r["Payment"]),
    ]))
    el.append(Spacer(1, 8))
    el.append(Paragraph("Guests", ss["Heading3"]))
    el.append(Paragraph(escape("; ".join(f"{g.get('name', '')} ({g.get('gender', '')}, {g.get('age', '')})"
                                         for g in guests) or "-"), cell))
    el.append(Spacer(1, 8))
    el.append(kv([
        ("Booked stay", f"{_fmt(r['Arrival'])}  to  {_fmt(r['Departure'])}"),
        ("Checked in", _stamp_time(r["Onsite Check-in"])),
        ("Checked out", _stamp_time(r["Onsite Check-out"])),
    ]))
    el.append(Spacer(1, 10))

    head = ["Description", "Rate / night (Rs.)", "Rooms", "Nights", "Amount (Rs.)"]
    rows = [head, [r["Category"], f"{rate:,}", str(rooms), str(nights), f"{total:,}"],
            ["", "", "", "Total", f"{total:,}"]]
    rows = [[Paragraph(escape(c), cell) if i and j == 0 and c else c for j, c in enumerate(row)]
            for i, row in enumerate(rows)]
    t = Table(rows, colWidths=[68 * mm, 32 * mm, 18 * mm, 18 * mm, 32 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f3a5f")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey), ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    el.append(t)
    el.append(Spacer(1, 14))
    el.append(Paragraph("Payment is collected at the Guest House reception; the receptionist will record it "
                        "in the portal. This is a computer-generated bill.", ss["Italic"]))
    doc.build(el)
    return buf.getvalue()
