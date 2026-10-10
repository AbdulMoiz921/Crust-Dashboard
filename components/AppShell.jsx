"use client";
import { useEffect, useState, useCallback } from "react";
import { useApp } from "./AppProvider";
import { canView, isAdmin, roleLabel } from "@/lib/access";
import { signOut } from "@/lib/firebase";
import Icon from "./Icon";
import Dashboard from "./pages/Dashboard";
import DailyEntry from "./pages/DailyEntry";
import Employees from "./pages/Employees";
import MonthClosing from "./pages/MonthClosing";
import Vendors from "./pages/Vendors";
import Capital from "./pages/Capital";
import Users from "./pages/Users";
import Workflow from "./pages/Workflow";

const TABS = [
  ["dash", "Dashboard", "Dashboard"], ["entry", "Daily entry", "Daily entry"], ["emp", "Employees", "Employees"], ["close", "Month closing", "Closing"],
  ["ven", "Vendors", "Vendors"], ["cap", "Capital", "Capital"], ["users", "Users", "Users"], ["flow", "Workflow", "Workflow"],
];
// order of the phone's bottom bar: the first four pages this person can open, the rest under More
const MOBILE_ORDER = ["dash", "entry", "ven", "emp", "close", "cap", "users", "flow"];

// On phones, list tables turn into cards; each cell shows its column name taken from the table header.
function labelStackTables(root) {
  root.querySelectorAll("table.cards").forEach(t => {
    const heads = [...t.querySelectorAll("thead th")].map(th => th.textContent.trim());
    t.querySelectorAll("tbody tr, tfoot tr").forEach(tr => {
      let col = 0;
      [...tr.children].forEach(td => {
        const label = heads[col] || "";
        if (td.dataset.label !== label) td.dataset.label = label;
        col += td.colSpan || 1;
      });
    });
  });
}

export default function AppShell() {
  const { me, D } = useApp();
  const allowed = useCallback(t => t === "flow" || (t === "users" ? isAdmin(me) : canView(me, t)), [me]);
  const [tab, setTab] = useState("dash");
  const [moreOpen, setMoreOpen] = useState(false);
  // cross-page hand-offs: open a day in Daily entry, or add an advance to the day being edited
  const [navReq, setNavReq] = useState(null);
  const [injectReq, setInjectReq] = useState(null);

  useEffect(() => {
    const fromHash = () => { const h = location.hash.slice(1); if (TABS.some(([k]) => k === h)) setTab(h); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  useEffect(() => {
    const main = document.querySelector("main");
    labelStackTables(main);
    const mo = new MutationObserver(() => labelStackTables(main)); // only childList changes, so labelling never re-triggers it
    mo.observe(main, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, []);

  const current = allowed(tab) ? tab : TABS.map(([k]) => k).find(allowed);
  const go = t => { setTab(t); setMoreOpen(false); history.replaceState(null, "", "#" + t); window.scrollTo(0, 0); };
  const openDay = date => { setNavReq({ date, n: Date.now() }); go("entry"); };
  const addAdvance = (date, ex) => setInjectReq({ date, ex, n: Date.now() });

  const pending = [...D.requests.keys()].filter(k => !D.users.has(k)).length;
  const label = (k, l) => k === "users" && pending ? `${l} (${pending})` : l;
  const mobileTabs = MOBILE_ORDER.filter(allowed);
  const barTabs = mobileTabs.slice(0, 4), moreTabs = mobileTabs.slice(4);
  const tabInfo = k => TABS.find(([key]) => key === k);
  const initials = (me.name || me.email || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="brand"><b>Crust House · Commercial</b><span>Riders, sale &amp; expense book</span><em className="page-name">{tabInfo(current)?.[1]}</em></div>
          <div className="who">
            <div className="who-text"><b>{me.name || me.email}</b><span>{roleLabel(me.role)}</span></div>
            <button className="btn ghost who-out" onClick={() => signOut()}>Sign out</button>
            <button className="avatar" onClick={() => setMoreOpen(true)} aria-label="Account and more pages">{initials}</button>
          </div>
          <nav className="tabs" role="tablist" style={{ flexBasis: "100%" }}>
            {TABS.filter(([k]) => allowed(k)).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={current === k} onClick={() => go(k)}>{label(k, l)}</button>
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

      {/* phone navigation */}
      <nav className="bnav" aria-label="Pages">
        {barTabs.map(k => (
          <button key={k} aria-current={current === k ? "page" : undefined} onClick={() => go(k)}>
            <Icon name={k} /><span>{tabInfo(k)[2]}</span>
          </button>
        ))}
        <button aria-current={moreTabs.includes(current) ? "page" : undefined} onClick={() => setMoreOpen(true)}>
          <Icon name="more" /><span>More{pending ? ` (${pending})` : ""}</span>
        </button>
      </nav>
      {moreOpen && <>
        <div className="sheet-back" onClick={() => setMoreOpen(false)} />
        <div className="more-sheet" role="dialog" aria-label="More pages">
          <div className="more-who"><span className="avatar">{initials}</span><div><b>{me.name || me.email}</b><span>{roleLabel(me.role)} · {me.email}</span></div></div>
          {moreTabs.map(k => (
            <button key={k} className={"more-item" + (current === k ? " on" : "")} onClick={() => go(k)}><Icon name={k} /><span>{label(k, tabInfo(k)[1])}</span></button>
          ))}
          <button className="more-item danger" onClick={() => signOut()}><Icon name="users" /><span>Sign out</span></button>
          <button className="btn" onClick={() => setMoreOpen(false)}>Close</button>
        </div>
      </>}
    </>
  );
}
