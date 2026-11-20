import { pool, query, one, transaction } from '../../core/db.js';
import { j } from '../../core/http.js';

const shape = (h) => h && ({ ...h, meal_plans: j(h.meal_plans, []), room_types: j(h.room_types, []), contacts: j(h.contacts, []) });

export async function list(orgId, f) {
  const where = ['h.org_id = ?']; const params = [orgId];
  if (f.status !== 'all') where.push(f.status === 'disabled' ? 'h.is_active = 0' : 'h.is_active = 1');
  if (f.q) { where.push('(h.name LIKE ? OR h.city LIKE ? OR h.location LIKE ? OR h.group_name LIKE ?)'); params.push(...Array(4).fill(`%${f.q}%`)); }
  if (f.city) { where.push('(h.city = ? OR h.location LIKE ?)'); params.push(f.city, `%${f.city}%`); }
  if (f.star) { where.push('h.star = ?'); params.push(f.star); }
  if (f.group) { where.push('h.group_name = ?'); params.push(f.group); }
  if (f.meal_plan) { where.push('JSON_CONTAINS(h.meal_plans, ?)'); params.push(JSON.stringify(f.meal_plan)); }
  if (f.room_type) { where.push('JSON_SEARCH(h.room_types, \'one\', ?, NULL, \'$[*].name\') IS NOT NULL'); params.push(f.room_type); }
  if (f.entry_method) { where.push('h.entry_method = ?'); params.push(f.entry_method); }
  if (f.updated_from) { where.push('h.updated_at >= ?'); params.push(`${f.updated_from} 00:00:00`); }
  if (f.updated_to) { where.push('h.updated_at <= ?'); params.push(`${f.updated_to} 23:59:59`); }
  if (f.expiring_before) { where.push("(SELECT MAX(r.date_to) FROM rates r WHERE r.service = 'hotel' AND r.ref_id = h.id) <= ?"); params.push(f.expiring_before); }
  if (f.no_rates === '1') where.push("NOT EXISTS (SELECT 1 FROM rates r WHERE r.service = 'hotel' AND r.ref_id = h.id AND r.date_to >= CURDATE())");
  const page = Math.max(Number(f.page) || 1, 1); const size = Math.min(Number(f.size) || 25, 200);
  const [rows] = await pool.query(
    `SELECT SQL_CALC_FOUND_ROWS h.*, pp.name AS payment_pref, s.name AS supplier_name, u.name AS updated_by_name,
            (SELECT MIN(r.date_from) FROM rates r WHERE r.service = 'hotel' AND r.ref_id = h.id AND r.date_to >= CURDATE()) AS rate_from,
            (SELECT MAX(r.date_to) FROM rates r WHERE r.service = 'hotel' AND r.ref_id = h.id) AS rate_to
     FROM hotels h LEFT JOIN payment_preferences pp ON pp.id = h.payment_pref_id LEFT JOIN suppliers s ON s.id = h.supplier_id
     LEFT JOIN users u ON u.id = COALESCE(h.updated_by, h.created_by)
     WHERE ${where.join(' AND ')} ORDER BY h.name LIMIT ${size} OFFSET ${(page - 1) * size}`, params
  );
  const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() AS total');
  return { rows: rows.map(shape), total: Number(total), page, size };
}

export async function get(orgId, id) {
  const h = shape(await one(
    `SELECT h.*, pp.name AS payment_pref, s.name AS supplier_name, cu.name AS created_by_name FROM hotels h
     LEFT JOIN payment_preferences pp ON pp.id = h.payment_pref_id LEFT JOIN suppliers s ON s.id = h.supplier_id LEFT JOIN users cu ON cu.id = h.created_by
     WHERE h.id = ? AND h.org_id = ?`, [id, orgId]
  ));
  if (!h) return null;
  h.closures = (await query('SELECT * FROM hotel_closures WHERE hotel_id = ? ORDER BY date_from', [id])).map((c) => ({ ...c, room_types: j(c.room_types, null) }));
  h.rate_summary = await query(
    `SELECT variant, meal_plan, kind, MIN(date_from) AS date_from, MAX(date_to) AS date_to, COUNT(*) AS n FROM rates
     WHERE service = 'hotel' AND ref_id = ? GROUP BY variant, meal_plan, kind ORDER BY kind, variant, meal_plan`, [id]
  );
  return h;
}

const COLS = ['name', 'group_name', 'location', 'city', 'star', 'address', 'meal_plans', 'room_types', 'checkin_time', 'checkout_time', 'child_age_from', 'child_age_to', 'payment_pref_id', 'supplier_id', 'phone', 'email', 'link', 'contacts', 'notes'];
const JSONC = ['meal_plans', 'room_types', 'contacts'];
const vals = (b) => COLS.map((c) => (JSONC.includes(c) ? JSON.stringify(b[c] || []) : b[c] ?? null));

export async function create(orgId, b, userId) {
  const r = await query(`INSERT INTO hotels (org_id, ${COLS.join(',')}, created_by) VALUES (?, ${COLS.map(() => '?').join(',')}, ?)`, [orgId, ...vals(b), userId]);
  return r.insertId;
}
export const update = (orgId, id, b, userId) => query(`UPDATE hotels SET ${COLS.map((c) => `${c}=?`).join(',')}, updated_by = ? WHERE id = ? AND org_id = ?`, [...vals(b), userId, id, orgId]);
export const setActive = (orgId, id, on) => query('UPDATE hotels SET is_active = ? WHERE id = ? AND org_id = ?', [on ? 1 : 0, id, orgId]);
export const updateNotes = (orgId, id, notes) => query('UPDATE hotels SET notes = ? WHERE id = ? AND org_id = ?', [notes, id, orgId]);

export function saveClosures(hotelId, closures) {
  return transaction(async (c) => {
    await c.execute('DELETE FROM hotel_closures WHERE hotel_id = ?', [hotelId]);
    for (const x of closures) {
      await c.execute('INSERT INTO hotel_closures (hotel_id, kind, room_types, date_from, date_to) VALUES (?,?,?,?,?)',
        [hotelId, x.kind, x.room_types?.length ? JSON.stringify(x.room_types) : null, x.date_from, x.date_to]);
    }
  });
}

/** Bookings and money linked to this hotel. */
export async function activity(orgId, id) {
  const bookings = await query(
    `SELECT b.id, b.trip_id, b.title, b.status, b.service_date, b.booked_amount, b.quoted_cost, t.trip_no, t.guest_name
     FROM bookings b JOIN trips t ON t.id = b.trip_id
     WHERE b.org_id = ? AND b.service = 'hotel' AND JSON_EXTRACT(b.details, '$.hotel_id') = ? ORDER BY b.service_date DESC LIMIT 200`, [orgId, id]
  );
  const dues = await query(
    `SELECT i.*, t.trip_no, t.guest_name FROM instalments i JOIN trips t ON t.id = i.trip_id
     WHERE i.org_id = ? AND i.party_type = 'hotel' AND i.party_id = ? ORDER BY i.due_date`, [orgId, id]
  );
  return { bookings, dues };
}

/** Move everything from duplicates into one hotel, then delete the duplicates. */
export function merge(orgId, targetId, sourceIds) {
  return transaction(async (c) => {
    for (const sid of sourceIds) {
      await c.execute("UPDATE rates SET ref_id = ? WHERE org_id = ? AND service = 'hotel' AND ref_id = ?", [targetId, orgId, sid]);
      await c.execute("UPDATE bookings SET details = JSON_SET(details, '$.hotel_id', ?) WHERE org_id = ? AND service = 'hotel' AND JSON_EXTRACT(details, '$.hotel_id') = ?", [targetId, orgId, sid]);
      await c.execute("UPDATE quote_items SET details = JSON_SET(details, '$.hotel_id', ?) WHERE org_id = ? AND service = 'hotel' AND JSON_EXTRACT(details, '$.hotel_id') = ?", [targetId, orgId, sid]);
      await c.execute("UPDATE instalments SET party_id = ? WHERE org_id = ? AND party_type = 'hotel' AND party_id = ?", [targetId, orgId, sid]);
      await c.execute('DELETE FROM hotels WHERE id = ? AND org_id = ?', [sid, orgId]);
    }
  });
}

export const groups = (orgId) => query("SELECT group_name AS name, COUNT(*) AS hotels FROM hotels WHERE org_id = ? AND group_name IS NOT NULL AND group_name <> '' GROUP BY group_name ORDER BY group_name", [orgId]);
export const cities = (orgId) => query('SELECT city, COUNT(*) AS hotels FROM hotels WHERE org_id = ? GROUP BY city ORDER BY city', [orgId]);
