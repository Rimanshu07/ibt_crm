import { z } from 'zod';
import { transaction } from '../../core/db.js';
import { validate, badRequest, addDays, zText, zOptId } from '../../core/http.js';
import { notify } from '../../core/notify.js';
import { TRIP_STAGES, ENQUIRY_SERVICES, datesNeeded } from '../../../../shared/catalog.js';
import * as M from './trips.model.js';

const label = (k) => TRIP_STAGES.find((s) => s.key === k)?.label || k;
const tripLink = (id) => `/app/trips/${id}`;

export async function list(req, res) {
  await M.refreshStages(req.orgId);
  const r = await M.list(req, req.query);
  res.json({ data: r.rows, total: r.total, page: r.page, size: r.size, counts: r.counts });
}

const enquiryKeys = ENQUIRY_SERVICES.map((s) => s.key);
const tripSchema = z.object({
  services: z.array(z.enum(enquiryKeys)).min(1, 'Choose at least one service the client needs'),
  source_id: zOptId, ref_id: zText(60),
  destination_ids: z.array(z.coerce.number().int()).default([]),
  start_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional().transform((v) => v || null),
  nights: z.union([z.coerce.number().int().min(0).max(120), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
  adults: z.coerce.number().int().min(1, 'At least 1 adult').max(500),
  children_ages: z.array(z.coerce.number().int().min(0, 'Enter each child\'s age').max(17, 'Children are under 18')).default([]),
  infants: z.coerce.number().int().min(0).max(50).default(0),
  foc: z.coerce.number().int().min(0).default(0),
  guest_salutation: zText(10), guest_name: z.string().trim().min(2, 'Guest name is required').max(150),
  guest_phone: zText(40),
  guest_email: z.union([z.string().trim().toLowerCase().email('Enter a valid email'), z.literal('')]).optional().default(''),
  guest_city: zText(100),
  tags: z.array(z.string().max(60)).default([]), notes: zText(5000),
  sales_user_id: zOptId,
});

/** Dates are needed only when the chosen services need them (no dates for visa / passport only). */
function applyDateRules(b) {
  const need = datesNeeded(b.services);
  if (need === 'stay') {
    if (!b.start_date) throw badRequest('Choose the start date', { start_date: 'Required for this service' });
    if (b.nights === null) throw badRequest('Enter the number of nights', { nights: 'Required' });
  } else if (need === 'date') {
    if (!b.start_date) throw badRequest('Choose the travel date', { start_date: 'Required for this service' });
    if (b.nights === null) b.nights = 0;
  }
  b.end_date = b.start_date ? addDays(b.start_date, b.nights || 0) : null;
  b.trip_type = b.services.some((s) => ['package', 'land_package'].includes(s)) || (b.services.includes('hotel') && b.services.length > 1) ? 'package' : 'individual';
  return b;
}

export async function create(req, res) {
  const b = applyDateRules(validate(tripSchema, req.body));
  const currency = await M.orgCurrency(req.orgId);
  const trip = await transaction(async (c) => {
    const t = await M.create(c, req, b, currency);
    if (b.notes) await c.execute('INSERT INTO tasks (org_id, trip_id, body, is_actionable, created_by) VALUES (?,?,?,0,?)', [req.orgId, t.id, b.notes.slice(0, 1000), req.user.id]);
    await M.logTrip(c, req, t.id, 'created the enquiry');
    return t;
  });
  const owner = b.sales_user_id || req.user.id;
  if (owner !== req.user.id) {
    await notify(null, { orgId: req.orgId, userIds: [owner], type: 'trip.assigned', title: `New enquiry assigned: Trip ${trip.trip_no}`, body: `${b.guest_name} · ${b.services.join(', ')}`, link: tripLink(trip.id) });
  }
  res.status(201).json({ data: trip, message: `Enquiry created – Trip ${trip.trip_no}` });
}

export async function get(req, res) {
  await M.refreshStages(req.orgId);
  const t = await M.getTrip(req, req.params.id);
  res.json({ data: await M.detail(req, t) });
}

export async function update(req, res) {
  const t = await M.getTrip(req, req.params.id);
  const b = applyDateRules(validate(tripSchema, req.body));
  await M.update(t.id, b);
  await M.logTrip(null, req, t.id, 'updated trip details');
  res.json({ message: 'Trip saved' });
}

const MANUAL = ['new', 'in_progress', 'on_hold', 'dropped', 'cancelled'];
export async function stage(req, res) {
  const t = await M.getTrip(req, req.params.id);
  const b = validate(z.object({ stage: z.enum(MANUAL), reason: zText(255) }), req.body);
  if (b.stage === 'cancelled' && !['converted', 'on_trip'].includes(t.stage)) throw badRequest('Only converted trips can be cancelled. Use Drop for enquiries.');
  if (['new', 'in_progress', 'on_hold', 'dropped'].includes(b.stage) && ['converted', 'on_trip', 'past'].includes(t.stage)) throw badRequest('This trip is already converted. Cancel it instead.');
  if (['dropped', 'cancelled'].includes(b.stage) && !b.reason) throw badRequest('Give a reason', { reason: 'Required' });
  await M.setStage(t.id, b.stage, b.reason);
  await M.logTrip(null, req, t.id, `moved the trip from ${label(t.stage)} to ${label(b.stage)}${b.reason ? ` (${b.reason})` : ''}`);
  res.json({ message: `Trip moved to ${label(b.stage)}` });
}

export async function team(req, res) {
  const t = await M.getTrip(req, req.params.id);
  const b = validate(z.object({ sales_user_id: zOptId, resv_user_id: zOptId, ops_user_id: zOptId }), req.body);
  const staff = await M.staffIds(req.orgId);
  for (const v of Object.values(b)) if (v && !staff.has(v)) throw badRequest('Unknown user');
  await M.setTeam(t.id, b);
  await M.logTrip(null, req, t.id, 'updated the trip team');
  const fresh = [b.sales_user_id !== t.sales_user_id && b.sales_user_id, b.resv_user_id !== t.resv_user_id && b.resv_user_id, b.ops_user_id !== t.ops_user_id && b.ops_user_id]
    .filter((x) => x && x !== req.user.id);
  await notify(null, { orgId: req.orgId, userIds: fresh, type: 'trip.assigned', title: `You were added to Trip ${t.trip_no}`, body: t.guest_name, link: tripLink(t.id) });
  res.json({ message: 'Team saved' });
}

export async function travel(req, res) {
  const t = await M.getTrip(req, req.params.id);
  await M.setTravel(t.id, validate(z.object({ arrival_details: zText(255), departure_details: zText(255) }), req.body));
  res.json({ message: 'Saved' });
}

export async function logs(req, res) {
  const t = await M.getTrip(req, req.params.id);
  res.json({ data: await M.logs(t.id) });
}
