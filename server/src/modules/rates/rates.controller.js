import { z } from 'zod';
import { validate, notFound, badRequest, zDate } from '../../core/http.js';
import { audit } from '../../core/tenancy.js';
import { TEMPLATES } from './grid.js';
import { upload } from './rates.upload.js';
import * as M from './rates.model.js';
import { hotelPrice, transportPrice, activityPrice } from './rates.pricing.js';

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

/** Price calculator (Hotel Prices → Calculate Price). */
export async function calculate(req, res) {
  const s = service(req);
  const b = validate(z.object({ date: zDate, details: z.record(z.string(), z.any()) }), req.body);
  const fn = { hotel: hotelPrice, transport: transportPrice, activity: activityPrice }[s];
  const out = await fn(req.orgId, b.details, b.date);
  if (out.cost === null && !out.note) throw badRequest('Could not calculate');
  res.json({ data: out });
}
