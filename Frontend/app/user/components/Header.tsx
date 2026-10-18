"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function UserHeader() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { setEmail(sessionStorage.getItem("guest_house_user_email")); }, []);
  function signOut() { sessionStorage.removeItem("guest_house_user_email"); setEmail(null); }
  return (
    <header className="site-header">
      <Link href="/user" className="brand">
        <div className="brand-mark">IIT</div>
        <div><div className="brand-hi">भारतीय प्रौद्योगिकी संस्थान रोपड़</div><div className="brand-en">Indian Institute of Technology Ropar</div></div>
      </Link>
      <nav className="nav">
        <Link href="/user">Home</Link><Link href="/user/book">Book Online</Link><Link href="/user/status">Booking Status</Link>
        {email ? <button type="button" className="user-auth-button" onClick={signOut}>Sign out</button> : <Link className="user-auth-link" href="/user/login">Sign in with Google</Link>}
      </nav>
    </header>
  );
}
