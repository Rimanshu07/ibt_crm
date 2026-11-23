import { pool, query, one, transaction } from '../../core/db.js';
import { j } from '../../core/http.js';

export async function list(orgId, f) {
  const where = ['a.org_id = ?']; const params = [orgId];
  if (f.status !== 'all') where.push(f.status === 'disabled' ? 'a.is_active = 0' : 'a.is_active = 1');
  if (f.q) { where.push('(a.name LIKE ? OR a.city LIKE ? OR EXISTS (SELECT 1 FROM activity_services s WHERE s.activity_id = a.id AND s.name LIKE ?))'); params.push(...Array(3).fill(`%${f.q}%`)); }
  if (f.city) { where.push('a.city = ?'); params.push(f.city); }
  const page = Math.max(Number(f.page) || 1, 1); const size = Math.min(Number(f.size) || 25, 200);
  const [rows] = await pool.query(
    `SELECT SQL_CALC_FOUND_ROWS a.* FROM activities a WHERE ${where.join(' AND ')} ORDER BY a.name LIMIT ${size} OFFSET ${(page - 1) * size}`, params
  );
  const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() AS total');
  if (rows.length) {
    const [svcs] = await pool.query(
      `SELECT s.*, (SELECT MAX(r.date_to) FROM rates r WHERE r.service = 'activity' AND r.ref_id = s.id) AS rate_to
       FROM activity_services s WHERE s.activity_id IN (?) ORDER BY s.name`, [rows.map((r) => r.id)]
    );
    rows.forEach((a) => { a.services = svcs.filter((s) => s.activity_id === a.id).map((s) => ({ ...s, closing_dates: j(s.closing_dates, []) })); });
  }
  return { rows, total: Number(total), page, size };
}

export async function get(orgId, id) {
  const a = await one('SELECT * FROM activities WHERE id = ? AND org_id = ?', [id, orgId]);
  if (!a) return null;
  a.closing_dates = j(a.closing_dates, []);
  a.services = (await query('SELECT * FROM activity_services WHERE activity_id = ? ORDER BY name', [id])).map((s) => ({ ...s, closing_dates: j(s.closing_dates, []) }));
  return a;
}

const SCOLS = ['name', 'code', 'description', 'open_time', 'close_time', 'duration_mins', 'slots', 'child_age_from', 'child_age_to', 'closing_weekdays', 'closing_dates', 'is_active'];
const svals = (s) => SCOLS.map((c) => (c === 'closing_dates' ? JSON.stringify(s[c] || []) : c === 'is_active' ? (s[c] === false ? 0 : 1) : s[c] === '' ? null : s[c] ?? null));

export function save(orgId, id, b) {
  return transaction(async (c) => {
    let aid = id;
    if (aid) {
      const [r] = await c.execute('UPDATE activities SET name = ?, city = ?, description = ?, tourist_types = ?, closing_weekdays = ?, closing_dates = ? WHERE id = ? AND org_id = ?', [b.name, b.city || null, b.description || null, b.tourist_types, b.closing_weekdays || null, JSON.stringify(b.closing_dates || []), aid, orgId]);
      if (!r.affectedRows) return null;
    } else {
      const [r] = await c.execute('INSERT INTO activities (org_id, name, city, description, tourist_types, closing_weekdays, closing_dates) VALUES (?,?,?,?,?,?,?)', [orgId, b.name, b.city || null, b.description || null, b.tourist_types, b.closing_weekdays || null, JSON.stringify(b.closing_dates || [])]);
      aid = r.insertId;
    }
    const keep = [];
    for (const s of b.services) {
      if (s.id) {
        await c.execute(`UPDATE activity_services SET ${SCOLS.map((x) => `${x}=?`).join(',')} WHERE id = ? AND activity_id = ?`, [...svals(s), s.id, aid]);
        keep.push(s.id);
      } else {
        const [r] = await c.execute(`INSERT INTO activity_services (activity_id, org_id, ${SCOLS.join(',')}) VALUES (?,?, ${SCOLS.map(() => '?').join(',')})`, [aid, orgId, ...svals(s)]);
        keep.push(r.insertId);
      }
    }
    // services removed from the form are disabled (their prices and bookings stay)
    if (keep.length) await c.query('UPDATE activity_services SET is_active = 0 WHERE activity_id = ? AND id NOT IN (?)', [aid, keep]);
    return aid;
  });
}
export const setActive = (orgId, id, on) => query('UPDATE activities SET is_active = ? WHERE id = ? AND org_id = ?', [on ? 1 : 0, id, orgId]);
export const cities = (orgId) => query("SELECT city AS name, COUNT(*) AS n FROM activities WHERE org_id = ? AND city IS NOT NULL AND city <> '' GROUP BY city ORDER BY city", [orgId]);
