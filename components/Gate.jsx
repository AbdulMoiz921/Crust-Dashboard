"use client";
import { useState } from "react";
import { useApp } from "./AppProvider";
import { signIn, signUp, signOut, resetPassword, authMessage } from "@/lib/firebase";

function Brand() {
  return <div className="gate-brand"><b>Crust House · Commercial</b><span>Cash book</span></div>;
}

export function Login() {
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: false });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (signup && !name.trim()) return setMsg({ text: "Enter your name." });
    setBusy(true); setMsg({ text: "" });
    try { signup ? await signUp(email.trim(), pw, name.trim()) : await signIn(email.trim(), pw); }
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
        <h1>{signup ? "Create your login" : "Sign in"}</h1>
        <form onSubmit={submit}>
          {signup && <label className="field">Your name<input id="l-name" type="text" value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>}
          <label className="field">Email<input id="l-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label className="field">Password<input id="l-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete={signup ? "new-password" : "current-password"} required minLength={6} /></label>
          <p className={"msg" + (msg.ok ? " ok" : "")} role="alert">{msg.text}</p>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Please wait…" : signup ? "Create login" : "Sign in"}</button>
        </form>
        {!signup && <button className="linkbtn" onClick={forgot}>Forgot password?</button>}
        <button className="linkbtn" onClick={() => { setSignup(!signup); setMsg({ text: "" }); }}>{signup ? "I already have a login" : "New here? Create a login"}</button>
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
    catch { setMsg("Could not set up. Someone may have already claimed this book. Reload the page."); setBusy(false); }
  }
  return (
    <div className="gate">
      <div className="gate-card">
        <Brand />
        {status === "owner" ? <>
          <h1>Set up the cash book</h1>
          <p className="hint" style={{ margin: 0 }}>Nobody owns this cash book yet. Set it up with <b>{user?.email}</b> as the owner. You’ll be the admin and can add everyone else from the Users page.</p>
          <p className="msg">{msg}</p>
          <button className="btn primary" onClick={doClaim} disabled={busy}>{busy ? "Setting up…" : "Set me up as owner"}</button>
        </> : status === "off" ? <>
          <h1>Access switched off</h1>
          <p className="hint" style={{ margin: 0 }}>Your access to the cash book has been switched off. Ask the owner if you think this is a mistake.</p>
        </> : <>
          <h1>Waiting for access</h1>
          <p className="hint" style={{ margin: 0 }}>Your login (<b>{user?.email}</b>) is ready, but the owner still needs to give you access. Ask them to open <b>Users</b> and approve your email. This page opens the book by itself once they do.</p>
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
