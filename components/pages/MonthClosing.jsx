"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Kpi, Empty, Confirm, NumInput, SourceSelect } from "../ui";
import { fmt, thisMonth, monthName, monthShort, prevMonth } from "@/lib/format";
import { closingCalc, SOURCES } from "@/lib/calc";
import { canEdit } from "@/lib/access";
import { saveDoc, isDenied } from "@/lib/firebase";
import { exportClosing } from "@/lib/excel";

const clone = o => JSON.parse(JSON.stringify(o));
const zero = () => ({ cash: 0, bank: 0, easypaisa: 0 });

export default function MonthClosing() {
  const { D, me, toast } = useApp();
  const [month, setMonth] = useState(thisMonth());
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(null);
  const [ask, setAsk] = useState(null); // "close" | "reopen"

  function load(m) {
    const c = D.closings.get(m);
    let d;
    if (c) d = clone(c);
    else { const pc = D.closings.get(prevMonth(m)); d = { month: m, opening: pc?.closing ? { ...pc.closing } : zero(), salaries: {}, status: "open" }; }
    d.salaries ||= {}; d.opening ||= zero();
    setMonth(m); setDraft(d); setDirty(false); setPending(null); setAsk(null);
  }
  useEffect(() => { if (!dirty) load(month); }, [D.closings]);

  const calc = useMemo(() => draft ? closingCalc(month, draft, D) : null, [draft, month, D]);
  if (!draft || !calc) return <p className="loading">Loading…</p>;

  const closed = draft.status === "closed";
  const editable = canEdit(me, "close");
  const ro = closed || !editable;
  const { f, rows, paid, close, salaryCost, toPay, profit } = calc;
  const o = draft.opening, total = close.cash + close.bank + close.easypaisa;
  const sum3 = x => x.cash + x.bank + x.easypaisa;
  const money = (v, sign) => v ? sign + fmt(v) : fmt(0);
  const saved = D.closings.get(month);
  const savedText = dirty ? "Unsaved changes" : saved?.status === "closed" && saved.closedAt ? "Closed on " + new Date(saved.closedAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : saved?.updatedAt ? "Saved" : "Not saved yet";
  const edit = fn => { setDraft(p => { const n = clone(p); fn(n); return n; }); setDirty(true); };
  const setSal = (id, k, v) => edit(n => { const s = n.salaries[id] ||= {}; s[k] = v; if (k === "paid") s.paidOn = v ? new Date().toISOString().slice(0, 10) : null; });

  const base = extra => ({ month, opening: { cash: +o.cash || 0, bank: +o.bank || 0, easypaisa: +o.easypaisa || 0 }, salaries: draft.salaries, status: "open", updatedAt: new Date().toISOString(), ...extra });
  async function write(doc, okMsg) {
    try { await saveDoc("closings", month, doc); setDirty(false); setDraft(clone(doc)); setAsk(null); toast(okMsg); }
    catch (e) { toast(isDenied(e) ? "You don’t have permission to change month closing." : "Could not save. Try again."); }
  }
  const doClose = () => write(base({ status: "closed", rows, flows: f, paid, closing: close, closedAt: new Date().toISOString(), closedBy: me.uid }), monthName(month) + " closed. Next month opens with these balances.");

  return (
    <>
      <div className="card bar">
        <div className="grow">
          <h2 style={{ margin: 0 }}>Month closing</h2>
          <span className={"pill " + (closed ? "closed" : "open")}>{closed ? "Closed" : "Open"}</span>
          {pending ? <span className="sub">Unsaved changes. <button className="btn ghost" onClick={() => load(pending)}>Discard and open {monthName(pending)}</button></span> : <span className="sub">{savedText}</span>}
        </div>
        <label className="field" style={{ width: 170 }}>Month<input type="month" value={month} onChange={e => { const m = e.target.value; if (!m) return; dirty ? setPending(m) : load(m); }} /></label>
        <button className="btn xl" onClick={() => exportClosing(D, month, draft, calc).then(() => toast("Excel file downloaded"))}>Export to Excel</button>
        {!ro && <button className="btn" onClick={() => write(base(), monthName(month) + " saved")}>Save</button>}
        {editable && (ask === "close" ? <Confirm danger={false} text={`${toPay ? fmt(toPay) + " salary is still unpaid. " : ""}Close ${monthName(month)} and lock the numbers?`} yes="Close month" no="Cancel" onYes={doClose} onNo={() => setAsk(null)} />
          : ask === "reopen" ? <Confirm danger={false} text={`Reopen ${monthName(month)}? Numbers will update again from the daily book.`} yes="Reopen" no="Cancel" onYes={() => write(base(), monthName(month) + " reopened")} onNo={() => setAsk(null)} />
          : closed ? <button className="btn" onClick={() => setAsk("reopen")}>Reopen month</button>
          : <button className="btn primary" onClick={() => setAsk("close")}>Close month</button>)}
      </div>

      <div className="kpis">
        <Kpi main label="Closing balance" value={total} sub="cash + bank + EasyPaisa" />
        <Kpi label={`Sale · ${monthShort(month)}`} value={f.sale} sub={`${f.n} day${f.n === 1 ? "" : "s"} recorded`} />
        <Kpi label="Expenses" value={f.exp} sub={`incl. petrol ${fmt(f.petrol)}, advances ${fmt(f.adv)}`} />
        <Kpi label="Salary still to pay" value={toPay} sub={`salary cost ${fmt(salaryCost)}`} />
        <Kpi label="Profit after salary" value={profit} sub="sale + credit + Foodpanda − commission − expenses − vendor bills − salaries" />
        <Kpi label="Owed to vendors" value={f.owed} neg={f.owed > 0} sub={`at month end · bills ${fmt(f.vbills)}`} />
        <Kpi label="Customers owe us" value={f.recv} sub="credit not paid back at month end" />
        <Kpi label="Foodpanda sale" value={f.fpSale} sub={`received ${fmt(f.fpPay)} · commission ${fmt(f.fpFee)}`} />
        <Kpi label="Foodpanda owes us" value={f.fpOwes} sub="at month end" />
        <Kpi label="Food given on credit" value={f.credit} sub={`this month · received back ${fmt(sum3(f.cpay))}`} />
      </div>

      <div className="card">
        <h2>Cash, bank and EasyPaisa position <small>opening + received − paid out = closing</small></h2>
        <div className="open-row" style={{ marginBottom: 14 }}>
          {[["cash", "Opening cash"], ["bank", "Opening bank"], ["easypaisa", "Opening EasyPaisa / JazzCash"]].map(([k, l]) => (
            <label className="field" key={k}>{l}<NumInput disabled={ro} value={o[k]} onChange={v => edit(n => { n.opening[k] = v === "" ? 0 : v; })} /></label>
          ))}
        </div>
        <div className="tbl-wrap"><table className="num money cards"><thead><tr><th></th><th>Cash</th><th>Bank</th><th>EasyPaisa / JazzCash</th><th>Total</th></tr></thead><tbody>
          <tr><td>Opening balance</td><td>{fmt(o.cash)}</td><td>{fmt(o.bank)}</td><td>{fmt(o.easypaisa)}</td><td>{fmt((+o.cash || 0) + (+o.bank || 0) + (+o.easypaisa || 0))}</td></tr>
          <tr><td>+ Sale received</td><td>{money(f.cash, "+ ")}</td><td>{money(f.bank, "+ ")}</td><td>{money(f.ep, "+ ")}</td><td>{money(f.sale, "+ ")}</td></tr>
          <tr><td>+ Foodpanda payments</td><td>{fmt(0)}</td><td>{money(f.fpPay, "+ ")}</td><td>{fmt(0)}</td><td>{money(f.fpPay, "+ ")}</td></tr>
          <tr><td>+ Customer payments received</td><td>{money(f.cpay.cash, "+ ")}</td><td>{money(f.cpay.bank, "+ ")}</td><td>{money(f.cpay.easypaisa, "+ ")}</td><td>{money(sum3(f.cpay), "+ ")}</td></tr>
          <tr><td>+ Capital invested</td><td>{money(f.capIn.cash, "+ ")}</td><td>{money(f.capIn.bank, "+ ")}</td><td>{money(f.capIn.easypaisa, "+ ")}</td><td>{money(sum3(f.capIn), "+ ")}</td></tr>
          <tr><td>− Expenses, petrol &amp; advances</td><td>{money(f.out.cash, "− ")}</td><td>{money(f.out.bank, "− ")}</td><td>{money(f.out.easypaisa, "− ")}</td><td>{money(f.exp, "− ")}</td></tr>
          <tr><td>− Capital spent &amp; withdrawn</td><td>{money(f.capOut.cash, "− ")}</td><td>{money(f.capOut.bank, "− ")}</td><td>{money(f.capOut.easypaisa, "− ")}</td><td>{money(sum3(f.capOut), "− ")}</td></tr>
          <tr><td>− Vendor bills paid</td><td>{money(f.vpay.cash, "− ")}</td><td>{money(f.vpay.bank, "− ")}</td><td>{money(f.vpay.easypaisa, "− ")}</td><td>{money(sum3(f.vpay), "− ")}</td></tr>
          <tr><td>− Salaries paid</td><td>{money(paid.cash, "− ")}</td><td>{money(paid.bank, "− ")}</td><td>{money(paid.easypaisa, "− ")}</td><td>{money(sum3(paid), "− ")}</td></tr>
          <tr className="total"><td>Closing balance</td>{["cash", "bank", "easypaisa"].map(k => <td key={k} className={close[k] < 0 ? "neg" : ""}>{fmt(close[k])}</td>)}<td>{fmt(total)}</td></tr>
        </tbody></table></div>
        <p className="hint">Expenses, rider petrol and advances come out of the account chosen in “Paid from” when they were entered. Vendor payments come from the Vendors page, capital from the Capital page. Each employee’s remaining salary comes out of the account you pick below once you tick Paid. Opening balances fill in from last month’s closing.</p>
      </div>

      <div className="card">
        <h2>Salary sheet <small>salary − absent days − advances − deduction + bonus = to pay</small></h2>
        {rows.length ? (
          <div className="tbl-wrap"><table className="num cards"><thead><tr><th>Employee</th><th>Salary</th><th>Absent days</th><th>Absent cut</th><th>Advances</th><th>Deduction</th><th>Bonus</th><th>To pay</th><th>Pay from</th><th>Paid</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id}><td><b>{r.name}</b><div className="sub">{r.role}</div></td><td>{fmt(r.base)}</td>
                <td>{ro ? r.absent : <NumInput step="0.5" max="31" aria-label="Absent days" value={r.absent || ""} onChange={v => setSal(r.id, "absent", v === "" ? null : v)} />}
                  {r.absentSrc && <div className="sub">{r.absentSrc === "attendance" ? "from attendance" : "typed in"}</div>}</td>
                <td>{fmt(r.absentDed)}</td><td>{fmt(r.adv)}</td>
                <td>{ro ? fmt(r.ded) : <NumInput aria-label="Deduction" value={r.ded || ""} onChange={v => setSal(r.id, "deduction", v === "" ? 0 : v)} />}</td>
                <td>{ro ? fmt(r.bonus) : <NumInput aria-label="Bonus" value={r.bonus || ""} onChange={v => setSal(r.id, "bonus", v === "" ? 0 : v)} />}</td>
                <td><b className={r.net < 0 ? "neg" : ""}>{fmt(r.net)}</b></td>
                <td>{ro ? SOURCES[r.from] : <SourceSelect aria-label="Pay from" value={r.from} onChange={v => setSal(r.id, "from", v)} />}</td>
                <td>{ro ? (r.paid ? "Yes" : "No") : <input type="checkbox" aria-label="Paid" checked={r.paid} onChange={e => setSal(r.id, "paid", e.target.checked)} />}</td>
              </tr>))}</tbody>
            <tfoot><tr><td>Total</td>{["base", "absent", "absentDed", "adv", "ded", "bonus", "net"].map(k => { const s = rows.reduce((a, r) => a + (+r[k] || 0), 0); return <td key={k}>{k === "absent" ? s : fmt(s)}</td>; })}<td></td><td>{rows.filter(r => r.paid).length}/{rows.length}</td></tr></tfoot>
          </table></div>
        ) : <Empty>No employees for this month. Add staff on the <b>Employees</b> page and they will appear here with their advances.</Empty>}
      </div>
    </>
  );
}
