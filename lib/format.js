export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export const fmt = n => "Rs " + Math.round(n || 0).toLocaleString("en-PK");
export const fmtShort = n => {
  n = Math.round(n || 0);
  return n >= 100000 ? (n / 1000).toFixed(0) + "k" : n >= 10000 ? (n / 1000).toFixed(1) + "k" : n.toLocaleString("en-PK");
};
export const pad = n => String(n).padStart(2, "0");
export const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const today = () => iso(new Date());
export const thisMonth = () => today().slice(0, 7);

export const nice = s => { const d = parse(s); return DOW[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]; };
export const niceLong = s => { const d = parse(s); return pad(d.getDate()) + "-" + MONTHS[d.getMonth()] + "-" + d.getFullYear(); };
export const monthName = m => { const [y, mm] = m.split("-").map(Number); return FULL_MONTHS[mm - 1] + " " + y; };
export const monthShort = m => MONTHS[+m.slice(5) - 1];
export const dim = m => { const [y, mm] = m.split("-").map(Number); return new Date(y, mm, 0).getDate(); };
export const monthEnd = m => m + "-" + pad(dim(m));
export const prevMonth = m => { const [y, mm] = m.split("-").map(Number); const d = new Date(y, mm - 2, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
export const whenText = s => s ? new Date(s).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Never";

// number input helpers: keep "" while the field is empty so placeholders show
export const numOrBlank = v => v === "" ? "" : +v;
export const num = v => (v === "" || v == null || isNaN(+v)) ? 0 : +v;
