"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { userAuthApi } from "@/lib/api/client";
import type { SessionUser } from "@/lib/api/types";
import { makeAuth } from "./makeAuth";

const { Provider, useAuthValue } = makeAuth<SessionUser>(userAuthApi, "useUserAuth");
export const UserAuthProvider = Provider;
export const useUserAuth = useAuthValue;

/** For pages that need a signed-in user: sends anonymous visitors to /user/login and back again afterwards. */
export function useRequireUser(afterLogin: string) {
  const auth = useUserAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.status === "anon") {
      sessionStorage.setItem("gh_after_login", afterLogin);
      router.replace("/user/login");
    }
  }, [auth.status, afterLogin, router]);
  return auth;
}
