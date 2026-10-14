"use client";
// Demo stand-in for lib/firebase.js, used only by `npm run dev:demo`.
// Same exports, but data lives in this browser (localStorage) and you are signed in as the demo owner.
// The example records below are made up.

const KEY = "crust-demo-db-v1";
const ME = { uid: "demo-owner", email: "owner@demo.local", displayName: "Demo Owner" };
const listeners = new Map(); // col -> Set(fn)
const docListeners = new Map(); // col/id -> Set(fn)
let authCb = null, signedIn = true;

function seed() {
  const days = {}, base = new Date(); base.setDate(1);
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  for (let i = 0; i < 9; i++) {
    const d = new Date(base); d.setDate(1 + i); const date = iso(d);
    days[date] = {
      date, sale: { cash: 42000 + i * 1300, bank: 9000 + i * 400, easypaisa: 11000 + i * 700 },
      expenses: [
        { cat: "Vegetables", desc: "Onion, tomato, capsicum", amt: 3200 + i * 50, from: "cash" },
        { cat: "Dairy", desc: "Cheese and milk", amt: 5200, from: i % 2 ? "bank" : "cash" },
        ...(i === 4 ? [{ cat: "Salary advance", desc: "Arslan", amt: 5000, emp: "e1", from: "cash" }] : []),
      ],
      riders: [
        { name: "Arslan", orders: [1200, 950, 1800, 700], kmStart: 12000 + i * 60, kmEnd: 12055 + i * 60, petrolAuto: true },
        { name: "Usman", orders: [1450, 2200, 800], kmStart: 15000 + i * 50, kmEnd: 15048 + i * 50, petrolAuto: true },
      ],
      petrolRate: 8, petrolFrom: "cash", note: "Example day",
    };
  }
  const at = new Date().toISOString();
  return {
    users: { [ME.uid]: { name: ME.displayName, email: ME.email, role: "admin", active: true, perms: {}, createdAt: at },
      u2: { name: "Bilal (cashier)", email: "bilal@demo.local", role: "cashier", active: true, perms: { dash: "view", entry: "edit", emp: "none", close: "none", ven: "edit", cap: "none" }, createdAt: at } },
    requests: { r1: { name: "Kamran", email: "kamran@demo.local", at } },
    meta: { setup: { ownerUid: ME.uid } },
    days,
    employees: { e1: { name: "Arslan", role: "Rider", salary: 30000, active: true }, e2: { name: "Kamran", role: "Cook", salary: 45000, active: true } },
    vendors: { v1: { name: "Ali Chicken Shop", cat: "Meat / chicken", openingDue: 5000, phone: "" } },
    vbills: { b1: { date: iso(new Date(base.getFullYear(), base.getMonth(), 3)), vendorId: "v1", vendorName: "Ali Chicken Shop", cat: "Meat / chicken", desc: "40 kg chicken", amt: 20000 } },
    vpays: {},
    customers: { k1: { name: "Shahid (bank office)", phone: "", openingDue: 0 } },
    cbills: { cb1: { date: iso(new Date(base.getFullYear(), base.getMonth(), 4)), customerId: "k1", customerName: "Shahid (bank office)", desc: "Office lunch, 6 pizzas", amt: 9000 } },
    cpays: {},
    attendance: {},
    capital: { c1: { date: iso(new Date(base.getFullYear(), base.getMonth(), 1)), type: "in", person: "Owner", desc: "Opening investment", amt: 100000, from: "bank" } },
    closings: {},
  };
}

let store;
function load() {
  if (store) return store;
  try { store = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { store = seed(); }
  return store;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} }
const list = col => Object.entries(load()[col] || {}).map(([id, v]) => ({ ...v, id }));
function emit(col, id) {
  const docs = list(col);
  setTimeout(() => {
    (listeners.get(col) || []).forEach(fn => fn(docs));
    const v = load()[col]?.[id];
    (docListeners.get(col + "/" + id) || []).forEach(fn => fn(v ? { ...v, id } : null));
  }, 30);
}

export const configured = true;
export const newId = () => "d" + Math.random().toString(36).slice(2, 12);
export const saveDoc = async (col, id, data) => { (load()[col] ||= {})[id] = JSON.parse(JSON.stringify(data)); persist(); emit(col, id); };
const DEL = { __delete__: true };
export const removeField = () => DEL;
const deepMerge = (t, src) => { for (const [k, v] of Object.entries(src)) { if (v === DEL) delete t[k]; else if (v && typeof v === "object" && !Array.isArray(v)) deepMerge(t[k] ||= {}, v); else t[k] = v; } return t; };
export const mergeDoc = async (col, id, data) => { const s = load(); deepMerge((s[col] ||= {})[id] ||= {}, JSON.parse(JSON.stringify(data, (k, v) => v === DEL ? "__DEL__" : v), (k, v) => v === "__DEL__" ? DEL : v)); persist(); emit(col, id); };
export const patchDoc = async (col, id, data) => { const s = load(); if (!s[col]?.[id]) throw Object.assign(new Error("missing"), { code: "not-found" }); Object.assign(s[col][id], data); persist(); emit(col, id); };
export const removeDoc = async (col, id) => { delete (load()[col] || {})[id]; persist(); emit(col, id); };
export const readDoc = async (col, id) => { const v = load()[col]?.[id]; return v ? { ...v, id } : null; };
export const watchCollection = (col, next) => {
  if (!listeners.has(col)) listeners.set(col, new Set());
  listeners.get(col).add(next);
  setTimeout(() => next(list(col)), 30);
  return () => listeners.get(col).delete(next);
};
export const watchWhere = (col, field, value, next) => watchCollection(col, docs => next(docs.filter(d => d[field] === value)));
export const listWhere = async (col, field, value) => list(col).filter(d => d[field] === value);
export const watchDoc = (col, id, next) => {
  const k = col + "/" + id;
  if (!docListeners.has(k)) docListeners.set(k, new Set());
  docListeners.get(k).add(next);
  setTimeout(() => { const v = load()[col]?.[id]; next(v ? { ...v, id } : null); }, 30);
  return () => docListeners.get(k).delete(next);
};
export const isDenied = e => e?.code === "permission-denied";

export const onAuth = cb => { authCb = cb; setTimeout(() => cb(signedIn ? ME : null), 30); return () => { authCb = null; }; };
export const signIn = async () => { signedIn = true; authCb && authCb(ME); };
export const signOut = async () => { signedIn = false; authCb && authCb(null); };
export const resetPassword = async () => {};
export const claimOwner = async () => {};
export const createLogin = async () => newId();
export const authMessage = () => "Demo mode: any email and password signs you in as the demo owner.";
