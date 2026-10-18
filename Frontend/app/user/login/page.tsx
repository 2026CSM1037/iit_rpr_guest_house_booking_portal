"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";

function decodeCredential(credential: string): { email?: string; name?: string } | null {
  try {
    const payload = credential.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch { return null; }
}

export default function UserLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="page-shell user-login-page">
      <section className="panel user-login-card">
        <h1>Sign in to Guest House Portal</h1>
        <p>Use your Google account to continue to the guest booking interface.</p>
        {error && <p className="user-login-error" role="alert">{error}</p>}
        <div className="user-google-login">
          <GoogleLogin
            onSuccess={(response) => {
              const profile = response.credential ? decodeCredential(response.credential) : null;
              if (!profile?.email) { setError("Google sign-in could not be verified. Please try again."); return; }
              if (!profile.email.toLowerCase().endsWith("@iitrpr.ac.in")) { setError("Please use your official @iitrpr.ac.in account."); return; }
              sessionStorage.setItem("guest_house_user_email", profile.email);
              sessionStorage.setItem("guest_house_user_name", profile.name ?? "");
              router.replace("/user");
            }}
            onError={() => setError("Google sign-in failed. Please try again.")}
            text="signin_with" shape="rectangular" theme="outline" size="large" width="320"
          />
        </div>
        <p className="user-login-hint">Use your official @iitrpr.ac.in account.</p>
        <p className="user-login-hint">Note: secure account authorization requires server-side verification. This UI sign-in checks the account domain in the browser.</p>
      </section>
    </div>
  );
}
