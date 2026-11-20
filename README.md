# IBT Travels CRM

Multi-tenant SaaS travel CRM — **React (Vite), Node.js, Express, MySQL** — built on the Sembark workflow and extended for
individual services, vendor land packages, trains, passport and travel insurance.

Flow: **enquiry → quote → share → convert → bookings → vouchers → payments → accounts → sales report**.

## What's in this release

| # | Request | Where |
|---|---|---|
| 1 | Enquiries by service: a visa-only or passport-only enquiry needs **no dates**; flight / train / insurance need a **travel date**; packages, hotels, land packages need **start date + nights**. Children with ages, infants. **Every dropdown has "+ Create new"** (saved per organisation). Flights have **origin / destination city**. | `Trips → + Add Trip`, `shared/catalog.js` (`ENQUIRY_SERVICES`, `datesNeeded`, `DEFAULT_OPTIONS`), `modules/options` |
| 2 | Email and city are optional on the enquiry | Trip form |
| 3 | **Carry-forward**: instalment 7,000, receipt 5,000 → 2,000 moves to the next instalment (or a new one a week later). Overpayments settle the next instalments. Deleting the payment undoes it. | `finance.controller.js → pay()`, Log receipt dialog |
| 4 | **Confirmation popup** before verifying a payment (amount, date, mode, reference, who logged it) | Accounting → Transactions, trip Accounting tab |
| 5 | **Bank accounts** (bank / UPI / cash / card / gateway, shown on documents) and **multiple office addresses** | Organization → Offices, Bank Accounts; Accounting → Accounts (balances & statements) |
| 6 | Organization tabs: Company, Offices, Bank Accounts, Header & Footer, **Templates** (Quote Email, Quote PDF, Proforma Invoice, Trip Voucher, Hotel Voucher, Hotel Booking Enquiry Email, Activity Voucher Email, Payment Receipt), **Supplier Payment Prefs**, **Customer Payment Prefs**, **T&C**, **Inc/Exclusions per service**, Taxes | `modules/organization/OrgSettings.jsx` |
| 7 | **Header & footer** (logo + text or letter-head image, accent colour, alignment) on every quote, voucher, invoice | Organization → Header & Footer (live preview) |
| 8 | Redesigned **quotation, trip voucher, hotel voucher, service vouchers, proforma invoice (CGST/SGST), payment receipt** — print / PDF / Word | `modules/documents/documents.js`, trip **Docs & Vouchers** tab |
| 9 | **HMVC** folder structure (server and client) | see below |
| 10 | **Vendor land packages**: buy a land package from a DMC in their currency (exchange rate), add your own flights, visa, insurance and margin. Quote type *Customised* or *Vendor land package + own flights*. | Services → Vendor Land Packages; quote builder |
| 11 | Dashboard in **Today / Overdue (Yesterday) / Next 7 days** format: follow-ups, bookings to confirm, incoming & outgoing payments, trips starting / ending, hotel check-ins, cab services | `modules/dashboard` |
| 12 | **Trips** and **Payments** like Sembark: stage tabs with counts, filters, rich rows, pagination; incoming / outgoing with Today / Overdue / Next 7 days / Upcoming / Unverified / Paid | `Trips`, `Accounting → Incoming / Outgoing Payments` |
| 13 | **Live trips with due payments** | Dashboard |
| 14 | Quote builder: hotel **pax/room**, rooms, AWEB / CWEB / CNB, nights; full fields for transport, activity (adults/children, slot), land package, flight (fares per adult/child/infant, baggage), train, visa (adult/child), passport, insurance, other | `modules/trips/QuoteBuilder.jsx` |
| 15 | "Reports" renamed **Sales Report** (`/app/accounting/sales-report`; old `/app/reports` redirects) | Accounting → Sales Report |
| 16 | **Hotel bookings board** fields: hotel & city, stay dates & nights, room type, meal plan, rooms × pax, extra beds, confirmation no., tag, booked via, quoted vs booked price, payable / paid, status; booking enquiry email & voucher | Bookings → Hotels Bookings |
| 17 | **Notifications** page (+ bell), **My Profile**, edit **Organization** | profile menu (👤) |
| 18 | **Accounting** section: payments, transactions, accounts, ledgers, sales report, quote vs booking | top bar → Accounting |
| 19 | **Services like Sembark**: Hotels (advanced filters, details, soldout / blackout, merge), **season-wise price upload** (same CSV grid as Sembark), price lists, **price calculator**, Transport services & prices, Travel activities & prices, cab types, visa, trains, passport, insurance, destinations, sources | top bar → Services |
| 20 | **Suppliers like Sembark**: tabs per service, contacts, bank details, payment preference, dues, bookings, accounting | top bar → Suppliers |
| — | Sembark-style UI: dark top navigation (Trips · Bookings · Accounting · trip search · Services · Suppliers · 🔔 · ⌂ · 👤) | `client/src/core/layout` |
| — | Super Admin: KPIs, sign-ups chart, most-active orgs, trials ending, organisation 360° (usage, users, features, plan & billing, notes, activity), **subscription invoices**, feature catalogue, super-admin users, audit | `/admin` |

### Season-wise prices (Sembark CSV format)

`Services → Hotel Prices → Upload Prices` (same for transport and activities). The screen shows the format with every column
explained and offers **Check file** (dry run) before saving and **Download template**. Highlights:

- `Season 1 (Ops)` = buying (booking) rates, `Season 1` = selling (quotation) rates, a season without `(Ops)` is used for both.
- Several date ranges per season (one per row), weekday rates with `(Sat,Sun)`.
- Hotels: `(2P)` / `(1P, 2P)` base occupancy, `(0EB) (12R) (1AWEB) (1CWEB) (1CNB)`, `[[CODE]]`, `Extras` rows for extra bed adult / child `(6-12)` / CNB.
  Hotels, room types and meal plans are **created automatically** (entry method "Uploaded").
- Transport: duty code, `A (short)`, `B`, service with `(C: Mon,Tue)` closing days / dates, distance, start time, duration, day schedule,
  cab types `Wagon R {{3 Pax}} {{4y+}} [[WRC]]` (cab types created automatically).
- Activities: name, service (ticket type), description, open / close, duration, slots, `Adult` / `Child (6-12)`.
- Uploading replaces a record's prices for the uploaded date window (tick "Keep existing prices" to add instead).

In quotes, the **selling** rate fills the price and the **buying (Ops)** rate fills the buying price; the buying price becomes the
booking's quoted cost and drives profit. Soldout dates block, blackout dates warn.

## Folder structure (HMVC)

```
server/src/
  server.js, app.js                 start-up and module mounting
  config/permissions.js             permission catalogue + default roles
  core/                             shared kernel
    db.js  http.js  auth.js  tenancy.js  notify.js  fields.js
  modules/<module>/                 one folder per module
    <module>.routes.js              routes + middleware (feature, permission)
    <module>.controller.js          request handling + validation
    <module>.model.js               SQL
  modules: auth meta admin organization notifications options lookup masters suppliers
           hotels transport activities rates (grid.js, rates.upload.js, rates.pricing.js)
           trips tasks quotes bookings finance reports
shared/                             used by API and React
  catalog.js   services, masters, dropdown defaults, statuses, date rules
  pricing.js   quote pricing, auto cost, payment-preference schedules
  templates.js document / email templates, default inclusions & T&C
client/src/
  core/        api.js auth.jsx ui.jsx forms.jsx styles.css layout/(AppShell.jsx nav.js)
  modules/     auth admin dashboard trips bookings accounting documents services suppliers
               organization profile notifications tasks
```

## Setup

Requirements: Node.js 18+, MySQL 8 (or `docker compose up -d`).

```bash
cd server
cp .env.example .env          # DB_PASSWORD, JWT_SECRET, SUPER_ADMIN_*
npm install
npm run setup-db              # DROPS and recreates all tables, loads seed data, creates the Super Admin
npm run dev                   # API on http://localhost:4000

cd ../client
npm install
npm run dev                   # http://localhost:5173
```

> This release changes the database schema. `npm run setup-db` drops existing tables. Run it on a fresh/test database.

For an existing database, run `cd server && npm run migrate-db` to create missing tables and add missing columns from the current schema without dropping existing tables or records.
Run `cd server && npm run seed-org-defaults` to backfill missing standard setup data for active organisations without replacing existing organisation data.
For empty service catalogs only, `cd server && npm run seed-demo-services` adds clearly labeled DEMO suppliers, hotels, transport, activities and sample rates for active organisations.
`cd server && npm run seed-demo-empty-tables` fills remaining empty setup/demo tables. Its sample invoices are void, sample notifications are read, and sample hotel closures are dated in 2099 so they do not affect current operations.

## Test the full flow

1. Register a company at `/register` → log in as Super Admin → **Organisations → Verify & approve** (choose the Professional plan).
   Approval creates roles, GST, starter inclusions/exclusions & T&C, 8 supplier + 3 customer payment preferences, a cash account and the head office.
2. Log in as the company owner → **Organization**: add a bank account, upload a logo, set the header/footer, look at the templates.
3. **Services → Hotel Prices → Upload Prices** → *Download template* → upload it (dates 2026–27). Do the same for transport and activities.
   Try **Calculate Price**.
4. **Suppliers → Add New**: a transport supplier and a DMC (Land package) with a payment preference.
5. **Trips → + Add Trip**: try *Visa* only (no dates asked), then a *Holiday package* with children's ages.
6. Open the package trip → **+ New Quote**: add hotel (pax/room, extra beds), cabs, activities — prices fill from the uploaded seasons.
   Generate the itinerary, load inclusions/exclusions, save. Share by WhatsApp / Email / PDF.
7. Try *Vendor land package + own flights*: add the DMC package (USD, exchange rate), flights with fares, margin.
8. **Convert** (customer payment preference fills the instalments) → **Bookings** tab / **Bookings → Hotels Bookings**:
   assign supplier, enter booked price, set Booked → supplier payables follow the payment preference. Send the hotel booking enquiry email.
9. **Accounting tab**: log a short receipt (e.g. 5,000 of 7,000) → the 2,000 moves to the next instalment.
   **Accounting → Transactions → Verify** (confirmation popup).
10. **Docs & Vouchers**: quotation, proforma invoice, trip / hotel / activity vouchers, receipts.
11. Check the **Dashboard** (Today / Overdue / Next 7 days, live trips with dues), **Notifications** and **Sales Report**.

## Status

All code passes syntax checks, ES-module bundling of server and client, and a lint pass for undefined names. The season-grid reader
and pricing were unit-checked with the three Sembark templates. **It has not yet been run against a live MySQL database**,
so expect a round of small fixes on first run.

Next: automated tests and hardening, email sending (SMTP) for quotes and booking enquiries, WhatsApp / email marketing, AI features.
