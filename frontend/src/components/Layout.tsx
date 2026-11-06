import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useState, useRef, useEffect } from "react";
import Avatar from "./Avatar";
import BottomNav from "./BottomNav";

interface LayoutProps {
  children: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showSearch?: boolean;
  leftSlot?: React.ReactNode;
}

export default function Layout({
  children,
  searchValue = "",
  onSearchChange,
  showSearch = false,
  leftSlot,
}: LayoutProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  const nav = [
    { label: "Markets", href: "/feed" },
    { label: "Live", href: "/live" },
    { label: "Chat", href: "/" },
    { label: "Leaderboard", href: "/leaderboard" },
    { label: "Memory", href: "/memory" },
  ];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setNavOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground" key={location.pathname}>
      <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1350px] items-center gap-3 px-3 md:h-14 md:px-4 lg:min-h-[68px] lg:px-6">
          {/* Vela logo — image only, no text */}
          <Link
            to="/feed"
            aria-label="Antroph home"
            className="flex h-10 w-fit shrink-0 cursor-pointer items-center"
          >
            <img
              src="/antroph.jpg"
              className="h-6 w-6 rounded-md object-cover md:h-7 md:w-7"
              alt="Antroph"
            />
          </Link>

          {leftSlot && <div className="flex items-center">{leftSlot}</div>}

          {/* Centered search */}
          {showSearch && (
            <div className="mx-auto hidden w-full max-w-xl sm:block">
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  placeholder="Search Antroph..."
                  className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
                />
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  /
                </kbd>
              </div>
            </div>
          )}

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-2">
            {/* Nav dropdown — desktop only; mobile uses BottomNav */}
            <div ref={navRef} className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setNavOpen((v) => !v)}
                aria-label="Menu"
                aria-expanded={navOpen}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              </button>
              {navOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-md border border-border bg-card p-1 shadow-2xl">
                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Navigate
                  </div>
                  {nav.map((item) => {
                    const active = location.pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setNavOpen(false)}
                        className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                          active
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        <span>{item.label}</span>
                        {active && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </Link>
                    );
                  })}
                  {user && (
                    <>
                      <div className="my-1 border-t border-border" />
                      <Link
                        to={user.username ? `/u/${user.username}` : "/onboarding"}
                        onClick={() => setNavOpen(false)}
                        className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                          location.pathname.startsWith("/u/")
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        Profile
                      </Link>
                      <Link
                        to="/settings"
                        onClick={() => setNavOpen(false)}
                        className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                          location.pathname === "/settings"
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        Settings
                      </Link>
                      <button
                        onClick={() => {
                          setNavOpen(false);
                          signOut();
                        }}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-accent"
                      >
                        Sign out
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {user ? (
              <Link
                to={user.username ? `/u/${user.username}` : "/onboarding"}
                aria-label="Profile"
                className="flex items-center gap-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Avatar
                  src={user.avatar_url}
                  username={user.username}
                  displayName={user.display_name}
                  size="sm"
                />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Sign In
                </Link>
                <Link
                  to="/login"
                  className="rounded-md bg-chalk-yellow px-3 py-1.5 text-sm font-medium text-[#1a1a1a] hover:bg-chalk-yellow/90"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile search */}
        {showSearch && (
          <div className="border-t border-border px-4 py-2 sm:hidden">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Search Antroph..."
                className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
              />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1350px] px-3 py-4 pb-24 md:px-4 md:py-6 lg:px-6 md:pb-6">
        {children}
      </main>
      <BottomNav username={user?.username} />
    </div>
  );
}
