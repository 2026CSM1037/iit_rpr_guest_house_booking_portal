"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUserAuth } from "@/lib/auth/UserAuth";

export default function UserHeader() {
  const { status, account, logout } = useUserAuth();
  const router = useRouter();
  async function signOut() { await logout(); router.replace("/user"); }
  return (
    <header className="site-header">
      <Link href="/user" className="brand">
        <div className="brand-mark">IIT</div>
        <div><div className="brand-hi">भारतीय प्रौद्योगिकी संस्थान रोपड़</div><div className="brand-en">Indian Institute of Technology Ropar</div></div>
      </Link>
      <nav className="nav">
        <Link href="/user">Home</Link><Link href="/user/book">Book Online</Link><Link href="/user/status">Booking Status</Link>
        {status === "authed"
          ? <button type="button" className="user-auth-button" onClick={signOut} title={account?.email}>Sign out</button>
          : status === "anon" ? <Link className="user-auth-link" href="/user/login">Sign in with Google</Link> : null}
      </nav>
    </header>
  );
}
