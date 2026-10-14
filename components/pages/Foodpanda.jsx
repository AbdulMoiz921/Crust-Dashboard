"use client";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { Kpi, Empty, Confirm, NumInput } from "../ui";
import { fmt, today, thisMonth, monthShort, monthName, nice, monthEnd } from "@/lib/format";
import { fpSold, fpPaid, fpFees, fpOwes, fpLedger } from "@/lib/calc";
import { canEdit } from "@/lib/access";
import { saveDoc, removeDoc, newId, isDenied } from "@/lib/firebase";
import { exportFoodpanda } from "@/lib/excel";

// Foodpanda orders and payouts. A payout always lands in the Bank account.
export default function Foodpanda() {
  const { D, me, loaded, toast } = useApp();
  const editable = canEdit(me, "fp");
  const [sale, setSale] = useState({ date: today(), amt: "", orders: "", note: "" });
  const [pay, setPay] = useState({ date: today(), amt: "", fee: "", note: "" });
  const [saleMsg, setSaleMsg] = useState("");
  const [payMsg, setPayMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [askId, setAskId] = useState(null);

  const m = thisMonth(), from = m + "-01", to = monthEnd(m);
  const owes = fpOwes(D);
  const ent = fpLedger(D).reverse();
  const isClosed = d => D.closings.get(d.slice(0, 7))?.status === "closed";

  async function addSale() {
    const amt = +sale.amt;
    if (!sale.date || !(amt > 0)) return setSaleMsg("Enter the date and the orders total.");
    if (isClosed(sale.date)) return setSaleMsg(monthName(sale.date.slice(0, 7)) + " is closed. Reopen it in Month closing first.");
    setBusy(true);
    try {
      await saveDoc("fpsales", newId("fpsales"), { date: sale.date, amt, orders: +sale.orders || 0, note: sale.note.trim(), createdAt: new Date().toISOString(), createdBy: me.uid });
      setSale(s => ({ ...s, amt: "", orders: "", note: "" })); setSaleMsg(""); toast(`Foodpanda sale of ${fmt(amt)} added`);
    } catch (e) { setSaleMsg(isDenied(e) ? "You have view-only access." : "Could not save. Try again."); }
    setBusy(false);
  }
  async function addPay() {
    const amt = +pay.amt, fee = +pay.fee || 0;
    if (!pay.date || !(amt > 0)) return setPayMsg("Enter the date and the amount received in the bank.");
    if (isClosed(pay.date)) return setPayMsg(monthName(pay.date.slice(0, 7)) + " is closed. Reopen it in Month closing first.");
    setBusy(true);
    try {
      await saveDoc("fppays", newId("fppays"), { date: pay.date, amt, fee, note: pay.note.trim(), createdAt: new Date().toISOString(), createdBy: me.uid });
      setPay(p => ({ ...p, amt: "", fee: "", note: "" })); setPayMsg(""); toast(`${fmt(amt)} from Foodpanda added to Bank`);
    } catch (e) { setPayMsg(isDenied(e) ? "You have view-only access." : "Could not save. Try again."); }
    setBusy(false);
  }
  async function del(e) {
    try { await removeDoc(e.kind === "sale" ? "fpsales" : "fppays", e.id); setAskId(null); toast("Deleted"); }
    catch { toast("Could not delete. Try again."); }
  }

  return (
    <>
      <div className="card bar">
        <div className="grow"><h2 style={{ margin: 0 }}>Foodpanda</h2><span className="sub">Foodpanda orders, payouts into the bank, commission, and what Foodpanda still owes</span></div>
        <button className="btn xl" onClick={() => exportFoodpanda(D, today()).then(() => toast("Excel file downloaded"))}>Export to Excel</button>
      </div>
      <div className="kpis">
        <Kpi main label="Foodpanda owes us" value={owes} sub="sales not paid out yet" />
        <Kpi label={`Foodpanda sale · ${monthShort(m)}`} value={fpSold(D.fpsales, from, to)} sub="orders this month" />
        <Kpi label={`Received in bank · ${monthShort(m)}`} value={fpPaid(D.fppays, from, to)} sub="payouts this month" />
        <Kpi label={`Commission · ${monthShort(m)}`} value={fpFees(D.fppays, from, to)} sub="kept by Foodpanda" />
      </div>
      <div className="emp-grid">
        <div className="card">
          <h2>History <small>newest first · balance = what Foodpanda owes after each entry</small></h2>
          {ent.length ? (
            <div className="tbl-wrap"><table className="num cards"><thead><tr><th>Date</th><th>Entry</th><th>Note</th><th>Sale</th><th>Into bank</th><th>Commission</th><th>Balance</th><th></th></tr></thead>
              <tbody>{ent.map(e => (
                <tr key={e.kind + e.id}><td>{nice(e.date)}</td><td style={{ textAlign: "left" }}>{e.label}</td><td style={{ textAlign: "left", whiteSpace: "normal" }}>{e.desc}</td>
                  <td>{e.sale ? fmt(e.sale) : ""}</td><td className={e.paid ? "pos" : ""}>{e.paid ? "+ " + fmt(e.paid) : ""}</td><td>{e.fee ? fmt(e.fee) : ""}</td><td><b>{fmt(e.bal)}</b></td>
                  <td>{editable && !isClosed(e.date) && (askId === e.kind + e.id ? <Confirm text="Delete?" yes="Yes" no="No" onYes={() => del(e)} onNo={() => setAskId(null)} /> : <button className="x" aria-label="Delete entry" onClick={() => setAskId(e.kind + e.id)}>×</button>)}</td></tr>
              ))}</tbody></table></div>
          ) : <Empty>{loaded.fpsales ? "No Foodpanda entries yet. Add the orders total, then the payout when it reaches your bank." : "Loading…"}</Empty>}
        </div>
        <div className="view">
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="view">
            <div className="card">
              <h2>Foodpanda sale <small>orders total for a day or week</small></h2>
              <div className="form2">
                <label className="field">Date<input type="date" value={sale.date} onChange={e => setSale(s => ({ ...s, date: e.target.value }))} /></label>
                <label className="field">Orders total (Rs)<NumInput value={sale.amt} onChange={v => setSale(s => ({ ...s, amt: v }))} /></label>
                <label className="field">Number of orders<NumInput value={sale.orders} onChange={v => setSale(s => ({ ...s, orders: v }))} placeholder="optional" /></label>
                <label className="field">Note<input type="text" value={sale.note} placeholder="e.g. 1–7 Oct" onChange={e => setSale(s => ({ ...s, note: e.target.value }))} /></label>
              </div>
              <div className="bar" style={{ marginTop: 12 }}><span className="grow sub">{saleMsg}</span><button className="btn primary" onClick={addSale} disabled={busy}>Add Foodpanda sale</button></div>
            </div>
            <div className="card">
              <h2>Foodpanda payment <small>goes into Bank</small></h2>
              <div className="form2">
                <label className="field">Date received<input type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} /></label>
                <label className="field">Amount received in bank (Rs)<NumInput value={pay.amt} onChange={v => setPay(p => ({ ...p, amt: v }))} /></label>
                <label className="field">Commission / fees deducted (Rs)<NumInput value={pay.fee} onChange={v => setPay(p => ({ ...p, fee: v }))} placeholder="optional" /></label>
                <label className="field">Note<input type="text" value={pay.note} placeholder="e.g. payout ref, period" onChange={e => setPay(p => ({ ...p, note: e.target.value }))} /></label>
              </div>
              <div className="bar" style={{ marginTop: 12 }}>
                <span className="grow sub">{payMsg || (owes > 0 ? `Foodpanda owes ${fmt(owes)}` : "")}</span>
                <button className="btn primary" onClick={addPay} disabled={busy}>Add payment to Bank</button>
              </div>
            </div>
          </fieldset>
          <p className="hint">Don’t include Foodpanda orders in the day’s sale on Daily entry. A payment here is added to the Bank balance for its date (Daily entry, Dashboard and Month closing). Commission counts as a cost in Month closing profit.</p>
        </div>
      </div>
    </>
  );
}
