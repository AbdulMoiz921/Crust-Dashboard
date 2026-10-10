"use client";
import { useState } from "react";
import { useApp } from "./AppProvider";
import { signIn, signOut, resetPassword, authMessage } from "@/lib/firebase";

function Brand() {
  return <div className="gate-brand"><b>Crust House · Commercial</b><span>Cash book</span></div>;
}

// Logins are only created by an admin (Users page) or in the Firebase console, so there is no sign-up here.
export function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: false });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg({ text: "" });
    try { await signIn(email.trim(), pw); }
    catch (err) { setMsg({ text: authMessage(err) }); }
    setBusy(false);
  }
  async function forgot() {
    if (!email.trim()) return setMsg({ text: "Type your email above first, then press Forgot password." });
    try { await resetPassword(email.trim()); setMsg({ text: "If that email has a login, a reset link is on its way.", ok: true }); }
    catch (err) { setMsg({ text: authMessage(err) }); }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <Brand />
        <h1>Sign in</h1>
        <form onSubmit={submit}>
          <label className="field">Email<input id="l-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label className="field">Password<input id="l-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" required minLength={6} /></label>
          <p className={"msg" + (msg.ok ? " ok" : "")} role="alert">{msg.text}</p>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Please wait…" : "Sign in"}</button>
        </form>
        <button className="linkbtn" onClick={forgot}>Forgot password?</button>
        <p className="hint" style={{ margin: 0 }}>No login yet? Ask the owner to add you on the Users page.</p>
      </div>
    </div>
  );
}

export function Pending() {
  const { status, user, claim } = useApp();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function doClaim() {
    setBusy(true);
    try { await claim(); }
    catch { setMsg("Still couldn’t set up. Make sure the rules are published, or that nobody else has already become the owner."); setBusy(false); }
  }
  return (
    <div className="gate">
      <div className="gate-card">
        <Brand />
        {status === "owner" ? <>
          <h1>Set up the cash book</h1>
          <p className="hint" style={{ margin: 0 }}>Setting up <b>{user?.email}</b> as the owner didn’t finish. Check that the rules from <code>firestore.rules</code> are published in Firebase → Firestore → Rules, then try again.</p>
          <p className="msg">{msg}</p>
          <button className="btn primary" onClick={doClaim} disabled={busy}>{busy ? "Setting up…" : "Try again"}</button>
        </> : status === "off" ? <>
          <h1>Access switched off</h1>
          <p className="hint" style={{ margin: 0 }}>Your access to the cash book has been switched off. Ask the owner if you think this is a mistake.</p>
        </> : <>
          <h1>Waiting for access</h1>
          <p className="hint" style={{ margin: 0 }}>You’re signed in as <b>{user?.email}</b>, but this login hasn’t been given access to the cash book. Ask the owner to open <b>Users</b> and approve it. This page opens the book by itself once they do.</p>
        </>}
        <button className="linkbtn" onClick={() => signOut()}>Sign out</button>
      </div>
    </div>
  );
}

export function ConfigMissing() {
  return (
    <div className="gate">
      <div className="gate-card">
        <Brand />
        <h1>Firebase is not connected</h1>
        <p className="hint" style={{ margin: 0 }}>Add the six <code>NEXT_PUBLIC_FIREBASE_*</code> values to <code>.env.local</code> (for local use) or to Vercel → Settings → Environment Variables, then redeploy. The README lists where to find each value.</p>
      </div>
    </div>
  );
}
