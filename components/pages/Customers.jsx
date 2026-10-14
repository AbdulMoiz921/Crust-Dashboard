"use client";
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { Kpi, Empty, Confirm, NumInput, SourceSelect } from "../ui";
import { fmt, today, thisMonth, monthShort, monthName, nice } from "@/lib/format";
import { SOURCES, custBal, custLedger, totalReceivable, byName } from "@/lib/calc";
import { canEdit } from "@/lib/access";
import { saveDoc, removeDoc, newId, isDenied } from "@/lib/firebase";
import { exportCustomers } from "@/lib/excel";

// Credit customers: food given now and paid for later. A credit sale moves no money;
// the payment does, into the account it was received in.
export default function Customers() {
  const { D, me, loaded, toast } = useApp();
  const editable = canEdit(me, "cust");
  const [sel, setSel] = useState(null);
  const [formOpen, setFormOpen] = useState(null); // null | "new" | "edit"
  const [credit, setCredit] = useState({ date: today(), customerId: "", desc: "", amt: "" });
  const [pay, setPay] = useState({ date: today(), customerId: "", amt: "", to: "cash", note: "" });
  const [creditMsg, setCreditMsg] = useState("");
  const [payMsg, setPayMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (sel && !D.customers.has(sel)) setSel(null); }, [D.customers]);

  const month = thisMonth(), list = [...D.customers.values()].sort(byName);
  const bal = c => custBal(c, D.cbills, D.cpays);
  const owesAll = totalReceivable(D);
  const creditM = [...D.cbills.values()].filter(b => b.date.slice(0, 7) === month).reduce((a, b) => a + (+b.amt || 0), 0);
  const paidM = [...D.cpays.values()].filter(p => p.date.slice(0, 7) === month).reduce((a, p) => a + (+p.amt || 0), 0);
  const rows = list.map(c => ({ c, b: bal(c) })).sort((a, b) => b.b.owes - a.b.owes || byName(a.c, b.c));
  const withDue = rows.filter(r => r.b.owes > 0).length;
  const isClosed = d => D.closings.get(d.slice(0, 7))?.status === "closed";
  const choose = id => { setSel(id); setFormOpen(null); setCredit(c => ({ ...c, customerId: id })); setPay(p => ({ ...p, customerId: id })); };
  const payCust = D.customers.get(pay.customerId);

  async function addCredit() {
    const c = D.customers.get(credit.customerId), amt = +credit.amt;
    if (!c) return setCreditMsg(D.customers.size ? "Choose the customer." : "Add a customer first.");
    if (!credit.date || !(amt > 0)) return setCreditMsg("Enter the date and amount.");
    if (isClosed(credit.date)) return setCreditMsg(monthName(credit.date.slice(0, 7)) + " is closed. Reopen it in Month closing first.");
    setBusy(true);
    try {
      await saveDoc("cbills", newId("cbills"), { date: credit.date, customerId: c.id, customerName: c.name, desc: credit.desc.trim(), amt, createdAt: new Date().toISOString(), createdBy: me.uid });
      setCredit(x => ({ ...x, amt: "", desc: "" })); setCreditMsg(""); setSel(c.id); toast(`${fmt(amt)} on credit added for ${c.name}`);
    } catch (e) { setCreditMsg(isDenied(e) ? "You have view-only access." : "Could not save. Try again."); }
    setBusy(false);
  }
  async function addPay() {
    const c = D.customers.get(pay.customerId), amt = +pay.amt;
    if (!c) return setPayMsg(D.customers.size ? "Choose the customer." : "Add a customer first.");
    if (!pay.date || !(amt > 0)) return setPayMsg("Enter the payment date and amount.");
    if (isClosed(pay.date)) return setPayMsg(monthName(pay.date.slice(0, 7)) + " is closed. Reopen it in Month closing first.");
    setBusy(true);
    try {
      await saveDoc("cpays", newId("cpays"), { date: pay.date, customerId: c.id, customerName: c.name, amt, to: pay.to, note: pay.note.trim(), createdAt: new Date().toISOString(), createdBy: me.uid });
      setPay(p => ({ ...p, amt: "", note: "" })); setPayMsg(""); setSel(c.id); toast(`Received ${fmt(amt)} from ${c.name} in ${SOURCES[pay.to]}`);
    } catch (e) { setPayMsg(isDenied(e) ? "You have view-only access." : "Could not save. Try again."); }
    setBusy(false);
  }

  const custOptions = <><option value="">{list.length ? "Choose customer…" : "Add a customer first"}</option>{list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</>;
  const selC = sel ? D.customers.get(sel) : null;

  return (
    <>
      <div className="card bar">
        <div className="grow"><h2 style={{ margin: 0 }}>Customers</h2><span className="sub">Food given on credit (udhaar), payments received, and how much each customer owes</span></div>
        <button className="btn xl" onClick={() => exportCustomers(D, today()).then(() => toast("Excel file downloaded"))}>Export to Excel</button>
        {editable && <button className="btn primary" onClick={() => { setSel(null); setFormOpen("new"); }}>+ Add customer</button>}
      </div>
      <div className="kpis">
        <Kpi main label="Customers owe us" value={owesAll} sub={`${withDue} customer${withDue === 1 ? "" : "s"} with unpaid credit`} />
        <Kpi label={`Credit given · ${monthShort(month)}`} value={creditM} sub="food given on credit this month" />
        <Kpi label={`Received · ${monthShort(month)}`} value={paidM} sub="credit paid back this month" />
        <Kpi money={false} label="Credit customers" value={list.length} sub="on the list" />
      </div>
      <div className="emp-grid">
        <div className="view">
          <div className="card">
            <h2>Who owes us <small>click a customer to see their credit and payments</small></h2>
            {rows.length ? (
              <div className="tbl-wrap"><table className="num cards"><thead><tr><th>Customer</th><th>Total credit</th><th>Paid</th><th>Owes us</th><th>Last entry</th></tr></thead>
                <tbody>{rows.map(({ c, b }) => (
                  <tr key={c.id} className={"click" + (c.id === sel ? " sel" : "")} tabIndex={0} onClick={() => choose(c.id)} onKeyDown={e => e.key === "Enter" && choose(c.id)}>
                    <td><b>{c.name}</b><div className="sub">{c.phone || ""}</div></td><td>{fmt(b.given)}</td><td>{fmt(b.paid)}</td>
                    <td>{b.owes > 0 ? <b className="neg">{fmt(b.owes)}</b> : b.owes < 0 ? <span className="pos">{fmt(-b.owes)} paid extra</span> : <span className="pill closed">Clear</span>}</td>
                    <td>{b.last ? nice(b.last) : "—"}</td></tr>))}</tbody>
                <tfoot><tr><td>Total</td><td>{fmt(rows.reduce((a, r) => a + r.b.given, 0))}</td><td>{fmt(rows.reduce((a, r) => a + r.b.paid, 0))}</td><td>{fmt(owesAll)}</td><td></td></tr></tfoot>
              </table></div>
            ) : <Empty>{loaded.customers ? <>No credit customers yet. Press <b>Add customer</b> for anyone who takes food now and pays later.</> : "Loading customers…"}</Empty>}
          </div>
          {selC && <Ledger c={selC} editable={editable} isClosed={isClosed} onEdit={() => setFormOpen("edit")} />}
        </div>

        <div className="view">
          {formOpen && <div className="card"><CustomerForm key={formOpen + (sel || "")} c={formOpen === "edit" ? selC : null} onDone={id => { setFormOpen(null); if (id) choose(id); else if (id === null) setSel(null); }} /></div>}
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="view">
            <div className="card">
              <h2>Food given on credit</h2>
              <div className="form2">
                <label className="field">Date<input type="date" value={credit.date} onChange={e => setCredit(x => ({ ...x, date: e.target.value }))} /></label>
                <label className="field">Customer<select value={credit.customerId} onChange={e => setCredit(x => ({ ...x, customerId: e.target.value }))}>{custOptions}</select></label>
                <label className="field">Amount (Rs)<NumInput value={credit.amt} onChange={v => setCredit(x => ({ ...x, amt: v }))} /></label>
                <label className="field">Details / bill no.<input type="text" value={credit.desc} placeholder="e.g. 2 large pizzas, bill #45" onChange={e => setCredit(x => ({ ...x, desc: e.target.value }))} /></label>
              </div>
              <div className="bar" style={{ marginTop: 12 }}><span className="grow sub">{creditMsg}</span><button className="btn primary" onClick={addCredit} disabled={busy}>Add credit</button></div>
            </div>
            <div className="card">
              <h2>Receive payment <small>{payCust ? `${payCust.name} owes ${fmt(bal(payCust).owes)}` : ""}</small></h2>
              <div className="form2">
                <label className="field">Payment date<input type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} /></label>
                <label className="field">Customer<select value={pay.customerId} onChange={e => setPay(p => ({ ...p, customerId: e.target.value }))}>{custOptions}</select></label>
                <label className="field">Amount (Rs)<NumInput value={pay.amt} onChange={v => setPay(p => ({ ...p, amt: v }))} /></label>
                <label className="field">Received in<SourceSelect value={pay.to} onChange={v => setPay(p => ({ ...p, to: v }))} /></label>
                <label className="field full">Note<input type="text" value={pay.note} placeholder="optional" onChange={e => setPay(p => ({ ...p, note: e.target.value }))} /></label>
              </div>
              <div className="bar" style={{ marginTop: 12 }}>
                <span className="grow sub">{payMsg}</span>
                <button className="btn" onClick={() => payCust ? setPay(p => ({ ...p, amt: Math.max(0, bal(payCust).owes) })) : setPayMsg("Choose a customer first.")}>Full amount</button>
                <button className="btn primary" onClick={addPay} disabled={busy}>Record payment</button>
              </div>
            </div>
          </fieldset>
          <p className="hint">Don’t include credit food in the day’s sale on Daily entry. Record it here instead. When the customer pays, the money is added to the account you pick, and Month closing shows it as “Customer payments received”.</p>
        </div>
      </div>
    </>
  );
}

function CustomerForm({ c, onDone }) {
  const { D, toast } = useApp();
  const [f, setF] = useState(() => ({ name: c?.name || "", phone: c?.phone || "", openingDue: c?.openingDue ?? "", note: c?.note || "" }));
  const [msg, setMsg] = useState("");
  const [askDel, setAskDel] = useState(false);
  const set = (k, val) => setF(p => ({ ...p, [k]: val }));
  async function save() {
    const name = f.name.trim();
    if (!name) return setMsg("Enter the customer’s name.");
    const dup = [...D.customers.values()].find(x => x.id !== c?.id && (x.name || "").toLowerCase() === name.toLowerCase());
    if (dup) return setMsg(dup.name + " is already on the list.");
    const id = c?.id || newId("customers");
    try {
      await saveDoc("customers", id, { name, phone: f.phone.trim(), openingDue: +f.openingDue || 0, note: f.note.trim(), createdAt: c?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
      toast(c ? "Customer updated" : name + " added"); onDone(id);
    } catch (e) { setMsg(isDenied(e) ? "You have view-only access." : "Could not save. Try again."); }
  }
  function tryDelete() {
    const used = [...D.cbills.values(), ...D.cpays.values()].some(x => x.customerId === c.id);
    if (used) return setMsg("This customer has credit or payments. Delete those first.");
    setAskDel(true);
  }
  async function del() {
    try { await removeDoc("customers", c.id); toast("Customer deleted"); onDone(null); } catch { setMsg("Could not delete. Try again."); }
  }
  return <>
    <h2>{c ? "Edit " + c.name : "New credit customer"}</h2>
    <div className="form2">
      <label className="field">Customer name<input type="text" value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Shahid (office near the bank)" /></label>
      <label className="field">Phone<input type="text" value={f.phone} onChange={e => set("phone", e.target.value)} placeholder="03xx-xxxxxxx" /></label>
      <label className="field">Old balance they owe (Rs)<NumInput value={f.openingDue} onChange={val => set("openingDue", val)} /></label>
      <label className="field">Note<input type="text" value={f.note} onChange={e => set("note", e.target.value)} placeholder="optional" /></label>
    </div>
    <p className="hint">Old balance is anything this customer already owed before you started using this book.</p>
    <div className="bar" style={{ marginTop: 10 }}>
      <span className="grow sub">{msg}</span>
      {c && (askDel ? <Confirm text={`Delete ${c.name}?`} onYes={del} onNo={() => setAskDel(false)} /> : <button className="btn danger" onClick={tryDelete}>Delete customer</button>)}
      <button className="btn ghost" onClick={() => onDone(undefined)}>Cancel</button>
      <button className="btn primary" onClick={save}>{c ? "Save changes" : "Add customer"}</button>
    </div>
  </>;
}

function Ledger({ c, editable, isClosed, onEdit }) {
  const { D, toast } = useApp();
  const [askId, setAskId] = useState(null);
  const b = custBal(c, D.cbills, D.cpays), ent = custLedger(c, D);
  async function del(e) {
    try { await removeDoc(e.kind === "credit" ? "cbills" : "cpays", e.id); setAskId(null); toast(e.kind === "credit" ? "Credit entry deleted" : "Payment deleted"); }
    catch { toast("Could not delete. Try again."); }
  }
  return (
    <div className="card">
      <h2>{c.name} <small>{c.phone || ""}</small></h2>
      <div className="bar" style={{ marginBottom: 12 }}>
        <span className="grow">Owes us <b className={b.owes > 0 ? "neg" : ""} style={{ fontSize: 18 }}>{fmt(b.owes)}</b></span>
        {editable && <button className="btn" onClick={onEdit}>Edit customer</button>}
      </div>
      <div className="tbl-wrap"><table className="num cards"><thead><tr><th>Date</th><th>Entry</th><th>Details</th><th>Credit</th><th>Paid</th><th>Balance</th><th></th></tr></thead><tbody>
        {+c.openingDue ? <tr><td>—</td><td style={{ textAlign: "left" }}>Old balance</td><td></td><td>{fmt(c.openingDue)}</td><td></td><td>{fmt(c.openingDue)}</td><td></td></tr> : null}
        {ent.map(e => (
          <tr key={e.kind + e.id}><td>{nice(e.date)}</td><td style={{ textAlign: "left" }}>{e.label}</td><td style={{ textAlign: "left", whiteSpace: "normal" }}>{e.desc}</td>
            <td>{e.kind === "credit" ? fmt(e.amt) : ""}</td><td>{e.kind === "pay" ? fmt(e.amt) : ""}</td><td><b>{fmt(e.bal)}</b></td>
            <td>{editable && !isClosed(e.date) && (askId === e.id ? <Confirm text="Delete?" yes="Yes" no="No" onYes={() => del(e)} onNo={() => setAskId(null)} /> : <button className="x" aria-label="Delete entry" onClick={() => setAskId(e.id)}>×</button>)}</td></tr>
        ))}
      </tbody></table></div>
      {!ent.length && !+c.openingDue && <p className="hint">No credit or payments yet.</p>}
    </div>
  );
}
