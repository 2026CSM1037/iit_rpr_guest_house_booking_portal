/**
 * The ONLY file that knows how to talk to the backend.
 * Swap the implementation here and nothing else in the app changes.
 *
 * Contract the backend must satisfy (session = httpOnly cookie):
 *   POST /auth/google  { credential }  -> 200 { authority }   | 401 {code:"INVALID_TOKEN"} | 403 {code:"NOT_AUTHORIZED"}
 *   GET  /auth/me                      -> 200 { authority }   | 401
 *   POST /auth/logout                  -> 204
 */
import { ApiError, ApiErrorCode, Authority } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
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

const real = {
  loginWithGoogle: (credential: string) =>
    http<{ authority: Authority }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }).then((r) => r.authority),
  me: () => http<{ authority: Authority }>("/auth/me").then((r) => r.authority),
  logout: () => http<void>("/auth/logout", { method: "POST" }),
};

// ---- Mock (dev only): any @iitrpr.ac.in Google account is accepted ----
const KEY = "mock_authority";
const mock: typeof real = {
  async loginWithGoogle(credential) {
    await new Promise((r) => setTimeout(r, 600));
    let p: { email?: string; name?: string };
    try { p = JSON.parse(atob(credential.split(".")[1])); } catch { throw new ApiError("INVALID_TOKEN", 401); }
    if (!p.email?.endsWith("@iitrpr.ac.in")) throw new ApiError("NOT_AUTHORIZED", 403);
    const a: Authority = { name: p.name ?? "Authority", email: p.email, level: 2 };
    sessionStorage.setItem(KEY, JSON.stringify(a));
    return a;
  },
  async me() {
    const s = sessionStorage.getItem(KEY);
    if (!s) throw new ApiError("UNAUTHENTICATED", 401);
    return JSON.parse(s);
  },
  async logout() { sessionStorage.removeItem(KEY); },
};

export const authApi = USE_MOCK ? mock : real;
