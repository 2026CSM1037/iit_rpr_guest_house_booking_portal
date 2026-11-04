"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { authorityApi, type Decision } from "@/lib/api/client";
import { ApiError, type AuthorityScope, type Booking } from "@/lib/api/types";
import BookingCard from "@/lib/ui/BookingCard";
import ForwardDialog from "@/lib/ui/ForwardDialog";
import RoomPicker from "@/lib/ui/RoomPicker";

const MESSAGES: Record<string, string> = {
  REMARKS_REQUIRED: "Please write remarks before rejecting or holding a request.",
  NOT_AUTHORIZED: "This request is no longer with you.",
  ALREADY_DECIDED: "This request has already been finalised.",
  INVALID_STATE: "This request is not in a state where that action is possible. Refresh and try again.",
  INVALID_INPUT: "Please choose a valid authority.",
  ALREADY_ALLOCATED: "Rooms are already allotted for this request.",
  NETWORK: "Unable to reach the server. Check your connection and try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

/** triage = brand-new, still with the admin · review = with an authority (or sent back) · allot = approved, admin assigns rooms */
const phaseOf = (b: Booking) => b.status === "Approved" ? "allot" : (b.trail ?? []).some((t) => t.action === "forward") ? "review" : "triage";

const INTRO_ADMIN = "Every new request arrives here first. Forward it to the right authority; once someone approves, it comes back to you to allot rooms.";
const INTRO_AUTH = "Requests forwarded to you appear under “Waiting for me”. You can approve, hold, reject, or forward to someone else.";

export default function DashboardPage() {
  const { status, authority } = useAuth();
  const router = useRouter();
  const [scope, setScope] = useState<AuthorityScope>("mine");
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [forwarding, setForwarding] = useState<Booking | null>(null);
  const [allotting, setAllotting] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState("");
  const reqId = useRef(0);

  useEffect(() => { if (status === "anon") router.replace("/authority/login"); }, [status, router]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const list = await authorityApi.list(scope);
      if (id !== reqId.current) return;
      setItems(list); setError("");
      setUpdated(new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }));
    } catch (e) {
      if (id !== reqId.current) return;
      if ((e as ApiError).code === "UNAUTHENTICATED") { router.replace("/authority/login"); return; }
      setItems([]); setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN);
    } finally { if (id === reqId.current) setLoading(false); }
  }, [scope, router]);

  useEffect(() => { if (status === "authed") load(); }, [status, load]);

  const openForward = (b: Booking) => setForwarding(b);

  async function act(b: Booking, decision: Decision, forwardTo = "") {
    setBusyId(b.bookingId); setError(""); setNotice("");
    try {
      await authorityApi.decide(b.bookingId, decision, remarks[b.bookingId] ?? "", forwardTo);
      setRemarks((r) => ({ ...r, [b.bookingId]: "" }));
      setForwarding(null);
      setNotice({
        forward: `${b.bookingId} was forwarded. It is no longer in your queue.`,
        approve: `${b.bookingId} approved. It is back with the admin for room allotment.`,
        reject: `${b.bookingId} rejected.`, hold: `${b.bookingId} put on hold.`, resume: `${b.bookingId} resumed.`,
      }[decision]);
      await load();
    } catch (e) {
      setForwarding(null);
      setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN);
    } finally { setBusyId(""); }
  }

  async function release(b: Booking) {
    if (!window.confirm(`Release the rooms of ${b.bookingId}? It will go back to Room Allotment Pending.`)) return;
    setBusyId(b.bookingId); setError(""); setNotice("");
    try { await authorityApi.unallocate(b.bookingId); setNotice(`${b.bookingId}: rooms released. Allot new rooms when ready.`); await load(); }
    catch (e) { setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN); }
    finally { setBusyId(""); }
  }

  if (status !== "authed") return <p className="center mute">Loading…</p>;
  const isFirst = !!authority?.isFirst;
  const tabs: [AuthorityScope, string][] = [["mine", "Waiting for me"], ["history", "History"], ...(isFirst ? [["all", "All requests"] as [AuthorityScope, string]] : [])];

  return (
    <div>
      <section className="page-head">
        <div>
          <h1>My Approvals</h1>
          <p className="mute">Welcome, {authority?.name}. {isFirst ? INTRO_ADMIN : INTRO_AUTH}</p>
        </div>
      </section>

      <div className="toolbar">
        <div className="seg" role="tablist">
          {tabs.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={scope === key} className={scope === key ? "on" : ""}
              onClick={() => { if (key !== scope) { setItems(null); setScope(key); } }}>{label}</button>
          ))}
        </div>
        <div className="toolbar-r">
          {updated && <span className="mute small">Updated {updated}</span>}
          <button className="btn ghost" onClick={load} disabled={loading} aria-busy={loading}>
            {loading ? <><i className="spin" /> Refreshing…</> : "↻ Refresh"}
          </button>
        </div>
      </div>

      {notice && <div className="alert ok" role="status">{notice}</div>}
      {error && <div className="alert err" role="alert">{error}</div>}

      {items === null && [0, 1].map((i) => <div key={i} className="req skeleton-card" aria-hidden><div className="skeleton" /><div className="skeleton s2" /><div className="skeleton s3" /></div>)}
      {items?.length === 0 && !error && (
        <div className="empty">
          <strong>{scope === "mine" ? "You are all caught up" : "Nothing to show"}</strong>
          <span className="mute">{scope === "mine" ? "Nothing is waiting for you right now." : "No requests in this view yet."}</span>
        </div>
      )}

      {items?.map((b) => {
        const phase = phaseOf(b), busy = busyId === b.bookingId;
        const showActions = b.canAct || b.canAllocate || b.canUnallocate;
        return (
          <BookingCard key={b.bookingId} b={b}>
            {showActions && (
              <div className="req-actions">
                {b.canAllocate ? (
                  <>
                    <span className="grow small">Approved. Choose {b.rooms} room{b.rooms === "1" ? "" : "s"} for this stay.</span>
                    <button className="btn" onClick={() => setAllotting(b)}>Allot rooms…</button>
                  </>
                ) : b.canUnallocate && !b.canAct ? (
                  <>
                    <span className="grow small">Rooms {b.allocatedRooms?.join(", ")} allotted.</span>
                    <button className="btn ghost" disabled={busy} onClick={() => release(b)}>Release rooms</button>
                  </>
                ) : b.canAct ? (
                  <>
                    <textarea
                      placeholder={phase === "triage" ? "Remarks for the next authority (required to reject or hold)" : "Remarks (required to reject or hold)"}
                      value={remarks[b.bookingId] ?? ""}
                      onChange={(e) => setRemarks((r) => ({ ...r, [b.bookingId]: e.target.value }))}
                    />
                    <div className="btn-row">
                      {b.status === "On Hold" ? (
                        <>
                          <button className="btn" disabled={busy} onClick={() => act(b, "resume")}>Resume</button>
                          <button className="btn ghost" disabled={busy} onClick={() => openForward(b)}>Forward…</button>
                        </>
                      ) : phase === "triage" ? (
                        <>
                          <button className="btn" disabled={busy} onClick={() => openForward(b)}>Forward to authority…</button>
                          <button className="btn ghost" disabled={busy} onClick={() => act(b, "hold")}>Hold</button>
                          <button className="btn ghost danger" disabled={busy} onClick={() => act(b, "reject")}>Reject</button>
                        </>
                      ) : (
                        <>
                          <button className="btn" disabled={busy} onClick={() => act(b, "approve")}>{busy ? <><i className="spin" /> Working…</> : "Approve"}</button>
                          <button className="btn ghost" disabled={busy} onClick={() => act(b, "hold")}>Hold</button>
                          <button className="btn ghost danger" disabled={busy} onClick={() => act(b, "reject")}>Reject</button>
                          <button className="btn ghost" disabled={busy} onClick={() => openForward(b)}>Forward…</button>
                        </>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </BookingCard>
        );
      })}

      {forwarding && (
        <ForwardDialog booking={forwarding} busy={busyId === forwarding.bookingId}
          onClose={() => setForwarding(null)} onConfirm={(email) => act(forwarding, "forward", email)} />
      )}
      {allotting && (
        <RoomPicker booking={allotting} onClose={() => setAllotting(null)}
          onDone={() => { setNotice(`${allotting.bookingId}: rooms allotted.`); setAllotting(null); load(); }} />
      )}
    </div>
  );
}
