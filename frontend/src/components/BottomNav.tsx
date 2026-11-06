import { Link, useLocation } from "react-router-dom";

interface NavItem {
  label: string;
  href: string;
  match: (path: string) => boolean;
  icon: (active: boolean) => React.ReactNode;
}

const items: NavItem[] = [
  {
    label: "Markets",
    href: "/feed",
    match: (p) => p === "/feed",
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 2}
      >
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M14 7h7v7" />
      </svg>
    ),
  },
  {
    label: "Live",
    href: "/live",
    match: (p) => p === "/live",
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 2}
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    label: "Chat",
    href: "/",
    match: (p) => p === "/",
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 2}
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: "Ranks",
    href: "/leaderboard",
    match: (p) => p === "/leaderboard",
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 2}
      >
        <path d="M8 21h8M12 17v4M5 4h14v6a7 7 0 0 1-14 0V4z" />
        <path d="M5 6H3a3 3 0 0 0 6 0M19 6h2a3 3 0 0 1-6 0" />
      </svg>
    ),
  },
  {
    label: "Memory",
    href: "/memory",
    match: (p) => p === "/memory",
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 2}
      >
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="M12 6a6 6 0 1 0 6 6" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "Profile",
    href: "/u/me",
    match: (p) => p.startsWith("/u/"),
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 2}
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/settings",
    match: (p) => p === "/settings",
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 2}
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];


interface BottomNavProps {
  username?: string | null;
}

export default function BottomNav({ username }: BottomNavProps) {
  const location = useLocation();
  // Hide on /login and /onboarding — no nav needed there.
  if (location.pathname === "/login" || location.pathname === "/onboarding") return null;

    return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around px-1">
        {items.map((item) => {
          const active = item.match(location.pathname);
          const href =
            item.href === "/u/me" && username
              ? `/u/${username}`
              : item.href;
          return (
            <Link
              key={item.href}
              to={href}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2.5 active:scale-95"
            >
              {item.icon(active)}
              <span
                className={`text-[9px] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
