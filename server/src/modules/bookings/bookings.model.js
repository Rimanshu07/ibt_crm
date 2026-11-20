import { pool, query, one } from '../../core/db.js';
import { j } from '../../core/http.js';
import { scopeFilter } from '../trips/trips.model.js';
import { SERVICES, isDoneStatus, isClosedStatus } from '../../../../shared/catalog.js';

export const SELECT = `
  SELECT b.*, t.trip_no, t.guest_salutation, t.guest_name, t.guest_phone, t.start_date AS trip_start, t.end_date AS trip_end, t.adults AS trip_adults,
         t.children_ages AS trip_children, t.stage AS trip_stage, t.resv_user_id, t.ops_user_id,
         s.name AS supplier_name, s.phone AS supplier_phone, s.email AS supplier_email,
         h.name AS hotel_name, h.city AS hotel_city, h.phone AS hotel_phone, h.email AS hotel_email, h.address AS hotel_address,
         (SELECT COALESCE(SUM(i.amount),0) FROM instalments i WHERE i.booking_id = b.id) AS payable,
         (SELECT COALESCE(SUM(i.paid_amount),0) FROM instalments i WHERE i.booking_id = b.id) AS paid,
         u.name AS updated_by_name
  FROM bookings b JOIN trips t ON t.id = b.trip_id LEFT JOIN suppliers s ON s.id = b.supplier_id
  LEFT JOIN hotels h ON b.service = 'hotel' AND h.id = JSON_UNQUOTE(JSON_EXTRACT(b.details, '$.hotel_id'))
  LEFT JOIN users u ON u.id = b.updated_by`;

export const shape = (r) => ({ ...r, details: j(r.details, {}), trip_children: j(r.trip_children, []) });

const WHEN = {
  today: 'b.service_date = CURDATE()',
  next7: 'b.service_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)',
  upcoming: 'b.service_date >= CURDATE()',
  past: 'b.service_date < CURDATE()',
  nodate: 'b.service_date IS NULL',
};

export async function board(req, service, f) {
  const scope = scopeFilter(req);
  const where = [`b.org_id = ? AND b.service = ?${scope.sql}`, "t.stage IN ('converted','on_trip','past')"];
  const params = [req.orgId, service, ...scope.params];
  if (WHEN[f.when]) where.push(WHEN[f.when]);
  if (f.from) { where.push('b.service_date >= ?'); params.push(f.from); }
  if (f.to) { where.push('b.service_date <= ?'); params.push(f.to); }
  if (f.supplier_id) { where.push('b.supplier_id = ?'); params.push(Number(f.supplier_id)); }
  if (f.hotel_id) { where.push("JSON_EXTRACT(b.details, '$.hotel_id') = ?"); params.push(Number(f.hotel_id)); }
  if (f.q) { const q = `%${f.q}%`; where.push('(t.guest_name LIKE ? OR b.title LIKE ? OR CAST(t.trip_no AS CHAR) LIKE ? OR s.name LIKE ?)'); params.push(q, q, q, q); }
  const baseWhere = [...where]; const baseParams = [...params];
  if (f.status) { where.push('b.status = ?'); params.push(f.status); }
  const order = f.when === 'past' ? 'b.service_date DESC, b.id' : 'b.service_date IS NULL, b.service_date, t.trip_no, b.id';
  const rows = await query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 1000`, params);
  const [counts] = await pool.query(
    `SELECT b.status, COUNT(*) AS n FROM bookings b JOIN trips t ON t.id = b.trip_id LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE ${baseWhere.join(' AND ')} GROUP BY b.status`, baseParams
  );
  return { rows: rows.map(shape), counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) };
}

/** Open (not done, not closed) upcoming bookings per service — for menu badges. */
export async function summary(req) {
  const scope = scopeFilter(req);
  const rows = await query(
    `SELECT b.service, b.status, COUNT(*) AS n FROM bookings b JOIN trips t ON t.id = b.trip_id
     WHERE b.org_id = ?${scope.sql} AND t.stage IN ('converted','on_trip') AND (b.service_date IS NULL OR b.service_date >= CURDATE())
     GROUP BY b.service, b.status`, [req.orgId, ...scope.params]
  );
  const out = {};
  for (const r of rows) {
    const s = (out[r.service] = out[r.service] || { open: 0, done: 0 });
    if (isClosedStatus(r.service, r.status)) continue;
    if (isDoneStatus(r.service, r.status)) s.done += Number(r.n); else s.open += Number(r.n);
  }
  return out;
}

export const byTrip = async (tripId) => (await query(`${SELECT} WHERE b.trip_id = ? ORDER BY b.service_date IS NULL, b.service_date, b.id`, [tripId])).map(shape);
export const get = (orgId, id) => one('SELECT * FROM bookings WHERE id = ? AND org_id = ?', [id, orgId]);
export const getFull = async (orgId, id) => { const r = await one(`${SELECT} WHERE b.id = ? AND b.org_id = ?`, [id, orgId]); return r ? shape(r) : null; };
export const supplier = (orgId, id) => one('SELECT id, name, payment_pref_id FROM suppliers WHERE id = ? AND org_id = ?', [id, orgId]);
export const hotel = (orgId, id) => one('SELECT id, name, payment_pref_id, supplier_id FROM hotels WHERE id = ? AND org_id = ?', [id, orgId]);
export async function prefParts(orgId, prefId, service) {
  const p = prefId ? await one('SELECT parts FROM payment_preferences WHERE id = ? AND org_id = ?', [prefId, orgId]) : null;
  const d = p || await one("SELECT parts FROM payment_preferences WHERE org_id = ? AND kind = 'supplier' AND service IN (?, 'all') AND is_default = 1 ORDER BY service = 'all' LIMIT 1", [orgId, service]);
  return d ? j(d.parts, []) : null;
}
export const idsOfOrg = async (orgId, ids) => { const [rows] = await pool.query('SELECT id, service FROM bookings WHERE org_id = ? AND id IN (?)', [orgId, ids]); return rows; };
export { SERVICES };
