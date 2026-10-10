"use client";
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { Kpi, Empty, Confirm, NumInput, SourceSelect } from "../ui";
import { fmt, today, thisMonth, monthName, nice, parse } from "@/lib/format";
import { CAP_TYPES, SOURCES, srcKey, capSign, capTotals, capByPerson } from "@/lib/calc";
import { canEdit } from "@/lib/access";
import { saveDoc, removeDoc, newId, isDenied } from "@/lib/firebase";
import { exportCapital } from "@/lib/excel";

export default function Capital() {
  const { D, me, loaded, toast } = useApp();
  const editable = canEdit(me, "cap");
  const [p, setP] = useState("all");
  const [month, setMonth] = useState(thisMonth());
  const [sel, setSel] = useState(null);
  useEffect(() => { if (sel && !D.capital.has(sel)) setSel(null); }, [D.capital]);

  const list = [...D.capital.values()].filter(c => p === "all" || (c.date || "").slice(0, 7) === month).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const t = capTotals(list), all = capTotals([...D.capital.values()]);
  const people = capByPerson(D.capital), totIn = people.reduce((a, [, o]) => a + o.in, 0);
  const scope = p === "all" ? "all time" : monthName(month);

  return (
    <>
      <div className="card bar">
        <div className="grow"><h2 style={{ margin: 0 }}>Capital</h2><span className="sub">Money owners and partners put in, setup and equipment spending, and owner withdrawals</span></div>
        <div className="seg">
          <button className="chip" aria-pressed={p === "all"} onClick={() => setP("all")}>All time</button>
          <button className="chip" aria-pressed={p === "month"} onClick={() => setP("month")}>Month</button>
        </div>
        {p === "month" && <label className="field" style={{ width: 170 }}>Month<input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label>}
        <button className="btn xl" onClick={() => exportCapital(D, list, p === "all" ? "" : month).then(() => toast("Excel file downloaded"))}>Export to Excel</button>
      </div>
      <div className="kpis">
        <Kpi main label="Capital invested" value={t.in} sub={scope} />
        <Kpi label="Setup / equipment" value={t.spend} sub="spent from capital" />
        <Kpi label="Owner withdrawals" value={t.out} sub="taken out" />
        <Kpi label="Net capital in business" value={all.in - all.out} sub="all time: invested − withdrawn" />
      </div>
      <div className="emp-grid">
        <div className="view">
          <div className="card">
            <h2>Capital entries <small>click an entry to edit it</small></h2>
            {list.length ? (
              <div className="tbl-wrap"><table className="num cards"><thead><tr><th>Date</th><th>Type</th><th>Owner / partner</th><th>Details</th><th>Account</th><th>Amount</th></tr></thead>
                <tbody>{list.map(c => (
                  <tr key={c.id} className={"click" + (c.id === sel ? " sel" : "")} tabIndex={0} onClick={() => setSel(c.id)} onKeyDown={e => e.key === "Enter" && setSel(c.id)}>
                    <td>{nice(c.date)}<div className="sub">{parse(c.date).getFullYear()}</div></td>
                    <td><span className={"pill " + (c.type === "in" ? "closed" : c.type === "out" ? "open" : "off")}>{CAP_TYPES[c.type] || c.type}</span></td>
                    <td style={{ textAlign: "left" }}>{c.person}</td><td style={{ textAlign: "left", whiteSpace: "normal", minWidth: 140 }}>{c.desc}</td>
                    <td>{SOURCES[srcKey(c.from)]}</td><td className={capSign(c) < 0 ? "neg" : "pos"}><b>{capSign(c) < 0 ? "− " : "+ "}{fmt(c.amt)}</b></td></tr>))}</tbody>
                <tfoot><tr><td colSpan={5}>Net (invested − spent − withdrawn)</td><td className={t.in - t.spend - t.out < 0 ? "neg" : ""}>{fmt(t.in - t.spend - t.out)}</td></tr></tfoot>
              </table></div>
            ) : <Empty>{loaded.capital ? `No capital entries ${p === "all" ? "yet" : "in this month"}. Use the form to record money put into the restaurant.` : "Loading…"}</Empty>}
          </div>
          <div className="card">
            <h2>By owner / partner</h2>
            {people.length ? <>
              <div className="tbl-wrap"><table className="num cards"><thead><tr><th>Name</th><th>Invested</th><th>Share</th><th>Withdrawn</th><th>Net</th></tr></thead>
                <tbody>{people.map(([k, o]) => <tr key={k}><td>{k}</td><td>{fmt(o.in)}</td><td>{totIn ? Math.round(o.in / totIn * 100) + "%" : "—"}</td><td>{fmt(o.out)}</td><td><b>{fmt(o.in - o.out)}</b></td></tr>)}</tbody></table></div>
              <p className="hint">All time. Share is each person’s part of the total invested.</p>
            </> : <Empty>Partner totals appear once you add capital entries.</Empty>}
          </div>
        </div>
        <div className="card"><CapitalForm key={sel || "new"} c={sel ? D.capital.get(sel) : null} editable={editable} onDone={() => setSel(null)} /></div>
      </div>
    </>
  );
}

function CapitalForm({ c, editable, onDone }) {
  const { D, me, toast } = useApp();
  const [f, setF] = useState(() => ({ date: c?.date || today(), type: c?.type || "in", person: c?.person || "", desc: c?.desc || "", amt: c?.amt ?? "", from: c?.from || "cash" }));
  const [msg, setMsg] = useState("");
  const [askDel, setAskDel] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const people = [...new Set([...D.capital.values()].map(x => (x.person || "").trim()).filter(Boolean))];

  async function save() {
    const amt = +f.amt;
    if (!f.date || !(amt > 0)) return setMsg("Enter a date and an amount.");
    if (D.closings.get(f.date.slice(0, 7))?.status === "closed") return setMsg(monthName(f.date.slice(0, 7)) + " is closed. Reopen it in Month closing first.");
    const id = c?.id || newId("capital");
    try {
      await saveDoc("capital", id, { date: f.date, type: f.type, person: f.person.trim(), desc: f.desc.trim(), amt, from: f.from, createdAt: c?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: me.uid });
      toast(c ? "Capital entry updated" : `${CAP_TYPES[f.type]} of ${fmt(amt)} added`);
      if (!c) setF(p => ({ ...p, amt: "", desc: "" }));
      onDone();
    } catch (e) { setMsg(isDenied(e) ? "You have view-only access." : "Could not save. Try again."); }
  }
  async function del() {
    try { await removeDoc("capital", c.id); toast("Capital entry deleted"); onDone(); } catch { setMsg("Could not delete. Try again."); }
  }
  return (
    <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <h2>{c ? "Edit capital entry" : "Add capital entry"}</h2>
      <div className="form2">
        <label className="field">Date<input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></label>
        <label className="field">Type<select value={f.type} onChange={e => set("type", e.target.value)}>{Object.entries(CAP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="field">Owner / partner<input type="text" list="cap-people" value={f.person} onChange={e => set("person", e.target.value)} placeholder="Who put in or took out the money" /></label>
        <label className="field">Amount (Rs)<NumInput value={f.amt} onChange={v => set("amt", v)} /></label>
        <label className="field full">Details<input type="text" value={f.desc} onChange={e => set("desc", e.target.value)} placeholder="e.g. Pizza oven, shop advance rent, partner investment" /></label>
        <label className="field full">{f.type === "in" ? "Received in" : "Paid from"}<SourceSelect value={f.from} onChange={v => set("from", v)} /></label>
      </div>
      <datalist id="cap-people">{people.map(x => <option key={x} value={x} />)}</datalist>
      {editable && <div className="bar" style={{ marginTop: 14 }}>
        <span className="grow sub">{msg}</span>
        {c && <button className="btn ghost" onClick={onDone}>New entry</button>}
        {c && (askDel ? <Confirm text="Delete this entry?" onYes={del} onNo={() => setAskDel(false)} /> : <button className="btn danger" onClick={() => setAskDel(true)}>Delete</button>)}
        <button className="btn primary" onClick={save}>{c ? "Save changes" : "Add entry"}</button>
      </div>}
      <p className="hint">Capital invested adds to the account it was received in. Setup / equipment and withdrawals come out of the account you pick. Month closing includes these.</p>
    </fieldset>
  );
}
