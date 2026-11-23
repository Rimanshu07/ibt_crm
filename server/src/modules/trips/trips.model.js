import { pool, query, one } from '../../core/db.js';
import { ApiError, j } from '../../core/http.js';

export async function logTrip(conn, req, tripId, message) {
  const sql = 'INSERT INTO trip_logs (org_id, trip_id, user_id, message) VALUES (?,?,?,?)';
  const params = [req.orgId, tripId, req.user.id, String(message).slice(0, 500)];
  if (conn) await conn.execute(sql, params); else await query(sql, params);
}

export async function nextTripNo(conn, orgId) {
  await conn.execute('INSERT IGNORE INTO trip_counters (org_id) VALUES (?)', [orgId]);
  await conn.execute('UPDATE trip_counters SET last_no = last_no + 1 WHERE org_id = ?', [orgId]);
  const [rows] = await conn.execute('SELECT last_no FROM trip_counters WHERE org_id = ?', [orgId]);
  return rows[0].last_no;
}

/** Converted trips move to On Trip / Past automatically by date. */
export async function refreshStages(orgId) {
  await query("UPDATE trips SET stage = 'on_trip' WHERE org_id = ? AND stage = 'converted' AND start_date <= CURDATE() AND end_date >= CURDATE()", [orgId]);
  await query("UPDATE trips SET stage = 'past' WHERE org_id = ? AND stage IN ('converted','on_trip') AND end_date < CURDATE()", [orgId]);
}

/** Limits trips to the user's own when they cannot see everyone's. */
export function scopeFilter(req, alias = 't') {
  if (req.user.is_org_owner || req.permissions.includes('trips.view_all')) return { sql: '', params: [] };
  return {
    sql: ` AND (${alias}.sales_user_id = ? OR ${alias}.resv_user_id = ? OR ${alias}.ops_user_id = ? OR ${alias}.created_by = ?)`,
    params: [req.user.id, req.user.id, req.user.id, req.user.id],
  };
}

export async function getTrip(req, id) {
  const scope = scopeFilter(req);
  const trip = await one(`SELECT t.* FROM trips t WHERE t.id = ? AND t.org_id = ?${scope.sql}`, [id, req.orgId, ...scope.params]);
  if (!trip) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
  return { ...trip, services: j(trip.services, []), children_ages: j(trip.children_ages, []), destination_ids: j(trip.destination_ids, []), tags: j(trip.tags, []) };
}

export async function list(req, f) {
  const scope = scopeFilter(req);
  const where = [`t.org_id = ?${scope.sql}`]; const params = [req.orgId, ...scope.params];
  if (f.q) {
    const q = `%${f.q}%`;
    where.push('(t.guest_name LIKE ? OR t.guest_phone LIKE ? OR t.guest_email LIKE ? OR t.ref_id LIKE ? OR CAST(t.trip_no AS CHAR) LIKE ?)');
    params.push(q, q, q, q, q);
  }
  if (f.from) { where.push('t.start_date >= ?'); params.push(f.from); }
  if (f.to) { where.push('t.start_date <= ?'); params.push(f.to); }
  if (f.created_from) { where.push('t.created_at >= ?'); params.push(`${f.created_from} 00:00:00`); }
  if (f.created_to) { where.push('t.created_at <= ?'); params.push(`${f.created_to} 23:59:59`); }
  if (f.destination) { where.push('JSON_CONTAINS(t.destination_ids, CAST(? AS JSON))'); params.push(String(Number(f.destination))); }
  if (f.service) { where.push('JSON_CONTAINS(t.services, ?)'); params.push(JSON.stringify(f.service)); }
  if (f.source) { where.push('t.source_id = ?'); params.push(Number(f.source)); }
  if (f.tag) { where.push('JSON_CONTAINS(t.tags, ?)'); params.push(JSON.stringify(f.tag)); }
  if (f.user) { where.push('(t.sales_user_id = ? OR t.resv_user_id = ? OR t.ops_user_id = ?)'); params.push(...Array(3).fill(Number(f.user))); }
  if (f.mine === '1') { where.push('(t.sales_user_id = ? OR t.resv_user_id = ? OR t.ops_user_id = ?)'); params.push(...Array(3).fill(req.user.id)); }
  if (f.followup === 'overdue') where.push('EXISTS (SELECT 1 FROM tasks k WHERE k.trip_id = t.id AND k.done_at IS NULL AND k.is_actionable = 1 AND k.due_at < NOW())');
  if (f.followup === 'today') where.push('EXISTS (SELECT 1 FROM tasks k WHERE k.trip_id = t.id AND k.done_at IS NULL AND k.is_actionable = 1 AND DATE(k.due_at) = CURDATE())');
  const baseWhere = [...where]; const baseParams = [...params];
  if (f.stage) { where.push('t.stage = ?'); params.push(f.stage); }
  const sort = { start: 't.start_date IS NULL, t.start_date ASC', created: 't.created_at DESC', updated: 't.updated_at DESC', start_desc: 't.start_date DESC' }[f.sort] || 't.created_at DESC';
  const page = Math.max(Number(f.page) || 1, 1); const size = Math.min(Number(f.size) || 50, 200);
  const [rows] = await pool.query(
    `SELECT SQL_CALC_FOUND_ROWS t.id, t.trip_no, t.trip_type, t.services, t.guest_salutation, t.guest_name, t.guest_phone, t.guest_email, t.guest_city, t.ref_id,
            t.start_date, t.end_date, t.nights, t.adults, t.children_ages, t.infants, t.stage, t.stage_reason, t.package_amount, t.currency, t.created_at, t.tags,
            s.name AS source_name, u.name AS sales_name, cu.name AS created_by_name,
            (SELECT GROUP_CONCAT(m.name ORDER BY m.name SEPARATOR ', ') FROM master_records m
              WHERE m.org_id = t.org_id AND m.type = 'destination' AND JSON_CONTAINS(t.destination_ids, CAST(m.id AS JSON))) AS destinations,
            (SELECT q.total_selling FROM quotes q WHERE q.id = t.latest_quote_id) AS latest_quote,
            (SELECT COUNT(*) FROM quotes q WHERE q.trip_id = t.id) AS quote_count,
            (SELECT MIN(k.due_at) FROM tasks k WHERE k.trip_id = t.id AND k.done_at IS NULL AND k.is_actionable = 1) AS next_task_at,
            (SELECT COALESCE(SUM(i.amount - i.paid_amount), 0) FROM instalments i WHERE i.trip_id = t.id AND i.direction = 'in') AS due_in
     FROM trips t LEFT JOIN master_records s ON s.id = t.source_id LEFT JOIN users u ON u.id = t.sales_user_id LEFT JOIN users cu ON cu.id = t.created_by
     WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ${size} OFFSET ${(page - 1) * size}`, params
  );
  const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() AS total');
  const [counts] = await pool.query(`SELECT t.stage, COUNT(*) AS n FROM trips t WHERE ${baseWhere.join(' AND ')} GROUP BY t.stage`, baseParams);
  return {
    rows: rows.map((r) => ({ ...r, services: j(r.services, []), children_ages: j(r.children_ages, []), tags: j(r.tags, []) })),
    total: Number(total), page, size, counts: Object.fromEntries(counts.map((c) => [c.stage, Number(c.n)])),
  };
}

const COLS = ['trip_type', 'services', 'source_id', 'ref_id', 'destination_ids', 'start_date', 'nights', 'end_date', 'adults', 'children_ages', 'infants', 'foc',
  'guest_salutation', 'guest_name', 'guest_phone', 'guest_email', 'guest_city', 'tags'];
const JSONC = ['services', 'destination_ids', 'children_ages', 'tags'];
export const tripVals = (b) => COLS.map((c) => (JSONC.includes(c) ? JSON.stringify(b[c] || []) : b[c] === '' ? null : b[c] ?? null));

export async function create(conn, req, b, currency) {
  const no = await nextTripNo(conn, req.orgId);
  const [r] = await conn.execute(
    `INSERT INTO trips (org_id, trip_no, ${COLS.join(',')}, notes, stage, sales_user_id, currency, created_by)
     VALUES (?,?, ${COLS.map(() => '?').join(',')}, ?, 'new', ?, ?, ?)`,
    [req.orgId, no, ...tripVals(b), b.notes || null, b.sales_user_id || req.user.id, currency, req.user.id]
  );
  return { id: r.insertId, trip_no: no };
}
export const update = (id, b) => query(`UPDATE trips SET ${COLS.map((c) => `${c}=?`).join(',')} WHERE id = ?`, [...tripVals(b), id]);
export const findByImportRef = async (orgId, refId) => {
  const norm = String(refId ?? '').trim().toUpperCase();
  try {
    return await one(
      `SELECT id, trip_no, trip_type, services, ref_id, destination_ids, start_date, nights, end_date, adults,
              children_ages, infants, foc, guest_salutation, guest_name, guest_phone, guest_email, guest_city, tags, notes
       FROM trips WHERE org_id = ? AND ref_id_normalized = ? LIMIT 1`,
      [orgId, norm]
    );
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      return await one(
        `SELECT id, trip_no, trip_type, services, ref_id, destination_ids, start_date, nights, end_date, adults,
                children_ages, infants, foc, guest_salutation, guest_name, guest_phone, guest_email, guest_city, tags, notes
         FROM trips WHERE org_id = ? AND UPPER(TRIM(ref_id)) = ? LIMIT 1`,
        [orgId, norm]
      );
    }
    throw err;
  }
};
export const isRefIdConflict = (error) => error?.code === 'ER_DUP_ENTRY'
  && (/uq_trips_org_ref_normalized/i.test(`${error.sqlMessage || ''} ${error.message || ''}`) || /ref_id/i.test(`${error.sqlMessage || ''} ${error.message || ''}`));

export async function detail(req, t) {
  const users = await query('SELECT id, name, phone FROM users WHERE org_id = ?', [req.orgId]);
  const uname = (id) => users.find((u) => u.id === id)?.name || null;
  const [dest] = t.destination_ids.length ? await pool.query('SELECT id, name FROM master_records WHERE org_id = ? AND id IN (?)', [req.orgId, t.destination_ids]) : [[]];
  const source = t.source_id ? await one('SELECT name FROM master_records WHERE id = ?', [t.source_id]) : null;
  const quotes = await query('SELECT id, version, quote_type, start_date, nights, adults, total_cost, total_buy, total_selling, currency, created_at FROM quotes WHERE trip_id = ? ORDER BY version DESC', [t.id]);
  const tasks = await query(
    `SELECT k.*, u.name AS assignee_name, c.name AS created_by_name FROM tasks k LEFT JOIN users u ON u.id = k.assignee_id LEFT JOIN users c ON c.id = k.created_by
     WHERE k.trip_id = ? ORDER BY k.done_at IS NOT NULL, k.due_at IS NULL, k.due_at, k.id DESC`, [t.id]
  );
  const money = await one(
    `SELECT COALESCE(SUM(IF(direction='in', amount, 0)),0) AS receivable, COALESCE(SUM(IF(direction='in', paid_amount, 0)),0) AS received,
            COALESCE(SUM(IF(direction='out', amount, 0)),0) AS payable, COALESCE(SUM(IF(direction='out', paid_amount, 0)),0) AS paid
     FROM instalments WHERE trip_id = ?`, [t.id]
  );
  return {
    ...t, destinations: dest, source_name: source?.name || null,
    sales_name: uname(t.sales_user_id), resv_name: uname(t.resv_user_id), ops_name: uname(t.ops_user_id), created_by_name: uname(t.created_by),
    quotes, tasks, money,
  };
}

export const setStage = (id, stage, reason) => query('UPDATE trips SET stage = ?, stage_reason = ? WHERE id = ?', [stage, reason || null, id]);
export const setTeam = (id, b) => query('UPDATE trips SET sales_user_id=?, resv_user_id=?, ops_user_id=? WHERE id=?', [b.sales_user_id, b.resv_user_id, b.ops_user_id, id]);
export const setTravel = (id, b) => query('UPDATE trips SET arrival_details=?, departure_details=? WHERE id=?', [b.arrival_details, b.departure_details, id]);
export const logs = (id) => query('SELECT l.id, l.message, l.created_at, u.name AS user_name FROM trip_logs l LEFT JOIN users u ON u.id = l.user_id WHERE l.trip_id = ? ORDER BY l.id DESC', [id]);
export const staffIds = async (orgId) => new Set((await query('SELECT id FROM users WHERE org_id = ?', [orgId])).map((u) => u.id));
export const orgCurrency = async (orgId) => (await one('SELECT base_currency FROM organizations WHERE id = ?', [orgId])).base_currency;
