"use client";
import { useEffect, useRef, useState } from "react";
import { authorityApi } from "@/lib/api/client";
import type { AuthorityInfo, Booking } from "@/lib/api/types";
import Dialog from "./Dialog";

const display = (a: AuthorityInfo) => a.name || a.email.split("@")[0];
const initial = (a: AuthorityInfo) => display(a).split(/[\s,._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** Search for any other authority (type-ahead) and hand the request to them. */
export default function ForwardDialog({ booking, busy, onClose, onConfirm }: {
  booking: Booking; busy: boolean; onClose: () => void; onConfirm: (email: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AuthorityInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<AuthorityInfo | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); setSearching(false); setFailed(false); return; }
    setSearching(true);
    const id = ++seq.current;
    const t = setTimeout(() => {
      authorityApi.searchAdmins(term)
        .then((r) => { if (id === seq.current) { setResults(r); setFailed(false); } })
        .catch(() => { if (id === seq.current) { setResults([]); setFailed(true); } })
        .finally(() => { if (id === seq.current) setSearching(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const term = q.trim();
  return (
    <Dialog
      title="Forward request"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn" disabled={!picked || busy} onClick={() => picked && onConfirm(picked.email)}>
            {busy ? <><i className="spin" /> Forwarding…</> : picked ? `Forward to ${display(picked)}` : "Choose an authority"}
          </button>
        </>
      }
    >
      <div className="fwd-for"><code>{booking.bookingId}</code><span>{booking.name}</span></div>
      <p className="mute small">Once forwarded, the request moves to that person and you can no longer act on it.</p>

      <div className="search">
        <input placeholder="Search authority by name or email" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search authority" />
        {searching && <i className="spin" aria-label="Searching" />}
      </div>

      <ul className="people" aria-live="polite">
        {!term && <li className="people-hint">Start typing to find an authority.</li>}
        {term && !searching && failed && <li className="people-hint">Could not search right now. Please try again.</li>}
        {term && !searching && !failed && results.length === 0 && <li className="people-hint">No authority matches “{term}”.</li>}
        {results.map((a) => {
          const on = picked?.email === a.email;
          return (
            <li key={a.email}>
              <button type="button" className={`person${on ? " on" : ""}`} onClick={() => setPicked(a)} aria-pressed={on}>
                <span className="avatar sm" aria-hidden>{initial(a)}</span>
                <span className="person-t"><strong>{display(a)}</strong><small>{a.email}</small></span>
                <span className="tick" aria-hidden>{on ? "✓" : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
