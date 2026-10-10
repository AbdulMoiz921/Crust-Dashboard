"use client";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { Empty, Confirm } from "../ui";
import { whenText } from "@/lib/format";
import { byName } from "@/lib/calc";
import { PAGES, LEVELS, ROLES_ACCESS, roleLabel, accessSummary, permsFor, matchRole } from "@/lib/access";
import { saveDoc, removeDoc, createLogin, resetPassword, isDenied } from "@/lib/firebase";

export default function Users() {
  const { D, me, loaded, toast } = useApp();
  const [sel, setSel] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const list = [...D.users.values()].sort((a, b) => (a.active === false) - (b.active === false) || byName(a, b));
  const reqs = [...D.requests.values()].filter(r => !D.users.has(r.id));

  async function approve(r, role) {
    try {
      await saveDoc("users", r.id, { name: r.name || r.email, email: r.email, role, perms: permsFor(role), active: true, createdAt: new Date().toISOString(), createdBy: me.uid });
      await removeDoc("requests", r.id);
      toast(`${r.name || r.email} can now sign in as ${roleLabel(role)}`);
    } catch { toast("Could not give access. Try again."); }
  }

  return (
    <>
      <div className="card bar">
        <div className="grow"><h2 style={{ margin: 0 }}>Users</h2><span className="sub">Who can sign in, and which pages each person can view or edit</span></div>
        <button className="btn primary" onClick={() => { setSel(null); setFormOpen(true); }}>+ Add user</button>
      </div>
      {reqs.length > 0 && <div className="card">
        <h2>Waiting for access <small>logins that signed in but have no access yet</small></h2>
        {reqs.map(r => <Request key={r.id} r={r} onApprove={approve} />)}
      </div>}
      <div className="emp-grid">
        <div className="card">
          <h2>People with access <small>click a person to change their access</small></h2>
          {list.length ? (
            <div className="tbl-wrap"><table className="cards"><thead><tr><th>User</th><th>Role</th><th style={{ textAlign: "left" }}>Can open</th><th>Status</th><th>Last sign-in</th></tr></thead>
              <tbody>{list.map(u => (
                <tr key={u.id} className={"click" + (u.id === sel ? " sel" : "")} tabIndex={0} onClick={() => { setSel(u.id); setFormOpen(true); }} onKeyDown={e => e.key === "Enter" && (setSel(u.id), setFormOpen(true))}>
                  <td><b>{u.name || u.email}</b>{u.id === me.uid && <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>you</span>}<div className="sub">{u.email}</div></td>
                  <td><span className={"pill " + (u.role === "admin" ? "closed" : "off")}>{roleLabel(u.role)}</span></td>
                  <td style={{ textAlign: "left", whiteSpace: "normal", minWidth: 180 }}>{accessSummary(u)}</td>
                  <td>{u.active === false ? <span className="pill open">Switched off</span> : <span className="pill closed">Active</span>}</td>
                  <td>{whenText(u.lastLogin)}</td></tr>))}</tbody></table></div>
          ) : <Empty>{loaded.users ? "No users yet." : "Loading users…"}</Empty>}
        </div>
        <div className="card">
          {formOpen ? <UserForm key={sel || "new"} u={sel ? D.users.get(sel) : null} onDone={() => { setFormOpen(false); setSel(null); }} />
            : <><h2>User details</h2><p className="hint" style={{ margin: 0 }}>Choose a person to change what they can open, or press <b>Add user</b>. Logins made directly in the Firebase console appear under “Waiting for access” until you approve them here.</p></>}
        </div>
      </div>
    </>
  );
}

function Request({ r, onApprove }) {
  const [role, setRole] = useState("cashier");
  const [busy, setBusy] = useState(false);
  return (
    <div className="req">
      <div className="req-who"><b>{r.name || r.email}</b><span className="sub">{r.email} · asked {whenText(r.at)}</span></div>
      <select value={role} onChange={e => setRole(e.target.value)} aria-label={`Role for ${r.email}`}>
        {Object.entries(ROLES_ACCESS).filter(([k]) => k !== "custom").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await onApprove(r, role); setBusy(false); }}>Give access</button>
      <button className="btn ghost" onClick={() => removeDoc("requests", r.id).catch(() => {})}>Dismiss</button>
    </div>
  );
}

function UserForm({ u, onDone }) {
  const { me, toast } = useApp();
  const self = u && u.id === me.uid;
  const [f, setF] = useState(() => ({ name: u?.name || "", email: u?.email || "", pw: "", role: u?.role || "cashier", active: u?.active !== false }));
  const [perms, setPerms] = useState(() => u ? (u.role === "admin" ? {} : { ...(u.perms || {}) }) : permsFor("cashier"));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [askDel, setAskDel] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  function setRole(role) { set("role", role); if (role !== "custom" && role !== "admin") setPerms(permsFor(role)); }
  function setPerm(page, lv) { const n = { ...perms, [page]: lv }; setPerms(n); set("role", matchRole(n)); }

  async function save() {
    const name = f.name.trim();
    if (!name) return setMsg("Enter a name.");
    const cleanPerms = f.role === "admin" ? {} : Object.fromEntries(Object.keys(PAGES).map(k => [k, perms[k] || "none"]));
    setBusy(true); setMsg("");
    try {
      if (u) {
        const { id, ...rest } = u;
        await saveDoc("users", u.id, { ...rest, name, role: self ? "admin" : f.role, perms: cleanPerms, active: self ? true : f.active, updatedAt: new Date().toISOString() });
        toast("Access updated for " + name);
      } else {
        const email = f.email.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) { setBusy(false); return setMsg("Enter a valid email address."); }
        if (f.pw.length < 6) { setBusy(false); return setMsg("The temporary password needs at least 6 characters."); }
        const uid = await createLogin(email, f.pw);
        await saveDoc("users", uid, { name, email, role: f.role, perms: cleanPerms, active: f.active, createdAt: new Date().toISOString(), createdBy: me.uid });
        toast(`Login created for ${name}. Give them the email and temporary password.`);
      }
      onDone();
    } catch (e) {
      setBusy(false);
      setMsg(e?.code === "auth/email-already-in-use" ? "This email already has a login (maybe made in the Firebase console). Ask them to sign in once; they will then appear under “Waiting for access” for you to approve."
        : e?.code === "auth/weak-password" ? "Choose a longer password." : isDenied(e) ? "Only admins can manage users." : "Could not save. Try again.");
    }
  }
  async function del() {
    try { await removeDoc("users", u.id); toast("Access removed. To delete the login itself, use Firebase console → Authentication."); onDone(); }
    catch { setMsg("Could not remove. Try again."); }
  }

  return <>
    <h2>{u ? "Edit " + (u.name || u.email) : "Add user"}</h2>
    <div className="form2">
      <label className="field">Name<input type="text" value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Bilal (cashier)" /></label>
      <label className="field">Email<input type="email" value={f.email} disabled={!!u} onChange={e => set("email", e.target.value)} placeholder="name@example.com" autoComplete="off" /></label>
      {!u && <label className="field">Temporary password<input type="text" value={f.pw} onChange={e => set("pw", e.target.value)} placeholder="at least 6 characters" autoComplete="new-password" /></label>}
      <label className="field">Role<select value={f.role} disabled={self} onChange={e => setRole(e.target.value)}>{Object.entries(ROLES_ACCESS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
      <label className="field full"><span className="chk"><input type="checkbox" checked={f.active} disabled={self} onChange={e => set("active", e.target.checked)} /> Can sign in (active)</span></label>
    </div>
    <h3 className="eyebrow" style={{ margin: "16px 0 8px" }}>What they can open</h3>
    {f.role === "admin" ? <p className="hint" style={{ margin: 0 }}>Admins can open and edit every page, and manage users.</p> : <>
      <div className="tbl-wrap"><table className="perm-tbl"><tbody>
        {Object.entries(PAGES).map(([k, v]) => (
          <tr key={k}><td>{v}</td><td><div className="seg" role="radiogroup" aria-label={v}>
            {Object.entries(LEVELS).map(([lv, lab]) => (
              <label className="chip-r" key={lv}><input type="radio" name={"perm-" + k} checked={(perms[k] || "none") === lv} onChange={() => setPerm(k, lv)} /><span>{lab}</span></label>
            ))}
          </div></td></tr>
        ))}
      </tbody></table></div>
      <p className="hint">{ROLES_ACCESS[f.role]?.note || "Changing any page switches the role to Custom when it no longer matches a preset."}</p>
    </>}
    <div className="bar" style={{ marginTop: 14 }}>
      <span className="grow sub">{msg}</span>
      {u && !self && (askDel ? <Confirm text={`Remove ${u.name || u.email}’s access?`} yes="Remove" onYes={del} onNo={() => setAskDel(false)} /> : <button className="btn danger" onClick={() => setAskDel(true)}>Remove access</button>)}
      {u && <button className="btn" onClick={async () => { try { await resetPassword(u.email); setMsg("Password reset email sent to " + u.email + "."); } catch { setMsg("Could not send the email."); } }}>Send password reset</button>}
      <button className="btn ghost" onClick={onDone}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={busy}>{u ? "Save changes" : "Create login"}</button>
    </div>
    {self && <p className="hint">You can’t change your own role or switch yourself off, so the book always has an admin.</p>}
  </>;
}
