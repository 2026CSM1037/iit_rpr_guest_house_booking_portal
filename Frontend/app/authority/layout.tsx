"use client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth/AuthContext";

function Header() {
  const { authority, logout } = useAuth();
  const router = useRouter();
  return (
    <header className="top">
      <div className="brand">
        <div className="logo">IIT</div>
        <div>भारतीय प्रौद्योगिकी संस्थान रोपड़<small>Indian Institute of Technology Ropar · Authority Portal</small></div>
      </div>
      {authority && (
        <div className="who">
          <span className="chip">{authority.roles.join(" · ")}</span>
          <span>{authority.email}</span>
          <button className="link" onClick={async () => { await logout(); router.replace("/authority/login"); }}>Sign out</button>
        </div>
      )}
    </header>
  );
}

export default function AuthorityLayout({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}>
      <AuthProvider>
        <Header />
        <main>{children}</main>
        <footer>Indian Institute of Technology Ropar</footer>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
