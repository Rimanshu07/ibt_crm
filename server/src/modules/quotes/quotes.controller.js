import { z } from 'zod';
import { query, one, transaction } from '../../core/db.js';
import { validate, notFound, badRequest, addDays, todayIso, r2, j, zText } from '../../core/http.js';
import { normalizeFields, refIdSets } from '../../core/fields.js';
import { notify } from '../../core/notify.js';
import { SERVICES, firstStatus } from '../../../../shared/catalog.js';
import { priceQuote, scheduleFromPref, defaultInstalments } from '../../../../shared/pricing.js';
import { getTrip, logTrip } from '../trips/trips.model.js';
import * as M from './quotes.model.js';

const money = (n, cur) => `${cur} ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function loadChecked(req, id) {
  const q = await M.load(req.orgId, id);
  if (!q) throw notFound('Quote');
  await getTrip(req, q.trip_id);
  return q;
}

export async function tripQuotes(req, res) {
  const t = await getTrip(req, req.params.id);
  const out = [];
  for (const r of await M.tripQuoteIds(t.id)) out.push(await M.load(req.orgId, r.id));
  res.json({ data: out });
}

export async function get(req, res) { res.json({ data: await loadChecked(req, Number(req.params.id)) }); }

export async function suggestions(req, res) {
  const t = await getTrip(req, req.params.id);
  res.json({ data: await M.suggestions(req.orgId, t) });
}

export async function price(req, res) {
  const b = validate(z.object({ service: z.string(), details: z.record(z.string(), z.any()), start_date: z.string().nullable().optional() }), req.body);
  if (!SERVICES[b.service]) throw notFound('Service');
  const date = M.serviceDate(b.start_date || null, b.details, b.service) || todayIso();
  res.json({ data: await M.lookupPrice(req.orgId, b.service, b.details, date) });
}

export async function itineraryDraft(req, res) {
  const b = validate(z.object({ nights: z.coerce.number().int().min(0).default(0), items: z.array(z.any()) }), req.body);
  const items = [];
  for (const it of b.items) items.push({ ...it, title: it.title || await M.itemTitle(req.orgId, it.service, it.details || {}) });
  res.json({ data: await M.draftItinerary(req.orgId, b.nights, items) });
}

export async function defaults(req, res) {
  const services = String(req.query.services || '').split(',').filter(Boolean);
  res.json({ data: await M.contentFor(req.orgId, services) });
}

const itemSchema = z.object({
  service: z.string(), details: z.record(z.string(), z.any()).default({}),
  cost: z.coerce.number().min(0, 'Price cannot be negative'),
  buy_cost: z.union([z.coerce.number().min(0), z.null(), z.literal('')]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
  selling_override: z.union([z.coerce.number().min(0), z.null(), z.literal('')]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
});

const quoteSchema = z.object({
  quote_type: z.enum(['custom', 'vendor_package']).default('custom'),
  start_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional().transform((v) => v || null),
  nights: z.union([z.coerce.number().int().min(0).max(120), z.null(), z.literal('')]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
  adults: z.coerce.number().int().min(1),
  children_ages: z.array(z.coerce.number().int().min(0).max(17)).default([]),
  infants: z.coerce.number().int().min(0).default(0),
  currency: z.string().length(3),
  pricing: z.object({
    strategy: z.enum(['overall', 'per_component']).default('overall'), markup_type: z.enum(['percent', 'amount']).default('percent'),
    markup_value: z.coerce.number().min(0).default(0), per_component: z.record(z.string(), z.coerce.number().min(0)).default({}),
    tax_name: z.string().max(30).default('Tax'), tax_rate: z.coerce.number().min(0).max(100).default(0),
    tax_basis: z.enum(['cost_markup', 'markup']).default('cost_markup'), rounding: z.coerce.number().int().min(1).default(1),
  }),
  items: z.array(itemSchema).min(1, 'Add at least one service'),
  itinerary: z.object({
    days: z.array(z.object({ title: z.string().max(200).default(''), description: z.string().max(10000).default('') })).default([]),
    inclusions: z.array(z.string().max(500)).default([]), exclusions: z.array(z.string().max(500)).default([]),
    notes: z.string().max(5000).default(''), tnc: z.string().max(30000).default(''),
  }).optional(),
  remarks_internal: zText(5000), remarks_customer: zText(5000),
});

async function cleanItems(req, items, startDate) {
  const out = []; const errors = {};
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const def = SERVICES[it.service];
    if (!def) { errors[`items.${i}`] = 'Unknown service'; continue; }
    if (def.feature && !req.features.includes(def.feature)) { errors[`items.${i}`] = `${def.label} is not enabled`; continue; }
    if (def.dates === 'stay' && !startDate) { errors[`items.${i}`] = `${def.label} needs the trip start date`; continue; }
    const sets = await refIdSets(req.orgId, def.quoteFields, [it.details]);
    const { data, errors: fe } = normalizeFields(def.quoteFields, it.details, { refIds: sets });
    for (const [k, m] of Object.entries(fe)) errors[`items.${i}.${k}`] = `${def.label}: ${def.quoteFields.find((f) => f.key === k)?.label} – ${m}`;
    if (Object.keys(fe).length) continue;
    out.push({ service: it.service, details: data, cost: it.cost, buy_cost: it.buy_cost, selling_override: it.selling_override,
      title: (await M.itemTitle(req.orgId, it.service, data)).slice(0, 255), day_no: data.day ?? null });
  }
  if (Object.keys(errors).length) throw badRequest(Object.values(errors)[0], errors);
  return out;
}

export async function create(req, res) {
  const t = await getTrip(req, req.params.id);
  if (['cancelled', 'past'].includes(t.stage)) throw badRequest('This trip is closed');
  const b = validate(quoteSchema, req.body);
  const items = await cleanItems(req, b.items, b.start_date);
  const priced = priceQuote(items, b.pricing, b.adults + b.children_ages.length);
  const quoteId = await transaction(async (c) => {
    const [[{ v }]] = await c.execute('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM quotes WHERE trip_id = ?', [t.id]);
    const [r] = await c.execute(
      `INSERT INTO quotes (org_id, trip_id, version, quote_type, start_date, nights, adults, children_ages, infants, currency, pricing,
         total_cost, total_buy, total_markup, total_tax, total_selling, itinerary, remarks_internal, remarks_customer, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.orgId, t.id, v, b.quote_type, b.start_date, b.nights, b.adults, JSON.stringify(b.children_ages), b.infants, b.currency, JSON.stringify(b.pricing),
        priced.total_cost, priced.total_buy, priced.total_markup, priced.total_tax, priced.total_selling,
        b.itinerary ? JSON.stringify(b.itinerary) : null, b.remarks_internal, b.remarks_customer, req.user.id]
    );
    let k = 0;
    for (const it of items) {
      await c.execute('INSERT INTO quote_items (quote_id, org_id, service, title, details, day_no, cost, buy_cost, selling_override, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [r.insertId, req.orgId, it.service, it.title, JSON.stringify(it.details), it.day_no, it.cost, it.buy_cost, it.selling_override, k += 1]);
    }
    const stage = ['new', 'in_progress', 'on_hold'].includes(t.stage) ? 'quote_given' : t.stage;
    await c.execute('UPDATE trips SET latest_quote_id = ?, stage = ?, package_amount = IF(converted_quote_id IS NULL, ?, package_amount) WHERE id = ?', [r.insertId, stage, priced.total_selling, t.id]);
    await logTrip(c, req, t.id, `gave quote v${v} with ${money(priced.total_selling, b.currency)}`);
    return r.insertId;
  });
  res.status(201).json({ data: { id: quoteId }, message: 'Quote saved' });
}

export async function updateItinerary(req, res) {
  const q = await loadChecked(req, Number(req.params.id));
  const b = validate(quoteSchema.pick({ itinerary: true, remarks_customer: true }), req.body);
  await query('UPDATE quotes SET itinerary = ?, remarks_customer = ? WHERE id = ?', [JSON.stringify(b.itinerary || {}), b.remarks_customer, q.id]);
  await logTrip(null, req, q.trip_id, `updated the itinerary of quote v${q.version}`);
  res.json({ message: 'Itinerary saved' });
}

/** Instalments the convert dialog suggests (from a customer payment preference). */
export async function schedule(req, res) {
  const q = await loadChecked(req, Number(req.params.id));
  const prefId = Number(req.query.pref_id) || null;
  const pref = prefId
    ? await one("SELECT parts FROM payment_preferences WHERE id = ? AND org_id = ? AND kind = 'customer'", [prefId, req.orgId])
    : await one("SELECT parts FROM payment_preferences WHERE org_id = ? AND kind = 'customer' AND is_default = 1 LIMIT 1", [req.orgId]);
  const dates = { booking_date: todayIso(), trip_start: q.start_date, checkin_date: q.start_date, trip_end: q.start_date ? addDays(q.start_date, q.nights || 0) : null, checkout_date: q.start_date ? addDays(q.start_date, q.nights || 0) : null };
  const rows = pref ? scheduleFromPref(Number(q.total_selling), j(pref.parts, []), dates) : defaultInstalments(Number(q.total_selling), q.start_date);
  res.json({ data: rows });
}

const convertSchema = z.object({
  quote_id: z.coerce.number().int().positive(),
  instalments: z.array(z.object({ amount: z.coerce.number().positive('Amount must be more than 0'), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date') })).min(1, 'Add at least one instalment'),
  verified: z.literal(true, { errorMap: () => ({ message: 'Confirm that you verified the details with the client' }) }),
  comments: zText(1000),
});

/** Convert: stage = Converted, one booking per quote line (per applicant for visa/passport), customer instalments. */
export async function convert(req, res) {
  const t = await getTrip(req, req.params.id);
  if (['converted', 'on_trip', 'past', 'cancelled'].includes(t.stage)) throw badRequest('This trip is already converted or closed');
  const b = validate(convertSchema, req.body);
  const q = await loadChecked(req, b.quote_id);
  if (q.trip_id !== t.id) throw badRequest('Quote belongs to another trip');
  const sum = r2(b.instalments.reduce((s, i) => s + i.amount, 0));
  if (Math.abs(sum - Number(q.total_selling)) > 0.5) throw badRequest(`Instalments add up to ${sum} but the package is ${q.total_selling}`, { instalments: 'Must equal the package price' });
  const customer = `${t.guest_salutation ? `${t.guest_salutation} ` : ''}${t.guest_name}`;
  await transaction(async (c) => {
    await c.execute(
      `UPDATE trips SET stage='converted', converted_quote_id=?, converted_at=NOW(), package_amount=?, currency=?, start_date=COALESCE(?, start_date), nights=COALESCE(?, nights),
         end_date=COALESCE(?, end_date), adults=?, resv_user_id = COALESCE(resv_user_id, ?), ops_user_id = COALESCE(ops_user_id, ?) WHERE id=?`,
      [q.id, q.total_selling, q.currency, q.start_date, q.nights, q.start_date ? addDays(q.start_date, q.nights || 0) : null, q.adults, req.user.id, req.user.id, t.id]
    );
    for (const it of q.items) {
      const def = SERVICES[it.service];
      const date = M.serviceDate(q.start_date, it.details, it.service);
      const end = date && ['hotel', 'land_package'].includes(it.service) ? addDays(date, Number(it.details.nights) || 1) : date;
      const people = Number(it.details.adults || 0) + Number(it.details.children || 0);
      const copies = def?.perGuest ? Math.max(people, 1) : 1;
      const buy = Number(it.buy_cost ?? it.cost);
      for (let n = 0; n < copies; n += 1) {
        await c.execute(
          `INSERT INTO bookings (org_id, trip_id, quote_item_id, service, title, service_date, end_date, details, status, supplier_id, quoted_cost, updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [req.orgId, t.id, it.id, it.service, copies > 1 ? `${it.title} (${n + 1}/${copies})` : it.title, date, end,
            JSON.stringify(def?.perGuest ? { ...it.details, adults: 1, children: 0 } : it.details), firstStatus(it.service),
            it.details.supplier_id || null, r2(buy / copies), req.user.id]
        );
      }
    }
    for (const ins of b.instalments) {
      await c.execute(`INSERT INTO instalments (org_id, trip_id, direction, party_type, party_name, amount, due_date, comments, created_by)
         VALUES (?,?, 'in', 'customer', ?,?,?,?,?)`, [req.orgId, t.id, customer, ins.amount, ins.due_date, b.comments || null, req.user.id]);
    }
    await logTrip(c, req, t.id, `converted the trip using quote v${q.version} (${money(q.total_selling, q.currency)})`);
    const team = [t.resv_user_id, t.ops_user_id, t.sales_user_id].filter((x) => x && x !== req.user.id);
    await notify(c, { orgId: req.orgId, userIds: team, type: 'trip.converted', title: `Trip ${t.trip_no} converted`, body: `${t.guest_name} · ${money(q.total_selling, q.currency)} · bookings are ready`, link: `/app/trips/${t.id}?tab=bookings` });
  });
  res.json({ message: 'Trip converted. Bookings and payment schedule are ready.' });
}
