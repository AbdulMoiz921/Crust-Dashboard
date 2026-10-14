"use client";
// Excel workbooks for every page. xlsx is loaded on demand so it stays out of the first page load.
import { niceLong, monthName, monthEnd, dim, pad } from "./format";
import {
  saleOf, expOf, otherExpOf, petrolDay, petrolOf, kmOf, riderOrders, expBySrc, vpayBySrc, totalOwed,
  cpayBySrc, creditGiven, totalReceivable, custBal, custLedger, attCounts,
  SOURCES, srcKey, advancesFor, allEmps, vendorBal, vendorLedger, CAP_TYPES, capSign, capTotals, capByPerson, inRange, byName,
} from "./calc";

async function xlsx() { return await import("xlsx"); }
function sheet(X, rows, widths) { const ws = X.utils.aoa_to_sheet(rows); ws["!cols"] = widths.map(w => ({ wch: w })); return ws; }
function save(X, wb, name) { X.writeFile(wb, name); }

function appendRange(X, wb, recs, from, to, D) {
  let cash = 0, bank = 0, ep = 0, other = 0, petrol = 0; const out = { cash: 0, bank: 0, easypaisa: 0 };
  recs.forEach(r => {
    cash += +r.sale?.cash || 0; bank += +r.sale?.bank || 0; ep += +r.sale?.easypaisa || 0; other += otherExpOf(r); petrol += petrolDay(r);
    const x = expBySrc(r); for (const k in out) out[k] += x[k];
  });
  const sale = cash + bank + ep, exp = other + petrol, vp = vpayBySrc(D.vpays, from, to), cp = cpayBySrc(D.cpays, from, to);
  X.utils.book_append_sheet(wb, sheet(X, [
    ["CRUST HOUSE - Commercial"], ["Riders And Expense Data"],
    ["Date", from === to ? niceLong(from) : niceLong(from) + " to " + niceLong(to)], ["Days recorded", recs.length], [],
    ["Total Sale", sale], ["Cash", cash], ["Bank", bank], ["EasyPaisa / JazzCash", ep], [],
    ["Rider petrol", petrol], ["Other expenses", other], ["Total Expense", exp], [],
    ["Paid from Cash", out.cash], ["Paid from Bank", out.bank], ["Paid from EasyPaisa / JazzCash", out.easypaisa], [],
    ["Vendor bills paid (cash)", vp.cash], ["Vendor bills paid (bank)", vp.bank], ["Vendor bills paid (EasyPaisa)", vp.easypaisa], [],
    ["Food given on credit", creditGiven(D.cbills, from, to)],
    ["Credit received (cash)", cp.cash], ["Credit received (bank)", cp.bank], ["Credit received (EasyPaisa)", cp.easypaisa], [],
    ["Sale - Expense", sale - exp], ["Cash in hand (cash sale + credit received - cash paid out)", cash + cp.cash - out.cash - vp.cash],
    ["Bank left", bank + cp.bank - out.bank - vp.bank], ["EasyPaisa left", ep + cp.easypaisa - out.easypaisa - vp.easypaisa],
    ["Owed to vendors (as of " + niceLong(to) + ")", totalOwed(D, to)],
    ["Customers owe us (as of " + niceLong(to) + ")", totalReceivable(D, to)],
  ], [40, 18]), "Summary");

  const dRows = [["Date","Cash","Bank","EasyPaisa/JazzCash","Total Sale","Other Expense","Rider Petrol","Total Expense","Paid Cash","Paid Bank","Paid EasyPaisa","Sale - Expense","Cash in Hand","Note"]];
  recs.forEach(r => { const s = saleOf(r), e = expOf(r), x = expBySrc(r); dRows.push([niceLong(r.date), +r.sale?.cash || 0, +r.sale?.bank || 0, +r.sale?.easypaisa || 0, s, otherExpOf(r), petrolDay(r), e, x.cash, x.bank, x.easypaisa, s - e, (+r.sale?.cash || 0) - x.cash, r.note || ""]); });
  dRows.push(["Total", cash, bank, ep, sale, other, petrol, exp, out.cash, out.bank, out.easypaisa, sale - exp, cash - out.cash, ""]);
  X.utils.book_append_sheet(wb, sheet(X, dRows, [14,12,12,18,12,14,12,14,11,11,14,14,13,30]), "Days");

  const eRows = [["Date","Category","Description","Paid From","Amount"]];
  recs.forEach(r => {
    (r.expenses || []).forEach(e => eRows.push([niceLong(r.date), e.cat || "Other", (e.desc || "") + (e.note ? " - " + e.note : ""), SOURCES[srcKey(e.from)], +e.amt || 0]));
    (r.riders || []).forEach(rd => { const p = petrolOf(rd, r.petrolRate); if (p) eRows.push([niceLong(r.date), "Rider petrol", `${rd.name || "Rider"} - ${rd.petrolAuto === false ? "entered by hand" : kmOf(rd) + " km x Rs " + (+r.petrolRate || 0)}`, SOURCES[srcKey(r.petrolFrom)], p]); });
  });
  eRows.push(["Total", "", "", "", exp]);
  X.utils.book_append_sheet(wb, sheet(X, eRows, [14,18,40,18,12]), "Expenses");

  const vrows = [["Date","Vendor","Paid From","Note","Amount"]];
  [...D.vpays.values()].filter(p => p.date >= from && p.date <= to).sort((a, b) => a.date < b.date ? -1 : 1)
    .forEach(p => vrows.push([niceLong(p.date), D.vendors.get(p.vendorId)?.name || p.vendorName || "", SOURCES[srcKey(p.from)], p.note || "", +p.amt || 0]));
  X.utils.book_append_sheet(wb, sheet(X, vrows, [14,22,18,30,12]), "Vendor payments");

  const crows = [["Date","Customer","Entry","Details","Account","Credit given","Paid back"]];
  const inR = d => d >= from && d <= to;
  [...[...D.cbills.values()].filter(b => inR(b.date)).map(b => [b.date, D.customers.get(b.customerId)?.name || b.customerName || "", "Food on credit", b.desc || "", "", +b.amt || 0, ""]),
   ...[...D.cpays.values()].filter(p => inR(p.date)).map(p => [p.date, D.customers.get(p.customerId)?.name || p.customerName || "", "Payment received", p.note || "", SOURCES[srcKey(p.to)], "", +p.amt || 0])]
    .sort((a, b) => a[0] < b[0] ? -1 : 1).forEach(r => crows.push([niceLong(r[0]), ...r.slice(1)]));
  X.utils.book_append_sheet(wb, sheet(X, crows, [14,22,18,30,18,13,12]), "Customer credit");

  const rRows = [["Date","Rider","Orders","Order amounts","Collected","Bike Start","Bike End","Km","Petrol Rate","Petrol"]];
  recs.forEach(r => (r.riders || []).forEach(rd => rRows.push([niceLong(r.date), rd.name || "", (rd.orders || []).length, (rd.orders || []).join(", "), riderOrders(rd), +rd.kmStart || "", +rd.kmEnd || "", kmOf(rd), rd.petrolAuto === false ? "manual" : (+r.petrolRate || 0), petrolOf(rd, r.petrolRate)])));
  X.utils.book_append_sheet(wb, sheet(X, rRows, [14,14,8,40,12,11,11,8,11,10]), "Riders");

  const cat = {};
  recs.forEach(r => { (r.expenses || []).forEach(e => { const k = e.cat || "Other"; cat[k] = (cat[k] || 0) + (+e.amt || 0); }); const p = petrolDay(r); if (p) cat["Rider petrol"] = (cat["Rider petrol"] || 0) + p; });
  X.utils.book_append_sheet(wb, sheet(X, [["Category","Amount"], ...Object.entries(cat).sort((a, b) => b[1] - a[1]), ["Total", exp]], [20,14]), "Categories");
}

export async function exportRange(D, recs, from, to, name) {
  const X = await xlsx(); const wb = X.utils.book_new();
  appendRange(X, wb, recs, from, to, D);
  save(X, wb, name);
}

export async function exportEmployees(D, month, rows) {
  const X = await xlsx(); const wb = X.utils.book_new(), rb = Object.fromEntries(rows.map(r => [r.id, r]));
  const a = [["Name","Role","Phone","Joining date","Status","ID card","Monthly salary","Advances","Absent cut","Deduction","Bonus","Remaining","Paid"]];
  allEmps(D.emps).forEach(m => { const r = rb[m.id]; a.push([m.name, m.role || "", m.phone || "", m.joined || "", m.active === false ? "Inactive" : "Active", m.docs > 0 ? "On file" : "Missing", +m.salary || 0, r?.adv || 0, r?.absentDed || 0, r?.ded || 0, r?.bonus || 0, r ? r.net : 0, r?.paid ? "Yes" : "No"]); });
  X.utils.book_append_sheet(wb, sheet(X, a, [18,10,15,13,9,10,14,11,11,11,9,12,6]), "Employees");
  const b = [["Date","Employee","Amount","Note"]];
  allEmps(D.emps).forEach(m => advancesFor(m, D.days, month).forEach(x => b.push([x.date, m.name, x.amt, x.note])));
  b.sort((x, y) => x[0] < y[0] ? -1 : 1);
  X.utils.book_append_sheet(wb, sheet(X, b.map((r, i) => i ? [niceLong(r[0]), r[1], r[2], r[3]] : r), [14,18,12,30]), "Advances");
  save(X, wb, `Crust-House-Employees-${month}.xlsx`);
}

export async function exportClosing(D, month, draft, calc) {
  const X = await xlsx(); const wb = X.utils.book_new();
  const { f, rows, paid, close, salaryCost, toPay, profit } = calc, o = draft.opening || {};
  const sum3 = x => x.cash + x.bank + x.easypaisa;
  X.utils.book_append_sheet(wb, sheet(X, [
    ["CRUST HOUSE - Commercial"], ["Month closing", monthName(month)], ["Status", draft.status === "closed" ? "Closed" : "Open"], [],
    ["", "Cash", "Bank", "EasyPaisa/JazzCash", "Total"],
    ["Opening balance", +o.cash || 0, +o.bank || 0, +o.easypaisa || 0, (+o.cash || 0) + (+o.bank || 0) + (+o.easypaisa || 0)],
    ["+ Sale received", f.cash, f.bank, f.ep, f.sale],
    ["+ Customer payments received", f.cpay.cash, f.cpay.bank, f.cpay.easypaisa, sum3(f.cpay)],
    ["+ Capital invested", f.capIn.cash, f.capIn.bank, f.capIn.easypaisa, sum3(f.capIn)],
    ["- Expenses, petrol & advances", f.out.cash, f.out.bank, f.out.easypaisa, f.exp],
    ["- Capital spent & withdrawn", f.capOut.cash, f.capOut.bank, f.capOut.easypaisa, sum3(f.capOut)],
    ["- Vendor bills paid", f.vpay.cash, f.vpay.bank, f.vpay.easypaisa, sum3(f.vpay)],
    ["- Salaries paid", paid.cash, paid.bank, paid.easypaisa, sum3(paid)],
    ["Closing balance", close.cash, close.bank, close.easypaisa, sum3(close)], [],
    ["Total sale", f.sale], ["Total expense", f.exp], ["of which rider petrol", f.petrol], ["of which salary advances", f.adv],
    ["Salary cost", salaryCost], ["Salary still to pay", toPay], ["Vendor bills this month", f.vbills], ["Owed to vendors at month end", f.owed],
    ["Food given on credit this month", f.credit], ["Customers owe us at month end", f.recv], ["Profit after salary", profit],
  ], [30,14,14,18,14]), "Money position");
  const s = [["Employee","Role","Salary","Absent days","Absent cut","Advances","Deduction","Bonus","To pay","Pay from","Paid"]];
  rows.forEach(r => s.push([r.name, r.role, r.base, r.absent, r.absentDed, r.adv, r.ded, r.bonus, r.net, SOURCES[r.from], r.paid ? "Yes" : "No"]));
  const sum = k => rows.reduce((a, r) => a + (+r[k] || 0), 0);
  s.push(["Total", "", sum("base"), sum("absent"), sum("absentDed"), sum("adv"), sum("ded"), sum("bonus"), sum("net"), "", ""]);
  X.utils.book_append_sheet(wb, sheet(X, s, [18,10,12,11,11,11,11,9,12,18,6]), "Salary sheet");
  const a = [["Date","Employee","Amount","Note"]];
  rows.forEach(r => { const m = D.emps.get(r.id) || { id: r.id, name: r.name }; advancesFor(m, D.days, month).forEach(x => a.push([niceLong(x.date), r.name, x.amt, x.note])); });
  X.utils.book_append_sheet(wb, sheet(X, a, [14,18,12,30]), "Advances");
  const cap = [["Date","Type","Owner / partner","Details","Account","Amount (+ in / - out)"]];
  [...D.capital.values()].filter(c => (c.date || "").slice(0, 7) === month).sort((x, y) => x.date < y.date ? -1 : 1)
    .forEach(c => cap.push([niceLong(c.date), CAP_TYPES[c.type] || c.type, c.person || "", c.desc || "", SOURCES[srcKey(c.from)], capSign(c) * (+c.amt || 0)]));
  X.utils.book_append_sheet(wb, sheet(X, cap, [14,18,20,36,18,18]), "Capital");
  const vb = [["Bill date","Vendor","Category","Details","Amount"]];
  [...D.vbills.values()].filter(b => (b.date || "").slice(0, 7) === month).sort((a, b) => a.date < b.date ? -1 : 1)
    .forEach(b => vb.push([niceLong(b.date), D.vendors.get(b.vendorId)?.name || b.vendorName || "", b.cat || "", b.desc || "", +b.amt || 0]));
  X.utils.book_append_sheet(wb, sheet(X, vb, [14,22,16,34,12]), "Vendor bills");
  const from = month + "-01", to = monthEnd(month), tmp = X.utils.book_new();
  appendRange(X, tmp, inRange(D.days, from, to), from, to, D);
  ["Days", "Expenses", "Vendor payments", "Customer credit", "Riders", "Categories"].forEach(n => X.utils.book_append_sheet(wb, tmp.Sheets[n], n));
  save(X, wb, `Crust-House-Closing-${month}.xlsx`);
}

export async function exportVendors(D, todayISO) {
  const X = await xlsx(); const wb = X.utils.book_new(), list = [...D.vendors.values()].sort(byName);
  const s = [["Vendor","Supplies","Phone","Old balance","Total bills","Paid","We owe","Last entry"]];
  list.forEach(v => { const b = vendorBal(v, D.vbills, D.vpays); s.push([v.name, v.cat || "", v.phone || "", +v.openingDue || 0, b.billed, b.paid, b.owed, b.last ? niceLong(b.last) : ""]); });
  s.push(["Total", "", "", "", list.reduce((a, v) => a + vendorBal(v, D.vbills, D.vpays).billed, 0), list.reduce((a, v) => a + vendorBal(v, D.vbills, D.vpays).paid, 0), totalOwed(D), ""]);
  X.utils.book_append_sheet(wb, sheet(X, s, [22,14,15,12,12,12,12,14]), "What we owe");
  const l = [["Vendor","Date","Entry","Details","Bill","Paid","Balance"]];
  list.forEach(v => { if (+v.openingDue) l.push([v.name, "", "Old balance", "", +v.openingDue, "", +v.openingDue]); vendorLedger(v, D).forEach(e => l.push([v.name, niceLong(e.date), e.label, e.desc, e.kind === "bill" ? e.amt : "", e.kind === "pay" ? e.amt : "", e.bal])); });
  X.utils.book_append_sheet(wb, sheet(X, l, [22,14,22,32,12,12,12]), "Ledger");
  save(X, wb, `Crust-House-Vendors-${todayISO}.xlsx`);
}

export async function exportAttendance(D, month) {
  const X = await xlsx(); const wb = X.utils.book_new(), n = dim(month);
  const days = Array.from({ length: n }, (_, i) => month + "-" + pad(i + 1));
  const rows = [["Employee", "Role", ...days.map(d => +d.slice(8)), "Present", "Absent", "Half day", "Leave", "Day off", "Absent days (salary)"]];
  allEmps(D.emps).forEach(m => {
    const c = attCounts(m.id, month, D.attendance);
    if (!c.marked && m.active === false) return;
    rows.push([m.name, m.role || "", ...days.map(d => D.attendance.get(d)?.marks?.[m.id] || ""), c.P, c.A, c.H, c.L, c.O, c.absentDays]);
  });
  rows.push([], ["P = present, A = absent, H = half day, L = paid leave, O = day off. Absent days = A + half of H."]);
  X.utils.book_append_sheet(wb, sheet(X, rows, [20, 10, ...days.map(() => 4), 9, 8, 9, 7, 8, 18]), "Register " + month);
  save(X, wb, `Crust-House-Attendance-${month}.xlsx`);
}

export async function exportCustomers(D, todayISO) {
  const X = await xlsx(); const wb = X.utils.book_new(), list = [...D.customers.values()].sort(byName);
  const s = [["Customer","Phone","Old balance","Total credit","Paid back","Owes us","Last entry"]];
  list.forEach(c => { const b = custBal(c, D.cbills, D.cpays); s.push([c.name, c.phone || "", +c.openingDue || 0, b.given, b.paid, b.owes, b.last ? niceLong(b.last) : ""]); });
  s.push(["Total", "", "", list.reduce((a, c) => a + custBal(c, D.cbills, D.cpays).given, 0), list.reduce((a, c) => a + custBal(c, D.cbills, D.cpays).paid, 0), totalReceivable(D), ""]);
  X.utils.book_append_sheet(wb, sheet(X, s, [22,15,12,12,12,12,14]), "Who owes us");
  const l = [["Customer","Date","Entry","Details","Credit","Paid","Balance"]];
  list.forEach(c => { if (+c.openingDue) l.push([c.name, "", "Old balance", "", +c.openingDue, "", +c.openingDue]); custLedger(c, D).forEach(e => l.push([c.name, niceLong(e.date), e.label, e.desc, e.kind === "credit" ? e.amt : "", e.kind === "pay" ? e.amt : "", e.bal])); });
  X.utils.book_append_sheet(wb, sheet(X, l, [22,14,22,32,12,12,12]), "Ledger");
  save(X, wb, `Crust-House-Customers-${todayISO}.xlsx`);
}

export async function exportCapital(D, list, label) {
  const X = await xlsx(); const wb = X.utils.book_new(), t = capTotals(list);
  const rows = [["Date","Type","Owner / partner","Details","Account","Amount (+ in / - out)"]];
  list.slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(c => rows.push([niceLong(c.date), CAP_TYPES[c.type] || c.type, c.person || "", c.desc || "", SOURCES[srcKey(c.from)], capSign(c) * (+c.amt || 0)]));
  rows.push([], ["Capital invested", "", "", "", "", t.in], ["Setup / equipment", "", "", "", "", -t.spend], ["Owner withdrawals", "", "", "", "", -t.out], ["Net", "", "", "", "", t.in - t.spend - t.out]);
  X.utils.book_append_sheet(wb, sheet(X, rows, [14,18,20,36,18,18]), "Capital");
  X.utils.book_append_sheet(wb, sheet(X, [["Name","Invested","Setup / equipment","Withdrawn","Net (invested - withdrawn)"], ...capByPerson(D.capital).map(([k, o]) => [k, o.in, o.spend, o.out, o.in - o.out])], [20,14,18,14,22]), "By partner");
  save(X, wb, label ? `Crust-House-Capital-${label}.xlsx` : "Crust-House-Capital.xlsx");
}
