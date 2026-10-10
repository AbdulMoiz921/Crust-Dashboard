"use client";
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { Kpi, Empty, Confirm, NumInput, SourceSelect } from "../ui";
import { fmt, today, thisMonth, monthShort, monthName, nice } from "@/lib/format";
import { BILL_CATS, SOURCES, vendorBal, vendorLedger, totalOwed, byName } from "@/lib/calc";
import { canEdit } from "@/lib/access";
import { saveDoc, removeDoc, newId, isDenied } from "@/lib/firebase";
import { exportVendors } from "@/lib/excel";

export default function Vendors() {
  const { D, me, loaded, toast } = useApp();
  const editable = canEdit(me, "ven");
  const [sel, setSel] = useState(null);
  const [formOpen, setFormOpen] = useState(null); // null | "new" | "edit"
  const [bill, setBill] = useState({ date: today(), vendorId: "", cat: BILL_CATS[0], desc: "", amt: "" });
  const [pay, setPay] = useState({ date: today(), vendorId: "", amt: "", from: "cash", note: "" });
  const [billMsg, setBillMsg] = useState("");
  const [payMsg, setPayMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (sel && !D.vendors.has(sel)) setSel(null); }, [D.vendors]);

  const month = thisMonth(), list = [...D.vendors.values()].sort(byName);
  const bal = v => vendorBal(v, D.vbills, D.vpays);
  const owedAll = totalOwed(D);
  const billsM = [...D.vbills.values()].filter(b => b.date.slice(0, 7) === month).reduce((a, b) => a + (+b.amt || 0), 0);
  const paidM = [...D.vpays.values()].filter(p => p.date.slice(0, 7) === month).reduce((a, p) => a + (+p.amt || 0), 0);
  const rows = list.map(v => ({ v, b: bal(v) })).sort((a, b) => b.b.owed - a.b.owed || byName(a.v, b.v));
  const withDue = rows.filter(r => r.b.owed > 0).length;
  const isClosed = d => D.closings.get(d.slice(0, 7))?.status === "closed";
  const choose = id => { setSel(id); setFormOpen(null); setBill(b => ({ ...b, vendorId: id, cat: D.vendors.get(id)?.cat && BILL_CATS.includes(D.vendors.get(id).cat) ? D.vendors.get(id).cat : b.cat })); setPay(p => ({ ...p, vendorId: id })); };
  const payVendor = D.vendors.get(pay.vendorId);

  async function addBill() {
    const v = D.vendors.get(bill.vendorId), amt = +bill.amt;
    if (!v) return setBillMsg(D.vendors.size ? "Choose the vendor." : "Add a vendor first.");
    if (!bill.date || !(amt > 0)) return setBillMsg("Enter the bill date and amount.");
    if (isClosed(bill.date)) return setBillMsg(monthName(bill.date.slice(0, 7)) + " is closed. Reopen it in Month closing first.");
    setBusy(true);
    try {
      await saveDoc("vbills", newId("vbills"), { date: bill.date, vendorId: v.id, vendorName: v.name, cat: bill.cat, desc: bill.desc.trim(), amt, createdAt: new Date().toISOString(), createdBy: me.uid });
      setBill(b => ({ ...b, amt: "", desc: "" })); setBillMsg(""); setSel(v.id); toast(`Unpaid bill of ${fmt(amt)} added for ${v.name}`);
    } catch (e) { setBillMsg(isDenied(e) ? "You have view-only access." : "Could not save. Try again."); }
    setBusy(false);
  }
  async function addPay() {
    const v = D.vendors.get(pay.vendorId), amt = +pay.amt;
    if (!v) return setPayMsg(D.vendors.size ? "Choose the vendor." : "Add a vendor first.");
    if (!pay.date || !(amt > 0)) return setPayMsg("Enter the payment date and amount.");
    if (isClosed(pay.date)) return setPayMsg(monthName(pay.date.slice(0, 7)) + " is closed. Reopen it in Month closing first.");
    setBusy(true);
    try {
      await saveDoc("vpays", newId("vpays"), { date: pay.date, vendorId: v.id, vendorName: v.name, amt, from: pay.from, note: pay.note.trim(), createdAt: new Date().toISOString(), createdBy: me.uid });
      setPay(p => ({ ...p, amt: "", note: "" })); setPayMsg(""); setSel(v.id); toast(`Paid ${fmt(amt)} to ${v.name} from ${SOURCES[pay.from]}`);
    } catch (e) { setPayMsg(isDenied(e) ? "You have view-only access." : "Could not save. Try again."); }
    setBusy(false);
  }

  const vendorOptions = <><option value="">{list.length ? "Choose vendor…" : "Add a vendor first"}</option>{list.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</>;
  const selV = sel ? D.vendors.get(sel) : null;

  return (
    <>
      <div className="card bar">
        <div className="grow"><h2 style={{ margin: 0 }}>Vendors</h2><span className="sub">Unpaid bills, payments and how much we owe each vendor</span></div>
        <button className="btn xl" onClick={() => exportVendors(D, today()).then(() => toast("Excel file downloaded"))}>Export to Excel</button>
        {editable && <button className="btn primary" onClick={() => { setSel(null); setFormOpen("new"); }}>+ Add vendor</button>}
      </div>
      <div className="kpis">
        <Kpi main label="We owe vendors" value={owedAll} sub={`${withDue} vendor${withDue === 1 ? "" : "s"} with unpaid bills`} />
        <Kpi label={`Unpaid bills · ${monthShort(month)}`} value={billsM} sub="bills added this month" />
        <Kpi label={`Paid to vendors · ${monthShort(month)}`} value={paidM} sub="payments this month" />
        <Kpi money={false} label="Vendors" value={list.length} sub="on the list" />
      </div>
      <div className="emp-grid">
        <div className="view">
          <div className="card">
            <h2>What we owe <small>click a vendor to see their bills and payments</small></h2>
            {rows.length ? (
              <div className="tbl-wrap"><table className="num"><thead><tr><th>Vendor</th><th>Total bills</th><th>Paid</th><th>We owe</th><th>Last entry</th></tr></thead>
                <tbody>{rows.map(({ v, b }) => (
                  <tr key={v.id} className={"click" + (v.id === sel ? " sel" : "")} tabIndex={0} onClick={() => choose(v.id)} onKeyDown={e => e.key === "Enter" && choose(v.id)}>
                    <td><b>{v.name}</b><div className="sub">{v.cat || ""}{v.phone ? " · " + v.phone : ""}</div></td><td>{fmt(b.billed)}</td><td>{fmt(b.paid)}</td>
                    <td>{b.owed > 0 ? <b className="neg">{fmt(b.owed)}</b> : b.owed < 0 ? <span className="pos">{fmt(-b.owed)} extra paid</span> : <span className="pill closed">Clear</span>}</td>
                    <td>{b.last ? nice(b.last) : "—"}</td></tr>))}</tbody>
                <tfoot><tr><td>Total</td><td>{fmt(rows.reduce((a, r) => a + r.b.billed, 0))}</td><td>{fmt(rows.reduce((a, r) => a + r.b.paid, 0))}</td><td>{fmt(owedAll)}</td><td></td></tr></tfoot>
              </table></div>
            ) : <Empty>{loaded.vendors ? <>No vendors yet. Press <b>Add vendor</b> to add your chicken supplier, vegetable seller and so on.</> : "Loading vendors…"}</Empty>}
          </div>
          {selV && <Ledger v={selV} editable={editable} isClosed={isClosed} onEdit={() => setFormOpen("edit")} />}
        </div>

        <div className="view">
          {formOpen && <div className="card"><VendorForm key={formOpen + (sel || "")} v={formOpen === "edit" ? selV : null} onDone={id => { setFormOpen(null); if (id) choose(id); else if (id === null) setSel(null); }} /></div>}
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="view">
            <div className="card">
              <h2>Add unpaid bill</h2>
              <div className="form2">
                <label className="field">Bill date<input type="date" value={bill.date} onChange={e => setBill(b => ({ ...b, date: e.target.value }))} /></label>
                <label className="field">Vendor<select value={bill.vendorId} onChange={e => { const v = D.vendors.get(e.target.value); setBill(b => ({ ...b, vendorId: e.target.value, cat: v?.cat && BILL_CATS.includes(v.cat) ? v.cat : b.cat })); }}>{vendorOptions}</select></label>
                <label className="field">Category<select value={bill.cat} onChange={e => setBill(b => ({ ...b, cat: e.target.value }))}>{BILL_CATS.map(c => <option key={c}>{c}</option>)}</select></label>
                <label className="field">Amount (Rs)<NumInput value={bill.amt} onChange={v => setBill(b => ({ ...b, amt: v }))} /></label>
                <label className="field full">Details / bill no.<input type="text" value={bill.desc} placeholder="e.g. 40 kg chicken, bill #1123" onChange={e => setBill(b => ({ ...b, desc: e.target.value }))} /></label>
              </div>
              <div className="bar" style={{ marginTop: 12 }}><span className="grow sub">{billMsg}</span><button className="btn primary" onClick={addBill} disabled={busy}>Add bill</button></div>
            </div>
            <div className="card">
              <h2>Pay vendor <small>{payVendor ? `owed to ${payVendor.name}: ${fmt(bal(payVendor).owed)}` : ""}</small></h2>
              <div className="form2">
                <label className="field">Payment date<input type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} /></label>
                <label className="field">Vendor<select value={pay.vendorId} onChange={e => setPay(p => ({ ...p, vendorId: e.target.value }))}>{vendorOptions}</select></label>
                <label className="field">Amount (Rs)<NumInput value={pay.amt} onChange={v => setPay(p => ({ ...p, amt: v }))} /></label>
                <label className="field">Paid from<SourceSelect value={pay.from} onChange={v => setPay(p => ({ ...p, from: v }))} /></label>
                <label className="field full">Note<input type="text" value={pay.note} placeholder="optional" onChange={e => setPay(p => ({ ...p, note: e.target.value }))} /></label>
              </div>
              <div className="bar" style={{ marginTop: 12 }}>
                <span className="grow sub">{payMsg}</span>
                <button className="btn" onClick={() => payVendor ? setPay(p => ({ ...p, amt: Math.max(0, bal(payVendor).owed) })) : setPayMsg("Choose a vendor first.")}>Pay full amount</button>
                <button className="btn primary" onClick={addPay} disabled={busy}>Record payment</button>
              </div>
            </div>
          </fieldset>
          <p className="hint">An unpaid bill does not take money out of any account. The payment does, from the account you pick, and Month closing shows it as “Vendor bills paid”.</p>
        </div>
      </div>
    </>
  );
}

function VendorForm({ v, onDone }) {
  const { D, toast } = useApp();
  const [f, setF] = useState(() => ({ name: v?.name || "", phone: v?.phone || "", cat: v?.cat || BILL_CATS[0], openingDue: v?.openingDue ?? "", note: v?.note || "" }));
  const [msg, setMsg] = useState("");
  const [askDel, setAskDel] = useState(false);
  const set = (k, val) => setF(p => ({ ...p, [k]: val }));
  async function save() {
    const name = f.name.trim();
    if (!name) return setMsg("Enter the vendor’s name.");
    const dup = [...D.vendors.values()].find(x => x.id !== v?.id && (x.name || "").toLowerCase() === name.toLowerCase());
    if (dup) return setMsg(dup.name + " is already on the list.");
    const id = v?.id || newId("vendors");
    try {
      await saveDoc("vendors", id, { name, phone: f.phone.trim(), cat: f.cat, openingDue: +f.openingDue || 0, note: f.note.trim(), createdAt: v?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
      toast(v ? "Vendor updated" : name + " added"); onDone(id);
    } catch (e) { setMsg(isDenied(e) ? "You have view-only access." : "Could not save. Try again."); }
  }
  function tryDelete() {
    const used = [...D.vbills.values(), ...D.vpays.values()].some(x => x.vendorId === v.id);
    if (used) return setMsg("This vendor has bills or payments. Delete those first.");
    setAskDel(true);
  }
  async function del() {
    try { await removeDoc("vendors", v.id); toast("Vendor deleted"); onDone(null); } catch { setMsg("Could not delete. Try again."); }
  }
  return <>
    <h2>{v ? "Edit " + v.name : "New vendor"}</h2>
    <div className="form2">
      <label className="field">Vendor name<input type="text" value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Ali Chicken Shop" /></label>
      <label className="field">Phone<input type="text" value={f.phone} onChange={e => set("phone", e.target.value)} placeholder="03xx-xxxxxxx" /></label>
      <label className="field">Usually supplies<select value={f.cat} onChange={e => set("cat", e.target.value)}>{BILL_CATS.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="field">Old balance we owe (Rs)<NumInput value={f.openingDue} onChange={val => set("openingDue", val)} /></label>
      <label className="field full">Note<input type="text" value={f.note} onChange={e => set("note", e.target.value)} placeholder="optional" /></label>
    </div>
    <p className="hint">Old balance is anything you owed this vendor before you started using this book.</p>
    <div className="bar" style={{ marginTop: 10 }}>
      <span className="grow sub">{msg}</span>
      {v && (askDel ? <Confirm text={`Delete ${v.name}?`} onYes={del} onNo={() => setAskDel(false)} /> : <button className="btn danger" onClick={tryDelete}>Delete vendor</button>)}
      <button className="btn ghost" onClick={() => onDone(undefined)}>Cancel</button>
      <button className="btn primary" onClick={save}>{v ? "Save changes" : "Add vendor"}</button>
    </div>
  </>;
}

function Ledger({ v, editable, isClosed, onEdit }) {
  const { D, toast } = useApp();
  const [askId, setAskId] = useState(null);
  const b = vendorBal(v, D.vbills, D.vpays), ent = vendorLedger(v, D);
  async function del(e) {
    try { await removeDoc(e.kind === "bill" ? "vbills" : "vpays", e.id); setAskId(null); toast(e.kind === "bill" ? "Bill deleted" : "Payment deleted"); }
    catch { toast("Could not delete. Try again."); }
  }
  return (
    <div className="card">
      <h2>{v.name} <small>{v.cat || ""}{v.phone ? " · " + v.phone : ""}</small></h2>
      <div className="bar" style={{ marginBottom: 12 }}>
        <span className="grow">We owe <b className={b.owed > 0 ? "neg" : ""} style={{ fontSize: 18 }}>{fmt(b.owed)}</b></span>
        {editable && <button className="btn" onClick={onEdit}>Edit vendor</button>}
      </div>
      <div className="tbl-wrap"><table className="num"><thead><tr><th>Date</th><th>Entry</th><th>Details</th><th>Bill</th><th>Paid</th><th>Balance</th><th></th></tr></thead><tbody>
        {+v.openingDue ? <tr><td>—</td><td style={{ textAlign: "left" }}>Old balance</td><td></td><td>{fmt(v.openingDue)}</td><td></td><td>{fmt(v.openingDue)}</td><td></td></tr> : null}
        {ent.map(e => (
          <tr key={e.kind + e.id}><td>{nice(e.date)}</td><td style={{ textAlign: "left" }}>{e.label}</td><td style={{ textAlign: "left", whiteSpace: "normal" }}>{e.desc}</td>
            <td>{e.kind === "bill" ? fmt(e.amt) : ""}</td><td>{e.kind === "pay" ? fmt(e.amt) : ""}</td><td><b>{fmt(e.bal)}</b></td>
            <td>{editable && !isClosed(e.date) && (askId === e.id ? <Confirm text="Delete?" yes="Yes" no="No" onYes={() => del(e)} onNo={() => setAskId(null)} /> : <button className="x" aria-label="Delete entry" onClick={() => setAskId(e.id)}>×</button>)}</td></tr>
        ))}
      </tbody></table></div>
      {!ent.length && !+v.openingDue && <p className="hint">No bills or payments yet.</p>}
    </div>
  );
}
