import { z } from 'zod';
import { transaction, query } from '../../core/db.js';
import { ApiError, validate, badRequest, addDays, zText, zOptId, todayIso } from '../../core/http.js';
import { notify } from '../../core/notify.js';
import { TRIP_STAGES, ENQUIRY_SERVICES, datesNeeded } from '../../../../shared/catalog.js';
import * as M from './trips.model.js';
import { importDetailsFromInput, importDetailsFromTrip, normalizeImportRef, sameImportDetails } from './trips.import.js';

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
  destination_ids: z.union([z.null(), z.array(z.coerce.number().int())]).optional().transform((v) => v ?? []),
  start_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional().transform((v) => v || null),
  nights: z.union([z.literal(''), z.null(), z.coerce.number().int().min(0).max(120)]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
  adults: z.coerce.number().int().min(1, 'At least 1 adult').max(500),
  children_ages: z.array(z.coerce.number().int().min(1, 'Child age is 1 to 12 years').max(12, 'Child age is 1 to 12 years (12+ counts as adult)')).default([]),
  infants: z.coerce.number().int().min(0).max(50).default(0),
  foc: z.coerce.number().int().min(0).default(0),
  guest_salutation: zText(10), guest_name: z.string().trim().min(2, 'Guest name is required').max(150),
  guest_phone: zText(40),
  guest_email: z.union([z.null(), z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email')]).optional().transform((v) => v ?? ''),
  guest_city: zText(100),
  tags: z.union([z.null(), z.array(z.string().max(60))]).optional().transform((v) => v ?? []), notes: zText(5000),
  sales_user_id: zOptId,
});
const importTripSchema = tripSchema.extend({
  ref_id: z.string({ required_error: 'Reference ID is required' })
    .trim().min(1, 'Reference ID is required').max(60).transform((value) => value.toUpperCase()),
});
const refIdConflict = () => new ApiError(409, 'CONFLICT', 'Reference ID already exists in this organisation');

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

const notPast = (b) => { if (b.start_date && b.start_date < todayIso()) throw badRequest('The start date cannot be in the past', { start_date: 'Choose today or a later date' }); return b; };

export async function create(req, res) {
  const b = notPast(applyDateRules(validate(tripSchema, req.body)));
  const currency = await M.orgCurrency(req.orgId);
  let trip;
  try {
    trip = await transaction(async (c) => {
      const t = await M.create(c, req, b, currency);
      if (b.notes) await c.execute('INSERT INTO tasks (org_id, trip_id, body, is_actionable, created_by) VALUES (?,?,?,0,?)', [req.orgId, t.id, b.notes.slice(0, 1000), req.user.id]);
      await M.logTrip(c, req, t.id, 'created the enquiry');
      return t;
    });
  } catch (e) {
    if (M.isRefIdConflict(e)) throw refIdConflict();
    throw e;
  }
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
  try { await M.update(t.id, b); } catch (e) {
    if (M.isRefIdConflict(e)) throw refIdConflict();
    throw e;
  }
  await M.logTrip(null, req, t.id, 'updated trip details');
  res.json({ message: 'Trip saved' });
}

const MANUAL = ['new', 'in_progress', 'on_hold', 'dropped', 'cancelled'];
export async function stage(req, res) {
  const t = await M.getTrip(req, req.params.id);
  const b = validate(z.object({
    stage: z.enum(MANUAL),
    reason: zText(255),
    comments: z.string().max(1000).optional(),
    remind_at: z.union([z.string(), z.null()]).optional(),
  }), req.body);
  if (['dropped', 'cancelled'].includes(b.stage) && !b.reason) throw badRequest('Give a reason', { reason: 'Required' });
  const finalReason = [b.reason, b.comments?.trim()].filter(Boolean).join(' — ').slice(0, 255) || null;
  await M.setStage(t.id, b.stage, finalReason);
  if (b.stage === 'cancelled' && b.remind_at) {
    await query(
      'INSERT INTO tasks (org_id, trip_id, body, is_actionable, due_at, assignee_id, created_by) VALUES (?,?,?,1,?,?,?)',
      [req.orgId, t.id, `Cancellation follow-up: ${b.reason}${b.comments ? ` (${b.comments})` : ''}`.slice(0, 1000), b.remind_at, t.sales_user_id || req.user.id, req.user.id]
    );
  }
  const actionMsg = t.stage === 'cancelled' && b.stage !== 'cancelled'
    ? `reopened the query and moved to ${label(b.stage)}`
    : `moved the trip from ${label(t.stage)} to ${label(b.stage)}${finalReason ? ` (${finalReason})` : ''}`;
  await M.logTrip(null, req, t.id, actionMsg);
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

/** "Existing guest?" check on the new trip form (by phone or email). */
export async function guestCheck(req, res) {
  const phone = String(req.query.phone || '').replace(/\D/g, '').slice(-10);
  const email = String(req.query.email || '').trim().toLowerCase();
  if (phone.length < 6 && !email.includes('@')) return res.json({ data: [] });
  const where = []; const params = [req.orgId];
  if (phone.length >= 6) { where.push("REPLACE(REPLACE(REPLACE(t.guest_phone, ' ', ''), '-', ''), '+', '') LIKE ?"); params.push(`%${phone}`); }
  if (email.includes('@')) { where.push('LOWER(t.guest_email) = ?'); params.push(email); }
  const rows = await query(
    `SELECT t.id, t.trip_no, t.guest_salutation, t.guest_name, t.guest_phone, t.guest_email, t.guest_city, t.stage, t.start_date, t.created_at
     FROM trips t WHERE t.org_id = ? AND (${where.join(' OR ')}) ORDER BY t.id DESC LIMIT 10`, params);
  res.json({ data: rows });
}

/** Upload via CSV: the browser parses the sheet; each row is checked like the form. */
export async function importTrips(req, res) {
  const { rows } = validate(z.object({ rows: z.array(z.record(z.string(), z.any())).min(1, 'The file has no rows').max(500, 'Up to 500 rows at a time') }), req.body);
  const currency = await M.orgCurrency(req.orgId);
  const lockKey = `trip_import_${req.orgId}`;
  await query('SELECT GET_LOCK(?, 30)', [lockKey]);
  try {
    const created = []; const skipped = []; const conflicts = []; const invalid = [];
    const seen = new Map();
    for (const [i, raw] of rows.entries()) {
      const row = i + 2;
      const rawRef = raw?.ref_id !== undefined && raw?.ref_id !== null ? String(raw.ref_id).trim() : '';
      if (!rawRef) {
        invalid.push({ row, ref_id: '', reason: 'Reference ID (ref_id) is required' });
        continue;
      }
      let b;
      try {
        b = notPast(applyDateRules(validate(importTripSchema, { ...raw, ref_id: rawRef.toUpperCase() })));
      } catch (e) {
        invalid.push({ row, ref_id: normalizeImportRef(raw.ref_id), reason: e.message });
        continue;
      }

      const details = importDetailsFromInput(b);
      const addExistingResult = (record) => {
        const same = sameImportDetails(details, record.details);
        const entry = {
          row, ref_id: b.ref_id,
          reason: same ? 'Reference already exists with the same imported details.'
            : 'Reference ID already exists, but imported details differ. The existing trip was not changed.',
          trip_id: record.id, trip_no: record.trip_no,
        };
        (same ? skipped : conflicts).push(entry);
      };

      let record = seen.get(b.ref_id);
      if (!record) {
        const existing = await M.findByImportRef(req.orgId, b.ref_id);
        if (existing) {
          record = { id: existing.id, trip_no: existing.trip_no, details: importDetailsFromTrip(existing) };
          seen.set(b.ref_id, record);
        }
      }
      if (record) {
        addExistingResult(record);
        continue;
      }

      let trip;
      try {
        trip = await transaction(async (c) => {
          const newTrip = await M.create(c, req, b, currency);
          await M.logTrip(c, req, newTrip.id, 'created the enquiry (CSV upload)');
          return newTrip;
        });
      } catch (e) {
        if (!M.isRefIdConflict(e)) throw e;
        const existing = await M.findByImportRef(req.orgId, b.ref_id);
        if (!existing) throw e;
        record = { id: existing.id, trip_no: existing.trip_no, details: importDetailsFromTrip(existing) };
        seen.set(b.ref_id, record);
        addExistingResult(record);
        continue;
      }
      record = { id: trip.id, trip_no: trip.trip_no, details };
      seen.set(b.ref_id, record);
      created.push({ row, ref_id: b.ref_id, trip_id: trip.id, trip_no: trip.trip_no });
    }
    const counts = { created: created.length, skipped: skipped.length, conflicts: conflicts.length, invalid: invalid.length };
    res.status(200).json({
      data: { created, skipped, conflicts, invalid, counts },
      message: `${counts.created} created, ${counts.skipped} skipped, ${counts.conflicts} conflicts, ${counts.invalid} invalid`,
    });
  } finally {
    await query('SELECT RELEASE_LOCK(?)', [lockKey]);
  }
}
