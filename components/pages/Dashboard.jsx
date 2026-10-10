"use client";
import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Kpi, Empty, Swatch } from "../ui";
import { fmt, fmtShort, today, addDays, niceLong, nice, parse, MONTHS, dim, pad } from "@/lib/format";
import { saleOf, expOf, petrolDay, petrolOf, kmOf, riderOrders, expBySrc, vpayBySrc, leftBySrc, totalOwed, inRange } from "@/lib/calc";
import { exportRange } from "@/lib/excel";

const PRESETS = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "Last 7 days"], ["month", "Month"], ["custom", "Custom"]];

export default function Dashboard({ openDay }) {
  const { D, loaded, toast } = useApp();
  const t = today();
  const [p, setP] = useState("month");
  const [month, setMonth] = useState(t.slice(0, 7));
  const [from0, setFrom] = useState(addDays(t, -6));
  const [to0, setTo] = useState(t);

  const [from, to] = useMemo(() => {
    if (p === "today") return [t, t];
    if (p === "yesterday") { const y = addDays(t, -1); return [y, y]; }
    if (p === "week") return [addDays(t, -6), t];
    if (p === "custom") return from0 <= to0 ? [from0, to0] : [to0, from0];
    return [month + "-01", month + "-" + pad(dim(month))];
  }, [p, month, from0, to0, t]);

  const recs = useMemo(() => inRange(D.days, from, to), [D.days, from, to]);
  const S = useMemo(() => {
    let cash = 0, bank = 0, ep = 0, exp = 0; const out = { cash: 0, bank: 0, easypaisa: 0 };
    recs.forEach(r => {
      cash += +r.sale?.cash || 0; bank += +r.sale?.bank || 0; ep += +r.sale?.easypaisa || 0; exp += expOf(r);
      const x = expBySrc(r); for (const k in out) out[k] += x[k];
    });
    const vp = vpayBySrc(D.vpays, from, to);
    const cat = {};
    recs.forEach(r => { (r.expenses || []).forEach(e => { const k = e.cat || "Other"; cat[k] = (cat[k] || 0) + (+e.amt || 0); }); const pp = petrolDay(r); if (pp) cat["Rider petrol"] = (cat["Rider petrol"] || 0) + pp; });
    const rid = {};
    recs.forEach(r => (r.riders || []).forEach(rd => {
      const k = (rd.name || "").trim() || "Unnamed";
      const o = rid[k] ||= { days: 0, orders: 0, amt: 0, km: 0, petrol: 0 };
      o.days++; o.orders += (rd.orders || []).length; o.amt += riderOrders(rd); o.km += kmOf(rd); o.petrol += petrolOf(rd, r.petrolRate);
    }));
    return {
      cash, bank, ep, exp, out, vp, vpTot: vp.cash + vp.bank + vp.easypaisa, sale: cash + bank + ep,
      cats: Object.entries(cat).filter(c => c[1] > 0).sort((a, b) => b[1] - a[1]),
      riders: Object.entries(rid).sort((a, b) => b[1].amt - a[1].amt),
    };
  }, [recs, D.vpays, from, to]);
  const owed = useMemo(() => totalOwed(D), [D.vendors, D.vbills, D.vpays]);
  const n = recs.length, net = S.sale - S.exp, inHand = S.cash - S.out.cash - S.vp.cash;

  return (
    <>
      <TodayStrip openDay={openDay} />

      <div className="card filters">
        <div className="seg">
          {PRESETS.map(([k, l]) => <button key={k} className="chip" aria-pressed={p === k} onClick={() => setP(k)}>{l}</button>)}
        </div>
        {p === "month" && <label className="field" style={{ width: 170 }}>Month<input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label>}
        {p === "custom" && <>
          <label className="field" style={{ width: 160 }}>From<input type="date" value={from0} onChange={e => e.target.value && setFrom(e.target.value)} /></label>
          <label className="field" style={{ width: 160 }}>To<input type="date" value={to0} onChange={e => e.target.value && setTo(e.target.value)} /></label>
        </>}
        <span className="range-label">{from === to ? niceLong(from) : niceLong(from) + " → " + niceLong(to)}</span>
        <button className="btn xl" onClick={() => exportRange(D, recs, from, to, from === to ? `Crust-House-${from}.xlsx` : `Crust-House-${from}-to-${to}.xlsx`).then(() => toast("Excel file downloaded"))}>Export to Excel</button>
      </div>

      <div className="kpis">
        <Kpi main label="Total sale" value={S.sale} sub={`${n} day${n === 1 ? "" : "s"} recorded`} />
        <Kpi label="Total expense" value={S.exp} sub={S.sale ? ((S.exp / S.sale) * 100).toFixed(1) + "% of sale" : "—"} />
        <Kpi label="Sale minus expense" value={net} sub={net >= 0 ? "▲ ahead" : "▼ expense is higher"} />
        <Kpi label="Cash in hand" value={inHand} sub="cash sale − cash paid out" />
        <Kpi label="Owed to vendors" value={owed} neg={owed > 0} sub={"unpaid bills now" + (S.vpTot ? " · paid " + fmt(S.vpTot) + " in range" : "")} />
        <Kpi label="Average daily sale" value={n ? S.sale / n : 0} sub={n ? "best: " + fmt(Math.max(...recs.map(saleOf))) : "no days yet"} />
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Daily sale vs expense <span className="mini-legend"><span><Swatch color="--sale" />Sale</span><span><Swatch color="--expense" />Expense</span></span></h2>
          <DailyChart from={from} to={to} openDay={openDay} />
        </div>
        <div className="card">
          <h2>How customers paid <small>{fmt(S.sale)}</small></h2>
          {!S.sale ? <Empty>No sale in this range yet.</Empty> : <>
            <div className="stack" role="img" aria-label="Payment split">
              {[["Cash", S.cash, "--cash"], ["Bank", S.bank, "--bank"], ["EasyPaisa / JazzCash", S.ep, "--ep"]].filter(x => x[1] > 0).map(([l, v, c]) => <div key={l} style={{ flex: v, background: `var(${c})` }} title={`${l}: ${fmt(v)}`} />)}
            </div>
            <div className="legend">
              {[["Cash", S.cash, "--cash"], ["Bank", S.bank, "--bank"], ["EasyPaisa / JazzCash", S.ep, "--ep"]].map(([l, v, c]) => (
                <div className="row" key={l}><Swatch color={c} /><span>{l}</span><b className="num">{fmt(v)}</b><span className="pct num">{((v / S.sale) * 100).toFixed(0)}%</span></div>
              ))}
            </div>
          </>}
          {(S.sale || S.exp || S.vpTot) ? <>
            <h3 className="eyebrow" style={{ margin: "18px 0 6px" }}>Left in each account</h3>
            <div className="tbl-wrap"><table className="num"><thead><tr><th></th><th>Received</th><th>Expenses</th>{S.vpTot ? <th>Vendors</th> : null}<th>Left</th></tr></thead><tbody>
              {[["Cash", S.cash, "cash"], ["Bank", S.bank, "bank"], ["EasyPaisa", S.ep, "easypaisa"]].map(([l, v, k]) => {
                const left = v - S.out[k] - S.vp[k];
                return <tr key={k}><td>{l}</td><td>{fmt(v)}</td><td>{fmt(S.out[k])}</td>{S.vpTot ? <td>{fmt(S.vp[k])}</td> : null}<td className={left < 0 ? "neg" : ""}><b>{fmt(left)}</b></td></tr>;
              })}
            </tbody></table></div>
          </> : null}
        </div>
      </div>

      <div className="grid2b">
        <div className="card">
          <h2>Expenses by category <small>{fmt(S.exp)}</small></h2>
          {S.cats.length ? S.cats.map(([k, v]) => (
            <div className="hbar" key={k}><span>{k}</span><div className="track"><div className="fill" style={{ width: (v / S.cats[0][1]) * 100 + "%" }} /></div><b className="num">{fmt(v)}</b></div>
          )) : <Empty>No expenses in this range.</Empty>}
        </div>
        <div className="card">
          <h2>Riders <small>orders, amount collected, bike km</small></h2>
          {S.riders.length ? (
            <div className="tbl-wrap"><table className="num"><thead><tr><th>Rider</th><th>Days</th><th>Orders</th><th>Collected</th><th>Km</th><th>Petrol</th></tr></thead>
              <tbody>{S.riders.map(([k, o]) => <tr key={k}><td>{k}</td><td>{o.days}</td><td>{o.orders}</td><td>{fmt(o.amt)}</td><td>{o.km.toLocaleString()}</td><td>{fmt(o.petrol)}</td></tr>)}</tbody>
              <tfoot><tr><td>Total</td><td></td>
                <td>{S.riders.reduce((a, [, o]) => a + o.orders, 0)}</td><td>{fmt(S.riders.reduce((a, [, o]) => a + o.amt, 0))}</td>
                <td>{S.riders.reduce((a, [, o]) => a + o.km, 0).toLocaleString()}</td><td>{fmt(S.riders.reduce((a, [, o]) => a + o.petrol, 0))}</td></tr></tfoot>
            </table></div>
          ) : <Empty>No rider entries in this range.</Empty>}
        </div>
      </div>

      <div className="card">
        <h2>Day by day <small>click a day to open or edit it</small></h2>
        {recs.length ? (
          <div className="tbl-wrap"><table className="num"><thead><tr><th>Date</th><th>Cash</th><th>Bank</th><th>EasyPaisa</th><th>Total sale</th><th>Expense</th><th>Sale − exp.</th></tr></thead>
            <tbody>{recs.slice().reverse().map(r => {
              const s = saleOf(r), e = expOf(r);
              return <tr key={r.date} className="click" tabIndex={0} onClick={() => openDay(r.date)} onKeyDown={ev => ev.key === "Enter" && openDay(r.date)}>
                <td>{nice(r.date)}</td><td>{fmt(r.sale?.cash)}</td><td>{fmt(r.sale?.bank)}</td><td>{fmt(r.sale?.easypaisa)}</td><td><b>{fmt(s)}</b></td><td>{fmt(e)}</td><td className={s - e < 0 ? "neg" : ""}>{fmt(s - e)}</td></tr>;
            })}</tbody>
            <tfoot><tr><td>Total</td><td>{fmt(S.cash)}</td><td>{fmt(S.bank)}</td><td>{fmt(S.ep)}</td><td>{fmt(S.sale)}</td><td>{fmt(S.exp)}</td><td className={net < 0 ? "neg" : ""}>{fmt(net)}</td></tr></tfoot>
          </table></div>
        ) : <Empty>{loaded.days ? <>No days recorded in this range. Open <b>Daily entry</b> to add one.</> : "Loading your days…"}</Empty>}
      </div>
    </>
  );
}

function TodayStrip({ openDay }) {
  const { D, toast } = useApp();
  const t = today(), r = D.days.get(t);
  const s = r ? saleOf(r) : 0, e = r ? expOf(r) : 0, c = +r?.sale?.cash || 0, pp = r ? petrolDay(r) : 0;
  const inHand = r ? leftBySrc(r, D.vpays).cash : -vpayBySrc(D.vpays, t, t).cash;
  const cells = [
    ["Total sale", s, "hl"], ["Cash", c, "", "--cash"], ["Bank", +r?.sale?.bank || 0, "", "--bank"], ["EasyPaisa / JazzCash", +r?.sale?.easypaisa || 0, "", "--ep"],
    ["Total expense", e, "hl"], ["Rider petrol", pp], ["Sale − expense", s - e], ["Cash in hand", inHand], ["Owed to vendors", totalOwed(D)],
  ];
  return (
    <div className="card today">
      <div className="today-head">
        <h2>Today</h2><span className="s">{niceLong(t)}{r ? "" : " · not entered yet"}</span>
        <button className="btn xl" disabled={!r} onClick={() => exportRange(D, [r], t, t, `Crust-House-${t}.xlsx`).then(() => toast("Excel file downloaded"))}>Excel</button>
        <button className="btn primary" onClick={() => openDay(t)}>{r ? "Edit today" : "Enter today’s sale"}</button>
      </div>
      <div className="today-grid num">
        {cells.map(([l, v, cls, sw]) => (
          <div key={l} className={cls || ""}><span className="l">{sw && <Swatch color={sw} />}{l}</span><span className={"v" + (v < 0 ? " neg" : "")}>{fmt(v)}</span></div>
        ))}
      </div>
    </div>
  );
}

function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x || 1))); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function rbar(x, y, w, h) { const r = Math.min(4, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }

function DailyChart({ from, to, openDay }) {
  const { D } = useApp();
  const [tip, setTip] = useState(null);
  const list = [];
  for (let d = from, i = 0; d <= to && i < 62; d = addDays(d, 1), i++) list.push(d);
  if (list.length === 1) { list.length = 0; for (let i = 6; i >= 0; i--) list.push(addDays(to, -i)); }
  const pts = list.map(d => { const r = D.days.get(d); return { d, s: r ? saleOf(r) : 0, e: r ? expOf(r) : 0, has: !!r }; });
  const max = Math.max(1, ...pts.map(p => Math.max(p.s, p.e)));
  const step = niceStep(max / 4), top = Math.ceil(max / step) * step;
  const W = Math.max(560, list.length * 26 + 60), H = 240, L = 52, R = 8, T = 12, B = 30;
  const cw = (W - L - R) / list.length, bw = Math.max(3, Math.min(14, cw * 0.34));
  const y = v => T + (H - T - B) * (1 - v / top);
  const ticks = []; for (let v = 0; v <= top + 0.1; v += step) ticks.push(v);
  const every = Math.ceil(list.length / 12);
  return (
    <div className="chart-wrap" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily sale and expense bars">
        {ticks.map(v => <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={`var(${v === 0 ? "--axis" : "--grid"})`} strokeWidth="1" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{fmtShort(v)}</text>
        </g>)}
        {pts.map((p, i) => {
          const cx = L + cw * i + cw / 2;
          return <g key={p.d}>
            {tip?.i === i && <rect x={L + cw * i} y={T} width={cw} height={H - T - B} fill="var(--grid)" fillOpacity=".5" />}
            {p.s > 0 && <path d={rbar(cx - bw - 1, y(p.s), bw, y(0) - y(p.s))} fill="var(--sale)" />}
            {p.e > 0 && <path d={rbar(cx + 1, y(p.e), bw, y(0) - y(p.e))} fill="var(--expense)" />}
            {i % every === 0 && <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">{parse(p.d).getDate()} {list.length <= 7 ? MONTHS[parse(p.d).getMonth()] : ""}</text>}
            <rect x={L + cw * i} y={T} width={cw} height={H - T - B} fill="transparent" style={{ cursor: "pointer" }}
              onMouseMove={ev => { const box = ev.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect(); setTip({ i, x: ev.clientX - box.left, y: ev.clientY - box.top }); }}
              onClick={() => openDay(p.d)} />
          </g>;
        })}
      </svg>
      {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>
        <b>{nice(pts[tip.i].d)}</b>{pts[tip.i].has ? <>Sale {fmt(pts[tip.i].s)}<br />Expense {fmt(pts[tip.i].e)}</> : "Not entered"}
      </div>}
    </div>
  );
}
