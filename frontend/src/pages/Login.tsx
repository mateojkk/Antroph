import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";

function VelaLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-md bg-gradient-to-br from-walrus-purple to-walrus-cyan font-bold text-walrus-deep ${className}`}
      >
        A
      </div>
    );
  }
  return (
    <img
      src="/antroph.jpg"
      className={className}
      alt="Antroph"
      onError={() => setFailed(true)}
    />
  );
}

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Wait until the profile fetch completes before deciding where to send the
    // user. Without this guard, a returning user's wallet reconnects and briefly
    // produces a `user` with no username (before loadProfile resolves), causing
    // the Login page to erroneously redirect them to /onboarding every time.
    if (loading) return;
    if (user) {
      if (!user.username) {
        navigate("/onboarding");
      } else {
        navigate("/");
      }
    }
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <VelaLogo className="mx-auto mb-4 h-16 w-16 rounded-md object-cover" />
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">antroph</h1>
          <p className="text-sm text-muted-foreground">
            Your AI football rival for the season. Powered by Walrus Memory on Sui.
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-8">
          <h2 className="mb-6 text-center text-lg font-semibold text-foreground">
            Connect Wallet
          </h2>

          <div className="flex justify-center">
            <ConnectButton className="antroph-connect-button">
              Connect Sui Wallet
            </ConnectButton>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Use the Slush browser extension. The web wallet popup is off because it
            blocks this site before you can approve.
          </p>
        </div>
      </div>
    </div>
  );
}
