"use client";
import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Kpi, Empty } from "../ui";
import { today, addDays, nice, niceLong, monthName, dim, pad, parse, DOW } from "@/lib/format";
import { ATT, attCounts, allEmps } from "@/lib/calc";
import { canEdit } from "@/lib/access";
import { mergeDoc, removeField, isDenied } from "@/lib/firebase";
import { exportAttendance } from "@/lib/excel";

const CODES = ["P", "A", "H", "L", "O"];

// Attendance: one document per date with every employee's mark. Taps save straight away.
export default function Attendance() {
  const { D, me, loaded, toast } = useApp();
  const [date, setDate] = useState(today());
  const [err, setErr] = useState("");
  const month = date.slice(0, 7);
  const closed = D.closings.get(month)?.status === "closed";
  const editable = canEdit(me, "att") && !closed;
  const rec = D.attendance.get(date);
  const marks = rec?.marks || {};

  // people who work on this date: active and already joined, plus anyone already marked that day
  const staff = allEmps(D.emps).filter(m => marks[m.id] || (m.active !== false && (!m.joined || m.joined <= date)));
  const counts = CODES.reduce((o, c) => ({ ...o, [c]: staff.filter(m => marks[m.id] === c).length }), {});
  const unmarked = staff.filter(m => !marks[m.id]).length;

  // each tap merges only that person's mark, so quick taps (or two phones marking at once) never overwrite each other
  async function write(changes) {
    setErr("");
    try { await mergeDoc("attendance", date, { date, marks: changes, updatedAt: new Date().toISOString(), updatedBy: me.uid }); return true; }
    catch (e) { setErr(isDenied(e) ? "You don’t have permission to mark attendance." : "Could not save. Check your connection and tap again."); return false; }
  }
  const mark = (id, code) => write({ [id]: marks[id] === code ? removeField() : code }); // tapping the same mark again clears it
  const allPresent = async () => {
    const changes = Object.fromEntries(staff.filter(m => !marks[m.id]).map(m => [m.id, "P"]));
    if (await write(changes)) toast("Everyone not yet marked is now Present");
  };

  return (
    <>
      <div className="card entry-head">
        <label className="field">Date<input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /></label>
        <div className="daynav">
          <button className="btn" onClick={() => setDate(addDays(date, -1))}>‹ Prev</button>
          <button className="btn" onClick={() => setDate(today())}>Today</button>
          <button className="btn" onClick={() => setDate(addDays(date, 1))}>Next ›</button>
        </div>
        <span className="status">{closed ? monthName(month) + " is closed" : rec?.updatedAt ? "Saved" : "Not marked yet"}</span>
      </div>

      <div className="kpis">
        <Kpi main money={false} label={"Present · " + nice(date)} value={counts.P} sub={`of ${staff.length} staff`} />
        <Kpi money={false} label="Absent" value={counts.A} sub={counts.H ? `${counts.H} half day` : "full day"} />
        <Kpi money={false} label="Leave / day off" value={counts.L + counts.O} sub={`${counts.L} leave · ${counts.O} off`} />
        <Kpi money={false} label="Not marked" value={unmarked} neg={unmarked > 0 && date <= today()} sub={unmarked ? "tap a mark for each person" : "all done"} />
      </div>

      <div className="card">
        <h2>Mark attendance <small>{niceLong(date)}</small></h2>
        {staff.length ? <>
          <div className="att-list">
            {staff.map(m => (
              <div className="att-row" key={m.id}>
                <div className="att-who"><b>{m.name}</b><span>{m.role || ""}</span></div>
                <div className="att-codes" role="radiogroup" aria-label={`Attendance for ${m.name}`}>
                  {CODES.map(c => (
                    <button key={c} type="button" className={"att-btn att-" + c} aria-pressed={marks[m.id] === c} disabled={!editable}
                      title={ATT[c].label} onClick={() => mark(m.id, c)}>
                      <b>{c}</b><span>{ATT[c].label.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {editable && <div className="bar" style={{ marginTop: 12 }}>
            <span className="grow sub">{err ? <span className="neg">{err}</span> : "Each tap saves straight away. Tap the same mark again to clear it."}</span>
            <button className="btn primary" onClick={allPresent} disabled={!unmarked}>Mark all present</button>
          </div>}
          {closed && <p className="hint">This month is closed, so attendance can’t be changed. Reopen it in Month closing first.</p>}
        </> : <Empty>{loaded.emps ? <>No employees yet. Add staff on the <b>Employees</b> page first.</> : "Loading employees…"}</Empty>}
        <p className="hint">P present · A absent (one day off salary) · H half day (half a day off salary) · L paid leave · O weekly day off. Month closing uses these for absent days.</p>
      </div>

      <Register month={month} date={date} setDate={setDate} />
    </>
  );
}

function Register({ month, date, setDate }) {
  const { D, toast } = useApp();
  const n = dim(month), days = Array.from({ length: n }, (_, i) => month + "-" + pad(i + 1));
  const rows = useMemo(() => allEmps(D.emps)
    .map(m => ({ m, c: attCounts(m.id, month, D.attendance) }))
    .filter(({ m, c }) => c.marked || (m.active !== false && (!m.joined || m.joined <= month + "-" + pad(n)))), [D.emps, D.attendance, month]);
  const t = today();
  return (
    <div className="card">
      <h2>Monthly register · {monthName(month)} <small><button className="btn xl" onClick={() => exportAttendance(D, month).then(() => toast("Excel file downloaded"))}>Export to Excel</button></small></h2>
      {rows.length ? (
        <div className="register-wrap"><table className="register num">
          <thead><tr><th>Employee</th>
            {days.map(d => <th key={d} className={(d === date ? "on " : "") + (parse(d).getDay() === 0 ? "sun" : "")}><button type="button" onClick={() => setDate(d)} title={nice(d)}>{+d.slice(8)}<span>{DOW[parse(d).getDay()][0]}</span></button></th>)}
            <th>P</th><th>A</th><th>H</th><th>L</th><th>O</th><th>Absent days</th></tr></thead>
          <tbody>{rows.map(({ m, c }) => (
            <tr key={m.id}><td>{m.name}</td>
              {days.map(d => { const code = D.attendance.get(d)?.marks?.[m.id]; return <td key={d} className={(code ? "att-" + code : d <= t ? "miss" : "") + (d === date ? " on" : "")}>{code || ""}</td>; })}
              <td>{c.P}</td><td>{c.A}</td><td>{c.H}</td><td>{c.L}</td><td>{c.O}</td><td><b>{c.absentDays}</b></td></tr>
          ))}</tbody>
        </table></div>
      ) : <Empty>No staff for this month yet.</Empty>}
      <p className="hint">Tap a date at the top to open it above. Empty past days mean nobody marked that person.</p>
    </div>
  );
}
