"use client";
import { useEffect, useMemo, useState } from "react";
import { authorityApi } from "@/lib/api/client";
import type { ApiError, Availability, Booking, RoomInfo } from "@/lib/api/types";
import Dialog from "./Dialog";

const ERRORS: Record<string, string> = {
  ROOM_BUSY: "One of those rooms was just taken. The map has been refreshed, please choose again.",
  ROOM_OFFICIAL_ONLY: "Rooms marked “Official” can only be used for official visits.",
  WRONG_ROOM_COUNT: "Select exactly the number of rooms requested.",
  UNKNOWN_ROOM: "One of those rooms does not exist.",
  INVALID_STATE: "This request is no longer waiting for room allotment.",
  NOT_AUTHORIZED: "Only the admin can allot rooms.",
  NETWORK: "Unable to reach the server. Check your connection and try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};
const dt = (v: string) => new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const floorOf = (no: string) => { const n = parseInt(no, 10); return Number.isNaN(n) ? "Rooms" : n >= 200 ? "Second floor" : n >= 100 ? "First floor" : "Ground floor"; };

/** Floor-by-floor room map for the guest's dates. Taken rooms show when they free up. */
export default function RoomPicker({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: () => void }) {
  const [data, setData] = useState<Availability | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [official, setOfficial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () => authorityApi.availability(booking.bookingId)
    .then((d) => { setData(d); setOfficial((o) => o || d.officialSuggested); })
    .catch((e: ApiError) => setError(ERRORS[e.code] ?? ERRORS.UNKNOWN));
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [booking.bookingId]);

  const need = data?.needed ?? (parseInt(booking.rooms, 10) || 1);
  const floors = useMemo(() => {
    const m = new Map<string, RoomInfo[]>();
    data?.rooms.forEach((r) => m.set(floorOf(r.roomNo), [...(m.get(floorOf(r.roomNo)) ?? []), r]));
    return [...m.entries()];
  }, [data]);

  const locked = (r: RoomInfo) => !r.available || (r.officialOnly && !official);
  function toggle(r: RoomInfo) {
    if (locked(r)) return;
    setSel((s) => s.includes(r.roomNo) ? s.filter((x) => x !== r.roomNo) : s.length < need ? [...s, r.roomNo] : need === 1 ? [r.roomNo] : s);
  }
  function toggleOfficial(v: boolean) {
    setOfficial(v);
    if (!v) setSel((s) => s.filter((id) => !data?.rooms.find((r) => r.roomNo === id)?.officialOnly));
  }

  async function confirm() {
    setBusy(true); setError("");
    try { await authorityApi.allocate(booking.bookingId, sel, official); onDone(); }
    catch (e) {
      const code = (e as ApiError).code;
      setError(ERRORS[code] ?? ERRORS.UNKNOWN);
      if (code === "ROOM_BUSY") { setSel([]); refresh(); }
    } finally { setBusy(false); }
  }

  return (
    <Dialog
      wide
      title="Allot rooms"
      onClose={onClose}
      footer={
        <>
          <span className="mute small grow">{sel.length} of {need} selected{sel.length ? ` · ${sel.join(", ")}` : ""}</span>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn" disabled={sel.length !== need || busy} onClick={confirm}>
            {busy ? <><i className="spin" /> Saving…</> : "Confirm allotment"}
          </button>
        </>
      }
    >
      <div className="fwd-for"><code>{booking.bookingId}</code><span>{booking.name}</span></div>
      <p className="small mute">
        {need} room{need > 1 ? "s" : ""} · {new Date(booking.arrival).toLocaleDateString("en-IN", { dateStyle: "medium" })} → {new Date(booking.departure).toLocaleDateString("en-IN", { dateStyle: "medium" })}
        {data && <> · <strong className="ink">{data.free} free</strong></>}
      </p>

      {data?.full && (
        <div className="alert">Not enough rooms are free for these dates{data.earliestFree ? `. The earliest a room frees up is ${dt(data.earliestFree)}` : ""}.</div>
      )}
      {error && <div className="alert err" role="alert">{error}</div>}
      {!data && !error && <p className="mute">Loading rooms…</p>}

      {data && (
        <label className="check">
          <input type="checkbox" checked={official} onChange={(e) => toggleOfficial(e.target.checked)} />
          This is an official visit <span className="mute">(unlocks rooms marked Official)</span>
        </label>
      )}

      <div className="legend small">
        <span><i className="sw" /> Free</span><span><i className="sw on" /> Selected</span><span><i className="sw busy" /> Taken</span>
      </div>

      {floors.map(([floor, list]) => (
        <section key={floor} className="floor">
          <h3>{floor}</h3>
          <div className="room-grid">
            {list.map((r) => (
              <button key={r.roomNo} type="button" disabled={locked(r)}
                className={`room${sel.includes(r.roomNo) ? " on" : ""}${!r.available ? " busy" : ""}`}
                onClick={() => toggle(r)}
                title={!r.available ? `Free from ${dt(r.busyUntil)}` : r.note || undefined}>
                <b>{r.roomNo}</b>
                {!r.available ? <small>Free {dt(r.busyUntil)}</small> : r.officialOnly ? <small>Official</small> : <small>Available</small>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </Dialog>
  );
}
