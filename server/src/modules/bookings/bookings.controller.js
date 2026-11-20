import { z } from 'zod';
import { transaction } from '../../core/db.js';
import { ApiError, validate, notFound, badRequest, todayIso, addDays, zText } from '../../core/http.js';
import { hasPerm } from '../../core/auth.js';
import { normalizeFields } from '../../core/fields.js';
import { isDoneStatus, isClosedStatus } from '../../../../shared/catalog.js';
import { scheduleFromPref } from '../../../../shared/pricing.js';
import { getTrip, logTrip } from '../trips/trips.model.js';
import * as M from './bookings.model.js';

/** Service must exist, be on, and the user needs its booking permission. */
function guard(service, req) {
  const def = M.SERVICES[service];
  if (!def) throw notFound('Service');
  if (def.feature && !req.features.includes(def.feature)) throw new ApiError(403, 'FEATURE_DISABLED', `${def.label} is not enabled`);
  if (!hasPerm(req, def.perm) && !hasPerm(req, 'trips.view_all')) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission for these bookings');
  return def;
}

export async function board(req, res) {
  const service = String(req.params.service);
  guard(service, req);
  const r = await M.board(req, service, req.query);
  res.json({ data: r.rows, counts: r.counts });
}

export async function summary(req, res) { res.json({ data: await M.summary(req) }); }

export async function byTrip(req, res) {
  const t = await getTrip(req, req.params.id);
  const rows = await M.byTrip(t.id);
  res.json({ data: rows.filter((r) => !M.SERVICES[r.service]?.feature || req.features.includes(M.SERVICES[r.service].feature)) });
}

export async function get(req, res) {
  const b = await M.getFull(req.orgId, Number(req.params.id));
  if (!b) throw notFound('Booking');
  guard(b.service, req);
  await getTrip(req, b.trip_id);
  res.json({ data: b });
}

const updateSchema = z.object({
  status: z.string(),
  supplier_id: z.union([z.coerce.number().int().positive(), z.null(), z.literal('')]).optional().transform((v) => (v === '' ? null : v)),
  booked_amount: z.union([z.coerce.number().min(0), z.null(), z.literal('')]).optional().transform((v) => (v === '' ? null : v)),
  fields: z.record(z.string(), z.any()).default({}),
  notes: zText(500),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payables: z.array(z.object({ amount: z.coerce.number().positive(), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).optional(),
});

/** Status / supplier / price / details. Confirming builds the supplier payment schedule from the payment preference. */
async function updateBooking(req, bookingId, body) {
  const bk = await M.get(req.orgId, bookingId);
  if (!bk) throw notFound('Booking');
  const def = guard(bk.service, req);
  const trip = await getTrip(req, bk.trip_id);
  const b = validate(updateSchema, body);
  if (!def.statuses.some((s) => s.key === b.status)) throw badRequest('Unknown status', { status: 'Choose a status' });
  const { data: fields, errors } = normalizeFields(def.bookingFields, b.fields);
  if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields', errors);
  const details = { ...(typeof bk.details === 'string' ? JSON.parse(bk.details) : bk.details), ...fields };
  const supplierId = b.supplier_id === undefined ? bk.supplier_id : b.supplier_id;
  const supplier = supplierId ? await M.supplier(req.orgId, supplierId) : null;
  if (supplierId && !supplier) throw badRequest('Choose a supplier from the list', { supplier_id: 'Unknown supplier' });
  const amount = b.booked_amount === undefined ? bk.booked_amount : b.booked_amount;
  const nowDone = isDoneStatus(bk.service, b.status);
  const wasDone = isDoneStatus(bk.service, bk.status);
  const closing = isClosedStatus(bk.service, b.status);
  const serviceDate = b.service_date || (bk.service_date ? String(bk.service_date).slice(0, 10) : null);

  let party = null;
  if (supplier) party = { type: 'supplier', id: supplier.id, name: supplier.name, pref: supplier.payment_pref_id };
  else if (bk.service === 'hotel' && details.hotel_id) {
    const h = await M.hotel(req.orgId, details.hotel_id);
    if (h) party = { type: 'hotel', id: h.id, name: h.name, pref: h.payment_pref_id };
  }
  if (nowDone && !party) throw badRequest('Choose the supplier before confirming', { supplier_id: 'Required to confirm' });
  if (nowDone && (amount === null || amount === undefined)) throw badRequest('Enter the booked (buying) price before confirming', { booked_amount: 'Required to confirm' });

  await transaction(async (c) => {
    await c.execute('UPDATE bookings SET status=?, supplier_id=?, booked_amount=?, details=?, notes=?, service_date=?, locked_at=?, updated_by=? WHERE id=?',
      [b.status, supplierId || null, amount ?? null, JSON.stringify(details), b.notes || bk.notes || null, serviceDate, nowDone ? (bk.locked_at || new Date()) : null, req.user.id, bk.id]);
    const [[paid]] = await c.execute('SELECT COALESCE(SUM(paid_amount),0) AS p FROM instalments WHERE booking_id = ?', [bk.id]);
    if (closing || !nowDone) {
      await c.execute('DELETE FROM instalments WHERE booking_id = ? AND paid_amount = 0', [bk.id]);
    } else if (Number(paid.p) === 0) {
      await c.execute('DELETE FROM instalments WHERE booking_id = ?', [bk.id]);
      let plan = b.payables;
      if (!plan?.length) {
        const parts = await M.prefParts(req.orgId, party.pref, bk.service);
        const end = bk.end_date ? String(bk.end_date).slice(0, 10) : serviceDate;
        plan = parts
          ? scheduleFromPref(Number(amount), parts, { booking_date: todayIso(), checkin_date: serviceDate, checkout_date: end, trip_start: trip.start_date && String(trip.start_date).slice(0, 10), trip_end: trip.end_date && String(trip.end_date).slice(0, 10) })
          : [{ amount: Number(amount), due_date: serviceDate && addDays(serviceDate, -7) > todayIso() ? addDays(serviceDate, -7) : todayIso() }];
      }
      for (const p of plan) {
        await c.execute(`INSERT INTO instalments (org_id, trip_id, booking_id, direction, party_type, party_id, party_name, amount, due_date, created_by)
           VALUES (?,?,?, 'out', ?,?,?,?,?,?)`, [req.orgId, trip.id, bk.id, party.type, party.id, party.name, p.amount, p.due_date, req.user.id]);
      }
    }
    const st = def.statuses.find((s) => s.key === b.status)?.label;
    if (bk.status !== b.status) await logTrip(c, req, trip.id, `updated ${def.label.toLowerCase()} "${bk.title}" to ${st}`);
    if (supplierId && supplierId !== bk.supplier_id) await logTrip(c, req, trip.id, `assigned ${supplier.name} to "${bk.title}"`);
  });
  return wasDone || !nowDone ? 'Booking updated' : 'Booking confirmed. Supplier payment schedule created from the payment preference.';
}

export async function update(req, res) { res.json({ message: await updateBooking(req, Number(req.params.id), req.body) }); }

/** One supplier (and driver / vehicle) for many bookings — e.g. all cabs of a trip. */
export async function assign(req, res) {
  const b = validate(z.object({
    booking_ids: z.array(z.coerce.number().int()).min(1, 'Choose at least one service'), supplier_id: z.coerce.number().int().positive(),
    fields: z.record(z.string(), z.any()).default({}), prices: z.record(z.string(), z.coerce.number().min(0)).default({}), confirm: z.boolean().default(false),
  }), req.body);
  const rows = await M.idsOfOrg(req.orgId, b.booking_ids);
  if (rows.length !== b.booking_ids.length) throw notFound('Booking');
  for (const r of rows) {
    const def = guard(r.service, req);
    const status = b.confirm ? def.statuses.find((s) => s.done).key : def.statuses[1]?.key || def.statuses[0].key;
    await updateBooking(req, r.id, { status, supplier_id: b.supplier_id, booked_amount: b.prices[r.id] ?? undefined, fields: b.fields });
  }
  res.json({ message: `Supplier assigned to ${rows.length} service(s)` });
}
