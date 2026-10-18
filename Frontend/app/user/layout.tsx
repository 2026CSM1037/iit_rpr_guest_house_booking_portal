import type { Metadata } from "next";
import { GoogleOAuthProvider } from "@react-oauth/google";
import UserHeader from "./components/Header";
import UserFooter from "./components/Footer";
import "./user-portal.css";

export const metadata: Metadata = { title: "IIT Ropar Guest House Portal", description: "Guest House Booking Portal for IIT Ropar" };

export default function UserLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}>
      <div className="user-portal">
        <UserHeader />
        <div className="user-main">{children}</div>
        <UserFooter />
      </div>
    </GoogleOAuthProvider>
  );
}
