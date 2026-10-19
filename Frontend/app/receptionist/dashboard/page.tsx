"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useReceptionistAuth } from "@/lib/auth/ReceptionistAuth";
import { receptionApi } from "@/lib/api/client";
import { ApiError, Booking } from "@/lib/api/types";
import BookingCard from "@/lib/ui/BookingCard";

const MESSAGES: Record<string, string> = {
  INVALID_STATE: "That action is not possible for this booking right now. Refresh and try again.",
  ALREADY_DONE: "That step was already recorded.",
  NETWORK: "Unable to reach the server. Check your connection and try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

export default function ReceptionDashboardPage() {
  const { status, account } = useReceptionistAuth();
  const router = useRouter();
  const [scope, setScope] = useState<"active" | "all">("active");
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => { if (status === "anon") router.replace("/receptionist/login"); }, [status, router]);

  const load = useCallback(async () => {
    try { setItems(await receptionApi.list(scope)); setError(""); }
    catch (e) {
      if ((e as ApiError).code === "UNAUTHENTICATED") { router.replace("/receptionist/login"); return; }
      setItems([]); setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN);
    }
  }, [scope, router]);

  useEffect(() => { if (status === "authed") load(); }, [status, load]);

  async function act(b: Booking, kind: "in" | "out") {
    setBusyId(b.bookingId); setError("");
    try {
      await (kind === "in" ? receptionApi.checkIn(b.bookingId) : receptionApi.checkOut(b.bookingId));
      await load();
    } catch (e) {
      setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN);
    } finally { setBusyId(""); }
  }

  if (status !== "authed") return <p className="center mute">Loading…</p>;

  return (
    <div>
      <div className="card">
        <h1>Arrivals &amp; Departures</h1>
        <p className="mute">
          Welcome, {account?.name}. Only fully approved (Booked) requests appear here. Verify the guest&apos;s ID, then record check-in and check-out.
        </p>
      </div>

      <div className="tabs">
        <button className={`btn ${scope === "active" ? "" : "ghost"}`} onClick={() => setScope("active")}>Active</button>
        <button className={`btn ${scope === "all" ? "" : "ghost"}`} onClick={() => setScope("all")}>All booked</button>
        <button className="btn ghost" onClick={load}>Refresh</button>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}
      {items === null && <p className="mute">Loading bookings…</p>}
      {items?.length === 0 && !error && <p className="mute">No booked requests to show.</p>}

      {items?.map((b) => (
        <BookingCard key={b.bookingId} b={b}>
          <div className="req-actions">
            {!b.checkIn && (
              <button className="btn" disabled={busyId === b.bookingId} onClick={() => act(b, "in")}>Check in</button>
            )}
            {b.checkIn && !b.checkOut && (
              <button className="btn" disabled={busyId === b.bookingId} onClick={() => act(b, "out")}>Check out</button>
            )}
            {b.checkOut && <span className="mute">Stay completed.</span>}
          </div>
        </BookingCard>
      ))}
    </div>
  );
}
