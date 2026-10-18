"use client";

import { FormEvent, useState } from "react";

type Guest = { arrival?: string; departure?: string };
type Booking = {
  bookingId?: string;
  email?: string;
  category?: string;
  rooms?: string;
  purpose?: string;
  guests?: Guest[];
};

export default function StatusPage() {
  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [message, setMessage] = useState("");

  function checkStatus(event: FormEvent) {
    event.preventDefault();
    const saved = localStorage.getItem("guestHouseBooking");

    if (!saved) {
      setMessage("No demo booking found. Submit a booking first.");
      setBooking(null);
      return;
    }

    const data: Booking = JSON.parse(saved);
    const idMatches = data.bookingId === id;
    const emailMatches = data.email?.toLowerCase() === email.toLowerCase();

    if (idMatches && emailMatches) {
      setBooking(data);
      setMessage("");
    } else {
      setBooking(null);
      setMessage("Booking ID or registered email does not match.");
    }
  }

  const primaryGuest = booking?.guests?.[0];

  return (
    <div className="page-shell status-page">
      <section className="status-search panel">
        <h1>Check Booking Status</h1>
        <form onSubmit={checkStatus}>
          <label className="field">
            <span>Booking / Request ID *</span>
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Enter booking ID (e.g. GH2026001234)" required />
          </label>
          <label className="field">
            <span>Registered Email *</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your registered email address" required />
          </label>
          <button className="primary-button" type="submit">⌕ &nbsp; Check Status</button>
          {message && <p className="inline-error">{message}</p>}
        </form>
      </section>

      <section className="status-result panel">
        <div className="status-title">
          <h2>Booking Status</h2>
          <span className="approved-pill">Request Submitted</span>
        </div>

        <div className="status-table">
          <SummaryRow label="Booking ID" value={booking?.bookingId || "—"} />
          <SummaryRow label="Check-in Date" value={formatDate(primaryGuest?.arrival)} />
          <SummaryRow label="Check-out Date" value={formatDate(primaryGuest?.departure)} />
          <SummaryRow label="Room Category" value={booking?.category || "—"} />
          <SummaryRow label="Number of Rooms" value={booking?.rooms || "—"} />
          <SummaryRow label="Purpose of Visit" value={booking?.purpose || "—"} />
        </div>

        <h3>Status Timeline</h3>
        <ol className="timeline">
          {["Request Submitted", "Sent to Approver", "Approved", "Guest House Processing", "Room Allocated", "Check-in", "Check-out", "Billed"].map((item, index) => (
            <li key={item} className={index === 0 && booking ? "done" : ""}>
              <span className="timeline-dot">{index === 0 && booking ? "✓" : ""}</span>
              <strong>{item}</strong>
              {index === 0 && booking && <time>Submitted</time>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="summary-row"><span>{label}</span><strong>{value}</strong></div>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
