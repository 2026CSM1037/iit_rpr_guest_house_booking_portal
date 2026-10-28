"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/types";

const MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED: "This Google account is not registered as an approving authority.",
  INVALID_TOKEN: "Google sign-in could not be verified. Please try again.",
  NETWORK: "Unable to reach the server. Check your connection and try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (status === "authed") router.replace("/authority/dashboard"); }, [status, router]);

  async function onCredential(credential?: string) {
    if (!credential) return setError(MESSAGES.INVALID_TOKEN);
    setBusy(true); setError(null);
    try { await login(credential); }
    catch (e) { setError(MESSAGES[(e as ApiError).code] ?? MESSAGES.UNKNOWN); }
    finally { setBusy(false); }
  }

  if (status === "loading") return <p className="center mute">Loading…</p>;

  return (
    <div className="card login">
      <h1>Authority Sign In</h1>
      <p className="mute">Guest House booking approvals</p>

      {error && <div className="alert" role="alert">{error}</div>}


      <div className="gbtn">
        {busy ? <p className="mute">Verifying your account…</p> : (
          <GoogleLogin
            onSuccess={(r) => onCredential(r.credential)}
            onError={() => setError(MESSAGES.INVALID_TOKEN)}
            text="signin_with" shape="rectangular" theme="outline" size="large" width="320"
          />
        )}
      </div>

      <p className="hint">Use your official @iitrpr.ac.in account. Access is limited to registered authorities.</p>
    </div>
  );
}
