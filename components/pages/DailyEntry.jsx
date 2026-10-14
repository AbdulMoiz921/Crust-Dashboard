"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { Confirm, NumInput, SourceSelect, Swatch } from "../ui";
import { fmt, fmtShort, today, addDays, nice, niceLong, num } from "@/lib/format";
import {
  CATS, DEFAULT_RATE, saleOf, expOf, otherExpOf, petrolDay, petrolOf, kmOf, riderOrders, expBySrc, vpayBySrc, leftBySrc,
  prevDay, activeEmps, matchEmp, srcKey, creditGiven, cpayBySrc, SOURCES, custBal, byName,
} from "@/lib/calc";
import { canEdit } from "@/lib/access";
import { saveDoc, removeDoc, newId, isDenied } from "@/lib/firebase";
import { exportRange } from "@/lib/excel";

const clone = o => JSON.parse(JSON.stringify(o));

export default function DailyEntry({ navReq, injectReq }) {
  const { D, me, toast } = useApp();
  const canWrite = canEdit(me, "entry");
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [pendingNav, setPendingNav] = useState(null);
  const [askDelete, setAskDelete] = useState(false);
  const dateRef = useRef(today());

  function blankDay(d) {
    const p = prevDay(D.days, d);
    return {
      date: d, sale: { total: "", cash: "", bank: "", easypaisa: "" }, expenses: [{ cat: "Vegetables", desc: "", amt: "", from: "cash" }],
      // carry rider names, and yesterday's end reading as today's start, so they don't need retyping
      riders: p ? (p.riders || []).map(r => ({ name: r.name, orders: [], kmStart: r.kmEnd || "", kmEnd: "", petrolAuto: r.petrolAuto !== false, petrol: "" })) : [],
      petrolRate: p?.petrolRate ?? DEFAULT_RATE, petrolFrom: p?.petrolFrom || "cash", note: "",
    };
  }
  function load(d) {
    const r = D.days.get(d);
    const x = r ? clone(r) : blankDay(d);
    x.sale ||= { cash: "", bank: "", easypaisa: "" }; x.expenses ||= []; x.riders ||= [];
    // days saved before the total-first entry have no total: their total is the split
    if (x.sale.total == null) x.sale.total = r ? saleOf(r) || "" : "";
    if (x.petrolRate == null) x.petrolRate = prevDay(D.days, d)?.petrolRate ?? DEFAULT_RATE;
    dateRef.current = d;
    setDraft(x); setDirty(false); setErr(""); setPendingNav(null); setAskDelete(false);
  }
  function openDay(d) {
    if (dirty && draft && d !== draft.date) { setPendingNav(d); return; }
    load(d);
  }

  // first load, and reload from the database whenever it changes while nothing is being edited
  useEffect(() => { if (!dirty) load(dateRef.current); }, [D.days, D.emps]);
  useEffect(() => { if (navReq) openDay(navReq.date); }, [navReq]);
  useEffect(() => {
    // an advance given on the Employees page lands on the day being edited: keep it in the unsaved draft too
    if (injectReq && dirty && draft?.date === injectReq.date) setDraft(prev => ({ ...prev, expenses: [...prev.expenses, { ...injectReq.ex }] }));
  }, [injectReq]);

  if (!draft) return <p className="loading">Loading…</p>;

  const update = fn => { setDraft(prev => { const n = clone(prev); fn(n); return n; }); setDirty(true); setErr(""); };
  const exists = D.days.has(draft.date);
  const emps = activeEmps(D.emps);

  function clean() {
    return {
      date: draft.date,
      sale: { total: saleOf(draft), cash: num(draft.sale.cash), bank: num(draft.sale.bank), easypaisa: num(draft.sale.easypaisa) },
      expenses: draft.expenses.filter(e => num(e.amt) > 0 || (e.desc || "").trim()).map(e => {
        const o = { cat: e.cat || "Other", desc: (e.desc || "").trim(), amt: num(e.amt), from: srcKey(e.from) };
        if (e.cat === "Salary advance" && e.emp) o.emp = e.emp;
        if (e.note) o.note = e.note;
        return o;
      }),
      petrolFrom: srcKey(draft.petrolFrom),
      petrolRate: num(draft.petrolRate),
      riders: draft.riders.filter(r => (r.name || "").trim() || (r.orders || []).length || r.kmStart || r.kmEnd || r.petrol)
        .map(r => ({ name: (r.name || "").trim(), orders: (r.orders || []).map(num), kmStart: num(r.kmStart), kmEnd: num(r.kmEnd), petrolAuto: r.petrolAuto !== false, petrol: petrolOf(r, draft.petrolRate) })),
      note: (draft.note || "").trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: me.uid,
    };
  }
  async function save(okMsg = "Day saved") {
    const closed = D.closings.get(draft.date.slice(0, 7))?.status === "closed";
    if (closed) { setErr("This month is closed. Reopen it in Month closing to change this day."); return; }
    // the split must add up to the total sale typed in (a day with no total typed just uses the split)
    const tot = num(draft.sale.total), gap = tot - saleOf(draft);
    if (draft.sale.total !== "" && gap !== 0) {
      setErr(gap > 0 ? `${fmt(gap)} of the total sale isn’t split yet. Add it to Cash, Bank or EasyPaisa.` : `Cash + Bank + EasyPaisa is ${fmt(-gap)} more than the total sale. Fix the split or the total.`);
      return;
    }
    setSaving(true);
    const rec = clean();
    try { await saveDoc("days", rec.date, rec); setDraft(clone(rec)); setDirty(false); toast(okMsg); }
    catch (e) { setErr(isDenied(e) ? "You have view-only access, so this day was not saved." : "Could not save. Check your connection and press Save again."); }
    setSaving(false);
  }
  async function del() {
    try { await removeDoc("days", draft.date); setAskDelete(false); load(draft.date); toast("Day deleted"); }
    catch { setErr("Could not delete. Try again."); }
  }

  const s = saleOf(draft), e = expOf(draft), p = petrolDay(draft);
  const x = expBySrc(draft), l = leftBySrc(draft, D), v = vpayBySrc(D.vpays, draft.date, draft.date), vt = v.cash + v.bank + v.easypaisa;
  const km = draft.riders.reduce((a, r) => a + kmOf(r), 0);
  const cg = creditGiven(D.cbills, draft.date, draft.date), cp = cpayBySrc(D.cpays, draft.date, draft.date), ct = cp.cash + cp.bank + cp.easypaisa;
  // the last 14 days with no entry, counted only from the first day ever recorded
  const first = [...D.days.keys()].sort()[0];
  const missed = [];
  if (first) for (let i = 14; i >= 1; i--) { const d = addDays(today(), -i); if (d >= first && !D.days.has(d)) missed.push(d); }
  const updatedText = D.days.get(draft.date)?.updatedAt ? "Saved · " + new Date(D.days.get(draft.date).updatedAt).toLocaleString("en-PK", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }) : exists ? "Saved" : "New day, not saved yet";
  const petrolCalc = r => {
    if (r.petrolAuto === false) return "Entered by hand";
    const k = kmOf(r);
    return k ? `${k} km × Rs ${+draft.petrolRate || 0} = ${fmt(petrolOf(r, draft.petrolRate))}` : "Enter bike start and end to work out petrol";
  };

  return (
    <>
      <div className="card entry-head">
        <label className="field">Date<input type="date" value={draft.date} onChange={ev => ev.target.value && openDay(ev.target.value)} /></label>
        <div className="daynav">
          <button className="btn" onClick={() => openDay(addDays(draft.date, -1))}>‹ Prev</button>
          <button className="btn" onClick={() => openDay(today())}>Today</button>
          <button className="btn" onClick={() => openDay(addDays(draft.date, 1))}>Next ›</button>
        </div>
        {pendingNav ? (
          <span className="status dirty">Unsaved changes. <button className="btn ghost" onClick={() => { setDirty(false); load(pendingNav); }}>Discard and open {nice(pendingNav)}</button></span>
        ) : (
          <span className={"status" + (dirty || err ? " dirty" : "")}>{saving ? "Saving…" : err || (dirty ? "Unsaved changes" : updatedText)}</span>
        )}
        <button className="btn xl" onClick={() => {
          const rec = dirty ? clean() : D.days.get(draft.date);
          if (!rec) return toast("This day is empty. Fill it in first.");
          exportRange(D, [rec], rec.date, rec.date, `Crust-House-${rec.date}${dirty ? "-unsaved" : ""}.xlsx`).then(() => toast("Excel file downloaded"));
        }}>Export day</button>
        {canWrite && <button className="btn primary desk-save" onClick={() => save()} disabled={saving}>Save day</button>}
        {missed.length > 0 && (
          <div className="missed">
            <span className="sub">Missed days:</span>
            {missed.map(d => <button key={d} className={"chip" + (d === draft.date ? " on" : "")} aria-pressed={d === draft.date} onClick={() => openDay(d)}>{nice(d)}</button>)}
          </div>
        )}
      </div>

      <div className="entry-grid">
        <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="view">
            <div className="card">
              <h2>Sale <small>enter the total, then split it by how customers paid</small></h2>
              <div className="sale-total">
                <label className="field">Total sale for {nice(draft.date)}<NumInput value={draft.sale.total} onChange={val => update(n => { n.sale.total = val; })} placeholder="e.g. 15000" /></label>
                <SplitStatus total={draft.sale.total} split={s} onFill={k => update(n => { n.sale[k] = num(n.sale[k]) + (num(n.sale.total) - saleOf(n)); })} />
              </div>
              <div className="sales3">
                {[["cash", "Cash", "--cash"], ["bank", "Bank", "--bank"], ["easypaisa", "EasyPaisa / JazzCash", "--ep"]].map(([k, label, c]) => (
                  <label className="field" key={k}><span className="lbl"><Swatch color={c} />{label}</span>
                    <NumInput value={draft.sale[k]} onChange={val => update(n => { n.sale[k] = val; })} /></label>
                ))}
              </div>
              <p className="credit-note">Food given on credit, or a customer paying back old credit? Don’t count it in this sale; use <b>Credit customers</b> below.</p>
              {canWrite && <div className="bar" style={{ marginTop: 12 }}>
                <span className="grow">Split <b className="num">{fmt(s)}</b>{err && <span className="neg" style={{ display: "block", fontSize: 13 }}>{err}</span>}</span>
                <button className="btn primary" onClick={() => save("Sale saved")} disabled={saving || (!dirty && exists)}>{saving ? "Saving…" : !dirty && exists ? "Saved" : "Save sale"}</button>
              </div>}
            </div>

            <CreditToday date={draft.date} editable={canWrite} />

            <div className="card">
              <h2>Daily expense <small>{p ? `${fmt(otherExpOf(draft))} + rider petrol ${fmt(p)} = ${fmt(e)}` : fmt(e)}</small></h2>
              {draft.expenses.length ? <div className="exp-head"><span>Category</span><span>Details</span><span>Paid from</span><span style={{ textAlign: "right" }}>Amount</span><span></span></div>
                : <p className="hint" style={{ margin: "0 0 10px" }}>No other expenses for this day.</p>}
              {draft.expenses.map((ex, i) => (
                <div className="exp-row" key={i}>
                  <select value={ex.cat} aria-label="Category" onChange={ev => update(n => {
                    const it = n.expenses[i]; it.cat = ev.target.value;
                    if (it.cat === "Salary advance") { const m = matchEmp(D.emps, it.desc); if (m) { it.emp = m.id; it.desc = m.name; } } else delete it.emp;
                  })}>
                    {CATS.map(c => <option key={c}>{c}</option>)}
                    {ex.cat && !CATS.includes(ex.cat) && <option>{ex.cat}</option>}
                  </select>
                  {ex.cat === "Salary advance" ? (
                    <select className="desc emp-sel" value={ex.emp || ""} aria-label="Employee" onChange={ev => update(n => { const it = n.expenses[i]; it.emp = ev.target.value; it.desc = D.emps.get(ev.target.value)?.name || ""; })}>
                      <option value="">Choose employee…</option>
                      {emps.map(m => <option key={m.id} value={m.id}>{m.name}{m.role ? " · " + m.role : ""}</option>)}
                      {ex.emp && !D.emps.has(ex.emp) && <option value={ex.emp}>{ex.desc || "Removed employee"}</option>}
                    </select>
                  ) : (
                    <input className="desc" type="text" value={ex.desc || ""} placeholder="What was it for?" aria-label="Description" onChange={ev => update(n => { n.expenses[i].desc = ev.target.value; })} />
                  )}
                  <SourceSelect className="from" value={ex.from} aria-label="Paid from" onChange={val => update(n => { n.expenses[i].from = val; })} />
                  <NumInput value={ex.amt} aria-label="Amount" onChange={val => update(n => { n.expenses[i].amt = val; })} />
                  <button className="x" aria-label="Remove expense" onClick={() => update(n => { n.expenses.splice(i, 1); })}>×</button>
                </div>
              ))}
              <button className="btn" onClick={() => update(n => { n.expenses.push({ cat: "Other", desc: "", amt: "", from: n.expenses[n.expenses.length - 1]?.from || "cash" }); })}>+ Add expense</button>
            </div>

            <div className="card">
              <h2>Riders <small>petrol today {fmt(p)} · {km.toLocaleString()} km</small></h2>
              <div className="rate-row">
                <label className="field">Petrol rate (Rs per km)<input type="number" min="0" step="0.5" value={draft.petrolRate ?? ""} placeholder="10" onChange={ev => update(n => { n.petrolRate = ev.target.value === "" ? 0 : +ev.target.value; })} /></label>
                <label className="field">Petrol paid from<SourceSelect value={draft.petrolFrom} onChange={val => update(n => { n.petrolFrom = val; })} /></label>
                <p className="hint" style={{ margin: "0 0 8px" }}>Petrol = km × rate. It is added to the day’s expense automatically.</p>
              </div>
              <div className="riders">
                {draft.riders.length ? draft.riders.map((r, i) => (
                  <div className="rider" key={i}>
                    <div className="rider-top">
                      <input type="text" value={r.name || ""} placeholder="Rider name" aria-label="Rider name" list="rider-names" onChange={ev => update(n => { n.riders[i].name = ev.target.value; })} />
                      <button className="x" aria-label="Remove rider" onClick={() => update(n => { n.riders.splice(i, 1); })}>×</button>
                    </div>
                    <div className="orders">
                      {(r.orders || []).map((o, j) => <span className="order num" key={j}>{Math.round(o).toLocaleString()}<button aria-label="Remove order" onClick={() => update(n => { n.riders[i].orders.splice(j, 1); })}>×</button></span>)}
                    </div>
                    <input type="number" min="0" placeholder="Order amount, press Enter" aria-label="Add order amount" onKeyDown={ev => {
                      if (ev.key !== "Enter") return; ev.preventDefault();
                      const val = +ev.currentTarget.value; if (!(val > 0)) return;
                      ev.currentTarget.value = "";
                      update(n => { (n.riders[i].orders ||= []).push(val); });
                    }} />
                    <div className="km">
                      <label className="field">Bike start<NumInput value={r.kmStart} onChange={val => update(n => { n.riders[i].kmStart = val; })} /></label>
                      <label className="field">Bike end<NumInput value={r.kmEnd} onChange={val => update(n => { n.riders[i].kmEnd = val; })} /></label>
                      <span className="tot num">{kmOf(r)} km</span>
                    </div>
                    <div className="petrol">
                      <label className="chk"><input type="checkbox" checked={r.petrolAuto !== false} onChange={ev => update(n => {
                        const it = n.riders[i]; it.petrolAuto = ev.target.checked;
                        if (!it.petrolAuto) it.petrol = petrolOf({ ...it, petrolAuto: true }, n.petrolRate) || "";
                      })} /> By km rate</label>
                      <NumInput aria-label="Petrol amount" disabled={r.petrolAuto !== false} value={r.petrolAuto !== false ? petrolOf(r, draft.petrolRate) : r.petrol} onChange={val => update(n => { n.riders[i].petrol = val; })} />
                      <span className="calc num">{petrolCalc(r)}</span>
                    </div>
                    <div className="rider-foot"><span>{(r.orders || []).length} orders · {fmt(riderOrders(r))}</span><span className="num">Petrol {fmt(petrolOf(r, draft.petrolRate))}</span></div>
                  </div>
                )) : <p className="hint" style={{ margin: 0 }}>No riders added for this day.</p>}
              </div>
              <datalist id="rider-names">{[...new Set([...emps.map(m => m.name), ...[...D.days.values()].flatMap(d => (d.riders || []).map(r => r.name))].filter(Boolean))].map(nm => <option key={nm} value={nm} />)}</datalist>
              <p className="hint">Type an order amount and press Enter to add it. Untick “By km rate” to type the petrol amount yourself. Rider collections are already part of the sale above, so they are not added to it again.</p>
              <div style={{ marginTop: 10 }}><button className="btn" onClick={() => update(n => { n.riders.push({ name: "", orders: [], kmStart: "", kmEnd: "", petrolAuto: true, petrol: "" }); })}>+ Add rider</button></div>
            </div>

            <div className="card">
              <label className="field">Note for the day<input type="text" value={draft.note || ""} placeholder="e.g. Gas cylinder changed, rain slowed delivery" onChange={ev => update(n => { n.note = ev.target.value; })} /></label>
            </div>
            {canWrite && <div className="card bar desk-save">
              <span className="grow">{err ? <span className="neg">{err}</span> : dirty ? "Unsaved changes" : updatedText}</span>
              <button className="btn primary" onClick={() => save()} disabled={saving}>{saving ? "Saving…" : "Save day"}</button>
            </div>}
          </div>
        </fieldset>

        <aside className="card sheet">
          <h2>Day summary</h2>
          <table className="num"><tbody>
            <tr><td>Date</td><td>{niceLong(draft.date)}</td></tr>
            <tr className="big"><td>Total sale</td><td>{fmt(s)}</td></tr>
            <tr><td>Cash</td><td>{fmt(draft.sale.cash)}</td></tr>
            <tr><td>Bank</td><td>{fmt(draft.sale.bank)}</td></tr>
            <tr><td>EasyPaisa / JazzCash</td><td>{fmt(draft.sale.easypaisa)}</td></tr>
            <tr><td>Rider petrol</td><td>{fmt(p)}</td></tr>
            <tr><td>Other expenses</td><td>{fmt(e - p)}</td></tr>
            <tr className="big"><td>Total expense</td><td>{fmt(e)}</td></tr>
            <tr><td>Sale − expense</td><td className={s - e < 0 ? "neg" : ""}>{fmt(s - e)}</td></tr>
            <tr><td>Paid from cash / bank / EasyPaisa</td><td>{fmtShort(x.cash)} / {fmtShort(x.bank)} / {fmtShort(x.easypaisa)}</td></tr>
            {ct ? <tr><td>Credit paid back (cash / bank / EP)</td><td>{fmtShort(cp.cash)} / {fmtShort(cp.bank)} / {fmtShort(cp.easypaisa)}</td></tr> : null}
            {cg ? <tr><td>Food given on credit</td><td>{fmt(cg)}</td></tr> : null}
            {vt ? <tr><td>Vendor payments (cash / bank / EP)</td><td>{fmtShort(v.cash)} / {fmtShort(v.bank)} / {fmtShort(v.easypaisa)}</td></tr> : null}
            <tr className="big"><td>Cash in hand</td><td className={l.cash < 0 ? "neg" : ""}>{fmt(l.cash)}</td></tr>
            <tr><td>Bank left</td><td className={l.bank < 0 ? "neg" : ""}>{fmt(l.bank)}</td></tr>
            <tr><td>EasyPaisa left</td><td className={l.easypaisa < 0 ? "neg" : ""}>{fmt(l.easypaisa)}</td></tr>
            <tr><td>Rider orders</td><td>{draft.riders.reduce((a, r) => a + (r.orders || []).length, 0)} · {fmt(draft.riders.reduce((a, r) => a + riderOrders(r), 0))}</td></tr>
            <tr><td>Bike km</td><td>{km.toLocaleString()} km</td></tr>
          </tbody></table>
          {exists && canWrite && <div style={{ marginTop: 14 }}>
            {askDelete ? <Confirm text={`Delete ${niceLong(draft.date)} for good?`} onYes={del} onNo={() => setAskDelete(false)} />
              : <button className="btn danger" onClick={() => setAskDelete(true)}>Delete this day</button>}
          </div>}
        </aside>
      </div>

      {/* phones: totals and Save stay reachable at the bottom while scrolling the form */}
      {canWrite && <div className="savebar">
        <div><span>{nice(draft.date)} · {dirty ? "unsaved" : exists ? "saved" : "new"}</span><b>Sale {fmt(s)} · Exp {fmt(e)}</b></div>
        <button className="btn primary" onClick={() => save()} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>}
    </>
  );
}

// Shows whether Cash + Bank + EasyPaisa adds up to the total sale, with one-tap buttons to put the rest in an account.
function SplitStatus({ total, split, onFill }) {
  if (total === "" || total == null) return <p className="split-note">Type the total sale, then enter how much came in Cash, Bank and EasyPaisa.</p>;
  const gap = num(total) - split;
  if (gap === 0) return <p className="split-note ok">✓ Split matches the total sale</p>;
  if (gap < 0) return <p className="split-note bad">Split is {fmt(-gap)} more than the total sale</p>;
  return (
    <div className="split-note warn">
      <span><b>{fmt(gap)}</b> still to split</span>
      <span className="split-fill">Put it in: {[["cash", "Cash"], ["bank", "Bank"], ["easypaisa", "EasyPaisa"]].map(([k, l]) => <button key={k} type="button" className="chip" onClick={() => onFill(k)}>{l}</button>)}</span>
    </div>
  );
}

// Credit customers on this date: payments received go into that day's Cash / Bank / EasyPaisa,
// food given on credit adds to what the customer owes. Saved straight away to the Customers records.
function CreditToday({ date, editable }) {
  const { D, me, toast } = useApp();
  const [mode, setMode] = useState("pay"); // "pay" | "credit"
  const [f, setF] = useState({ customerId: "", newName: "", amt: "", to: "cash", note: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [askId, setAskId] = useState(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const customers = [...D.customers.values()].sort(byName);
  const closed = D.closings.get(date.slice(0, 7))?.status === "closed";
  const pays = [...D.cpays.values()].filter(p => p.date === date);
  const credits = [...D.cbills.values()].filter(b => b.date === date);
  const cust = D.customers.get(f.customerId);
  const name = id => D.customers.get(id)?.name;

  async function add() {
    setMsg("");
    const amt = +f.amt;
    if (closed) return setMsg("This month is closed. Reopen it in Month closing first.");
    if (f.customerId === "new" && !f.newName.trim()) return setMsg("Type the new customer’s name.");
    if (!f.customerId) return setMsg("Choose the customer.");
    if (!(amt > 0)) return setMsg("Enter the amount.");
    setBusy(true);
    try {
      let id = f.customerId, cname = cust?.name;
      if (id === "new") {
        cname = f.newName.trim();
        const dup = customers.find(c => (c.name || "").toLowerCase() === cname.toLowerCase());
        if (dup) id = dup.id;
        else { id = newId("customers"); await saveDoc("customers", id, { name: cname, phone: "", openingDue: 0, note: "", createdAt: new Date().toISOString() }); }
      }
      const at = new Date().toISOString();
      if (mode === "pay") {
        await saveDoc("cpays", newId("cpays"), { date, customerId: id, customerName: cname, amt, to: f.to, note: f.note.trim(), createdAt: at, createdBy: me.uid });
        toast(`Received ${fmt(amt)} from ${cname} in ${SOURCES[f.to]}`);
      } else {
        await saveDoc("cbills", newId("cbills"), { date, customerId: id, customerName: cname, desc: f.note.trim(), amt, createdAt: at, createdBy: me.uid });
        toast(`${fmt(amt)} on credit added for ${cname}`);
      }
      setF(p => ({ ...p, customerId: id, newName: "", amt: "", note: "" }));
    } catch (e) { setMsg(isDenied(e) ? "You don’t have permission to record customer credit." : "Could not save. Try again."); }
    setBusy(false);
  }
  async function del(kind, id) {
    try { await removeDoc(kind === "pay" ? "cpays" : "cbills", id); setAskId(null); toast("Deleted"); }
    catch { toast("Could not delete. Try again."); }
  }

  const rows = [
    ...pays.map(p => ({ kind: "pay", id: p.id, who: name(p.customerId) || p.customerName, what: "Paid back · " + SOURCES[srcKey(p.to)], note: p.note, amt: +p.amt || 0 })),
    ...credits.map(b => ({ kind: "credit", id: b.id, who: name(b.customerId) || b.customerName, what: "Food on credit", note: b.desc, amt: +b.amt || 0 })),
  ];
  const owes = cust ? custBal(cust, D.cbills, D.cpays).owes : 0;

  return (
    <div className="card">
      <h2>Credit customers <small>{nice(date)}</small></h2>
      {rows.length > 0 && <div className="credit-list">
        {rows.map(r => (
          <div className={"credit-row " + r.kind} key={r.kind + r.id}>
            <div><b>{r.who}</b><span>{r.what}{r.note ? " · " + r.note : ""}</span></div>
            <b className="num">{r.kind === "pay" ? "+ " : ""}{fmt(r.amt)}</b>
            {editable && !closed && (askId === r.id ? <Confirm text="Delete?" yes="Yes" no="No" onYes={() => del(r.kind, r.id)} onNo={() => setAskId(null)} />
              : <button type="button" className="x" aria-label="Delete" onClick={() => setAskId(r.id)}>×</button>)}
          </div>
        ))}
      </div>}
      {editable && !closed && <>
        <div className="seg" style={{ margin: "4px 0 10px" }}>
          <button type="button" className="chip" aria-pressed={mode === "pay"} onClick={() => setMode("pay")}>Customer paid back</button>
          <button type="button" className="chip" aria-pressed={mode === "credit"} onClick={() => setMode("credit")}>Food given on credit</button>
        </div>
        <div className="form2">
          <label className="field">Customer<select value={f.customerId} onChange={e => set("customerId", e.target.value)}>
            <option value="">Choose customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="new">+ New customer…</option>
          </select></label>
          {f.customerId === "new" && <label className="field">New customer’s name<input type="text" value={f.newName} onChange={e => set("newName", e.target.value)} placeholder="e.g. Shahid (bank office)" /></label>}
          <label className="field">Amount (Rs)<NumInput value={f.amt} onChange={v => set("amt", v)} /></label>
          {mode === "pay" && <label className="field">Received in<SourceSelect value={f.to} onChange={v => set("to", v)} /></label>}
          <label className="field">{mode === "pay" ? "Note" : "Details / bill no."}<input type="text" value={f.note} onChange={e => set("note", e.target.value)} placeholder={mode === "pay" ? "optional" : "e.g. 2 large pizzas, bill #45"} /></label>
        </div>
        <div className="bar" style={{ marginTop: 10 }}>
          <span className="grow sub">{msg ? <span className="neg">{msg}</span> : cust ? `${cust.name} owes ${fmt(owes)}` : ""}</span>
          {mode === "pay" && cust && owes > 0 && <button type="button" className="btn" onClick={() => set("amt", owes)}>Full amount</button>}
          <button type="button" className="btn primary" onClick={add} disabled={busy}>{mode === "pay" ? "Add payment" : "Add credit"}</button>
        </div>
      </>}
      {closed && <p className="hint">This month is closed.</p>}
      <p className="hint">{mode === "pay" ? "A payment is added to this day’s Cash, Bank or EasyPaisa (see Day summary), not to the sale." : "Credit food isn’t money in, so it’s not part of the sale; it’s added to what the customer owes."}</p>
    </div>
  );
}
