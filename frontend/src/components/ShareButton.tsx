import { useState } from "react";

interface Props {
  url: string;
  title: string;
  text?: string;
  className?: string;
}

export default function ShareButton({ url, title, text, className = "" }: Props) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select the text manually
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // user cancelled
      }
    } else {
      setOpen((v) => !v);
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={nativeShare}
        onContextMenu={(e) => {
          e.preventDefault();
          copyLink();
        }}
        className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
        aria-label="Share"
        title="Share"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        Share
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-md border border-border bg-card p-1 shadow-2xl">
            <button
              onClick={copyLink}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              {copied ? "Copied!" : "Copy link"}
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text || title)}&url=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share on X
            </a>
            <a
              href={`https://warpcast.com/~/compose?text=${encodeURIComponent((text || title) + " " + url)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              Share on Warpcast
            </a>
          </div>
        </>
      )}
    </div>
  );
}
