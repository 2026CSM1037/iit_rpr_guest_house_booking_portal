"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Status = "loading" | "authed" | "anon";
type SessionApi<T> = {
  me: () => Promise<T>;
  loginWithGoogle: (credential: string) => Promise<T>;
  logout: () => Promise<void>;
};
export type AuthValue<T> = {
  status: Status;
  account: T | null;
  login: (googleCredential: string) => Promise<void>; // throws ApiError
  logout: () => Promise<void>;
};

/** Builds a Provider + hook pair for one role (user / receptionist). */
export function makeAuth<T>(api: SessionApi<T>, hookName: string) {
  const Ctx = createContext<AuthValue<T> | null>(null);

  function useAuthValue() {
    const c = useContext(Ctx);
    if (!c) throw new Error(`${hookName} must be used inside its provider`);
    return c;
  }

  function Provider({ children }: { children: React.ReactNode }) {
    const [account, setAccount] = useState<T | null>(null);
    const [status, setStatus] = useState<Status>("loading");

    useEffect(() => {
      api.me()
        .then((a) => { setAccount(a); setStatus("authed"); })
        .catch(() => setStatus("anon"));
    }, []);

    const login = useCallback(async (cred: string) => {
      const a = await api.loginWithGoogle(cred);
      setAccount(a); setStatus("authed");
    }, []);

    const logout = useCallback(async () => {
      await api.logout().catch(() => {});
      setAccount(null); setStatus("anon");
    }, []);

    return <Ctx.Provider value={{ status, account, login, logout }}>{children}</Ctx.Provider>;
  }

  return { Provider, useAuthValue };
}
