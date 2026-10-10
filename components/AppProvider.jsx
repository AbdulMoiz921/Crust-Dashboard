"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { configured, onAuth, watchDoc, watchCollection, readDoc, saveDoc, patchDoc, claimOwner } from "@/lib/firebase";
import { readable } from "@/lib/access";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const empty = () => ({
  days: new Map(), emps: new Map(), closings: new Map(), capital: new Map(),
  vendors: new Map(), vbills: new Map(), vpays: new Map(), users: new Map(), requests: new Map(),
});

// status: loading | config | signedOut | owner (fresh project, can claim) | pending (waiting for approval) | off (switched off) | ready
export default function AppProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [me, setMe] = useState(null);
  const [data, setData] = useState(empty);
  const [loaded, setLoaded] = useState({});
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(null);

  const toast = useCallback(msg => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 3800);
  }, []);

  // sign-in state, then the person's profile at users/{uid}
  useEffect(() => {
    if (!configured) { setStatus("config"); return; }
    let unProfile = () => {};
    const unAuth = onAuth(u => {
      unProfile();
      setUser(u); setMe(null); setData(empty()); setLoaded({});
      if (!u) { setStatus("signedOut"); return; }
      setStatus("loading");
      let stamped = false;
      unProfile = watchDoc("users", u.uid, async prof => {
        if (prof && prof.active !== false) {
          setMe({ ...prof, uid: u.uid });
          setStatus("ready");
          if (!stamped) { stamped = true; patchDoc("users", u.uid, { lastLogin: new Date().toISOString() }).catch(() => {}); }
          return;
        }
        setMe(null);
        if (prof && prof.active === false) { setStatus("off"); return; }
        // no profile yet: on a fresh project the first person to sign in becomes the owner automatically
        // (the profile listener above then picks up the new admin profile); otherwise they wait for an admin
        let setup = null;
        try { setup = await readDoc("meta", "setup"); } catch { setup = { unknown: true }; }
        if (!setup) {
          try { await claimOwner(u); return; }
          catch { setStatus("owner"); return; } // shows a retry button with the reason
        }
        setStatus("pending");
        saveDoc("requests", u.uid, { name: u.displayName || "", email: u.email, at: new Date().toISOString() }).catch(() => {});
      });
    });
    return () => { unAuth(); unProfile(); };
  }, []);

  // live data: only the collections this person's access lets them read
  const canRead = useMemo(() => readable(me), [me]);
  const readKey = JSON.stringify(canRead);
  useEffect(() => {
    if (status !== "ready") return;
    const subs = [];
    const keyed = (key, col, keyOf = d => d.id, keep = () => true) => {
      subs.push(watchCollection(col, docs => {
        const m = new Map();
        docs.forEach(d => { if (keep(d)) m.set(keyOf(d), d); });
        setData(prev => ({ ...prev, [key]: m }));
        setLoaded(prev => ({ ...prev, [key]: true }));
      }, () => setLoaded(prev => ({ ...prev, [key]: true }))));
    };
    const skip = key => setLoaded(prev => ({ ...prev, [key]: true }));
    canRead.days ? keyed("days", "days", d => d.date, d => !!d.date) : skip("days");
    canRead.employees ? keyed("emps", "employees", d => d.id, d => !!d.name) : skip("emps");
    keyed("closings", "closings", d => d.month, d => !!d.month);
    if (canRead.vendors) {
      keyed("vendors", "vendors", d => d.id, d => !!d.name);
      keyed("vbills", "vbills", d => d.id, d => !!d.date);
      keyed("vpays", "vpays", d => d.id, d => !!d.date);
    } else { skip("vendors"); skip("vbills"); skip("vpays"); }
    canRead.capital ? keyed("capital", "capital", d => d.id, d => !!d.date) : skip("capital");
    if (canRead.users) { keyed("users", "users"); keyed("requests", "requests"); }
    return () => subs.forEach(u => u());
  }, [status, readKey]);

  const value = useMemo(() => ({
    status, user, me, D: data, loaded, toast,
    claim: () => claimOwner(user),
  }), [status, user, me, data, loaded, toast]);

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="toast" role="status" hidden={!toastMsg}>{toastMsg}</div>
    </AppCtx.Provider>
  );
}
