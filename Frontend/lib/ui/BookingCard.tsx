import type { Booking } from "@/lib/api/types";
import StatusPill from "./StatusPill";

const dateOf = (v?: string) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
};
const timeOf = (v?: string) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";
};
const stamp = (v?: string) => (v ? `${dateOf(v)}, ${timeOf(v)}` : "—");
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const who = (e?: string) => (e ? e.split("@")[0] : "Applicant");

const VERBS: Record<string, (t: Booking["trail"][number]) => string> = {
  submit: () => "submitted the request",
  forward: (t) => `forwarded it to ${who(t.to)}`,
  approve: () => "approved",
  reject: () => "rejected",
  hold: () => "put it on hold",
  resume: () => "resumed it",
  allocate: (t) => `allotted ${t.remarks || "rooms"}`,
  unallocate: () => "released the rooms",
  cancel: () => "cancelled the request",
  reassign: () => "request returned to admin",
};

/** Booking summary for staff screens (authority + receptionist). Action buttons go in `children`. */
export default function BookingCard({ b, children }: { b: Booking; children?: React.ReactNode }) {
  const trail = b.trail ?? [];
  const rooms = b.allocatedRooms ?? [];
  const n = b.nights;

  return (
    <article className="req">
      <header className="req-top">
        <div className="avatar" aria-hidden>{initials(b.name)}</div>
        <div className="req-who">
          <strong>{b.name}</strong>
          <span>{[b.designation, b.department].filter(Boolean).join(" · ")}</span>
        </div>
        <div className="req-meta">
          <StatusPill status={b.status} />
          <code className="req-id">{b.bookingId}</code>
        </div>
      </header>

      <div className="req-stay">
        <div className="stat"><span>Arrival</span><b>{dateOf(b.arrival)}</b><small>{timeOf(b.arrival)}</small></div>
        <div className="stat"><span>Departure</span><b>{dateOf(b.departure)}</b><small>{timeOf(b.departure)} · {n} night{n === 1 ? "" : "s"}</small></div>
        <div className="stat"><span>Rooms</span><b>{b.rooms} room{b.rooms === "1" ? "" : "s"}</b><small>{b.category}</small></div>
        <div className="stat"><span>Room charges</span><b>₹{b.roomCharges.toLocaleString("en-IN")}</b><small>{b.payment}</small></div>
      </div>

      <div className="req-body">
        <div className="line"><span className="k">Purpose</span><span>{b.purpose || "—"}</span></div>

        <div className="line">
          <span className="k">Guests</span>
          <span className="chips">
            {b.guests.length === 0 && "—"}
            {b.guests.map((g, i) => (
              <span key={i} className="chip-soft" title={g.idType ? `${g.idType} ${g.idNumber}` : undefined}>
                {g.name}<em>{[g.gender, g.age].filter(Boolean).join(", ")}</em>
              </span>
            ))}
          </span>
        </div>

        {(b.primaryIdLink || b.approvalDocLink) && (
          <div className="line">
            <span className="k">Documents</span>
            <span className="chips">
              {b.primaryIdLink && <a className="doc" href={b.primaryIdLink} target="_blank" rel="noreferrer">Primary guest ID ↗</a>}
              {b.approvalDocLink && <a className="doc" href={b.approvalDocLink} target="_blank" rel="noreferrer">Approval letter ↗</a>}
            </span>
          </div>
        )}

        {rooms.length > 0 && (
          <div className="line">
            <span className="k">Rooms</span>
            <span className="chips">{rooms.map((r) => <span key={r} className="room-chip">{r}</span>)}</span>
          </div>
        )}

        {b.currentApprover && (
          <div className="line"><span className="k">With</span><span className="with"><i />{b.currentApprover}</span></div>
        )}

        {(b.checkIn || b.checkOut) && (
          <div className="line"><span className="k">Stay</span><span>In: {b.checkIn ? stamp(b.checkIn.at) : "—"} · Out: {b.checkOut ? stamp(b.checkOut.at) : "—"}</span></div>
        )}

        <details className="more">
          <summary>Details &amp; approval trail ({trail.length})</summary>
          <div className="more-grid">
            <div><span className="k">Applicant</span>{b.name} · {b.email}<br />{b.mobile}{b.employeeCode ? ` · ${b.employeeCode}` : ""}</div>
            <div><span className="k">Submitted</span>{stamp(b.submittedAt)}</div>
            {b.project && <div><span className="k">Project / budget head</span>{b.project}</div>}
            {b.approvedByName && <div><span className="k">Approved by</span>{b.approvedByName}</div>}
          </div>
          {b.guests.some((g) => g.idType) && (
            <ul className="idlist">
              {b.guests.map((g, i) => <li key={i}>{g.name}: {g.idType || "ID"} {g.idNumber}</li>)}
            </ul>
          )}
          <ol className="tl">
            {trail.map((t, i) => (
              <li key={i}>
                <strong>{who(t.by)}</strong> {(VERBS[t.action] ?? (() => t.action))(t)}
                <small>{stamp(t.at)}{t.remarks && t.action !== "allocate" ? ` · “${t.remarks}”` : ""}</small>
              </li>
            ))}
          </ol>
          {b.remarks && <div className="remarks">{b.remarks}</div>}
        </details>
      </div>

      {children}
    </article>
  );
}
