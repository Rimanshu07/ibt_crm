import { pool, query } from '../../core/db.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekday = (date) => DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** Every rate of one record overlapping [from, to]. */
export const ratesFor = (orgId, service, refId, from, to) => query(
  `SELECT * FROM rates WHERE org_id = ? AND service = ? AND ref_id = ? AND date_from <= ? AND date_to >= ? ORDER BY id DESC`,
  [orgId, service, refId, to, from]
);

/**
 * Best rate for a date. mode 'sales' = quotation price, 'ops' = buying price.
 * Prefers: exact weekday rates, the right rate type, exact occupancy, newest upload.
 */
export function pick(rates, { variant = '', meal_plan = '', kind = 'base', occupancy = null }, date, mode = 'sales') {
  const wd = weekday(date);
  const want = { sales: { sales: 3, both: 2, ops: -1 }, ops: { ops: 3, both: 2, sales: 1 } }[mode];
  let best = null; let bestScore = -Infinity;
  for (const r of rates) {
    if (r.kind !== kind) continue;
    if (String(r.variant).toLowerCase() !== String(variant || '').toLowerCase()) continue;
    if ((r.meal_plan || '') !== (meal_plan || '')) continue;
    const from = String(r.date_from).slice(0, 10); const to = String(r.date_to).slice(0, 10);
    if (date < from || date > to) continue;
    if (r.weekdays && !r.weekdays.split(',').includes(wd)) continue;
    const typeScore = want[r.rate_type];
    if (typeScore < 0) continue;
    let score = typeScore * 1000 + (r.weekdays ? 100 : 0);
    if (occupancy && r.occupancy) {
      if (Number(r.occupancy) === Number(occupancy)) score += 50;
      else if (Number(r.occupancy) < Number(occupancy)) score += 20 - (occupancy - r.occupancy);
      else score -= 30;
    }
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

export async function insertMany(conn, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const cols = ['org_id', 'service', 'ref_id', 'variant', 'meal_plan', 'occupancy', 'kind', 'rate_type', 'season', 'date_from', 'date_to', 'weekdays', 'price', 'currency', 'code', 'upload_id', 'created_by'];
    await conn.query(`INSERT INTO rates (${cols.join(',')}) VALUES ?`, [chunk.map((r) => cols.map((c) => r[c] ?? null))]);
  }
}

/** Remove a record's existing rates in the date window being uploaded (upload replaces them). */
export const clearWindow = (conn, orgId, service, refId, from, to) => conn.execute(
  'DELETE FROM rates WHERE org_id = ? AND service = ? AND ref_id = ? AND date_from <= ? AND date_to >= ?', [orgId, service, refId, to, from]
);

/** Price list screen. */
export async function list(orgId, service, f = {}) {
  const where = ['r.org_id = ?', 'r.service = ?']; const params = [orgId, service];
  if (f.ref_id) { where.push('r.ref_id = ?'); params.push(Number(f.ref_id)); }
  if (f.date) { where.push('? BETWEEN r.date_from AND r.date_to'); params.push(f.date); }
  if (f.expiring_before) { where.push('r.date_to <= ? AND r.date_to >= CURDATE()'); params.push(f.expiring_before); }
  if (f.rate_type) { where.push('r.rate_type = ?'); params.push(f.rate_type); }
  if (f.upload_id) { where.push('r.upload_id = ?'); params.push(Number(f.upload_id)); }
  const name = {
    hotel: "CONCAT(h.name, ' · ', h.city)",
    transport: "CONCAT(t.from_location, IF(t.to_location IS NULL OR t.to_location='', '', CONCAT(' → ', t.to_location)), ' · ', t.service)",
    activity: "CONCAT(a.name, ' – ', s.name)",
  }[service];
  const join = {
    hotel: 'JOIN hotels h ON h.id = r.ref_id',
    transport: 'JOIN transport_services t ON t.id = r.ref_id',
    activity: 'JOIN activity_services s ON s.id = r.ref_id JOIN activities a ON a.id = s.activity_id',
  }[service];
  if (f.q) { where.push(`${name} LIKE ?`); params.push(`%${f.q}%`); }
  const page = Math.max(Number(f.page) || 1, 1);
  const [rows] = await pool.query(
    `SELECT SQL_CALC_FOUND_ROWS r.*, ${name} AS ref_name FROM rates r ${join}
     WHERE ${where.join(' AND ')} ORDER BY ref_name, r.variant, r.meal_plan, r.kind, r.date_from, r.rate_type LIMIT 200 OFFSET ${(page - 1) * 200}`, params
  );
  const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() AS total');
  return { rows, total: Number(total), page };
}

export const getOne = (orgId, id) => query('SELECT * FROM rates WHERE org_id = ? AND id = ?', [orgId, id]).then((r) => r[0] || null);

export const update = (orgId, id, b) => pool.query(
  'UPDATE rates SET price = ?, season = ?, date_from = ?, date_to = ?, weekdays = ?, rate_type = ? WHERE id = ? AND org_id = ?',
  [b.price, b.season, b.date_from, b.date_to, b.weekdays || null, b.rate_type, id, orgId]
);

export const remove = (orgId, ids) => pool.query('DELETE FROM rates WHERE org_id = ? AND id IN (?)', [orgId, ids]);
export const uploads = (orgId, service) => query(
  `SELECT u.*, us.name AS created_by_name, (SELECT COUNT(*) FROM rates r WHERE r.upload_id = u.id) AS rate_count
   FROM rate_uploads u LEFT JOIN users us ON us.id = u.created_by WHERE u.org_id = ? AND u.service = ? ORDER BY u.id DESC LIMIT 50`, [orgId, service]
);
