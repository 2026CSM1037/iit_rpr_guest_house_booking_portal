import type { Booking } from "@/lib/api/types";

const fmt = (v?: string) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

/** Read-only booking details for staff screens (authority + receptionist). Action buttons go in `children`. */
export default function BookingCard({ b, children }: { b: Booking; children?: React.ReactNode }) {
  const who = (e?: string) => (e ? e.split("@")[0] : "applicant");
  const line = (t: Booking["trail"][number]) => {
    const verb = { submit: "submitted", forward: `forwarded to ${who(t.to)}`, approve: "approved", reject: "rejected", hold: "put on hold", resume: "resumed", allot: `allotted rooms ${t.remarks ?? ""}` }[t.action];
    return `${who(t.by)} ${verb} · ${fmt(t.at)}${t.remarks && t.action !== "allot" ? ` — “${t.remarks}”` : ""}`;
  };

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

      {b.roomsAllotted && b.roomsAllotted.length > 0 && <div className="req-sec"><strong>Rooms allotted:</strong> {b.roomsAllotted.join(", ")}</div>}
      {b.currentApprover && <div className="req-sec"><strong>Currently with:</strong> {who(b.currentApprover)}</div>}
      <details className="req-sec trail">
        <summary>Approval trail ({(b.trail ?? []).length})</summary>
        <ol>{(b.trail ?? []).map((t, i) => <li key={i}>{line(t)}</li>)}</ol>
      </details>
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
