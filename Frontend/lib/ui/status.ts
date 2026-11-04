import type { BookingStatus } from "@/lib/api/types";

export type Tone = "amber" | "violet" | "blue" | "green" | "red" | "gray";

/** How each backend status is shown to staff: a clearer label and a colour. */
export const STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  "Pending Approval": { label: "Pending Approval", tone: "amber" },
  "On Hold": { label: "On Hold", tone: "violet" },
  Approved: { label: "Room Allotment Pending", tone: "blue" },
  Booked: { label: "Room Allotted", tone: "green" },
  Rejected: { label: "Rejected", tone: "red" },
  Cancelled: { label: "Cancelled", tone: "gray" },
};

export const statusMeta = (s: string) => STATUS[s as BookingStatus] ?? { label: s, tone: "gray" as Tone };
