import { getDisplayName } from "../lib/displayName";

interface AvatarProps {
  src?: string | null;
  username?: string | null;
  displayName?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-20 w-20 text-2xl",
};

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const trimmed = name.replace(/^@/, "");
  if (!trimmed) return "?";
  const parts = trimmed.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function Avatar({
  src,
  username,
  displayName,
  size = "md",
  className = "",
}: AvatarProps) {
  const sizeClass = SIZE_CLASSES[size];

  if (src && src.startsWith("emoji:")) {
    const emoji = src.slice(6);
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background ${sizeClass} ${className}`}
      >
        <span>{emoji}</span>
      </div>
    );
  }

  if (src) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background ${sizeClass} ${className}`}
      >
        <img
          src={src}
          alt={getDisplayName(displayName, username)}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border border-border bg-primary font-bold text-primary-foreground ${sizeClass} ${className}`}
    >
      {getInitials(displayName || username)}
    </div>
  );
}

export default Avatar;

