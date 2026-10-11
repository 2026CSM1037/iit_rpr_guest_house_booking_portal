import "./globals.css";
export const metadata = { title: "IIT Ropar Guest House – Authority Portal" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}