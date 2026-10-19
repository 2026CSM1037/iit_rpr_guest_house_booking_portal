"use client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { UserAuthProvider } from "@/lib/auth/UserAuth";

export default function UserProviders({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}>
      <UserAuthProvider>{children}</UserAuthProvider>
    </GoogleOAuthProvider>
  );
}
