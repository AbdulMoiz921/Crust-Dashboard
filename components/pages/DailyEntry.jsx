"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { Confirm, NumInput, SourceSelect, Swatch } from "../ui";
import { fmt, fmtShort, today, addDays, nice, niceLong, num } from "@/lib/format";
import {
  CATS, DEFAULT_RATE, saleOf, expOf, otherExpOf, petrolDay, petrolOf, kmOf, riderOrders, expBySrc, vpayBySrc, leftBySrc,
  prevDay, activeEmps, matchEmp, srcKey,
} from "@/lib/calc";
import { canEdit } from "@/lib/access";
import { saveDoc, removeDoc, isDenied } from "@/lib/firebase";
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
      date: d, sale: { cash: "", bank: "", easypaisa: "" }, expenses: [{ cat: "Vegetables", desc: "", amt: "", from: "cash" }],
      // carry rider names, and yesterday's end reading as today's start, so they don't need retyping
      riders: p ? (p.riders || []).map(r => ({ name: r.name, orders: [], kmStart: r.kmEnd || "", kmEnd: "", petrolAuto: r.petrolAuto !== false, petrol: "" })) : [],
      petrolRate: p?.petrolRate ?? DEFAULT_RATE, petrolFrom: p?.petrolFrom || "cash", note: "",
    };
  }
  function load(d) {
    const r = D.days.get(d);
    const x = r ? clone(r) : blankDay(d);
    x.sale ||= { cash: "", bank: "", easypaisa: "" }; x.expenses ||= []; x.riders ||= [];
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
      sale: { cash: num(draft.sale.cash), bank: num(draft.sale.bank), easypaisa: num(draft.sale.easypaisa) },
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
  const x = expBySrc(draft), l = leftBySrc(draft, D.vpays), v = vpayBySrc(D.vpays, draft.date, draft.date), vt = v.cash + v.bank + v.easypaisa;
  const km = draft.riders.reduce((a, r) => a + kmOf(r), 0);
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
              <h2>Sale <small>enter the day’s totals by payment type</small></h2>
              <div className="sales3">
                {[["cash", "Cash", "--cash"], ["bank", "Bank", "--bank"], ["easypaisa", "EasyPaisa / JazzCash", "--ep"]].map(([k, label, c]) => (
                  <label className="field" key={k}><span className="lbl"><Swatch color={c} />{label}</span>
                    <NumInput value={draft.sale[k]} onChange={val => update(n => { n.sale[k] = val; })} /></label>
                ))}
              </div>
              {canWrite && <div className="bar" style={{ marginTop: 12 }}>
                <span className="grow">Total sale <b className="num">{fmt(s)}</b>{err && <span className="neg" style={{ display: "block", fontSize: 13 }}>{err}</span>}</span>
                <button className="btn primary" onClick={() => save("Sale saved")} disabled={saving || (!dirty && exists)}>{saving ? "Saving…" : !dirty && exists ? "Saved" : "Save sale"}</button>
              </div>}
            </div>

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
