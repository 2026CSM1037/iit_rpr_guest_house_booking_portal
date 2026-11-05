import { statusMeta } from "./status";

export default function StatusPill({ status }: { status: string }) {
  const m = statusMeta(status);
  return <span className={`pill t-${m.tone}`}>{m.label}</span>;
}
