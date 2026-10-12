"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";

export default function DashboardPage() {
  const { status, authority } = useAuth();
  const router = useRouter();

  useEffect(() => { if (status === "anon") router.replace("/authority/login"); }, [status, router]);
  if (status !== "authed") return <p className="center mute">Loading…</p>;

  return (
    <div className="card">
      <h1>My Approvals</h1>
      <p className="mute">Welcome, {authority?.name}. Pending requests will appear here lol.</p>
    </div>
  );
}