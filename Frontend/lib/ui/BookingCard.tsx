import type { Booking } from "@/lib/api/types";

const fmt = (v?: string) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

/** Read-only booking details for staff screens (authority + receptionist). Action buttons go in `children`. */
export default function BookingCard({ b, children }: { b: Booking; children?: React.ReactNode }) {
  const approvals = (["chairman", "warden", "dean"] as const).map((s) => {
    const a = b.approvals[s];
    return `${s[0].toUpperCase()}${s.slice(1)}: ${a ? `✓ ${a.by ?? ""} (${fmt(a.at)})` : "—"}`;
  });

  return (
    <article className="req">
      <div className="req-head">
        <div>
          <strong>{b.bookingId}</strong>
          <span className="mute"> · {b.name} ({b.email})</span>
        </div>
        <span className="badge">{b.status}</span>
      </div>

      <div className="kv">
        <div><span>Category</span>{b.category}</div>
        <div><span>Rooms</span>{b.rooms}</div>
        <div><span>Stay</span>{fmt(b.arrival)} → {fmt(b.departure)} ({b.nights} night{b.nights === 1 ? "" : "s"})</div>
        <div><span>Room charges</span>₹{b.roomCharges.toLocaleString("en-IN")} · {b.payment}</div>
        <div><span>Purpose</span>{b.purpose}</div>
        <div><span>Applicant</span>{b.designation}, {b.department} · {b.mobile}</div>
      </div>

      <div className="req-sec">
        <strong>Guests:</strong>{" "}
        {b.guests.map((g) => `${g.name} (${g.gender}, ${g.age}${g.idType ? `, ${g.idType} ${g.idNumber}` : ""})`).join("; ") || "—"}
      </div>

      <div className="req-sec">
        <strong>Documents:</strong>{" "}
        {b.primaryIdLink ? <a href={b.primaryIdLink} target="_blank" rel="noreferrer">Primary guest ID</a> : "—"}
        {b.approvalDocLink && <> · <a href={b.approvalDocLink} target="_blank" rel="noreferrer">Approval letter</a></>}
      </div>

      <div className="req-sec mute">{approvals.join("  |  ")}</div>
      {(b.checkIn || b.checkOut) && (
        <div className="req-sec mute">
          Check-in: {b.checkIn ? fmt(b.checkIn.at) : "—"}  |  Check-out: {b.checkOut ? fmt(b.checkOut.at) : "—"}
        </div>
      )}
      {b.remarks && <div className="remarks">{b.remarks}</div>}

      {children}
    </article>
  );
}
