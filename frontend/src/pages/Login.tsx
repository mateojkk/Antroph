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
          <span>antroph</span><span className="brand-dot" aria-hidden="true">®</span>
        </Link>
        <Link to="/" className="login-back">Back to home <span aria-hidden="true">↗</span></Link>
      </header>

      <div className="login-layout">
        <section id="login-connect" className="login-card" aria-labelledby="connect-title">
          <h2 id="connect-title">Connect your wallet.</h2>
          <p className="login-card-copy">Your Sui wallet is your ticket in. Connect to set up your profile and start a rivalry with a long memory.</p>
          <div className="login-connect-button">
            <ConnectButton className="antroph-connect-button">Connect Sui Wallet</ConnectButton>
          </div>
          <div className="login-divider"><span>WHAT HAPPENS NEXT</span></div>
          <ol className="login-next-steps">
            <li><span>1</span><p>Choose a username and make the profile yours.</p></li>
            <li><span>2</span><p>Authorize your memory account with one wallet transaction.</p></li>
            <li><span>3</span><p>Jump into the chat. The next take is on you.</p></li>
          </ol>
          <div className="login-gas-note"><span aria-hidden="true">SUI</span><p>Memory setup needs a small amount of SUI for gas. Your wallet will show the transaction before you approve.</p></div>
          <p className="login-privacy">Your wallet controls the memory access grant.</p>
        </section>
      </div>

      <footer className="login-footer"><span>Football ends. The conversation doesn't.</span><Link to="/about">Meet Antroph <span aria-hidden="true">↗</span></Link></footer>
    </main>
  );
}
