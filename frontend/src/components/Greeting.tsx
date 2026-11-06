import { useMemo } from "react";

interface GreetingProps {
  username?: string | null;
  displayName?: string | null;
  variant?: "default" | "return" | "first";
}

const DEFAULT_GREETINGS = [
  "Hey",
  "Hello",
  "Hey there",
  "What's up",
  "Howdy",
  "Glad you're here",
];

const RETURNING_GREETINGS = [
  "Welcome back",
  "Good to see you again",
  "Great to have you back",
  "Hey, welcome back",
  "Ready for more football",
  "Back at it",
];

const FIRST_TIME_GREETINGS = [
  "Hey",
  "Welcome to Antroph",
  "Nice to meet you",
  "Hello",
  "Glad you stopped by",
  "Welcome aboard",
  "Hey there",
  "Howdy",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatGreeting(template: string, name?: string | null): string {
  const base = template.trim();
  if (!name) return base;
  // Add the name naturally: "Hey" → "Hey, mj"; "Welcome back" → "Welcome back, mj".
  if (base.endsWith("?")) {
    return `${base.slice(0, -1).trim()}, ${name}?`;
  }
  return `${base}, ${name}`;
}

export default function Greeting({ username, displayName, variant = "default" }: GreetingProps) {
  // Pick once per identity so it doesn't flicker on every parent re-render.
  const greeting = useMemo(() => {
    const pool =
      variant === "first"
        ? FIRST_TIME_GREETINGS
        : variant === "return"
        ? RETURNING_GREETINGS
        : DEFAULT_GREETINGS;
    return formatGreeting(pickRandom(pool), displayName || username || null);
  }, [variant, displayName, username]);

  return <>{greeting}</>;
}
