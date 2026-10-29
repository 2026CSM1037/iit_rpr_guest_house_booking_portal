export type Authority = { name: string; email: string; isFirst: boolean }; // isFirst = the Guest House admin who receives every new request
export type AuthorityInfo = { email: string; name: string; designation: string };
export type SessionUser = { name: string; email: string };
export type Receptionist = { name: string; email: string };

/**
 * Pending Approval -> with `currentApprover` (admin first, then whoever it was forwarded to)
 * On Hold          -> paused by `currentApprover`
 * Approved         -> an authority approved; back with the admin for ROOM ALLOTMENT
 * Booked           -> rooms allotted, ready for check-in
 */
export type BookingStatus = "Pending Approval" | "On Hold" | "Approved" | "Booked" | "Rejected" | "Cancelled";

/** `by` is only sent to staff, never to the applicant. */
export type Stamp = { by?: string; at: string } | null;

export type TrailAction = "submit" | "forward" | "approve" | "reject" | "hold" | "resume" | "allot";
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
  roomsAllotted?: string[]; // room numbers, once Booked
  name: string; email: string; designation: string; department: string;
  employeeCode: string; mobile: string; category: string; payment: string;
  purpose: string; project: string; rooms: string; approverEmail: string;
  arrival: string; departure: string; nights: number; roomCharges: number;
  guests: BookingGuest[];
  primaryIdLink: string; approvalDocLink: string; // empty for the applicant
  approvedBy?: Stamp;
  checkIn: Stamp; checkOut: Stamp;
  remarks: string;
  canAct?: boolean; // authority list only
};

export type Decision = "approve" | "reject" | "hold" | "resume" | "forward";
export type AuthorityScope = "mine" | "history" | "all";

/** One physical room. `busyWith` = booking id that already holds it for the requested dates. */
export type RoomInfo = { id: string; floor: string; category: string; busyWith?: string };

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
  | "ROOMS_UNAVAILABLE"
  | "NETWORK"
  | "UNKNOWN";

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, public status = 0) {
    super(code);
  }
}
