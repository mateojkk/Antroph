import { useState } from "react";
import { Link } from "react-router-dom";
import "./Landing.css";

const takes = [
  { label: "The bold prediction", take: "Brazil are winning the whole thing. Calling it now.", reply: "The whole thing? Beautiful. I'm keeping this receipt. Let's see if your confidence survives the quarter-finals.", tag: "Prediction remembered", color: "mint" },
  { label: "The rivalry", take: "You seriously think you know more football than me?", reply: "Only one way to settle it. Make your next pick. We'll let the results do the talking.", tag: "Rivalry started", color: "violet" },
  { label: "The hot take", take: "Possession means nothing if you can't finish.", reply: "So we're retiring your ‘they controlled the game’ excuse? Good. I'll remember that next time your team has 70% and loses.", tag: "Opinion remembered", color: "cyan" },
];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export default function Landing() {
  const [selected, setSelected] = useState(0);
  const example = takes[selected];

  return (
    <div className="landing">
      <a className="landing-skip" href="#landing-main">Skip to content</a>
      <header className="landing-nav landing-wrap">
        <Link to="/" className="landing-brand" aria-label="Antroph home"><img src="/antroph.jpg" alt="" />antroph<span className="brand-dot">®</span></Link>
        <nav aria-label="Landing page navigation">
          <a href="#the-rival">The rival</a>
          <a href="#how-it-works">How it works</a>
          <Link to="/login" className="landing-nav-cta">Enter the game <Arrow /></Link>
        </nav>
      </header>

      <main id="landing-main">
        <section className="landing-hero landing-wrap" aria-labelledby="hero-title">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow"><span className="landing-dot" /> FOOTBALL. WITH A LONG MEMORY.</p>
            <h1 id="hero-title">Your takes.<br />Your rival.<br /><span>No forgetting.</span></h1>
            <p className="landing-intro">Meet the AI football rival that remembers what you said. Make your picks, defend your team, and give it something to talk about.</p>
            <div className="landing-actions">
              <Link to="/login" className="landing-button">Meet your rival <Arrow /></Link>
              <a href="#the-rival" className="landing-text-link">See it in action <span aria-hidden="true">↓</span></a>
            </div>
            <p className="landing-small">Connect a Sui wallet. Bring your football opinions.</p>
          </div>

          <div className="landing-pitch" aria-label="Illustration of a football pitch with an example prediction receipt">
            <div className="pitch-top"><span>THE BEAUTIFUL GAME</span><span>THE UNFORGETTABLE TAKES</span></div>
            <div className="pitch-lines" aria-hidden="true"><div className="pitch-circle" /><div className="pitch-box pitch-box-top" /><div className="pitch-box pitch-box-bottom" /><i className="pitch-player player-one" /><i className="pitch-player player-two" /><i className="pitch-player player-three" /></div>
            <div className="pitch-word" aria-hidden="true">TALK<br />IS CHEAP.</div>
            <div className="landing-receipt">
              <div className="receipt-header"><span className="landing-dot" /> A RECEIPT FOR THAT <span>01</span></div>
              <p>“Trust me.<br />This is our year.”</p>
              <div className="receipt-bottom"><span>YOU SAID IT. ANTROPH REMEMBERS.</span><span aria-hidden="true">↗</span></div>
            </div>
            <div className="pitch-bottom"><span>OPINIONS WELCOME.</span><span>EXCUSES REMEMBERED.</span></div>
          </div>
        </section>

        <div className="landing-strip"><div className="landing-wrap"><span>PICK A SIDE</span><i>✳</i><span>BACK YOUR TAKE</span><i>✳</i><span>KEEP THE RECEIPTS</span><i>✳</i><span>COME BACK FOR MORE</span></div></div>

        <section id="the-rival" className="landing-demo landing-wrap" aria-labelledby="rival-title">
          <div>
            <p className="landing-eyebrow">01 / MORE THAN A MATCHDAY CHAT</p>
            <h2 id="rival-title">Finally, someone<br />who brings it<br /><span className="landing-violet">up again.</span></h2>
            <p className="landing-body">The confident prediction. The questionable opinion. The team you swore you'd never back. Antroph remembers the conversation, so the next one gets personal.</p>
            <div className="landing-demo-options" role="group" aria-label="Choose an example conversation">
              {takes.map((take, index) => <button key={take.label} aria-pressed={selected === index} onClick={() => setSelected(index)}><span>0{index + 1}</span>{take.label}<Arrow /></button>)}
            </div>
          </div>
          <div className="landing-conversation">
            <div className="conversation-top"><span><img src="/antroph.jpg" alt="" /> Your rival, Antroph</span><span className="example-label">ILLUSTRATIVE DEMO</span></div>
            <div className="conversation-content" aria-live="polite" aria-atomic="true">
              <div className="conversation-user"><span>YOU</span><p>{example.take}</p></div>
              <div className="conversation-rival"><span>ANTROPH <span aria-hidden="true">✳</span></span><p>{example.reply}</p></div>
              <div className={`conversation-tag ${example.color}`}><span aria-hidden="true">↳</span> {example.tag}</div>
            </div>
            <div className="conversation-bottom"><span>Every good rivalry has history.</span><Link to="/login" aria-label="Start your own conversation">Start yours <Arrow /></Link></div>
          </div>
        </section>

        <section id="how-it-works" className="landing-process" aria-labelledby="process-title">
          <div className="landing-wrap">
            <div className="landing-section-heading"><p className="landing-eyebrow">02 / YOUR NEXT MATCHDAY</p><h2 id="process-title">A little conviction.<br />A lot to play for.</h2></div>
            <div className="landing-steps">
              <article><span className="step-number landing-cyan">01 ↗</span><h3>Make it yours.</h3><p>Connect your Sui wallet, set up your profile, and authorize Antroph to use your Walrus Memory account.</p><span className="step-note">A small SUI gas fee applies during setup.</span></article>
              <article><span className="step-number landing-violet">02 ↗</span><h3>Put it on record.</h3><p>Talk football. Make predictions. Pick your side before the final whistle makes everyone an expert.</p><Link to="/login" className="step-note">Bring your first take <Arrow /></Link></article>
              <article><span className="step-number landing-mint">03 ↗</span><h3>Build your history.</h3><p>Follow your prediction record, explore your memory map, and come back to a rival with context.</p><Link to="/leaderboard" className="step-note">Explore the leaderboard <Arrow /></Link></article>
            </div>
          </div>
        </section>

        <section className="landing-memory landing-wrap" aria-labelledby="memory-title">
          <div className="memory-mark" aria-hidden="true"><span>✳</span><i>MEMORY MAKES<br />THE RIVALRY.</i></div>
          <div><p className="landing-eyebrow">03 / BUILT TO REMEMBER</p><h2 id="memory-title">The chat moves on.<br />Your story stays.</h2><p className="landing-body">Your football history lives in your own Walrus Memory account. You authorize Antroph to read and write memories with a delegate key. Your wallet controls that grant.</p><div className="memory-tags"><span>Powered by Walrus Memory</span><span>Connected through Sui</span></div></div>
        </section>

        <section className="landing-finale landing-wrap"><p className="landing-eyebrow">THE NEXT TAKE IS YOURS.</p><h2>Got a feeling?<br /><span>Put it on record.</span></h2><Link to="/login" className="landing-button">Let's talk football <Arrow /></Link></section>
      </main>

      <footer className="landing-footer landing-wrap"><Link to="/" className="landing-brand">antroph<span className="brand-dot">®</span></Link><p>Football ends. The conversation doesn't.</p><a href="#landing-main">Back to top ↑</a></footer>
    </div>
  );
}
