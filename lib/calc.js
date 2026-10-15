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
// An expense line "Paid from: Capital" was paid with the owner's own money. It is copied to the Capital
// page and left out of every expense, cash, bank, EasyPaisa and profit figure.
export const fromCapital = e => e.from === "capital";
export const opExpenses = r => (r.expenses || []).filter(e => !fromCapital(e));
export const capitalPaid = r => (r.expenses || []).filter(fromCapital).reduce((a, e) => a + (+e.amt || 0), 0);
export const otherExpOf = r => opExpenses(r).reduce((a, e) => a + (+e.amt || 0), 0);
export const expOf = r => otherExpOf(r) + petrolDay(r);

// what the day paid out of each account: expense lines by their "paid from", petrol by the day's petrol source
export const expBySrc = r => {
  const o = zero();
  opExpenses(r).forEach(e => { o[srcKey(e.from)] += +e.amt || 0; });
  o[srcKey(r.petrolFrom)] += petrolDay(r);
  return o;
};

/* ---------- vendors ---------- */
// Vendor bills and payments only track what we owe each vendor ("Owed to vendors").
// They never touch cash, bank, EasyPaisa or profit: the actual payment is entered as an
// expense in Daily entry, so counting the Vendors-page payment too would double it.
// payments recorded on the Vendors page in a date range, by account (Vendors page only)
export const vpayBySrc = (vpays, from, to) => {
  const o = zero();
  for (const p of vpays.values()) if (p.date >= from && p.date <= to) o[srcKey(p.from)] += +p.amt || 0;
  return o;
};
// what is left in each account for one day: sale − expenses + credit customers paying back (+ Foodpanda into bank)
export const leftBySrc = (r, D) => {
  const x = expBySrc(r), c = cpayBySrc(D.cpays, r.date, r.date), fp = fpPaid(D.fppays, r.date, r.date);
  return {
    cash: (+r.sale?.cash || 0) - x.cash + c.cash,
    bank: (+r.sale?.bank || 0) - x.bank + c.bank + fp, // Foodpanda pays into the bank
    easypaisa: (+r.sale?.easypaisa || 0) - x.easypaisa + c.easypaisa,
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

/* ---------- credit customers (food given now, paid later) ---------- */
// payments received from credit customers in a date range, by the account the money came into
export const cpayBySrc = (cpays, from, to) => {
  const o = zero();
  for (const p of cpays.values()) if (p.date >= from && p.date <= to) o[srcKey(p.to)] += +p.amt || 0;
  return o;
};
export const creditGiven = (cbills, from, to) => [...cbills.values()].filter(b => b.date >= from && b.date <= to).reduce((a, b) => a + (+b.amt || 0), 0);
export function custBal(c, cbills, cpays, upTo) {
  let given = +c.openingDue || 0, paid = 0, last = "";
  for (const b of cbills.values()) if (b.customerId === c.id && (!upTo || b.date <= upTo)) { given += +b.amt || 0; if (b.date > last) last = b.date; }
  for (const p of cpays.values()) if (p.customerId === c.id && (!upTo || p.date <= upTo)) { paid += +p.amt || 0; if (p.date > last) last = p.date; }
  return { given, paid, owes: given - paid, last };
}
export const totalReceivable = (D, upTo) => [...D.customers.values()].reduce((a, c) => a + custBal(c, D.cbills, D.cpays, upTo).owes, 0);
export function custLedger(c, D) {
  const ent = [];
  for (const b of D.cbills.values()) if (b.customerId === c.id) ent.push({ kind: "credit", id: b.id, date: b.date, label: "Food on credit", desc: b.desc || "", amt: +b.amt || 0 });
  for (const p of D.cpays.values()) if (p.customerId === c.id) ent.push({ kind: "pay", id: p.id, date: p.date, label: "Paid · " + SOURCES[srcKey(p.to)], desc: p.note || "", amt: +p.amt || 0 });
  ent.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === "credit" ? -1 : 1));
  let bal = +c.openingDue || 0;
  ent.forEach(e => { bal += e.kind === "credit" ? e.amt : -e.amt; e.bal = bal; });
  return ent;
}

/* ---------- Foodpanda ---------- */
// Foodpanda collects order money and later pays the restaurant into the bank, keeping a commission.
// fpsales = orders total for a day/period (Foodpanda now owes us); fppays = payout into Bank (+ fee deducted).
export const fpSold = (fpsales, from, to) => [...fpsales.values()].filter(s => s.date >= from && s.date <= to).reduce((a, s) => a + (+s.amt || 0), 0);
export const fpPaid = (fppays, from, to) => [...fppays.values()].filter(p => p.date >= from && p.date <= to).reduce((a, p) => a + (+p.amt || 0), 0);
export const fpFees = (fppays, from, to) => [...fppays.values()].filter(p => p.date >= from && p.date <= to).reduce((a, p) => a + (+p.fee || 0), 0);
// what Foodpanda still owes up to a date: sales − money received − commission they kept
export const fpOwes = (D, upTo = "9999-12-31") => fpSold(D.fpsales, "0000", upTo) - fpPaid(D.fppays, "0000", upTo) - fpFees(D.fppays, "0000", upTo);
export function fpLedger(D) {
  const ent = [
    ...[...D.fpsales.values()].map(s => ({ kind: "sale", id: s.id, date: s.date, label: "Foodpanda sale" + (s.orders ? ` · ${s.orders} orders` : ""), desc: s.note || "", sale: +s.amt || 0, paid: 0, fee: 0 })),
    ...[...D.fppays.values()].map(p => ({ kind: "pay", id: p.id, date: p.date, label: "Payment into Bank", desc: p.note || "", sale: 0, paid: +p.amt || 0, fee: +p.fee || 0 })),
  ].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === "sale" ? -1 : 1));
  let bal = 0;
  ent.forEach(e => { bal += e.sale - e.paid - e.fee; e.bal = bal; });
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
/* ---------- attendance ---------- */
// attendance/{YYYY-MM-DD} = { marks: { empId: code } }. Absent takes a full day off salary, half day half;
// paid leave and the weekly day off don't reduce salary.
export const ATT = {
  P: { label: "Present" }, A: { label: "Absent" }, H: { label: "Half day" }, L: { label: "Leave (paid)" }, O: { label: "Day off" },
};
export function attCounts(empId, month, attendance) {
  const n = { P: 0, A: 0, H: 0, L: 0, O: 0, marked: 0 };
  for (const a of attendance.values()) {
    if (a.date.slice(0, 7) !== month) continue;
    const code = a.marks?.[empId];
    if (code && code in n) { n[code]++; n.marked++; }
  }
  n.absentDays = n.A + n.H / 2;
  return n;
}

export function salaryRow(emp, month, c, D) {
  const s = c?.salaries?.[emp.id] || {};
  // absent days come from attendance unless someone typed a number on the salary sheet
  const att = attCounts(emp.id, month, D.attendance);
  const manual = s.absent != null && s.absent !== "";
  const base = +emp.salary || 0, absent = manual ? +s.absent : att.absentDays, absentDed = Math.round(base / dim(month) * absent);
  const adv = advancesFor(emp, D.days, month).reduce((a, x) => a + x.amt, 0), bonus = +s.bonus || 0, ded = +s.deduction || 0;
  return {
    id: emp.id, name: emp.name, role: emp.role || "", base, absent, absentSrc: manual ? "manual" : att.marked ? "attendance" : "",
    absentDed, adv, bonus, ded, net: base - absentDed - adv - ded + bonus, paid: !!s.paid, from: s.from || "cash",
  };
}
export function sheetRows(month, c, D) {
  if (c?.status === "closed" && Array.isArray(c.rows)) return c.rows;
  const end = monthEnd(month);
  return allEmps(D.emps)
    .filter(m => (!m.joined || m.joined <= end) && (m.active !== false || advancesFor(m, D.days, month).length))
    .map(m => salaryRow(m, month, c, D));
}

/* ---------- month closing ---------- */
export function monthFlows(m, D) {
  const f = { cash: 0, bank: 0, ep: 0, exp: 0, adv: 0, petrol: 0, n: 0, out: zero(), capIn: zero(), capOut: zero() };
  for (const r of D.days.values()) if (r.date.slice(0, 7) === m) {
    f.n++; f.cash += +r.sale?.cash || 0; f.bank += +r.sale?.bank || 0; f.ep += +r.sale?.easypaisa || 0;
    f.exp += expOf(r); f.petrol += petrolDay(r);
    const x = expBySrc(r); for (const k in f.out) f.out[k] += x[k];
    opExpenses(r).forEach(x => { if (x.cat === "Salary advance") f.adv += +x.amt || 0; });
  }
  f.owed = totalOwed(D, m + "-31");
  f.cpay = cpayBySrc(D.cpays, m + "-01", m + "-31");
  f.credit = creditGiven(D.cbills, m + "-01", m + "-31");
  f.recv = totalReceivable(D, m + "-31");
  f.fpSale = fpSold(D.fpsales, m + "-01", m + "-31");
  f.fpPay = fpPaid(D.fppays, m + "-01", m + "-31");
  f.fpFee = fpFees(D.fppays, m + "-01", m + "-31");
  f.fpOwes = fpOwes(D, m + "-31");
  // capital paid straight from the owner's pocket (Daily entry "Paid from: Capital") moves no account
  for (const c of D.capital.values()) if ((c.date || "").slice(0, 7) === m && c.type !== "direct") (c.type === "in" ? f.capIn : f.capOut)[srcKey(c.from)] += +c.amt || 0;
  f.sale = f.cash + f.bank + f.ep;
  return f;
}
export function closingCalc(month, draft, D) {
  const closed = draft.status === "closed";
  const f = closed && draft.flows ? { ...draft.flows } : monthFlows(month, D);
  // months closed by older versions lack some fields: treat them as all-cash, no capital or vendors
  f.out ||= { cash: f.exp, bank: 0, easypaisa: 0 }; f.capIn ||= zero(); f.capOut ||= zero();
  f.owed ??= 0; f.cpay ||= zero(); f.credit ||= 0; f.recv ??= 0;
  f.fpSale ||= 0; f.fpPay ||= 0; f.fpFee ||= 0; f.fpOwes ??= 0;
  const rows = sheetRows(month, draft, D), o = draft.opening || zero();
  const paid = zero();
  rows.forEach(r => { if (r.paid && r.net > 0) paid[r.from] = (paid[r.from] || 0) + r.net; });
  const sale = { cash: f.cash, bank: f.bank, easypaisa: f.ep }, close0 = {};
  for (const k of ["cash", "bank", "easypaisa"]) close0[k] = (+o[k] || 0) + sale[k] + f.cpay[k] + (k === "bank" ? f.fpPay : 0) + f.capIn[k] - f.out[k] - f.capOut[k] - paid[k];
  const close = closed && draft.closing ? draft.closing : close0;
  const salaryCost = rows.reduce((a, r) => a + r.base - r.absentDed + r.bonus - r.ded, 0);
  const toPay = rows.reduce((a, r) => a + (r.paid ? 0 : Math.max(0, r.net)), 0);
  // food given on credit counts as sale in the month it was given, even if paid later
  // Foodpanda orders count as sale; the commission Foodpanda keeps is a cost
  const profit = f.sale + f.credit + f.fpSale - f.fpFee - (f.exp - f.adv) - salaryCost;
  return { f, rows, paid, close, salaryCost, toPay, profit };
}

/* ---------- capital ---------- */
export const CAP_TYPES = { in: "Capital invested", spend: "Setup / equipment", out: "Owner withdrawal" };
export const capTypeLabel = c => c.type === "direct" ? "Paid from capital" : CAP_TYPES[c.type] || c.type;
export const capSign = c => c.type === "in" || c.type === "direct" ? 1 : -1;
export function capTotals(list) {
  const t = { in: 0, spend: 0, out: 0, direct: 0 };
  list.forEach(c => { t[c.type in t ? c.type : "spend"] += +c.amt || 0; });
  return t;
}
export function capByPerson(capital) {
  const ppl = {};
  [...capital.values()].forEach(c => { const k = (c.person || "").trim() || "Not named"; const o = ppl[k] ||= { in: 0, spend: 0, out: 0 }; o[c.type === "direct" ? "in" : c.type in o ? c.type : "spend"] += +c.amt || 0; });
  return Object.entries(ppl).sort((a, b) => b[1].in - a[1].in);
}

export const prevDay = (days, d) => { const k = [...days.keys()].filter(k => k < d).sort().pop(); return k ? days.get(k) : null; };
export const inRange = (days, from, to) => [...days.values()].filter(r => r.date >= from && r.date <= to).sort((a, b) => a.date < b.date ? -1 : 1);
