import { z } from 'zod';
import { validate, notFound, badRequest, zDate } from '../../core/http.js';
import { audit } from '../../core/tenancy.js';
import { TEMPLATES } from './grid.js';
import { upload } from './rates.upload.js';
import * as M from './rates.model.js';
import { hotelPrice, transportPrice, activityPrice, breakdown as rateBreakdown } from './rates.pricing.js';
import { insertMany } from './rates.model.js';
import { transaction, one } from '../../core/db.js';

const SERVICES = ['hotel', 'transport', 'activity'];
const service = (req) => { if (!SERVICES.includes(req.params.service)) throw notFound('Price list'); return req.params.service; };

export async function list(req, res) {
  const s = service(req);
  const r = await M.list(req.orgId, s, req.query);
  res.json({ data: r.rows, total: r.total, page: r.page });
}

export async function template(req, res) {
  const s = service(req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${s}-prices-template.csv"`);
  res.send(TEMPLATES[s]);
}

export async function doUpload(req, res) {
  const s = service(req);
  const b = validate(z.object({
    currency: z.string().length(3),
    files: z.array(z.object({ name: z.string().max(200).default('prices.csv'), text: z.string().min(10, 'The file is empty').max(8_000_000) })).min(1, 'Choose a CSV file'),
    dry_run: z.boolean().default(false),
    append: z.boolean().default(false),
  }), req.body);
  const result = await upload({ orgId: req.orgId, userId: req.user.id, service: s, currency: b.currency, files: b.files, dryRun: b.dry_run, append: b.append });
  if (!b.dry_run && result.ok) await audit(req, 'rates.uploaded', s, result.upload_id, { rates: result.summary.rates });
  const msg = b.dry_run
    ? `Checked: ${result.summary.rates} prices for ${result.summary.records.length} record(s)${result.errors.length ? `, ${result.errors.length} problem(s)` : ''}.`
    : result.ok ? `Uploaded ${result.summary.rates} prices · ${result.summary.created} new, ${result.summary.updated} updated.` : 'Nothing was saved.';
  res.json({ data: result, message: msg });
}

export async function uploads(req, res) { res.json({ data: await M.uploads(req.orgId, service(req)) }); }

export async function remove(req, res) {
  service(req);
  const { ids } = validate(z.object({ ids: z.array(z.coerce.number().int()).min(1, 'Choose prices to delete') }), req.body);
  await M.remove(req.orgId, ids);
  res.json({ message: `${ids.length} price(s) deleted` });
}

export async function updateRate(req, res) {
  const s = service(req);
  const id = Number(req.params.id);
  const existing = await M.getOne(req.orgId, id);
  if (!existing || existing.service !== s) throw notFound('Price record not found');
  const b = validate(z.object({
    price: z.coerce.number().min(0, 'Enter a valid price'),
    season: z.string().max(80).optional().default(existing.season || 'Manual'),
    date_from: zDate.optional().default(existing.date_from),
    date_to: zDate.optional().default(existing.date_to),
    weekdays: z.string().max(40).nullable().optional().default(existing.weekdays),
    rate_type: z.enum(['both', 'sales', 'ops']).optional().default(existing.rate_type),
  }), req.body);
  if (b.date_to < b.date_from) throw badRequest('The end date is before the start date');
  await M.update(req.orgId, id, b);
  await audit(req, 'rates.update', s, id, { old_price: existing.price, new_price: b.price });
  res.json({ message: 'Price updated successfully' });
}

/** Price calculator (Hotel Prices → Calculate Price). */
export async function calculate(req, res) {
  const s = service(req);
  const b = validate(z.object({ date: zDate, details: z.record(z.string(), z.any()) }), req.body);
  const fn = { hotel: hotelPrice, transport: transportPrice, activity: activityPrice }[s];
  const out = await fn(req.orgId, b.details, b.date);
  if (out.cost === null && !out.note) throw badRequest('Could not calculate');
  res.json({ data: out });
}

/** Per-date system rates for the quote form price popups. */
export async function breakdown(req, res) {
  const s = service(req);
  const b = validate(z.object({ details: z.record(z.string(), z.any()), dates: z.array(zDate).max(120) }), req.body);
  res.json({ data: await rateBreakdown(req.orgId, s, b.details, b.dates) });
}

const REF = { hotel: 'SELECT id FROM hotels WHERE id = ? AND org_id = ?', transport: 'SELECT id FROM transport_services WHERE id = ? AND org_id = ?', activity: 'SELECT id FROM activity_services WHERE id = ? AND org_id = ?' };

/** Manual data feed: add prices from a form (same rules as the sheet upload). */
export async function manual(req, res) {
  const s = service(req);
  const b = validate(z.object({
    currency: z.string().length(3),
    rows: z.array(z.object({
      ref_id: z.coerce.number().int().positive('Choose the record'),
      variant: z.string().trim().max(150).default(''), meal_plan: z.string().trim().max(20).default(''),
      occupancy: z.union([z.null(), z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => v || null),
      kind: z.enum(['base', 'aweb', 'cweb', 'cnb']).default('base'),
      season: z.string().max(80).default('Manual'),
      date_from: zDate, date_to: zDate, weekdays: z.string().max(40).optional().default(''),
      sales: z.union([z.literal(''), z.null(), z.coerce.number().min(0)]).optional(),
      ops: z.union([z.literal(''), z.null(), z.coerce.number().min(0)]).optional(),
    })).min(1, 'Add at least one price'),
  }), req.body);
  const rows = [];
  for (const [i, r] of b.rows.entries()) {
    if (r.date_to < r.date_from) throw badRequest(`Row ${i + 1}: the end date is before the start date`);
    if (!(await one(REF[s], [r.ref_id, req.orgId]))) throw badRequest(`Row ${i + 1}: record not found`);
    const base = { org_id: req.orgId, service: s, ref_id: r.ref_id, variant: r.kind === 'base' ? r.variant : '', meal_plan: r.meal_plan.toUpperCase(), occupancy: r.occupancy,
      kind: r.kind, season: r.season, date_from: r.date_from, date_to: r.date_to, weekdays: r.weekdays || null, currency: b.currency, created_by: req.user.id };
    const hasS = r.sales !== '' && r.sales !== null && r.sales !== undefined;
    const hasO = r.ops !== '' && r.ops !== null && r.ops !== undefined;
    if (!hasS && !hasO) throw badRequest(`Row ${i + 1}: enter a selling or buying price`);
    if (hasS && hasO && Number(r.sales) !== Number(r.ops)) { rows.push({ ...base, rate_type: 'sales', price: r.sales }, { ...base, rate_type: 'ops', price: r.ops }); }
    else rows.push({ ...base, rate_type: 'both', price: hasS ? r.sales : r.ops });
  }
  await transaction((c) => insertMany(c, rows));
  await audit(req, 'rates.manual', s, null, { rows: rows.length });
  res.status(201).json({ message: `${rows.length} price(s) added` });
}
