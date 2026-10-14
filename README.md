# Crust House Cash Book

Cash book for **Crust House Commercial**: the daily sheet (sale by Cash / Bank / EasyPaisa, expenses, riders and bike readings) plus employees and salary advances, vendor dues, capital and month-end closing. Every page exports to Excel. Built with **Next.js 14**, **Firebase Authentication** and **Cloud Firestore**, deployed on **Vercel**.

## Pages

| Page | What it does |
|---|---|
| Dashboard | Today's totals, filters (today / 7 days / month / custom), sale vs expense chart, payment mix, money left in each account, expense categories, riders, day-by-day table |
| Daily entry | One record per day: sale by payment type, expenses with "paid from", riders with orders, bike km and petrol (km × rate), day summary |
| Employees | Staff list, monthly salary, advances (from the daily book or "Give advance"), ID card photos (CNIC front/back), each person's account |
| Month closing | Opening → received → paid out → closing for Cash, Bank and EasyPaisa; salary sheet (salary − absent days − advances − deduction + bonus); close / reopen month |
| Attendance | Mark each employee Present / Absent / Half day / Leave / Day off by date; monthly register; feeds absent days into the salary sheet |
| Vendors | Unpaid bills, payments, balance owed per vendor, full ledger |
| Customers | Food given on credit (udhaar), payments received back into Cash / Bank / EasyPaisa, how much each customer owes, full ledger |
| Foodpanda | Foodpanda orders totals, payouts (added to Bank automatically), commission, and what Foodpanda still owes |
| Capital | Owner/partner investments, setup and equipment spending, withdrawals |
| Users | Admins add people and choose, page by page, No access / View / Edit |

## 1. Create the Firebase project (one time)

1. Go to <https://console.firebase.google.com> → **Add project**.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Build → Firestore Database → Create database** (production mode, a region near you, e.g. `asia-south1`).
4. **Firestore → Rules**: paste the whole of [`firestore.rules`](firestore.rules) and press **Publish**. The rules are what enforce each user's access, so don't skip this.
5. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app (no hosting needed) and copy the config values.

## 2. Run it on your computer

```bash
npm install
cp .env.local.example .env.local   # then paste the six Firebase values into .env.local
npm run dev                        # http://localhost:3000
```

**Create the owner login:** Firebase console → **Authentication → Users → Add user** (your email and a password). Then sign in to the app with it: the **first person to sign in** on a fresh project becomes the owner (admin) automatically. There is no sign-up on the sign-in page; the owner adds everyone else from the **Users** page.

To try the app without Firebase, run `npm run dev:demo` (<http://localhost:3001>). It uses made-up example data stored only in your browser.

## 3. Deploy on Vercel

1. Push this repo to GitHub.
2. <https://vercel.com/new> → import the repo (framework: Next.js, no other settings).
3. **Environment Variables**: add the six `NEXT_PUBLIC_FIREBASE_*` values from `.env.local.example`.
4. Deploy.
5. In Firebase → **Authentication → Settings → Authorized domains**, add your Vercel domain (e.g. `crust-cashbook.vercel.app`) so password-reset links work there.

## Roles and access

| Role | Dashboard | Daily entry | Employees | Month closing | Vendors | Capital | Users |
|---|---|---|---|---|---|---|---|
| Admin | Edit | Edit | Edit | Edit | Edit | Edit | Yes |
| Manager | Edit | Edit | Edit | Edit | Edit | View | – |
| Cashier | View | Edit | – | – | Edit | – | – |
| Viewer | View | View | View | View | View | View | – |
| Custom | chosen page by page | | | | | | |

- **Add user** creates the login with a temporary password; give it to the person. **Send password reset** emails them a link.
- **Remove access** or unticking **Can sign in** stops a person at once. To delete the login itself, use Firebase console → Authentication.
- There is no self sign-up. A login made directly in the Firebase console appears under **Waiting for access** after its first sign-in, for an admin to approve.
- Keep **Authentication → Settings → User actions → Enable create (sign-up)** switched on: the Users page needs it to create logins. Strangers who sign up through the API get no access, because the rules only open the book to people with a profile.

## Data (Firestore collections)

| Collection | One document per |
|---|---|
| `days/{YYYY-MM-DD}` | day: sale, expenses, riders, petrol rate, note |
| `employees/{id}` | employee |
| `empDocs/{id}` | employee ID card or other document (photo shrunk in the browser, stored inside the document) |
| `closings/{YYYY-MM}` | month: opening balances, salary sheet, status; frozen totals once closed |
| `vendors/{id}`, `vbills/{id}`, `vpays/{id}` | vendor, unpaid bill, vendor payment |
| `attendance/{YYYY-MM-DD}` | one day's attendance marks for every employee |
| `customers/{id}`, `cbills/{id}`, `cpays/{id}` | credit customer, food given on credit, payment received |
| `fpsales/{id}`, `fppays/{id}` | Foodpanda orders total, Foodpanda payout into Bank (with commission) |
| `capital/{id}` | capital entry |
| `users/{uid}`, `requests/{uid}`, `meta/setup` | access profile, pending sign-up, first-owner marker |

Firestore's offline cache is on, so entries made while the internet is down are saved on the device and sync when it's back.

## Project layout

```
app/            layout, page, global styles
components/     AppProvider (auth + live data), AppShell (tabs), Gate (sign-in), pages/*
lib/            calc.js (all money maths), access.js, firebase.js, excel.js, format.js
dev/            demo stand-in for Firebase (npm run dev:demo only)
firestore.rules security rules to publish in the Firebase console
```
