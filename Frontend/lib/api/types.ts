export type AuthorityRole = "chairman" | "warden" | "dean";

export type Authority = { name: string; email: string; roles: AuthorityRole[] };
export type SessionUser = { name: string; email: string };
export type Receptionist = { name: string; email: string };

export type BookingStatus =
  | "Submitted"
  | "Pending at Chairman"
  | "Pending at Warden"
  | "Pending at Dean"
  | "Booked"
  | "Rejected"
  | "On Hold";

/** `by` is only sent to staff, never to the applicant. */
export type Stamp = { by?: string; at: string } | null;

export type BookingGuest = {
  name: string; gender: string; age: string; relation: string;
  idType: string; idNumber: string; arrival: string; departure: string;
};

export type Booking = {
  bookingId: string;
  submittedAt: string;
  status: BookingStatus;
  stage: AuthorityRole | null; // who has to act next (null = finished)
  name: string; email: string; designation: string; department: string;
  employeeCode: string; mobile: string; category: string; payment: string;
  purpose: string; project: string; rooms: string; approverEmail: string;
  arrival: string; departure: string; nights: number; roomCharges: number;
  guests: BookingGuest[];
  primaryIdLink: string; approvalDocLink: string; // empty for the applicant
  approvals: Record<AuthorityRole, Stamp>;
  checkIn: Stamp; checkOut: Stamp;
  remarks: string;
  canAct?: boolean; // authority list only
};

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
  | "NETWORK"
  | "UNKNOWN";

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, public status = 0) {
    super(code);
  }
}
