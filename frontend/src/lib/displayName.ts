export function getDisplayName(
  displayName?: string | null,
  username?: string | null
): string {
  if (displayName && displayName.trim()) return displayName.trim();
  if (username) return username.startsWith("@") ? username : `@${username}`;
  return "user";
}
