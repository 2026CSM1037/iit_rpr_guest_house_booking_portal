"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRequireUser } from "@/lib/auth/UserAuth";
import { bookingApi } from "@/lib/api/client";
import type { Booking } from "@/lib/api/types";

export default function ConfirmationPage() {
  const { status } = useRequireUser("/user/status");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (status !== "authed") return;
    const id = sessionStorage.getItem("gh_last_booking_id");
    if (!id) { setFailed(true); return; }
    bookingApi.get(id).then(setBooking).catch(() => setFailed(true));
  }, [status]);

  if (status !== "authed") return <div className="page-shell"><p>Loading…</p></div>;

  return (
    <div className="page-shell centered-page">
      <div className="success-icon">✓</div>
      <h1>Booking Request Submitted Successfully!</h1>
      <p className="center-copy">
        Your accommodation request has been submitted to the competent authority for approval. You will be notified once there is an update.
      </p>

      <section className="request-id-card">
        <span>Your Booking / Request ID</span>
        <strong>{booking?.bookingId || (failed ? "—" : "Loading…")}</strong>
        <button type="button" onClick={() => navigator.clipboard?.writeText(booking?.bookingId || "")}>Copy ID</button>
      </section>

      <section className="summary-panel">
        <h2>Booking Summary</h2>
        <SummaryRow label="Check-in Date" value={formatDate(booking?.arrival)} />
        <SummaryRow label="Check-out Date" value={formatDate(booking?.departure)} />
        <SummaryRow label="Room Category" value={booking?.category || "—"} />
        <SummaryRow label="Number of Rooms" value={booking?.rooms || "—"} />
        <SummaryRow label="Purpose of Visit" value={booking?.purpose || "—"} />
        <SummaryRow label="Room Charges" value={booking ? `₹${booking.roomCharges.toLocaleString("en-IN")}` : "—"} />
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
