import type { Metadata } from "next";
import UserProviders from "./UserProviders";
import UserHeader from "./components/Header";
import UserFooter from "./components/Footer";
import PortalShell from "./components/PortalShell";
import "./user-portal.css";
import "./user-inner-pages.css";

export const metadata: Metadata = { title: "IIT Ropar Guest House Portal", description: "Guest House Booking Portal for IIT Ropar" };

export default function UserLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <UserProviders>
      <PortalShell>
        <UserHeader />
        <div className="user-main">{children}</div>
        <UserFooter />
      </PortalShell>
    </UserProviders>
  );
}
