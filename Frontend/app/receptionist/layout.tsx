"use client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { useRouter } from "next/navigation";
import { ReceptionistAuthProvider, useReceptionistAuth } from "@/lib/auth/ReceptionistAuth";

function Header() {
  const { account, logout } = useReceptionistAuth();
  const router = useRouter();
  return (
    <header className="top">
      <div className="brand">
        <div className="logo">IIT</div>
        <div>भारतीय प्रौद्योगिकी संस्थान रोपड़<small>Indian Institute of Technology Ropar · Reception Portal</small></div>
      </div>
      {account && (
        <div className="who">
          <span className="chip">Reception</span>
          <span>{account.email}</span>
          <button className="link" onClick={async () => { await logout(); router.replace("/receptionist/login"); }}>Sign out</button>
        </div>
      )}
    </header>
  );
}

export default function ReceptionistLayout({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}>
      <ReceptionistAuthProvider>
        <Header />
        <main>{children}</main>
        <footer>Indian Institute of Technology Ropar</footer>
      </ReceptionistAuthProvider>
    </GoogleOAuthProvider>
  );
}
