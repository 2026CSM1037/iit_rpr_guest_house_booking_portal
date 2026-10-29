"use client";
import { useEffect, useMemo, useState } from "react";
import { authorityApi } from "@/lib/api/client";
import type { ApiError, Booking, RoomInfo } from "@/lib/api/types";
import Dialog from "./Dialog";

export const shortCategory = (c: string) =>
  c.replace("Executive Suite — Category-", "Exec ").replace("Business Room — Category-", "Biz ").replace("Business Room — Category ", "Biz ");

const ERRORS: Record<string, string> = {
  ROOMS_UNAVAILABLE: "One of those rooms was just taken. The map has been refreshed - please pick again.",
  INVALID_INPUT: "Select exactly the number of rooms requested.",
  NETWORK: "Unable to reach the server. Check your connection and try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

/** Floor-by-floor room map. Rooms already held for the guest's dates are locked; the requested category is starred. */
export default function RoomPicker({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: () => void }) {
  const need = parseInt(booking.rooms, 10) || 1;
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () => authorityApi.rooms(booking.bookingId).then(setRooms).catch((e: ApiError) =>
    setError(e.status === 404 || e.status === 405 ? "Room allotment is not available on the server yet." : ERRORS[e.code] ?? ERRORS.UNKNOWN));
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [booking.bookingId]);

  const floors = useMemo(() => {
    const m = new Map<string, RoomInfo[]>();
    rooms?.forEach((r) => m.set(r.floor, [...(m.get(r.floor) ?? []), r]));
    return [...m.entries()];
  }, [rooms]);

  const matches = (r: RoomInfo) => booking.category.startsWith(r.category);
  const offCategory = sel.filter((id) => { const r = rooms?.find((x) => x.id === id); return r && !matches(r); });

  function toggle(r: RoomInfo) {
    if (r.busyWith) return;
    setSel((s) => s.includes(r.id) ? s.filter((x) => x !== r.id) : s.length < need ? [...s, r.id] : need === 1 ? [r.id] : s);
  }

  async function confirm() {
    setBusy(true); setError("");
    try { await authorityApi.allot(booking.bookingId, sel); onDone(); }
    catch (e) {
      setError(ERRORS[(e as ApiError).code] ?? ERRORS.UNKNOWN);
      if ((e as ApiError).code === "ROOMS_UNAVAILABLE") { setSel([]); refresh(); }
    } finally { setBusy(false); }
  }

  return (
    <Dialog
      wide
      title={`Allot rooms · ${booking.bookingId}`}
      onClose={onClose}
      footer={
        <>
          <span className="mute small grow">{sel.length} of {need} selected{sel.length ? `: ${sel.join(", ")}` : ""}</span>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn" disabled={sel.length !== need || busy} onClick={confirm}>{busy ? "Saving…" : "Confirm allotment"}</button>
        </>
      }
    >
      <p className="small">
        <strong>{booking.name}</strong> · {need} room{need > 1 ? "s" : ""} · {booking.category}<br />
        <span className="mute">{new Date(booking.arrival).toLocaleDateString("en-IN", { dateStyle: "medium" })} → {new Date(booking.departure).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
      </p>

      <div className="legend small">
        <span><i className="sw free" /> Free</span><span><i className="sw on" /> Selected</span>
        <span><i className="sw busy" /> Taken for these dates</span><span>★ Requested category</span>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}
      {rooms === null && !error && <p className="mute">Loading rooms…</p>}

      {floors.map(([floor, list]) => (
        <section key={floor} className="floor">
          <h3>{floor}</h3>
          <div className="room-grid">
            {list.map((r) => (
              <button key={r.id} type="button" disabled={!!r.busyWith}
                className={`room${sel.includes(r.id) ? " on" : ""}${r.busyWith ? " busy" : ""}`}
                onClick={() => toggle(r)} title={r.busyWith ? `Held by ${r.busyWith}` : r.category}>
                <b>{r.id}{matches(r) ? " ★" : ""}</b>
                <small>{shortCategory(r.category)}</small>
                {r.busyWith && <small>{r.busyWith}</small>}
              </button>
            ))}
          </div>
        </section>
      ))}

      {offCategory.length > 0 && <p className="note small">Note: {offCategory.join(", ")} {offCategory.length > 1 ? "are" : "is"} not in the category the guest requested.</p>}
    </Dialog>
  );
}
