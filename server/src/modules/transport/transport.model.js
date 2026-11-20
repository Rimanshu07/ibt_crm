import { pool, query, one } from '../../core/db.js';
import { j } from '../../core/http.js';

const shape = (s) => s && ({ ...s, closing_dates: j(s.closing_dates, []) });

export async function list(orgId, f) {
  const where = ['t.org_id = ?']; const params = [orgId];
  if (f.status !== 'all') where.push(f.status === 'disabled' ? 't.is_active = 0' : 't.is_active = 1');
  if (f.q) { where.push('(t.from_location LIKE ? OR t.to_location LIKE ? OR t.service LIKE ? OR t.duty_code LIKE ?)'); params.push(...Array(4).fill(`%${f.q}%`)); }
  if (f.location) { where.push('(t.from_location = ? OR t.to_location = ?)'); params.push(f.location, f.location); }
  if (f.entry_method) { where.push('t.entry_method = ?'); params.push(f.entry_method); }
  const page = Math.max(Number(f.page) || 1, 1); const size = Math.min(Number(f.size) || 25, 200);
  const [rows] = await pool.query(
    `SELECT SQL_CALC_FOUND_ROWS t.*,
       (SELECT GROUP_CONCAT(DISTINCT r.variant ORDER BY r.variant SEPARATOR ', ') FROM rates r WHERE r.service = 'transport' AND r.ref_id = t.id AND r.date_to >= CURDATE()) AS cab_types,
       (SELECT MAX(r.date_to) FROM rates r WHERE r.service = 'transport' AND r.ref_id = t.id) AS rate_to
     FROM transport_services t WHERE ${where.join(' AND ')} ORDER BY t.from_location, t.duty_code, t.service LIMIT ${size} OFFSET ${(page - 1) * size}`, params
  );
  const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() AS total');
  return { rows: rows.map(shape), total: Number(total), page, size };
}
export const get = async (orgId, id) => shape(await one('SELECT * FROM transport_services WHERE id = ? AND org_id = ?', [id, orgId]));
const COLS = ['duty_code', 'from_location', 'from_short', 'to_location', 'to_short', 'service', 'code', 'distance_km', 'start_time', 'duration_mins', 'day_schedule', 'closing_weekdays', 'closing_dates'];
const vals = (b) => COLS.map((c) => (c === 'closing_dates' ? JSON.stringify(b[c] || []) : b[c] === '' ? null : b[c] ?? null));
export async function create(orgId, b) {
  const r = await query(`INSERT INTO transport_services (org_id, ${COLS.join(',')}) VALUES (?, ${COLS.map(() => '?').join(',')})`, [orgId, ...vals(b)]);
  return r.insertId;
}
export const update = (orgId, id, b) => query(`UPDATE transport_services SET ${COLS.map((c) => `${c}=?`).join(',')} WHERE id = ? AND org_id = ?`, [...vals(b), id, orgId]);
export const setActive = (orgId, id, on) => query('UPDATE transport_services SET is_active = ? WHERE id = ? AND org_id = ?', [on ? 1 : 0, id, orgId]);
export const locations = (orgId) => query(
  `SELECT x.loc AS name, COUNT(*) AS services FROM (SELECT from_location AS loc FROM transport_services WHERE org_id = ? UNION ALL
   SELECT to_location FROM transport_services WHERE org_id = ? AND to_location IS NOT NULL AND to_location <> '') x GROUP BY x.loc ORDER BY x.loc`, [orgId, orgId]
);
