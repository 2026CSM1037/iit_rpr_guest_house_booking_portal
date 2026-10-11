"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "@/lib/api/client";
import type { Authority } from "@/lib/api/types";

type Status = "loading" | "authed" | "anon";
type Ctx = {
  status: Status;
  authority: Authority | null;
  login: (googleCredential: string) => Promise<void>; // throws ApiError
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    authApi.me()
      .then((a) => { setAuthority(a); setStatus("authed"); })
      .catch(() => setStatus("anon"));
  }, []);

  const login = useCallback(async (cred: string) => {
    const a = await authApi.loginWithGoogle(cred);
    setAuthority(a); setStatus("authed");
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setAuthority(null); setStatus("anon");
  }, []);

  return <AuthCtx.Provider value={{ status, authority, login, logout }}>{children}</AuthCtx.Provider>;
}
