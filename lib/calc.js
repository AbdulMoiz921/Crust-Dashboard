// All money maths in one place. Every function is pure: it takes the records it needs
// (Maps from the data provider) and returns numbers, so pages and Excel exports agree.
import { dim, monthEnd } from "./format";

export const CATS = ["Rider petrol","Rider payment","Vegetables","Meat / chicken","Grocery","Dairy","Gas","Packaging","Utility bill","Salary advance","Salary / wages","Maintenance","Other"];
export const BILL_CATS = CATS.filter(c => !["Rider petrol","Rider payment","Salary advance","Salary / wages"].includes(c));
export const DEFAULT_RATE = 10;
export const SOURCES = { cash: "Cash", bank: "Bank", easypaisa: "EasyPaisa / JazzCash" };
export const srcKey = k => (k in SOURCES ? k : "cash");
const zero = () => ({ cash: 0, bank: 0, easypaisa: 0 });

/* ---------- one day ---------- */
export const saleOf = r => (+r.sale?.cash || 0) + (+r.sale?.bank || 0) + (+r.sale?.easypaisa || 0);
export const riderOrders = rd => (rd.orders || []).reduce((a, o) => a + (+o || 0), 0);
export const kmOf = rd => { const s = +rd.kmStart, e = +rd.kmEnd; return (s && e && e >= s) ? e - s : 0; };
export const petrolOf = (rd, rate) => rd.petrolAuto === false ? (+rd.petrol || 0) : Math.round(kmOf(rd) * (+rate || 0));
export const petrolDay = r => (r.riders || []).reduce((a, rd) => a + petrolOf(rd, r.petrolRate), 0);
export const otherExpOf = r => (r.expenses || []).reduce((a, e) => a + (+e.amt || 0), 0);
export const expOf = r => otherExpOf(r) + petrolDay(r);

// what the day paid out of each account: expense lines by their "paid from", petrol by the day's petrol source
export const expBySrc = r => {
  const o = zero();
  (r.expenses || []).forEach(e => { o[srcKey(e.from)] += +e.amt || 0; });
  o[srcKey(r.petrolFrom)] += petrolDay(r);
  return o;
};

/* ---------- vendors ---------- */
// payments made in a date range, by account (the bills themselves move no money)
export const vpayBySrc = (vpays, from, to) => {
  const o = zero();
  for (const p of vpays.values()) if (p.date >= from && p.date <= to) o[srcKey(p.from)] += +p.amt || 0;
  return o;
};
export const leftBySrc = (r, vpays) => {
  const x = expBySrc(r), v = vpayBySrc(vpays, r.date, r.date);
  return {
    cash: (+r.sale?.cash || 0) - x.cash - v.cash,
    bank: (+r.sale?.bank || 0) - x.bank - v.bank,
    easypaisa: (+r.sale?.easypaisa || 0) - x.easypaisa - v.easypaisa,
  };
};
export function vendorBal(v, vbills, vpays, upTo) {
  let billed = +v.openingDue || 0, paid = 0, last = "";
  for (const b of vbills.values()) if (b.vendorId === v.id && (!upTo || b.date <= upTo)) { billed += +b.amt || 0; if (b.date > last) last = b.date; }
  for (const p of vpays.values()) if (p.vendorId === v.id && (!upTo || p.date <= upTo)) { paid += +p.amt || 0; if (p.date > last) last = p.date; }
  return { billed, paid, owed: billed - paid, last };
}
export const totalOwed = (D, upTo) => [...D.vendors.values()].reduce((a, v) => a + vendorBal(v, D.vbills, D.vpays, upTo).owed, 0);
export function vendorLedger(v, D) {
  const ent = [];
  for (const b of D.vbills.values()) if (b.vendorId === v.id) ent.push({ kind: "bill", id: b.id, date: b.date, label: b.cat || "Bill", desc: b.desc || "", amt: +b.amt || 0 });
  for (const p of D.vpays.values()) if (p.vendorId === v.id) ent.push({ kind: "pay", id: p.id, date: p.date, label: "Payment · " + SOURCES[srcKey(p.from)], desc: p.note || "", amt: +p.amt || 0 });
  ent.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === "bill" ? -1 : 1));
  let bal = +v.openingDue || 0;
  ent.forEach(e => { bal += e.kind === "bill" ? e.amt : -e.amt; e.bal = bal; });
  return ent;
}

/* ---------- employees ---------- */
export const ROLES = ["Rider","Cook","Helper","Waiter","Cashier","Manager","Cleaner","Other"];
export const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
export const activeEmps = emps => [...emps.values()].filter(m => m.active !== false).sort(byName);
export const allEmps = emps => [...emps.values()].sort((a, b) => (a.active === false) - (b.active === false) || byName(a, b));
export const matchEmp = (emps, s) => {
  const t = (s || "").trim().toLowerCase(); if (!t) return null;
  return [...emps.values()].find(m => { const n = (m.name || "").toLowerCase(); return n && (t === n || t.startsWith(n + " ")); }) || null;
};
export function advancesFor(emp, days, month) {
  const out = [], nm = (emp.name || "").trim().toLowerCase();
  for (const r of days.values()) {
    if (month && r.date.slice(0, 7) !== month) continue;
    (r.expenses || []).forEach(x => {
      if (x.cat !== "Salary advance") return;
      const d = (x.desc || "").trim().toLowerCase();
      const hit = x.emp ? x.emp === emp.id : (nm && (d === nm || d.startsWith(nm + " "))); // older rows matched by name
      if (hit) out.push({ date: r.date, amt: +x.amt || 0, note: x.note || "" });
    });
  }
  return out.sort((a, b) => a.date < b.date ? -1 : 1);
}
export function salaryRow(emp, month, c, days) {
  const s = c?.salaries?.[emp.id] || {};
  const base = +emp.salary || 0, absent = +s.absent || 0, absentDed = Math.round(base / dim(month) * absent);
  const adv = advancesFor(emp, days, month).reduce((a, x) => a + x.amt, 0), bonus = +s.bonus || 0, ded = +s.deduction || 0;
  return { id: emp.id, name: emp.name, role: emp.role || "", base, absent, absentDed, adv, bonus, ded, net: base - absentDed - adv - ded + bonus, paid: !!s.paid, from: s.from || "cash" };
}
export function sheetRows(month, c, D) {
  if (c?.status === "closed" && Array.isArray(c.rows)) return c.rows;
  const end = monthEnd(month);
  return allEmps(D.emps)
    .filter(m => (!m.joined || m.joined <= end) && (m.active !== false || advancesFor(m, D.days, month).length))
    .map(m => salaryRow(m, month, c, D.days));
}

/* ---------- month closing ---------- */
export function monthFlows(m, D) {
  const f = { cash: 0, bank: 0, ep: 0, exp: 0, adv: 0, petrol: 0, n: 0, out: zero(), capIn: zero(), capOut: zero() };
  for (const r of D.days.values()) if (r.date.slice(0, 7) === m) {
    f.n++; f.cash += +r.sale?.cash || 0; f.bank += +r.sale?.bank || 0; f.ep += +r.sale?.easypaisa || 0;
    f.exp += expOf(r); f.petrol += petrolDay(r);
    const x = expBySrc(r); for (const k in f.out) f.out[k] += x[k];
    (r.expenses || []).forEach(x => { if (x.cat === "Salary advance") f.adv += +x.amt || 0; });
  }
  f.vpay = vpayBySrc(D.vpays, m + "-01", m + "-31");
  f.vbills = [...D.vbills.values()].filter(b => (b.date || "").slice(0, 7) === m).reduce((a, b) => a + (+b.amt || 0), 0);
  f.owed = totalOwed(D, m + "-31");
  for (const c of D.capital.values()) if ((c.date || "").slice(0, 7) === m) (c.type === "in" ? f.capIn : f.capOut)[srcKey(c.from)] += +c.amt || 0;
  f.sale = f.cash + f.bank + f.ep;
  return f;
}
export function closingCalc(month, draft, D) {
  const closed = draft.status === "closed";
  const f = closed && draft.flows ? { ...draft.flows } : monthFlows(month, D);
  // months closed by older versions lack some fields: treat them as all-cash, no capital or vendors
  f.out ||= { cash: f.exp, bank: 0, easypaisa: 0 }; f.capIn ||= zero(); f.capOut ||= zero();
  f.vpay ||= zero(); f.vbills ||= 0; f.owed ??= 0;
  const rows = sheetRows(month, draft, D), o = draft.opening || zero();
  const paid = zero();
  rows.forEach(r => { if (r.paid && r.net > 0) paid[r.from] = (paid[r.from] || 0) + r.net; });
  const sale = { cash: f.cash, bank: f.bank, easypaisa: f.ep }, close0 = {};
  for (const k of ["cash", "bank", "easypaisa"]) close0[k] = (+o[k] || 0) + sale[k] + f.capIn[k] - f.out[k] - f.vpay[k] - f.capOut[k] - paid[k];
  const close = closed && draft.closing ? draft.closing : close0;
  const salaryCost = rows.reduce((a, r) => a + r.base - r.absentDed + r.bonus - r.ded, 0);
  const toPay = rows.reduce((a, r) => a + (r.paid ? 0 : Math.max(0, r.net)), 0);
  const profit = f.sale - (f.exp - f.adv) - f.vbills - salaryCost;
  return { f, rows, paid, close, salaryCost, toPay, profit };
}

/* ---------- capital ---------- */
export const CAP_TYPES = { in: "Capital invested", spend: "Setup / equipment", out: "Owner withdrawal" };
export const capSign = c => c.type === "in" ? 1 : -1;
export function capTotals(list) {
  const t = { in: 0, spend: 0, out: 0 };
  list.forEach(c => { t[c.type in t ? c.type : "spend"] += +c.amt || 0; });
  return t;
}
export function capByPerson(capital) {
  const ppl = {};
  [...capital.values()].forEach(c => { const k = (c.person || "").trim() || "Not named"; const o = ppl[k] ||= { in: 0, spend: 0, out: 0 }; o[c.type in o ? c.type : "spend"] += +c.amt || 0; });
  return Object.entries(ppl).sort((a, b) => b[1].in - a[1].in);
}

export const prevDay = (days, d) => { const k = [...days.keys()].filter(k => k < d).sort().pop(); return k ? days.get(k) : null; };
export const inRange = (days, from, to) => [...days.values()].filter(r => r.date >= from && r.date <= to).sort((a, b) => a.date < b.date ? -1 : 1);
