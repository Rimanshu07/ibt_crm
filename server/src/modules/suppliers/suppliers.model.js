import { pool, query, one } from '../../core/db.js';
import { j } from '../../core/http.js';

const shape = (s) => s && ({ ...s, services: j(s.services, []), contacts: j(s.contacts, []), bank_accounts: j(s.bank_accounts, []), cab_types: j(s.cab_types, []) });

export async function list(orgId, f) {
  const where = ['s.org_id = ?']; const params = [orgId];
  if (f.service) { where.push('JSON_CONTAINS(s.services, ?)'); params.push(JSON.stringify(f.service)); }
  if (f.status !== 'all') where.push(f.status === 'disabled' ? 's.is_active = 0' : 's.is_active = 1');
  if (f.q) { where.push('(s.name LIKE ? OR s.city LIKE ? OR s.phone LIKE ? OR s.email LIKE ? OR JSON_SEARCH(s.contacts, \'one\', ?) IS NOT NULL)'); params.push(...Array(4).fill(`%${f.q}%`), `%${f.q}%`); }
  if (f.city) { where.push('s.city = ?'); params.push(f.city); }
  const page = Math.max(Number(f.page) || 1, 1); const size = Math.min(Number(f.size) || 25, 500);
  const [rows] = await pool.query(
    `SELECT SQL_CALC_FOUND_ROWS s.*, pp.name AS payment_pref,
       (SELECT COALESCE(SUM(i.amount - i.paid_amount), 0) FROM instalments i WHERE i.org_id = s.org_id AND i.party_type = 'supplier' AND i.party_id = s.id) AS balance,
       (SELECT COALESCE(SUM(i.amount - i.paid_amount), 0) FROM instalments i WHERE i.org_id = s.org_id AND i.party_type = 'supplier' AND i.party_id = s.id AND i.due_date < CURDATE()) AS overdue,
       (SELECT COUNT(*) FROM bookings b WHERE b.supplier_id = s.id AND b.service_date >= CURDATE()) AS upcoming
     FROM suppliers s LEFT JOIN payment_preferences pp ON pp.id = s.payment_pref_id
     WHERE ${where.join(' AND ')} ORDER BY s.name LIMIT ${size} OFFSET ${(page - 1) * size}`, params
  );
  const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() AS total');
  return { rows: rows.map(shape), total: Number(total), page, size };
}

export async function counts(orgId) {
  const rows = await query('SELECT services FROM suppliers WHERE org_id = ? AND is_active = 1', [orgId]);
  const c = {};
  for (const r of rows) for (const s of j(r.services, []) || []) c[s] = (c[s] || 0) + 1;
  return c;
}

export const get = async (orgId, id) => shape(await one(
  'SELECT s.*, pp.name AS payment_pref, pp.parts AS payment_parts FROM suppliers s LEFT JOIN payment_preferences pp ON pp.id = s.payment_pref_id WHERE s.id = ? AND s.org_id = ?', [id, orgId]
));

export async function activity(orgId, id) {
  const bookings = await query(
    `SELECT b.id, b.trip_id, b.service, b.title, b.status, b.service_date, b.booked_amount, b.quoted_cost, t.trip_no, t.guest_name
     FROM bookings b JOIN trips t ON t.id = b.trip_id WHERE b.org_id = ? AND b.supplier_id = ? ORDER BY b.service_date DESC LIMIT 300`, [orgId, id]
  );
  const dues = await query(
    `SELECT i.*, t.trip_no, t.guest_name, b.title AS booking_title FROM instalments i JOIN trips t ON t.id = i.trip_id LEFT JOIN bookings b ON b.id = i.booking_id
     WHERE i.org_id = ? AND i.party_type = 'supplier' AND i.party_id = ? ORDER BY i.due_date`, [orgId, id]
  );
  const payments = await query(
    `SELECT x.*, t.trip_no FROM transactions x LEFT JOIN trips t ON t.id = x.trip_id
     WHERE x.org_id = ? AND x.party_type = 'supplier' AND x.party_id = ? ORDER BY x.paid_at DESC LIMIT 300`, [orgId, id]
  );
  return { bookings, dues, payments };
}

const COLS = ['name', 'kind', 'services', 'email', 'phone', 'address', 'city', 'state', 'country', 'tax_id', 'pan', 'contacts', 'bank_accounts', 'payment_pref_id', 'cab_types', 'notes'];
const JSONC = ['services', 'contacts', 'bank_accounts', 'cab_types'];
const vals = (b) => COLS.map((c) => (JSONC.includes(c) ? JSON.stringify(b[c] || []) : b[c] === '' ? null : b[c] ?? null));
export async function create(orgId, b, userId) {
  const r = await query(`INSERT INTO suppliers (org_id, ${COLS.join(',')}, created_by) VALUES (?, ${COLS.map(() => '?').join(',')}, ?)`, [orgId, ...vals(b), userId]);
  return r.insertId;
}
export const update = (orgId, id, b) => query(`UPDATE suppliers SET ${COLS.map((c) => `${c}=?`).join(',')} WHERE id = ? AND org_id = ?`, [...vals(b), id, orgId]);
export const setActive = (orgId, id, on) => query('UPDATE suppliers SET is_active = ? WHERE id = ? AND org_id = ?', [on ? 1 : 0, id, orgId]);
export const byName = (orgId, name) => one('SELECT id FROM suppliers WHERE org_id = ? AND LOWER(name) = LOWER(?)', [orgId, name]);
