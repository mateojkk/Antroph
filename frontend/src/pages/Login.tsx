import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { useAuth } from "../hooks/useAuth";
import "./Login.css";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user) return;
    navigate(user.username ? "/" : "/onboarding");
  }, [user, loading, navigate]);

  return (
    <main className="login-page">
      <a className="login-skip" href="#login-connect">Skip to wallet connect</a>
      <header className="login-header">
        <Link to="/" className="login-brand" aria-label="Antroph home">
          <img src="/antroph.jpg" alt="" />
          <span>antroph</span><i aria-hidden="true">✳</i>
        </Link>
        <Link to="/" className="login-back">Back to home <span aria-hidden="true">↗</span></Link>
      </header>

      <div className="login-layout">
        <section className="login-story" aria-labelledby="login-title">
          <p className="login-eyebrow"><span className="login-live-dot" /> YOUR RIVAL REMEMBERS</p>
          <h1 id="login-title">Talk football.<br /><span>Leave receipts.</span></h1>
          <p className="login-lede">Connect your wallet to get in the game.</p>
        </section>

        <section id="login-connect" className="login-card" aria-labelledby="connect-title">
          <div className="login-card-brand"><img src="/antroph.jpg" alt="" /><span>ANTROPH / SUI MAINNET</span></div>
          <p className="login-card-kicker">SUI MAINNET</p>
          <h2 id="connect-title">You in?</h2>
          <p className="login-card-copy">Connect a Sui wallet to meet your football rival.</p>

          <div className="login-connect-button">
            <ConnectButton className="antroph-connect-button">Connect Sui Wallet</ConnectButton>
          </div>

          <div className="login-gas-note"><span aria-hidden="true">◈</span><p>Memory setup uses a small amount of SUI for gas.</p></div>
        </section>
      </div>

      <footer className="login-footer"><span>Football ends. The conversation doesn't.</span><Link to="/about">More about Antroph <span aria-hidden="true">↗</span></Link></footer>
    </main>
  );
}
