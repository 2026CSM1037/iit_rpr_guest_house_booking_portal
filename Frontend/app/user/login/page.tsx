"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { useUserAuth } from "@/lib/auth/UserAuth";
import { ApiError } from "@/lib/api/types";

const MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED: "Please use your official @iitrpr.ac.in account.",
  INVALID_TOKEN: "Google sign-in could not be verified. Please try again.",
  NETWORK: "Unable to reach the server. Make sure the backend is running and try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

export default function UserLoginPage() {
  const router = useRouter();
  const { status, login } = useUserAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authed") {
      const next = sessionStorage.getItem("gh_after_login") ?? "/user";
      sessionStorage.removeItem("gh_after_login");
      router.replace(next);
    }
  }, [status, router]);

  async function onCredential(credential?: string) {
    if (!credential) return setError(MESSAGES.INVALID_TOKEN);
    setBusy(true); setError("");
    try { await login(credential); }
    catch (e) { setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN); }
    finally { setBusy(false); }
  }

  return (
    <div className="page-shell user-login-page">
      <section className="panel user-login-card">
        <h1>Sign in to Guest House Portal</h1>
        <p>Use your Google account to continue to the guest booking interface.</p>
        {error && <p className="user-login-error" role="alert">{error}</p>}
        <div className="user-google-login">
          {busy || status === "loading" ? <p>Verifying your account…</p> : (
            <GoogleLogin
              onSuccess={(r) => onCredential(r.credential)}
              onError={() => setError(MESSAGES.INVALID_TOKEN)}
              text="signin_with" shape="rectangular" theme="outline" size="large" width="320"
            />
          )}
        </div>
        <p className="user-login-hint">Use your official @iitrpr.ac.in account.</p>
        <p className="user-login-hint">Your sign-in is verified securely by the portal server.</p>
      </section>
    </div>
  );
}
