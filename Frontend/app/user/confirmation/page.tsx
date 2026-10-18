"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Guest = { arrival?: string; departure?: string; name?: string };
type Booking = {
  bookingId?: string;
  category?: string;
  rooms?: string;
  purpose?: string;
  email?: string;
  guests?: Guest[];
};

export default function ConfirmationPage() {
  const [booking, setBooking] = useState<Booking>({});

  useEffect(() => {
    const saved = localStorage.getItem("guestHouseBooking");
    if (saved) setBooking(JSON.parse(saved));
  }, []);

  const primaryGuest = booking.guests?.[0];

  return (
    <div className="page-shell centered-page">
      <div className="success-icon">✓</div>
      <h1>Booking Request Submitted Successfully!</h1>
      <p className="center-copy">
        Your accommodation request has been submitted to the competent authority for approval. You will be notified once there is an update.
      </p>

      <section className="request-id-card">
        <span>Your Booking / Request ID</span>
        <strong>{booking.bookingId || "GH2026001234"}</strong>
        <button type="button" onClick={() => navigator.clipboard?.writeText(booking.bookingId || "")}>Copy ID</button>
      </section>

      <section className="summary-panel">
        <h2>Booking Summary</h2>
        <SummaryRow label="Check-in Date" value={formatDate(primaryGuest?.arrival)} />
        <SummaryRow label="Check-out Date" value={formatDate(primaryGuest?.departure)} />
        <SummaryRow label="Room Category" value={booking.category || "—"} />
        <SummaryRow label="Number of Rooms" value={booking.rooms || "—"} />
        <SummaryRow label="Purpose of Visit" value={booking.purpose || "—"} />
      </section>

      <div className="info-alert">ⓘ Please save this ID for future reference. You can track your booking status using the Booking Status option.</div>

      <div className="two-actions">
        <Link href="/user/status" className="primary-button">View Booking Status</Link>
        <Link href="/user" className="secondary-button">Back to Home</Link>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="summary-row"><span>{label}</span><strong>{value}</strong></div>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { dateStyle: "medium" });
}
