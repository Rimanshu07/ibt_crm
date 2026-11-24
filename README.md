# IBT Travels CRM

Multi-tenant SaaS travel CRM — **React (Vite), Node.js, Express, MySQL** — built on the Sembark workflow and extended for
individual services, vendor land packages, trains, passport and travel insurance.

Flow: **enquiry → quote → share → convert → bookings → vouchers → payments → accounts → sales report**.

## v3.1 – fixes from testing

**Upgrading from v3:** run `server/db/migrations/2026-11-v3.1-fixes.sql`, then open each listed quote with **Edit quote** and Save once.

| # | Fix | Where |
|---|---|---|
| 1 | Validation messages appear **in red under the field** (red border too); quote-form problems appear under the line they belong to. | `core/ui.jsx` (`Field`, `useForm`), `QuoteBuilder.jsx` |
| 2 | Remove / Delete are always **visible red buttons**. | `styles.css` (`.btn.remove`) |
| 3 | **Accommodation Summary** table (expected vs configured adults/children, rooms, status) + one "Misconfiguration in Hotel Services" box; same for transport (travellers, cabs, seats). | `quote/common.jsx` (`SummaryTable`) |
| 4 | Everything follows the **organisation's timezone**: each DB session is set to it (NOW(), CURDATE(), created-at times), the server's "today" and the browser's "today" use it. | `core/context.js`, `core/db.js`, `core/api.js` |
| 5 | **Selling ₹0 bug**: an empty "fixed selling price" was saved as 0, so land package / extra lines got no markup. Empty now stays empty everywhere (same fix applied to every optional number). | all `*.controller.js`, `quotes.items.js` |
| 6 | Document **Close** button works. Vendor (DMC) names never appear on quotes, vouchers or invoices; land-package hotels are listed on the trip voucher and a package voucher. | `documents.js` |
| 7 | Quote card: highlighted **Edit quote** (same version) and **Duplicate as new version**, separate from sharing. | `QuotesTab.jsx`, `PUT /quotes/:id` |
| 8 | Child ages **1–12** (dropdown). | `forms.jsx`, trips validation |
| 9 | **Light / dark theme** in My Profile → Appearance (and the profile menu). | `core/theme.js`, `styles.css` |
| 10 | Editing an enquiry no longer fails with "Expected string, received null". | `core/http.js` (`zText`) |
| 11 | **One price for all transport** (total + buying), cab rows kept for operations. | `quote/TransportSection.jsx` |
| 12 | Grouped menus like Sembark (Hotels / Transport / Activities / Repository / More services), service emoji removed. | `layout/AppShell.jsx`, `nav.js` |
| 13 | Flight section: **MakeMyTrip / Goibibo / Skyscanner** buttons open the search pre-filled; **Paste flight details** reads airline, flight no., times, stops and fare from copied text – tick what to fill. | `shared/flightSearch.js`, `quote/OtherSections.jsx` |

## v3 – Sembark-style quote form & vendor land packages

**Upgrading a v2 database:** run `server/db/migrations/2026-11-v3-quote-form-vendor-packages.sql`, then `npm install` in `client/` (adds `pdfjs-dist` for reading vendor PDFs and `xlsx` for Excel uploads).

| Area | What changed | Where |
|---|---|---|
| Vendor land package | Upload the vendor's PDF **or paste their email**; hotels, transport, day-wise itinerary, inclusions/exclusions, paid activities and the options/prices (per person or total, any currency) are read into an editable draft. Pick the option, add your flights/visa/extras, apply markup. The quotation goes out in **your** header/footer; the original PDF/email is **kept for records** on the trip (Docs tab) and on the vendor (**Packages received** tab). Vendors are listed under **Suppliers → Land Package Vendors (DMC)**. | `quote/LandPackageSection.jsx`, `shared/vendorPackage.js`, `shared/pdfText.js`, `core/files.js`, `modules/attachments` |
| Hotels in quote | Stay-night chips "1st N (Mon 30 Nov)", hotel → its own meal plans & room types, pax/room, rooms, **AWEB / CWEB / CNB** (one shared extra bed per room, limits from the hotel's "allowed extra beds"), comp. child. **Per-night price table** (Room × rooms, AWEB, CWEB, CNB, Rate, Given) and **Given Price popup** per night with "apply to all nights". Next Night (disabled when all nights are filled), Duplicate, Add Similar, Remove, "same for all nights". Night-wise **accommodation summary** (missing / short / complete). Special inclusions in hotels. | `quote/HotelsSection.jsx`, `POST /rates/hotel/breakdown` |
| Transport & activities | Day chips with dates; location → service type → route; start time, duration, pick-up point; cabs **Type × Qty × per-day price** with Given popup; **seat-shortage warning** ("2 seats missing"); Apply to all days, Next Day, Similar, Duplicate, Remove; same cab type for all. Activities with ticket types × qty × price. Extras/sightseeing in transportation. | `quote/TransportSection.jsx` |
| Flights, visa, others | Round trip / one way / multi-city legs, cost & selling per adult/child/infant. Visa country → visa → type with info card, PAX × rate / given, **currency + exchange rate**. Train / passport / insurance. "Any extra services" for every service + "Any other special service for this trip". | `quote/OtherSections.jsx` |
| Service sections | "Services in this quote" chips add/remove whole sections (the service booking sections are back). Basic details strip shows **N Nights, N+1 Days**; past start dates are blocked. | `trips/QuoteBuilder.jsx` |
| One calculator | Browser and server share `shared/quoteItems.js`; the server **re-computes every price** on save. On convert: hotels → one booking per continuous stay, transport → per day per cab, activities → per day, visa → per applicant. | `shared/quoteItems.js`, `modules/quotes/quotes.items.js` |
| Reports & menus | **Trips** menu: Sales Reports, Quote Bookings Diff, **Trip Check In/Out Report** (month/week/day, received/due, CSV), Hotel Check-In/Outs, Operational Bookings. Operations has a **12-day calendar grid** (counts "new + continuing = total") and list view. | `accounting/CheckInOut.jsx`, `bookings/Operations.jsx`, `GET /reports/check-in-out` |
| Masters | Organization → **Dropdown Lists** (meal plans, room types, cab types…). Hotel room types have **Allowed extra bed(s)**. Transport **route form** (start/end city, pick-up & drop points, several services, closed days/dates) and listing grouped by route. Activities: **tourist age & group configuration**, closed days/dates. Visa master has a currency. **Add prices manually** or upload **CSV / Excel** price sheets. | `organization/OrgSettings.jsx`, `services/*` |
| Trip form | Phone with country code, **existing guest check**, searchable destinations, "N Nights, N+1 Days", Total FOC, no past dates, **Upload Via CSV/Excel**. | `trips/common.jsx`, `trips/TripImport.jsx`, `POST /trips/import`, `GET /trips/guest-check` |

## What's in this release (v2)

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
npm run migrate-db            # Creates any missing tables in an existing database; preserves existing data
npm run dev                   # API on http://localhost:4000

cd ../client
npm install
npm run dev                   # http://localhost:5173
```

> This release changes the database schema. `npm run setup-db` drops existing tables. Run it on a fresh/test database.
> To add tables missing from an existing database without dropping tables or data, run `npm run migrate-db` from `server/`.

### Trip import reference IDs

CSV/Excel trip imports require `ref_id`; references are trimmed and uppercased, and are unique within each organisation. Re-importing identical rows skips them; rows with an existing reference but changed details are reported as conflicts and do not update the existing trip. Manual trip creation still allows an empty reference.

On an existing database, run `npm run migrate-trip-ref-id` from `server/` before deploying the importer. The migration first reports duplicate references grouped by organisation and stops without changing trip data or the schema if any are found. Resolve those references manually and rerun the migration. Fresh databases receive the generated normalized column and unique index through `schema.sql`.

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
and pricing were unit-checked with the three Sembark templates. v3: the vendor package reader was tested on the Kerala (email-style PDF
and pasted email) and Sri Lanka (proposal PDF) samples; the shared quote calculator and the server's line validation, pricing,
booking split and itinerary draft were tested with a stubbed database. **It has not yet been run against a live MySQL database**,
so expect a round of small fixes on first run.

Next: automated tests and hardening, email sending (SMTP) for quotes and booking enquiries, WhatsApp / email marketing, AI features.


npm --prefix ibt-travels-crm/server run migrate-db 
(Migration Script Command)


npm --prefix ibt-travels-crm/server run setup-db
(Fresh Setup Script)