/**
 * The ONLY file that knows how to talk to the backend (FastAPI in /Backend).
 * Sessions are httpOnly cookies, one per role (user / authority / receptionist).
 *
 * Sign-in contract, same for all three roles:
 *   POST {prefix}/google  { credential } -> 200 { <role> } | 401 {code:"INVALID_TOKEN"} | 403 {code:"NOT_AUTHORIZED"}
 *   GET  {prefix}/me                     -> 200 { <role> } | 401
 *   POST {prefix}/logout                 -> 204
 *   prefixes: authority "/auth", user "/user/auth", receptionist "/receptionist/auth"
 */
import {
  ApiError, ApiErrorCode, Authority, Availability, AuthorityInfo, AuthorityScope, Booking, Decision, Receptionist, SessionUser,
} from "./types";

export type { Decision } from "./types";


const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      credentials: "include",
      ...init,
      // multipart uploads must let the browser set the Content-Type (with its boundary)
      headers: isForm ? init.headers : { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) },
    });
  } catch {
    throw new ApiError("NETWORK");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError((body.code as ApiErrorCode) ?? "UNKNOWN", res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

function sessionApi<T>(prefix: string, key: string) {
  return {
    loginWithGoogle: (credential: string) =>
      http<Record<string, T>>(`${prefix}/google`, { method: "POST", body: JSON.stringify({ credential }) }).then((r) => r[key]),
    me: () => http<Record<string, T>>(`${prefix}/me`).then((r) => r[key]),
    logout: () => http<void>(`${prefix}/logout`, { method: "POST" }),
  };
}

export const authApi = sessionApi<Authority>("/auth", "authority");
export const userAuthApi = sessionApi<SessionUser>("/user/auth", "user");
export const receptionistAuthApi = sessionApi<Receptionist>("/receptionist/auth", "receptionist");

export const bookingApi = {
  create: (data: unknown, primaryId: File, approval?: File | null) => {
    const fd = new FormData();
    fd.append("data", JSON.stringify(data));
    fd.append("primary_id_file", primaryId);
    if (approval) fd.append("approval_file", approval);
    return http<{ bookingId: string; status: string; submittedAt: string; nights: number; roomCharges: number }>(
      "/bookings", { method: "POST", body: fd });
  },
  mine: () => http<{ bookings: Booking[] }>("/user/bookings").then((r) => r.bookings),
  get: (id: string) => http<{ booking: Booking }>(`/user/bookings/${encodeURIComponent(id)}`).then((r) => r.booking),
};

/**
 * Authority workflow (matches Backend/main.py):
 *   new request            -> "Pending Approval", with the first admin
 *   decide "forward"       -> moves to forwardTo; the sender can no longer act
 *   decide "approve"       -> status "Approved" (UI: Room Allotment Pending), back with the first admin
 *   allocate               -> first admin picks the rooms -> status "Booked" (UI: Room Allotted)
 *   unallocate             -> releases the rooms, back to "Approved"
 */
const realAuthorityApi = {
  list: (scope: AuthorityScope) =>
    http<{ bookings: Booking[] }>(`/authority/bookings?scope=${scope}`)
      .then((r) => r.bookings.map((b) => ({ ...b, trail: b.trail ?? [], allocatedRooms: b.allocatedRooms ?? [] }))),
  /** Type-ahead for "Forward to". The backend returns nothing for an empty query. */
  searchAdmins: (q: string) =>
    http<{ admins: AuthorityInfo[] }>(`/authority/admins/search?q=${encodeURIComponent(q)}`).then((r) => r.admins),
  decide: (id: string, decision: Decision, remarks: string, forwardTo = "") =>
    http<{ bookingId: string; status: string }>(`/authority/bookings/${encodeURIComponent(id)}/decision`, {
      method: "POST", body: JSON.stringify({ decision, remarks, forwardTo }),
    }),
  availability: (id: string) =>
    http<Availability>(`/authority/bookings/${encodeURIComponent(id)}/availability`),
  allocate: (id: string, rooms: string[], officialVisit: boolean) =>
    http<{ bookingId: string; status: string; rooms: string[] }>(`/authority/bookings/${encodeURIComponent(id)}/allocate`, {
      method: "POST", body: JSON.stringify({ rooms, officialVisit }),
    }),
  unallocate: (id: string) =>
    http<{ bookingId: string; status: string }>(`/authority/bookings/${encodeURIComponent(id)}/unallocate`, { method: "POST" }),
};

export const authorityApi = realAuthorityApi;

export const receptionApi = {
  list: (scope: "active" | "all") =>
    http<{ bookings: Booking[] }>(`/receptionist/bookings?scope=${scope}`).then((r) => r.bookings),
  checkIn: (id: string) => http<unknown>(`/receptionist/bookings/${encodeURIComponent(id)}/checkin`, { method: "POST" }),
  checkOut: (id: string) => http<unknown>(`/receptionist/bookings/${encodeURIComponent(id)}/checkout`, { method: "POST" }),
};
