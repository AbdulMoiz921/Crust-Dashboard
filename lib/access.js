// Who can open what. A profile lives at users/{uid}: { role, perms: {page: "none"|"view"|"edit"}, active }.
// firestore.rules enforces the same mapping on the server; this file only shapes the UI.
export const PAGES = { dash: "Dashboard", entry: "Daily entry", emp: "Employees", close: "Month closing", att: "Attendance", ven: "Vendors", cust: "Customers", fp: "Foodpanda", cap: "Capital" };
export const LEVELS = { none: "No access", view: "View", edit: "Edit" };
export const ROLES_ACCESS = {
  admin:   { label: "Admin",   note: "Every page, plus Users" },
  manager: { label: "Manager", perms: { dash: "edit", entry: "edit", emp: "edit", close: "edit", att: "edit", ven: "edit", cust: "edit", fp: "edit", cap: "view" } },
  cashier: { label: "Cashier", perms: { dash: "view", entry: "edit", emp: "none", close: "none", att: "edit", ven: "edit", cust: "edit", fp: "edit", cap: "none" } },
  viewer:  { label: "Viewer",  perms: { dash: "view", entry: "view", emp: "view", close: "view", att: "view", ven: "view", cust: "view", fp: "view", cap: "view" } },
  custom:  { label: "Custom",  note: "Pick access page by page" },
};

export const isAdmin = me => me?.role === "admin" && me?.active !== false;
export const level = (me, tab) => isAdmin(me) ? "edit" : (me?.active !== false && me?.perms?.[tab]) || "none";
export const canView = (me, tab) => level(me, tab) !== "none";
export const canEdit = (me, tab) => level(me, tab) === "edit";
export const roleLabel = r => ROLES_ACCESS[r]?.label || "Custom";
export const permsFor = (role, current) => role === "custom" ? { ...(current || {}) } : { ...(ROLES_ACCESS[role]?.perms || {}) };
export const matchRole = perms => {
  const m = Object.entries(ROLES_ACCESS).find(([, v]) => v.perms && Object.keys(PAGES).every(p => (v.perms[p] || "none") === (perms[p] || "none")));
  return m ? m[0] : "custom";
};
export const accessSummary = u => u.role === "admin" ? "All pages + Users" :
  Object.entries(PAGES).filter(([k]) => (u.perms?.[k] || "none") !== "none").map(([k, v]) => `${v}${u.perms[k] === "edit" ? "" : " (view)"}`).join(", ") || "No pages";

// what the rules let this person read, so the app never opens a listener that would be refused
export const readable = me => ({
  days: ["dash", "entry", "close", "emp"].some(t => canView(me, t)),
  employees: ["emp", "entry", "close", "att"].some(t => canView(me, t)),
  attendance: ["att", "emp", "close"].some(t => canView(me, t)),
  closings: true,
  vendors: ["ven", "dash", "close"].some(t => canView(me, t)),
  customers: ["cust", "dash", "close", "entry"].some(t => canView(me, t)),
  foodpanda: ["fp", "dash", "close", "entry"].some(t => canView(me, t)),
  capital: ["cap", "close"].some(t => canView(me, t)),
  users: isAdmin(me),
});
