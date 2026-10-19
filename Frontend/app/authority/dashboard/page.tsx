"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { authorityApi, type Decision } from "@/lib/api/client";
import { ApiError, Booking } from "@/lib/api/types";
import BookingCard from "@/lib/ui/BookingCard";

const MESSAGES: Record<string, string> = {
  REMARKS_REQUIRED: "Please write remarks before rejecting or holding a request.",
  NOT_AUTHORIZED: "You are not the approver for this stage.",
  ALREADY_DECIDED: "This request has already been finalised.",
  INVALID_STATE: "This request is not in a state where that action is possible. Refresh and try again.",
  NETWORK: "Unable to reach the server. Check your connection and try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

export default function DashboardPage() {
  const { status, authority } = useAuth();
  const router = useRouter();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  useEffect(() => { if (status === "anon") router.replace("/authority/login"); }, [status, router]);

  const load = useCallback(async () => {
    try { setItems(await authorityApi.list(scope)); setError(""); }
    catch (e) {
      if ((e as ApiError).code === "UNAUTHENTICATED") { router.replace("/authority/login"); return; }
      setItems([]); setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN);
    }
  }, [scope, router]);

  useEffect(() => { if (status === "authed") load(); }, [status, load]);

  async function act(b: Booking, decision: Decision) {
    setBusyId(b.bookingId); setError("");
    try {
      await authorityApi.decide(b.bookingId, decision, remarks[b.bookingId] ?? "");
      setRemarks((r) => ({ ...r, [b.bookingId]: "" }));
      await load();
    } catch (e) {
      setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN);
    } finally { setBusyId(""); }
  }

  if (status !== "authed") return <p className="center mute">Loading…</p>;

  return (
    <div>
      <div className="card">
        <h1>My Approvals</h1>
        <p className="mute">
          Welcome, {authority?.name}. You act as: <strong>{authority?.roles.join(", ")}</strong>.
          Requests move Chairman → Warden → Dean, then become Booked.
        </p>
      </div>

      <div className="tabs">
        <button className={`btn ${scope === "mine" ? "" : "ghost"}`} onClick={() => setScope("mine")}>Waiting for me</button>
        <button className={`btn ${scope === "all" ? "" : "ghost"}`} onClick={() => setScope("all")}>All requests</button>
        <button className="btn ghost" onClick={load}>Refresh</button>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}
      {items === null && <p className="mute">Loading requests…</p>}
      {items?.length === 0 && !error && <p className="mute">{scope === "mine" ? "Nothing is waiting for you right now." : "No requests yet."}</p>}

      {items?.map((b) => (
        <BookingCard key={b.bookingId} b={b}>
          {b.canAct && (
            <div className="req-actions">
              <textarea
                placeholder={`Remarks (required for reject / hold) — acting as ${b.stage}`}
                value={remarks[b.bookingId] ?? ""}
                onChange={(e) => setRemarks((r) => ({ ...r, [b.bookingId]: e.target.value }))}
              />
              {b.status === "On Hold" ? (
                <button className="btn" disabled={busyId === b.bookingId} onClick={() => act(b, "resume")}>Resume</button>
              ) : (
                <>
                  <button className="btn" disabled={busyId === b.bookingId} onClick={() => act(b, "approve")}>Approve</button>
                  <button className="btn ghost" disabled={busyId === b.bookingId} onClick={() => act(b, "hold")}>Hold</button>
                  <button className="btn ghost" disabled={busyId === b.bookingId} onClick={() => act(b, "reject")}>Reject</button>
                </>
              )}
            </div>
          )}
        </BookingCard>
      ))}
    </div>
  );
}
