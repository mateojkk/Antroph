import { useState, useRef, useEffect } from "react";
import { apiPatch } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

interface Props {
  currentDisplayName?: string | null;
  currentAvatarUrl?: string | null;
  username: string;
  email: string;
  onClose: () => void;
  onSaved: (updates: { display_name?: string | null; avatar_url?: string | null }) => void;
}

const PRESET_AVATARS = [
  "⚽", "🏆", "🦅", "🐺", "🦁", "🐉",
  "🔥", "⚡", "💎", "🚀", "👑", "🌟",
];

export default function EditProfileModal({
  currentDisplayName,
  currentAvatarUrl,
  username,
  email,
  onClose,
  onSaved,
}: Props) {
  const { updateUser } = useAuth();
  const [displayName, setDisplayName] = useState(currentDisplayName || "");
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pickEmoji(e: string) {
    setAvatarUrl(`emoji:${e}`);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("Image must be under 1 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setLoading(true);
    setError("");
    try {
      const result = await apiPatch<{ status: string; user: { display_name: string | null; avatar_url: string | null } }>(
        "/profile",
        { email, display_name: displayName, avatar_url: avatarUrl }
      );
      onSaved({
        display_name: result.user.display_name,
        avatar_url: result.user.avatar_url,
      });
      updateUser({
        display_name: result.user.display_name,
        avatar_url: result.user.avatar_url,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-md border border-border bg-card p-5 sm:rounded-md sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Edit profile</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        {/* Avatar preview */}
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-2xl">
            {avatarUrl ? (
              avatarUrl.startsWith("emoji:") ? (
                <span>{avatarUrl.slice(6)}</span>
              ) : (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setAvatarUrl("")}
                />
              )
            ) : (
              <span className="font-semibold text-muted-foreground">
                {username[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 text-sm text-muted-foreground">
            Pick an emoji, upload an image, or paste a URL.
          </div>
        </div>

        {/* Preset emojis */}
        <div className="mb-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Quick picks
          </div>
          <div className="grid grid-cols-6 gap-2">
            {PRESET_AVATARS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => pickEmoji(e)}
                className={`flex h-10 items-center justify-center rounded-md border text-xl transition-colors ${
                  avatarUrl === `emoji:${e}`
                    ? "border-primary bg-accent"
                    : "border-border bg-background hover:bg-accent"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Upload / URL */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
          >
            Upload image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
          <input
            type="text"
            value={avatarUrl.startsWith("emoji:") || avatarUrl.startsWith("data:") ? "" : avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="or paste image URL"
            className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
          />
        </div>

        {avatarUrl && (
          <button
            type="button"
            onClick={() => setAvatarUrl("")}
            className="mb-4 text-xs text-muted-foreground hover:text-danger"
          >
            Clear avatar
          </button>
        )}

        {/* Display name */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Display name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={username}
            maxLength={8}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
          />
          <div className="mt-1 text-[10px] text-muted-foreground">
            Leave blank to use @{username}. Max 8 characters.
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-border bg-background py-2.5 text-sm text-muted-foreground hover:border-muted-foreground/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={loading}
            className="flex-1 rounded-md border border-border bg-background py-2.5 text-sm font-medium text-foreground hover:border-muted-foreground/40 hover:bg-accent disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
