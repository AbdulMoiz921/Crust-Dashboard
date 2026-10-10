"use client";
import { useEffect, useState, useCallback } from "react";
import { useApp } from "./AppProvider";
import { canView, isAdmin, roleLabel } from "@/lib/access";
import { signOut } from "@/lib/firebase";
import Dashboard from "./pages/Dashboard";
import DailyEntry from "./pages/DailyEntry";
import Employees from "./pages/Employees";
import MonthClosing from "./pages/MonthClosing";
import Vendors from "./pages/Vendors";
import Capital from "./pages/Capital";
import Users from "./pages/Users";
import Workflow from "./pages/Workflow";

const TABS = [
  ["dash", "Dashboard"], ["entry", "Daily entry"], ["emp", "Employees"], ["close", "Month closing"],
  ["ven", "Vendors"], ["cap", "Capital"], ["users", "Users"], ["flow", "Workflow"],
];

export default function AppShell() {
  const { me, D } = useApp();
  const allowed = useCallback(t => t === "flow" || (t === "users" ? isAdmin(me) : canView(me, t)), [me]);
  const [tab, setTab] = useState("dash");
  // cross-page hand-offs: open a day in Daily entry, or add an advance to the day being edited
  const [navReq, setNavReq] = useState(null);
  const [injectReq, setInjectReq] = useState(null);

  useEffect(() => {
    const fromHash = () => { const h = location.hash.slice(1); if (TABS.some(([k]) => k === h)) setTab(h); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const current = allowed(tab) ? tab : TABS.map(([k]) => k).find(allowed);
  const go = t => { setTab(t); history.replaceState(null, "", "#" + t); window.scrollTo(0, 0); };
  const openDay = date => { setNavReq({ date, n: Date.now() }); go("entry"); };
  const addAdvance = (date, ex) => setInjectReq({ date, ex, n: Date.now() });

  const pending = [...D.requests.keys()].filter(k => !D.users.has(k)).length;

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="brand"><b>Crust House · Commercial</b><span>Riders, sale &amp; expense book</span></div>
          <div className="who">
            <div><b>{me.name || me.email}</b><span>{roleLabel(me.role)}</span></div>
            <button className="btn ghost" onClick={() => signOut()}>Sign out</button>
          </div>
          <nav className="tabs" role="tablist" style={{ flexBasis: "100%" }}>
            {TABS.filter(([k]) => allowed(k)).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={current === k} onClick={() => go(k)}>
                {k === "users" && pending ? `Users (${pending})` : label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {/* pages stay mounted so an unsaved day or form survives switching tabs */}
        {allowed("dash") && <section className="view" hidden={current !== "dash"}><Dashboard active={current === "dash"} openDay={openDay} /></section>}
        {allowed("entry") && <section className="view" hidden={current !== "entry"}><DailyEntry navReq={navReq} injectReq={injectReq} /></section>}
        {allowed("emp") && <section className="view" hidden={current !== "emp"}><Employees addAdvance={addAdvance} /></section>}
        {allowed("close") && <section className="view" hidden={current !== "close"}><MonthClosing /></section>}
        {allowed("ven") && <section className="view" hidden={current !== "ven"}><Vendors /></section>}
        {allowed("cap") && <section className="view" hidden={current !== "cap"}><Capital /></section>}
        {allowed("users") && <section className="view" hidden={current !== "users"}><Users /></section>}
        <section className="view" hidden={current !== "flow"}><Workflow active={current === "flow"} /></section>
      </main>
    </>
  );
}
