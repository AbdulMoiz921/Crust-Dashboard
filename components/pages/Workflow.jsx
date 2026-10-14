"use client";
import { useEffect, useRef, useState } from "react";

const STEPS = [
  ["Step 1 · Closing time", "Open Daily entry", "The date defaults to today. Use Prev or Next, or pick a date, to fill a missed day."],
  ["Step 2 · Sale", "Enter sale by payment", "Cash, Bank and EasyPaisa/JazzCash. Total sale is added up for you."],
  ["Step 3 · Expense", "Add each expense", "Pick a category, write what it was for, choose how it was paid (cash, bank or EasyPaisa) and enter the amount."],
  ["Step 4 · Riders", "Riders, bikes and petrol", "Add each rider’s order amounts and the bike’s start and end reading. Km, and petrol at your rate per km, are worked out and petrol goes into expense."],
  ["Step 5 · Save", "Check the summary, then save", "The summary matches the bottom of your sheet: total sale, total expense, each payment type and cash in hand."],
  ["Step 6 · Review", "Dashboard with filters", "Today’s totals sit at the top. Choose today, last 7 days, a month or a custom range to see totals, charts, riders and every day in a table."],
  ["Any day · Advance", "Salary advance", "In Daily entry pick “Salary advance” and the employee, or use Give advance on the Employees page. It is counted as that day’s expense and added to the employee’s account."],
  ["Any time · Vendors", "Unpaid bills", "On the Vendors page, add a bill you will pay later. When you pay, record the payment and the account it came from. Each vendor shows how much we still owe."],
  ["Any time · Customers", "Food on credit", "If a customer takes food now and pays later, add it on the Customers page instead of the day’s sale. When they pay, record it with the account it came into. Each customer shows how much they owe."],
  ["Any time · Foodpanda", "Foodpanda", "Add Foodpanda orders on the Foodpanda page, not in the day’s sale. When Foodpanda pays, add the payout and commission; the money goes into Bank."],
  ["Any time · Capital", "Capital", "Record money an owner or partner puts in, setup and equipment spending, and owner withdrawals, with the account used."],
  ["Every day · Attendance", "Mark attendance", "On the Attendance page pick the date and tap P, A, H, L or O for each person, or Mark all present. Month closing takes absent days from it."],
  ["Month end · Closing", "Close the month", "Month closing shows opening, received, paid out and closing for cash, bank and EasyPaisa, and each employee’s salary minus advances. Tick Paid, then Close month to lock it."],
  ["Admin · Users", "Users and access", "Admins add people on the Users page and choose, page by page, whether each person can view or edit."],
  ["Any page · Excel", "Export to Excel", "Every page has an Export to Excel button for the range or month you are looking at."],
];

const DIAGRAM = `flowchart LR
  A[Closing time] --> B[Daily entry: pick date]
  B --> C[Sale: Cash / Bank / EasyPaisa]
  B --> D[Expenses + paid from]
  B --> E[Riders: orders + bike km]
  E --> P[Km x rate = rider petrol]
  C --> F[Day summary]
  D --> F
  P --> F
  F --> G[(Save day)]
  G --> H[Dashboard and filters]
  D --> V[Salary advance]
  V --> W[Employee account]
  W --> M[Month closing]
  G --> M
  Q[Capital] --> M
  R[Vendor unpaid bill] --> S[Owed to vendor]
  T[Vendor payment] --> S
  T --> M
  M --> N[Closing cash / bank / EasyPaisa]
  U[Food on credit] --> X[Customer owes us]
  Y[Customer pays back] --> X
  Y --> M`;

export default function Workflow({ active }) {
  const box = useRef(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!active || drawn) return;
    let cancelled = false;
    (async () => {
      const mermaid = (await import("mermaid")).default;
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict" });
      const { svg } = await mermaid.render("cashbook-flow", DIAGRAM);
      if (!cancelled && box.current) { box.current.innerHTML = svg; setDrawn(true); }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [active, drawn]);

  return (
    <>
      <div className="card">
        <h2>How the cash book works</h2>
        <p className="ro-note" style={{ margin: "0 0 14px" }}>Each day is one record, the same as one printed sheet. You fill it once at closing, and the dashboard adds up any days you pick.</p>
        <div className="steps">
          {STEPS.map(([n, h, p]) => <div className="step" key={h}><span className="n">{n}</span><h3>{h}</h3><p>{p}</p></div>)}
        </div>
      </div>
      <div className="mermaid-box" ref={box}><p className="hint" style={{ margin: 0 }}>Drawing the diagram…</p></div>
    </>
  );
}
