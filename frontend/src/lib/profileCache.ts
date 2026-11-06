/**
 * Client-side profile cache so reconnects feel instant and survive short
 * network issues. The cache is keyed by normalized Sui wallet address.
 */

export function normalizeAddress(address: string | undefined): string | null {
  if (!address) return null;
  const lower = address.toLowerCase().trim();
  return lower.startsWith("0x") ? lower : `0x${lower}`;
}

export function profileKey(address: string) {
  return `vela_profile_${address}`;
}

export interface CachedProfile {
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  memwal_account_id?: string | null;
}

export function loadCachedProfile(address: string): CachedProfile | null {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  const raw = localStorage.getItem(profileKey(normalized));
  if (!raw) {
    console.log(`[profileCache] no cache for ${normalized.slice(0, 10)}...`);
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CachedProfile;
    console.log(
      `[profileCache] loaded for ${normalized.slice(0, 10)}... username=${parsed.username ?? "none"}`
    );
    return parsed;
  } catch {
    console.warn(`[profileCache] corrupt cache for ${normalized.slice(0, 10)}...`);
    return null;
  }
}

export function saveCachedProfile(address: string, profile: CachedProfile) {
  const normalized = normalizeAddress(address);
  if (!normalized || !profile.username) return;
  localStorage.setItem(profileKey(normalized), JSON.stringify(profile));
}

export function clearCachedProfile(address: string) {
  const normalized = normalizeAddress(address);
  if (!normalized) return;
  localStorage.removeItem(profileKey(normalized));
}
