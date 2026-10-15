"use client";
// Small shared pieces used across pages.
import { fmt } from "@/lib/format";

export function Kpi({ label, value, sub, main, money = true, neg }) {
  const isNeg = neg ?? (money && value < 0);
  return (
    <div className={"kpi" + (main ? " main" : "")}>
      <span className="eyebrow">{label}</span>
      <span className={"v num" + (isNeg ? " neg" : "")}>{money ? fmt(value) : value}</span>
      {sub != null && <span className="s">{sub}</span>}
    </div>
  );
}

export const Money = ({ v, bold, className = "" }) => {
  const t = fmt(v);
  return <span className={(v < 0 ? "neg " : "") + className}>{bold ? <b>{t}</b> : t}</span>;
};

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

// Inline "are you sure" used in place of browser confirm dialogs
export function Confirm({ text, yes = "Delete", no = "Keep", danger = true, onYes, onNo }) {
  return (
    <span className="confirm">{text} <button className={"btn " + (danger ? "danger" : "primary")} onClick={onYes}>{yes}</button><button className="btn ghost" onClick={onNo}>{no}</button></span>
  );
}

export function NumInput({ value, onChange, ...rest }) {
  return <input type="number" min="0" inputMode="decimal" value={value ?? ""} placeholder="0"
    onChange={e => onChange(e.target.value === "" ? "" : +e.target.value)} {...rest} />;
}

export function SourceSelect({ value, onChange, withCapital, ...rest }) {
  return (
    <select value={value || "cash"} onChange={e => onChange(e.target.value)} {...rest}>
      <option value="cash">Cash</option><option value="bank">Bank</option><option value="easypaisa">EasyPaisa / JazzCash</option>
      {withCapital && <option value="capital">Capital (owner’s money)</option>}
    </select>
  );
}

export const Swatch = ({ color }) => <i className="sw" style={{ background: `var(${color})` }} />;
