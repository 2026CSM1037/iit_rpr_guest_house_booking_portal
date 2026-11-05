"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps the whole user portal and tells the CSS which kind of page is on screen.
 *
 * Why this exists: home.css / user-inner-pages.css used to detect the page with
 * `:has(.home-root)`. Next.js keeps previously visited routes mounted (hidden)
 * while you navigate, so a hidden `.home-root` made BOTH the "home" and the
 * "inner page" styles fight each other (header floating over the content,
 * header/footer merged, inner pages losing their styling).
 * The route itself is the single source of truth, so we expose it as
 * `data-page="home" | "inner"` and the CSS keys off that instead.
 */
export default function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/user" || pathname === "/user/";
  return (
    <div className="user-portal" data-page={isHome ? "home" : "inner"}>
      {children}
    </div>
  );
}
