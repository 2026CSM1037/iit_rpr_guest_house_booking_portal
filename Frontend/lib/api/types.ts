export type Authority = { name: string; email: string; isFirst: boolean }; // isFirst = the Guest House admin who receives every new request
export type AuthorityInfo = { email: string; name: string };
export type SessionUser = { name: string; email: string };
export type Receptionist = { name: string; email: string };

/**
 * Pending Approval -> with `currentApprover` (admin first, then whoever it was forwarded to)
 * On Hold          -> paused by `currentApprover`
 * Approved         -> an authority approved; back with the admin, waiting for ROOM ALLOTMENT
 * Booked           -> rooms allotted, ready for check-in
 * (the UI shows these as "Room Allotment Pending" / "Room Allotted", see lib/ui/status.ts)
 */
export type BookingStatus = "Pending Approval" | "On Hold" | "Approved" | "Booked" | "Rejected" | "Cancelled";

/** `by` is only sent to staff, never to the applicant. */
export type Stamp = { by?: string; at: string } | null;

export type TrailAction = "submit" | "forward" | "approve" | "reject" | "hold" | "resume" | "allocate" | "unallocate" | "cancel" | "reassign";
export type TrailEntry = { by?: string; to?: string; action: TrailAction; at: string; remarks?: string };

export type BookingGuest = {
  name: string; gender: string; age: string; relation: string;
  idType: string; idNumber: string; arrival: string; departure: string;
};

export type Booking = {
  bookingId: string;
  submittedAt: string;
  status: BookingStatus;
  currentApprover?: string; // staff only: who has to act next ("" when finished)
  trail: TrailEntry[];      // who did what, in order
  allocatedRooms?: string[]; // room numbers, once Booked
  approvedByName?: string;
  name: string; email: string; designation: string; department: string;
  employeeCode: string; mobile: string; category: string; payment: string;
  purpose: string; project: string; rooms: string; approverEmail: string;
  arrival: string; departure: string; nights: number; roomCharges: number;
  guests: BookingGuest[];
  primaryIdLink: string; approvalDocLink: string; // empty for the applicant
  approvedBy?: Stamp;
  checkIn: Stamp; checkOut: Stamp;
  remarks: string;
  canAct?: boolean;        // authority list only: it is this person's turn
  canAllocate?: boolean;   // first admin, status Approved
  canUnallocate?: boolean; // first admin, status Booked and not checked in
};

export type Decision = "approve" | "reject" | "hold" | "resume" | "forward";
export type AuthorityScope = "mine" | "history" | "all";

/** One physical room for a given stay. `busyUntil` = when it frees up (only when not available). */
export type RoomInfo = { roomNo: string; officialOnly: boolean; available: boolean; busyUntil: string; note: string };
export type Availability = { needed: number; free: number; full: boolean; rooms: RoomInfo[]; earliestFree: string; officialSuggested: boolean };

export type ApiErrorCode =
  | "NOT_AUTHORIZED" // Google account is valid but not allowed for this portal / stage
  | "INVALID_TOKEN"  // Google token failed verification
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "NOT_FOUND"
  | "ALREADY_DECIDED"
  | "INVALID_STATE"
  | "ALREADY_DONE"
  | "REMARKS_REQUIRED"
  | "ROOM_BUSY"
  | "ROOM_OFFICIAL_ONLY"
  | "UNKNOWN_ROOM"
  | "WRONG_ROOM_COUNT"
  | "ALREADY_ALLOCATED"
  | "NETWORK"
  | "UNKNOWN";

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, public status = 0) {
    super(code);
  }
}
