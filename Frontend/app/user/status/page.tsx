"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRequireUser } from "@/lib/auth/UserAuth";
import { bookingApi } from "@/lib/api/client";
import type { Booking } from "@/lib/api/types";

export default function StatusPage() {
  const { status } = useRequireUser("/user/status");
  const [id, setId] = useState("");
  const [mine, setMine] = useState<Booking[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status !== "authed") return;
    bookingApi.mine()
      .then((list) => { setMine(list); if (list.length) setBooking(list[0]); })
      .catch(() => setMessage("Unable to load your bookings right now."));
  }, [status]);

  async function checkStatus(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      setBooking(await bookingApi.get(id.trim()));
    } catch {
      setBooking(null);
      setMessage("No booking with this ID was found for your account.");
    }
  }

  if (status !== "authed") return <div className="page-shell"><p>Loading…</p></div>;

  const steps = booking ? [
    { label: "Request Submitted", at: booking.submittedAt, done: true },
    { label: "Chairman Approval", at: booking.approvals.chairman?.at, done: !!booking.approvals.chairman },
    { label: "Warden Approval", at: booking.approvals.warden?.at, done: !!booking.approvals.warden },
    { label: "Dean Approval", at: booking.approvals.dean?.at, done: !!booking.approvals.dean },
    { label: "Booked", at: undefined, done: booking.status === "Booked" },
    { label: "Check-in", at: booking.checkIn?.at, done: !!booking.checkIn },
    { label: "Check-out", at: booking.checkOut?.at, done: !!booking.checkOut },
  ] : [];

  return (
    <div className="page-shell status-page">
      <section className="status-search panel">
        <h1>Check Booking Status</h1>
        <form onSubmit={checkStatus}>
          <label className="field">
            <span>Booking / Request ID *</span>
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Enter booking ID (e.g. GH2026123456)" required />
          </label>
          <button className="primary-button" type="submit">⌕ &nbsp; Check Status</button>
          {message && <p className="inline-error">{message}</p>}
        </form>

        {mine.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <strong>Your requests</strong>
            {mine.map((b) => (
              <button key={b.bookingId} type="button" className="secondary-button" style={{ display: "block", width: "100%", marginTop: 8 }}
                onClick={() => { setBooking(b); setId(b.bookingId); setMessage(""); }}>
                {b.bookingId} · {b.status}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="status-result panel">
        <div className="status-title">
          <h2>Booking Status</h2>
          <span className="approved-pill">{booking?.status ?? "—"}</span>
        </div>

        <div className="status-table">
          <SummaryRow label="Booking ID" value={booking?.bookingId || "—"} />
          <SummaryRow label="Check-in Date" value={formatDate(booking?.arrival)} />
          <SummaryRow label="Check-out Date" value={formatDate(booking?.departure)} />
          <SummaryRow label="Room Category" value={booking?.category || "—"} />
          <SummaryRow label="Number of Rooms" value={booking?.rooms || "—"} />
          <SummaryRow label="Purpose of Visit" value={booking?.purpose || "—"} />
        </div>

        {booking?.remarks && (
          <>
            <h3>Remarks</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{booking.remarks}</p>
          </>
        )}

        <h3>Status Timeline</h3>
        <ol className="timeline">
          {(steps.length ? steps : TIMELINE_PLACEHOLDER).map((s) => (
            <li key={s.label} className={s.done ? "done" : ""}>
              <span className="timeline-dot">{s.done ? "✓" : ""}</span>
              <strong>{s.label}</strong>
              {s.done && s.at && <time>{formatDate(s.at)}</time>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const TIMELINE_PLACEHOLDER = ["Request Submitted", "Chairman Approval", "Warden Approval", "Dean Approval", "Booked", "Check-in", "Check-out"]
  .map((label) => ({ label, at: undefined as string | undefined, done: false }));

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="summary-row"><span>{label}</span><strong>{value}</strong></div>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
