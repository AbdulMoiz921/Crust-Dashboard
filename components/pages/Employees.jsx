"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Kpi, Empty, Confirm, NumInput, SourceSelect } from "../ui";
import { fmt, today, thisMonth, monthName, monthShort, nice, niceLong } from "@/lib/format";
import { ROLES, DEFAULT_RATE, allEmps, activeEmps, sheetRows, salaryRow, advancesFor, prevDay } from "@/lib/calc";
import { canEdit } from "@/lib/access";
import { saveDoc, removeDoc, newId, isDenied } from "@/lib/firebase";
import { exportEmployees } from "@/lib/excel";

export const StatusPill = ({ r }) => r.paid ? <span className="pill closed">Paid</span> : r.net < 0 ? <span className="pill open">Over-advanced</span> : <span className="pill open">Due</span>;

export default function Employees({ addAdvance }) {
  const { D, me, loaded, toast } = useApp();
  const editable = canEdit(me, "emp");
  const [month, setMonth] = useState(thisMonth());
  const [sel, setSel] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const c = D.closings.get(month);
  const rows = useMemo(() => sheetRows(month, c, D), [month, c, D.emps, D.days]);
  const rowById = Object.fromEntries(rows.map(r => [r.id, r]));
  const act = activeEmps(D.emps), list = allEmps(D.emps);
  const adv = rows.reduce((a, r) => a + r.adv, 0), due = rows.reduce((a, r) => a + (r.paid ? 0 : Math.max(0, r.net)), 0);
  const bill = act.reduce((a, m) => a + (+m.salary || 0), 0);
  useEffect(() => { if (sel && !D.emps.has(sel)) setSel(null); }, [D.emps]);
  const m = sel ? D.emps.get(sel) : null;

  return (
    <>
      <div className="card bar">
        <div className="grow"><h2 style={{ margin: 0 }}>Employees</h2><span className="sub">{monthName(month)}</span></div>
        <label className="field" style={{ width: 170 }}>Month<input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label>
        <button className="btn xl" onClick={() => exportEmployees(D, month, rows).then(() => toast("Excel file downloaded"))}>Export to Excel</button>
        {editable && <button className="btn primary" onClick={() => { setSel(null); setFormOpen(true); }}>+ Add employee</button>}
      </div>
      <div className="kpis">
        <Kpi main money={false} label="Active staff" value={act.length} sub={`${D.emps.size - act.length} inactive`} />
        <Kpi label="Monthly salary bill" value={bill} sub="before advances" />
        <Kpi label={`Advances · ${monthShort(month)}`} value={adv} sub="from the daily book" />
        <Kpi label="Still to pay" value={due} sub={c?.status === "closed" ? "month closed" : "salary − advances"} />
      </div>
      <div className="emp-grid">
        <div className="card">
          <h2>Staff and salary <small>click a name to see the account</small></h2>
          {list.length ? (
            <div className="tbl-wrap"><table className="num"><thead><tr><th>Name</th><th>Salary</th><th>Advance</th><th>Remaining</th><th>Status</th></tr></thead>
              <tbody>{list.map(e => {
                const r = rowById[e.id];
                const open = () => { setSel(e.id); setFormOpen(false); };
                return <tr key={e.id} className={"click" + (e.id === sel ? " sel" : "")} tabIndex={0} onClick={open} onKeyDown={ev => ev.key === "Enter" && open()}>
                  <td><b>{e.name}</b><div className="sub">{e.role || ""}</div></td><td>{fmt(e.salary)}</td><td>{r ? fmt(r.adv) : "—"}</td>
                  <td className={r && r.net < 0 ? "neg" : ""}>{r ? fmt(r.net) : "—"}</td>
                  <td>{e.active === false ? <span className="pill off">Inactive</span> : r ? <StatusPill r={r} /> : null}</td></tr>;
              })}</tbody>
              <tfoot><tr><td>Total</td><td>{fmt(bill)}</td><td>{fmt(adv)}</td><td>{fmt(rows.reduce((a, r) => a + r.net, 0))}</td><td></td></tr></tfoot>
            </table></div>
          ) : <Empty>{loaded.emps ? <>No employees yet. Press <b>Add employee</b> to add your first one, with their monthly salary.</> : "Loading employees…"}</Empty>}
        </div>
        <div className="view">
          <div className="card">
            {formOpen || m ? <EmployeeForm key={formOpen ? "new" : m.id} emp={formOpen ? null : m} editable={editable}
              onDone={id => { setFormOpen(false); if (id !== undefined) setSel(id); }} />
              : <><h2>Employee details</h2><p className="hint" style={{ margin: 0 }}>Choose an employee from the list to see their advances and salary, or add a new one.</p></>}
          </div>
          {m && <Account m={m} month={month} editable={editable} addAdvance={addAdvance} />}
        </div>
      </div>
    </>
  );
}

function EmployeeForm({ emp, editable, onDone }) {
  const { D, toast } = useApp();
  const [f, setF] = useState(() => ({ name: emp?.name || "", role: emp?.role || "Rider", salary: emp?.salary ?? "", phone: emp?.phone || "", joined: emp?.joined || "", active: emp?.active !== false, note: emp?.note || "" }));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [askDel, setAskDel] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    const name = f.name.trim();
    if (!name) return setMsg("Enter the employee’s name.");
    const dup = [...D.emps.values()].find(x => x.id !== emp?.id && (x.name || "").toLowerCase() === name.toLowerCase());
    if (dup) return setMsg(`${dup.name} already exists. Use a different name, e.g. add the surname.`);
    const id = emp?.id || newId("employees");
    const data = { name, role: f.role, salary: +f.salary || 0, phone: f.phone.trim(), joined: f.joined, active: f.active, note: f.note.trim(), createdAt: emp?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    setBusy(true);
    try { await saveDoc("employees", id, data); toast(emp ? "Changes saved" : name + " added"); onDone(id); }
    catch (e) { setMsg(isDenied(e) ? "You have view-only access." : "Could not save. Try again."); setBusy(false); }
  }
  async function del() {
    try { await removeDoc("employees", emp.id); toast(emp.name + " deleted"); onDone(null); }
    catch { setMsg("Could not delete. Try again."); }
  }

  return (
    <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <h2>{emp ? "Edit " + emp.name : "New employee"}</h2>
      <div className="form2">
        <label className="field">Name<input type="text" value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Arslan" /></label>
        <label className="field">Role<select value={f.role} onChange={e => set("role", e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></label>
        <label className="field">Monthly salary (Rs)<NumInput value={f.salary} onChange={v => set("salary", v)} /></label>
        <label className="field">Phone<input type="text" value={f.phone} onChange={e => set("phone", e.target.value)} placeholder="03xx-xxxxxxx" /></label>
        <label className="field">Joining date<input type="date" value={f.joined} onChange={e => set("joined", e.target.value)} /></label>
        <label className="field">Status<span className="chk" style={{ padding: "8px 0" }}><input type="checkbox" checked={f.active} onChange={e => set("active", e.target.checked)} /> Working (active)</span></label>
        <label className="field full">Note<input type="text" value={f.note} onChange={e => set("note", e.target.value)} placeholder="CNIC, address or anything to remember" /></label>
      </div>
      {editable && <div className="bar" style={{ marginTop: 14 }}>
        <span className="grow sub">{msg}</span>
        {emp ? (askDel ? <Confirm text={`Delete ${emp.name}? Their advances stay in the daily book.`} onYes={del} onNo={() => setAskDel(false)} />
          : <button className="btn danger" onClick={() => setAskDel(true)}>Delete</button>)
          : <button className="btn ghost" onClick={() => onDone(undefined)}>Cancel</button>}
        <button className="btn primary" onClick={save} disabled={busy}>{emp ? "Save changes" : "Add employee"}</button>
      </div>}
    </fieldset>
  );
}

function Account({ m, month, editable, addAdvance }) {
  const { D, me, toast } = useApp();
  const [a, setA] = useState({ date: today(), amt: "", from: "cash", note: "" });
  const [busy, setBusy] = useState(false);
  const c = D.closings.get(month), closed = c?.status === "closed";
  const r = (closed && c.rows?.find(x => x.id === m.id)) || salaryRow(m, month, c, D.days);
  const all = advancesFor(m, D.days, null).reverse();
  const byMonth = {}; all.forEach(x => (byMonth[x.date.slice(0, 7)] ||= []).push(x));
  const hist = [...D.closings.values()].filter(x => x.status === "closed" && x.rows?.some(y => y.id === m.id)).sort((x, y) => x.month < y.month ? 1 : -1);
  const canAddDay = canEdit(me, "emp");

  async function give() {
    const amt = +a.amt, date = a.date;
    if (!date || !(amt > 0)) return toast("Enter a date and an amount for the advance.");
    if (D.closings.get(date.slice(0, 7))?.status === "closed") return toast(monthName(date.slice(0, 7)) + " is closed. Reopen it in Month closing first.");
    const ex = { cat: "Salary advance", desc: m.name, amt, emp: m.id, from: a.from }; if (a.note.trim()) ex.note = a.note.trim();
    const base = D.days.get(date), p = prevDay(D.days, date);
    const rec = base ? JSON.parse(JSON.stringify(base)) : { date, sale: { cash: 0, bank: 0, easypaisa: 0 }, expenses: [], riders: [], petrolRate: p?.petrolRate ?? DEFAULT_RATE, petrolFrom: p?.petrolFrom || "cash", note: "" };
    rec.expenses = [...(rec.expenses || []), ex]; rec.updatedAt = new Date().toISOString();
    setBusy(true);
    try { await saveDoc("days", date, rec); addAdvance(date, ex); setA(s => ({ ...s, amt: "", note: "" })); toast(`Advance of ${fmt(amt)} added for ${m.name} on ${niceLong(date)}`); }
    catch { toast("Could not save the advance. Try again."); }
    setBusy(false);
  }

  return (
    <div className="card">
      <h2>{m.name}’s account <small>{m.role || ""}{m.phone ? " · " + m.phone : ""}</small></h2>
      <table className="num money"><tbody>
        <tr><td>Salary · {monthName(month)}</td><td>{fmt(r.base)}</td></tr>
        <tr><td>Advances this month</td><td>− {fmt(r.adv)}</td></tr>
        {r.absentDed ? <tr><td>Absent {r.absent} day{r.absent == 1 ? "" : "s"}</td><td>− {fmt(r.absentDed)}</td></tr> : null}
        {r.ded ? <tr><td>Other deduction</td><td>− {fmt(r.ded)}</td></tr> : null}
        {r.bonus ? <tr><td>Bonus</td><td>+ {fmt(r.bonus)}</td></tr> : null}
        <tr className="total"><td>Remaining to pay</td><td className={r.net < 0 ? "neg" : ""}>{fmt(r.net)} <StatusPill r={r} /></td></tr>
      </tbody></table>
      {editable && canAddDay && <>
        <h3 className="eyebrow" style={{ margin: "18px 0 8px" }}>Give advance</h3>
        <div className="adv-form">
          <label className="field">Date<input type="date" value={a.date} onChange={e => setA(s => ({ ...s, date: e.target.value }))} /></label>
          <label className="field">Amount (Rs)<NumInput value={a.amt} onChange={v => setA(s => ({ ...s, amt: v }))} /></label>
          <label className="field">Paid from<SourceSelect value={a.from} onChange={v => setA(s => ({ ...s, from: v }))} /></label>
          <label className="field">Note<input type="text" value={a.note} placeholder="optional" onChange={e => setA(s => ({ ...s, note: e.target.value }))} /></label>
          <button className="btn primary" onClick={give} disabled={busy}>Add advance</button>
        </div>
        <p className="hint">Added to that day’s expense in the daily book, and taken off {m.name}’s salary for that month.</p>
      </>}
      <h3 className="eyebrow" style={{ margin: "18px 0 8px" }}>Advance history</h3>
      {all.length ? (
        <div className="tbl-wrap"><table className="num"><thead><tr><th>Date</th><th>Note</th><th>Amount</th></tr></thead><tbody>
          {Object.entries(byMonth).map(([mo, l]) => [
            ...l.map((x, i) => <tr key={mo + i}><td>{nice(x.date)}</td><td style={{ textAlign: "left" }}>{x.note}</td><td>{fmt(x.amt)}</td></tr>),
            <tr key={mo}><td><b>{monthName(mo)}</b></td><td></td><td><b>{fmt(l.reduce((s, x) => s + x.amt, 0))}</b></td></tr>,
          ])}
        </tbody></table></div>
      ) : <p className="hint" style={{ margin: 0 }}>No advances yet.</p>}
      {hist.length > 0 && <>
        <h3 className="eyebrow" style={{ margin: "18px 0 8px" }}>Closed months</h3>
        <div className="tbl-wrap"><table className="num"><thead><tr><th>Month</th><th>Salary</th><th>Advances</th><th>Paid at close</th><th></th></tr></thead><tbody>
          {hist.map(h => { const y = h.rows.find(z => z.id === m.id); return <tr key={h.month}><td>{monthName(h.month)}</td><td>{fmt(y.base)}</td><td>{fmt(y.adv)}</td><td>{fmt(y.paid ? Math.max(0, y.net) : 0)}</td><td><StatusPill r={y} /></td></tr>; })}
        </tbody></table></div>
      </>}
    </div>
  );
}
