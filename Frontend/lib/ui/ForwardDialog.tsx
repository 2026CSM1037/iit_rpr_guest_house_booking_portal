"use client";
import { useMemo, useState } from "react";
import type { AuthorityInfo, Booking } from "@/lib/api/types";
import Dialog from "./Dialog";

/** Pick any other authority in the organisation to hand the request to. */
export default function ForwardDialog({ booking, admins, busy, onClose, onConfirm }: {
  booking: Booking; admins: AuthorityInfo[] | null; busy: boolean;
  onClose: () => void; onConfirm: (email: string) => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<AuthorityInfo | null>(null);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (admins ?? []).filter((a) => !t || `${a.name} ${a.designation} ${a.email}`.toLowerCase().includes(t));
  }, [admins, q]);

  return (
    <Dialog
      title={`Forward ${booking.bookingId}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn" disabled={!picked || busy} onClick={() => picked && onConfirm(picked.email)}>
            {busy ? "Forwarding…" : picked ? `Forward to ${picked.name}` : "Select an authority"}
          </button>
        </>
      }
    >
      <p className="mute small">Once forwarded, the request moves to that person and you can no longer act on it.</p>
      <input className="field" placeholder="Search by name, role or email" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="pick-list">
        {admins === null && <li className="mute">Loading authorities…</li>}
        {admins && shown.length === 0 && <li className="mute">No one matches “{q}”.</li>}
        {shown.map((a) => (
          <li key={a.email}>
            <button className={`pick${picked?.email === a.email ? " on" : ""}`} onClick={() => setPicked(a)}>
              <span className="radio" aria-hidden>{picked?.email === a.email ? "●" : "○"}</span>
              <span><strong>{a.name}</strong><small>{a.designation} · {a.email}</small></span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
