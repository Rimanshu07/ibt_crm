import { pool, query, one } from '../../core/db.js';
import { r2, j } from '../../core/http.js';
import { scopeFilter } from '../trips/trips.model.js';
import { isDoneStatus, isClosedStatus } from '../../../../shared/catalog.js';

export const INST_SELECT = `
  SELECT i.*, t.trip_no, t.guest_name, t.guest_phone, t.start_date, t.end_date, t.stage, b.title AS booking_title, b.service, b.service_date,
         (SELECT COUNT(*) FROM transactions x WHERE x.instalment_id = i.id AND x.verified_at IS NULL) AS unverified,
         (SELECT MAX(x.paid_at) FROM transactions x WHERE x.instalment_id = i.id) AS last_paid_at
  FROM instalments i JOIN trips t ON t.id = i.trip_id LEFT JOIN bookings b ON b.id = i.booking_id`;

export const TABS = {
  today: 'i.paid_amount < i.amount AND i.due_date = CURDATE()',
  overdue: 'i.paid_amount < i.amount AND i.due_date < CURDATE()',
  next7: 'i.paid_amount < i.amount AND i.due_date BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)',
  upcoming: 'i.paid_amount < i.amount AND i.due_date > CURDATE()',
  paid: 'i.paid_amount >= i.amount AND i.amount > 0',
  unverified: 'EXISTS (SELECT 1 FROM transactions x WHERE x.instalment_id = i.id AND x.verified_at IS NULL)',
  all: '1=1',
};

export async function instalments(req, f) {
  const scope = scopeFilter(req);
  const where = [`i.org_id = ? AND i.direction = ? AND i.amount > 0${scope.sql}`];
  const params = [req.orgId, f.direction === 'out' ? 'out' : 'in', ...scope.params];
  if (f.q) { const q = `%${f.q}%`; where.push('(i.party_name LIKE ? OR t.guest_name LIKE ? OR CAST(t.trip_no AS CHAR) LIKE ?)'); params.push(q, q, q); }
  if (f.party_type) { where.push('i.party_type = ?'); params.push(f.party_type); }
  if (f.from) { where.push('i.due_date >= ?'); params.push(f.from); }
  if (f.to) { where.push('i.due_date <= ?'); params.push(f.to); }
  if (f.trip_stage === 'live') where.push("t.stage IN ('converted','on_trip')");
  const counts = {};
  for (const [k, cond] of Object.entries(TABS)) {
    const [[r]] = await pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(i.amount - i.paid_amount),0) AS due FROM instalments i JOIN trips t ON t.id = i.trip_id WHERE ${where.join(' AND ')} AND ${cond}`, params);
    counts[k] = { n: Number(r.n), due: Number(r.due) };
  }
  const tab = TABS[f.tab] ? f.tab : 'today';
  const order = tab === 'paid' ? 'i.due_date DESC' : 'i.due_date, i.id';
  const rows = await query(`${INST_SELECT} WHERE ${where.join(' AND ')} AND ${TABS[tab]} ORDER BY ${order} LIMIT 1000`, params);
  return { rows, counts, tab };
}

export const tripInstalments = (tripId) => query(`${INST_SELECT} WHERE i.trip_id = ? AND i.amount > 0 ORDER BY i.direction, i.due_date, i.id`, [tripId]);
export const tripTransactions = (tripId) => query(
  `SELECT x.*, u.name AS created_by_name, v.name AS verified_by_name, a.name AS account_name FROM transactions x
   LEFT JOIN users u ON u.id = x.created_by LEFT JOIN users v ON v.id = x.verified_by LEFT JOIN org_bank_accounts a ON a.id = x.account_id
   WHERE x.trip_id = ? ORDER BY x.paid_at DESC`, [tripId]
);

/** Profit = package − tax − costs (booked price when confirmed, quoted buying price otherwise). */
export async function tripProfit(trip) {
  const pkg = Number(trip.package_amount) || 0;
  const q = trip.converted_quote_id ? await one('SELECT total_tax FROM quotes WHERE id = ?', [trip.converted_quote_id]) : null;
  const tax = Number(q?.total_tax) || 0;
  const bookings = await query('SELECT service, status, quoted_cost, booked_amount FROM bookings WHERE trip_id = ?', [trip.id]);
  let booked = 0; let estimated = 0; let pending = 0; const byService = {};
  for (const b of bookings) {
    if (isClosedStatus(b.service, b.status)) continue;
    const done = isDoneStatus(b.service, b.status) && b.booked_amount !== null;
    const cost = done ? Number(b.booked_amount) : Number(b.quoted_cost);
    if (done) booked += cost; else { estimated += cost; pending += 1; }
    byService[b.service] = r2((byService[b.service] || 0) + cost);
  }
  const costs = booked + estimated; const profit = pkg - tax - costs;
  return { package_amount: r2(pkg), tax: r2(tax), booked_cost: r2(booked), estimated_cost: r2(estimated), total_cost: r2(costs),
    profit: r2(profit), profit_pct: pkg > 0 ? r2((profit / pkg) * 100) : 0, pending_bookings: pending, by_service: byService };
}

export const instalment = (orgId, id) => one('SELECT * FROM instalments WHERE id = ? AND org_id = ?', [id, orgId]);
export const transaction = (orgId, id) => one('SELECT * FROM transactions WHERE id = ? AND org_id = ?', [id, orgId]);
export const account = (orgId, id) => one('SELECT * FROM org_bank_accounts WHERE id = ? AND org_id = ? AND is_active = 1', [id, orgId]);
export const defaultAccount = (orgId, kind) => one('SELECT * FROM org_bank_accounts WHERE org_id = ? AND is_active = 1 AND (kind = ? OR is_default = 1) ORDER BY kind = ? DESC, is_default DESC LIMIT 1', [orgId, kind, kind]);

/** Unpaid instalments of the same party on the same trip, after the given one. */
export async function nextOpen(conn, inst) {
  const [rows] = await conn.execute(
    `SELECT * FROM instalments WHERE trip_id = ? AND direction = ? AND party_type = ? AND COALESCE(party_id, 0) = ? AND COALESCE(booking_id, 0) = ?
       AND id <> ? AND paid_amount < amount ORDER BY due_date, id`,
    [inst.trip_id, inst.direction, inst.party_type, inst.party_id || 0, inst.booking_id || 0, inst.id]
  );
  return rows;
}

export async function transactions(orgId, f) {
  const where = ['x.org_id = ?']; const params = [orgId];
  if (f.from) { where.push('x.paid_at >= ?'); params.push(`${f.from} 00:00:00`); }
  if (f.to) { where.push('x.paid_at <= ?'); params.push(`${f.to} 23:59:59`); }
  if (f.verified === '0') where.push('x.verified_at IS NULL');
  if (f.verified === '1') where.push('x.verified_at IS NOT NULL');
  if (f.direction) { where.push('x.direction = ?'); params.push(f.direction === 'out' ? 'out' : 'in'); }
  if (f.account_id) { where.push('x.account_id = ?'); params.push(Number(f.account_id)); }
  if (f.q) { const q = `%${f.q}%`; where.push('(x.party_name LIKE ? OR x.reference LIKE ? OR CAST(t.trip_no AS CHAR) LIKE ?)'); params.push(q, q, q); }
  return query(
    `SELECT x.*, t.trip_no, t.guest_name, u.name AS created_by_name, v.name AS verified_by_name, a.name AS account_name FROM transactions x
     LEFT JOIN trips t ON t.id = x.trip_id LEFT JOIN users u ON u.id = x.created_by LEFT JOIN users v ON v.id = x.verified_by
     LEFT JOIN org_bank_accounts a ON a.id = x.account_id
     WHERE ${where.join(' AND ')} ORDER BY x.paid_at DESC, x.id DESC LIMIT 2000`, params
  );
}

/** Payment accounts (bank / cash / UPI) with money in, out and balance. */
export const accounts = (orgId) => query(
  `SELECT a.*,
     COALESCE((SELECT SUM(x.amount) FROM transactions x WHERE x.account_id = a.id AND x.direction = 'in'), 0) AS money_in,
     COALESCE((SELECT SUM(x.amount) FROM transactions x WHERE x.account_id = a.id AND x.direction = 'out'), 0) AS money_out,
     (SELECT COUNT(*) FROM transactions x WHERE x.account_id = a.id AND x.verified_at IS NULL) AS unverified
   FROM org_bank_accounts a WHERE a.org_id = ? ORDER BY a.is_active DESC, a.is_default DESC, a.name`, [orgId]
);

/** Balance per party (customers, suppliers, hotels). */
export function parties(orgId, type) {
  const where = ['i.org_id = ?', 'i.amount > 0']; const params = [orgId];
  if (type) { where.push('i.party_type = ?'); params.push(type); }
  return query(
    `SELECT i.party_type, i.party_id, IF(i.party_type = 'customer', CONCAT(i.party_name, ' · Trip ', t.trip_no), i.party_name) AS party_name, i.direction,
            IF(i.party_type = 'customer', i.trip_id, NULL) AS trip_id,
            SUM(i.amount) AS total, SUM(i.paid_amount) AS paid, SUM(i.amount - i.paid_amount) AS balance,
            SUM(IF(i.paid_amount < i.amount AND i.due_date < CURDATE(), i.amount - i.paid_amount, 0)) AS overdue, COUNT(DISTINCT i.trip_id) AS trips
     FROM instalments i JOIN trips t ON t.id = i.trip_id WHERE ${where.join(' AND ')}
     GROUP BY i.party_type, i.party_id, IF(i.party_type = 'customer', i.trip_id, 0), party_name, i.direction ORDER BY balance DESC, party_name LIMIT 2000`, params
  );
}

export async function ledger(orgId, f) {
  const where = ['i.org_id = ?', 'i.party_type = ?']; const params = [orgId, f.party_type];
  if (f.party_type === 'customer') { where.push('i.trip_id = ?'); params.push(Number(f.trip_id)); } else { where.push('i.party_id = ?'); params.push(Number(f.party_id)); }
  const inst = await query(`${INST_SELECT} WHERE ${where.join(' AND ')} AND i.amount > 0 ORDER BY i.due_date`, params);
  const txWhere = where.map((w) => w.replace('i.', 'x.'));
  const txns = await query(`SELECT x.*, t.trip_no, a.name AS account_name FROM transactions x LEFT JOIN trips t ON t.id = x.trip_id LEFT JOIN org_bank_accounts a ON a.id = x.account_id WHERE ${txWhere.join(' AND ')} ORDER BY x.paid_at`, params);
  return { instalments: inst, transactions: txns.map((x) => ({ ...x, allocations: j(x.allocations, null) })) };
}
