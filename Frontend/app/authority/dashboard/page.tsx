"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { authorityApi, type Decision } from "@/lib/api/client";
import { ApiError, type AuthorityInfo, type AuthorityScope, type Booking } from "@/lib/api/types";
import BookingCard from "@/lib/ui/BookingCard";
import ForwardDialog from "@/lib/ui/ForwardDialog";
import RoomPicker from "@/lib/ui/RoomPicker";

const MESSAGES: Record<string, string> = {
  REMARKS_REQUIRED: "Please write remarks before rejecting or holding a request.",
  NOT_AUTHORIZED: "This request is no longer with you.",
  ALREADY_DECIDED: "This request has already been finalised.",
  INVALID_STATE: "This request is not in a state where that action is possible. Refresh and try again.",
  INVALID_INPUT: "Please choose a valid authority.",
  NETWORK: "Unable to reach the server. Check your connection and try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

/** triage = brand-new, still with the admin · review = with an authority (or sent back) · allot = approved, admin assigns rooms */
const phaseOf = (b: Booking) => b.status === "Approved" ? "allot" : b.trail.some((t) => t.action === "forward") ? "review" : "triage";

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
  const [admins, setAdmins] = useState<AuthorityInfo[] | null>(null);

  useEffect(() => { if (status === "anon") router.replace("/authority/login"); }, [status, router]);

  const load = useCallback(async () => {
    try { setItems(await authorityApi.list(scope)); setError(""); }
    catch (e) {
      if ((e as ApiError).code === "UNAUTHENTICATED") { router.replace("/authority/login"); return; }
      setItems([]); setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN);
    }
  }, [scope, router]);

  useEffect(() => { if (status === "authed") load(); }, [status, load]);

  async function openForward(b: Booking) {
    setForwarding(b);
    if (!admins) authorityApi.admins().then(setAdmins).catch(() => setAdmins([]));
  }

  async function act(b: Booking, decision: Decision, forwardTo = "") {
    setBusyId(b.bookingId); setError(""); setNotice("");
    try {
      await authorityApi.decide(b.bookingId, decision, remarks[b.bookingId] ?? "", forwardTo);
      setRemarks((r) => ({ ...r, [b.bookingId]: "" }));
      setForwarding(null);
      setNotice({
        forward: `${b.bookingId} was forwarded. It is no longer in your queue.`,
        approve: `${b.bookingId} approved - it has gone back to the admin for room allotment.`,
        reject: `${b.bookingId} rejected.`, hold: `${b.bookingId} put on hold.`, resume: `${b.bookingId} resumed.`,
      }[decision]);
      await load();
    } catch (e) {
      setForwarding(null);
      setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN);
    } finally { setBusyId(""); }
  }

  if (status !== "authed") return <p className="center mute">Loading…</p>;
  const isFirst = !!authority?.isFirst;
  const tabs: [AuthorityScope, string][] = [["mine", "Waiting for me"], ["history", "History"], ...(isFirst ? [["all", "All requests"] as [AuthorityScope, string]] : [])];

  return (
    <div>
      <div className="card">
        <h1>My Approvals</h1>
        <p className="mute">Welcome, {authority?.name}. {isFirst ? INTRO_ADMIN : INTRO_AUTH}</p>
      </div>

      <div className="tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={`btn ${scope === key ? "" : "ghost"}`} onClick={() => { setItems(null); setScope(key); }}>{label}</button>
        ))}
        <button className="btn ghost" onClick={load}>Refresh</button>
      </div>

      {notice && <div className="alert ok" role="status">{notice}</div>}
      {error && <div className="alert" role="alert">{error}</div>}
      {items === null && <p className="mute">Loading requests…</p>}
      {items?.length === 0 && !error && <p className="mute">{scope === "mine" ? "Nothing is waiting for you right now." : "No requests to show."}</p>}

      {items?.map((b) => {
        const phase = phaseOf(b), busy = busyId === b.bookingId;
        return (
          <BookingCard key={b.bookingId} b={b}>
            {b.canAct && (
              <div className="req-actions">
                {phase === "allot" ? (
                  <>
                    <span className="grow">Approved. Allot {b.rooms} room{b.rooms === "1" ? "" : "s"} ({b.category}).</span>
                    <button className="btn" onClick={() => setAllotting(b)}>Allot rooms…</button>
                  </>
                ) : (
                  <>
                    <textarea
                      placeholder={phase === "triage" ? "Remarks for the next authority (required to reject / hold)" : "Remarks (required to reject / hold)"}
                      value={remarks[b.bookingId] ?? ""}
                      onChange={(e) => setRemarks((r) => ({ ...r, [b.bookingId]: e.target.value }))}
                    />
                    {b.status === "On Hold" ? (
                      <>
                        <button className="btn" disabled={busy} onClick={() => act(b, "resume")}>Resume</button>
                        <button className="btn ghost" disabled={busy} onClick={() => openForward(b)}>Forward…</button>
                      </>
                    ) : phase === "triage" ? (
                      <>
                        <button className="btn" disabled={busy} onClick={() => openForward(b)}>Forward to authority…</button>
                        <button className="btn ghost" disabled={busy} onClick={() => act(b, "hold")}>Hold</button>
                        <button className="btn ghost" disabled={busy} onClick={() => act(b, "reject")}>Reject</button>
                      </>
                    ) : (
                      <>
                        <button className="btn" disabled={busy} onClick={() => act(b, "approve")}>Approve</button>
                        <button className="btn ghost" disabled={busy} onClick={() => act(b, "hold")}>Hold</button>
                        <button className="btn ghost" disabled={busy} onClick={() => act(b, "reject")}>Reject</button>
                        <button className="btn ghost" disabled={busy} onClick={() => openForward(b)}>Forward…</button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </BookingCard>
        );
      })}

      {forwarding && (
        <ForwardDialog booking={forwarding} admins={admins} busy={busyId === forwarding.bookingId}
          onClose={() => setForwarding(null)} onConfirm={(email) => act(forwarding, "forward", email)} />
      )}
      {allotting && (
        <RoomPicker booking={allotting} onClose={() => setAllotting(null)}
          onDone={() => { setNotice(`${allotting.bookingId} is booked. Rooms allotted.`); setAllotting(null); load(); }} />
      )}
    </div>
  );
}
