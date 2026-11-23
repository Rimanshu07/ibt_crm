import { pool, query, one } from '../../core/db.js';
import { j } from '../../core/http.js';
import { scopeFilter } from '../trips/trips.model.js';
import { TEMPLATES } from '../../../../shared/templates.js';

/** Three buckets used everywhere on the dashboard. */
const B = {
  today: (c) => `${c} = CURDATE()`,
  overdue: (c) => `${c} < CURDATE()`,
  yesterday: (c) => `${c} = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`,
  next7: (c) => `${c} BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
};

async function bucketed(build, buckets = ['today', 'overdue', 'next7']) {
  const out = {};
  for (const k of buckets) out[k] = await build(k);
  return out;
}

export async function dashboard(req) {
  const s = scopeFilter(req); const sp = s.params;
  const followups = await bucketed(async (k) => {
    const items = await query(
      `SELECT k.id, k.body, k.due_at, k.trip_id, t.trip_no, t.guest_name FROM tasks k LEFT JOIN trips t ON t.id = k.trip_id
       WHERE k.org_id = ? AND k.is_actionable = 1 AND k.done_at IS NULL AND ${B[k]('DATE(k.due_at)')}
         AND (k.assignee_id = ? OR (k.assignee_id IS NULL AND k.created_by = ?)) ORDER BY k.due_at LIMIT 50`, [req.orgId, req.user.id, req.user.id]
    );
    return { n: items.length, items: items.slice(0, 8) };
  });
  const money = async (dir) => bucketed(async (k) => {
    const items = await query(
      `SELECT i.id, i.trip_id, i.party_name, i.amount, i.paid_amount, i.due_date, t.trip_no, t.guest_name FROM instalments i JOIN trips t ON t.id = i.trip_id
       WHERE i.org_id = ? AND i.direction = ? AND i.paid_amount < i.amount${s.sql} AND ${B[k]('i.due_date')} ORDER BY i.due_date LIMIT 200`, [req.orgId, dir, ...sp]
    );
    return { n: items.length, amount: items.reduce((x, i) => x + Number(i.amount) - Number(i.paid_amount), 0), items: items.slice(0, 8) };
  });
  const trips = (col) => bucketed(async (k) => {
    const items = await query(
      `SELECT t.id, t.trip_no, t.guest_name, t.start_date, t.end_date, t.adults, t.children_ages FROM trips t
       WHERE t.org_id = ?${s.sql} AND t.stage IN ('converted','on_trip','past') AND ${B[k](`t.${col}`)} ORDER BY t.${col} LIMIT 100`, [req.orgId, ...sp]
    );
    return { n: items.length, items: items.slice(0, 8).map((t) => ({ ...t, children_ages: j(t.children_ages, []) })) };
  }, ['today', 'yesterday', 'next7']);
  const services = (svc) => bucketed(async (k) => {
    const items = await query(
      `SELECT b.id, b.trip_id, b.title, b.status, b.service_date, t.trip_no, t.guest_name FROM bookings b JOIN trips t ON t.id = b.trip_id
       WHERE b.org_id = ? AND b.service = ?${s.sql} AND t.stage IN ('converted','on_trip','past') AND ${B[k]('b.service_date')} ORDER BY b.service_date LIMIT 100`, [req.orgId, svc, ...sp]
    );
    return { n: items.length, items: items.slice(0, 8) };
  }, ['today', 'yesterday', 'next7']);
  const unconfirmed = await bucketed(async (k) => {
    const items = await query(
      `SELECT b.id, b.trip_id, b.service, b.title, b.status, b.service_date, t.trip_no, t.guest_name FROM bookings b JOIN trips t ON t.id = b.trip_id
       WHERE b.org_id = ?${s.sql} AND t.stage IN ('converted','on_trip') AND b.locked_at IS NULL
         AND b.status NOT IN ('dropped','cancelled','rejected') AND ${B[k]('b.service_date')} ORDER BY b.service_date LIMIT 200`, [req.orgId, ...sp]
    );
    return { n: items.length, items: items.slice(0, 8) };
  });

  const period = { today: 'CURDATE()', week: 'DATE_SUB(CURDATE(), INTERVAL 6 DAY)', month: "DATE_FORMAT(CURDATE(), '%Y-%m-01')" };
  const sales = {};
  for (const [k, from] of Object.entries(period)) {
    const leads = await one(`SELECT COUNT(*) AS n FROM trips t WHERE t.org_id = ?${s.sql} AND t.created_at >= ${from}`, [req.orgId, ...sp]);
    const quotes = await one(`SELECT COUNT(*) AS n FROM quotes q JOIN trips t ON t.id = q.trip_id WHERE t.org_id = ?${s.sql} AND q.created_at >= ${from}`, [req.orgId, ...sp]);
    const conv = await one(`SELECT COUNT(*) AS n, COALESCE(SUM(t.package_amount),0) AS revenue FROM trips t WHERE t.org_id = ?${s.sql} AND t.converted_at >= ${from} AND t.stage <> 'cancelled'`, [req.orgId, ...sp]);
    sales[k] = { leads: Number(leads.n), quotes: Number(quotes.n), conversions: Number(conv.n), revenue: Number(conv.revenue) };
  }
  const stages = Object.fromEntries((await query(`SELECT t.stage, COUNT(*) AS n FROM trips t WHERE t.org_id = ?${s.sql} GROUP BY t.stage`, [req.orgId, ...sp])).map((r) => [r.stage, Number(r.n)]));
  return {
    followups, incoming: await money('in'), outgoing: await money('out'),
    trip_starts: await trips('start_date'), trip_ends: await trips('end_date'),
    checkins: await services('hotel'), transport: await services('transport'), unconfirmed,
    sales, stages, live_dues: await liveDues(req),
  };
}

/** Trips travelling now or within 7 days that still owe money. */
export async function liveDues(req) {
  const s = scopeFilter(req);
  return query(
    `SELECT t.id, t.trip_no, t.guest_name, t.guest_phone, t.start_date, t.end_date, t.stage, t.package_amount, t.currency, u.name AS sales_name,
            COALESCE(SUM(i.amount),0) AS total, COALESCE(SUM(i.paid_amount),0) AS received,
            COALESCE(SUM(IF(i.due_date < CURDATE(), i.amount - i.paid_amount, 0)),0) AS overdue, MIN(IF(i.paid_amount < i.amount, i.due_date, NULL)) AS next_due
     FROM trips t JOIN instalments i ON i.trip_id = t.id AND i.direction = 'in' LEFT JOIN users u ON u.id = t.sales_user_id
     WHERE t.org_id = ?${s.sql} AND (t.stage = 'on_trip' OR (t.stage = 'converted' AND t.start_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)))
     GROUP BY t.id HAVING received < total ORDER BY t.start_date LIMIT 50`, [req.orgId, ...s.params]
  );
}

export async function sales(req, from, to) {
  const s = scopeFilter(req);
  const range = [`${from} 00:00:00`, `${to} 23:59:59`];
  const leads = await query(`SELECT t.id, t.stage, t.services FROM trips t WHERE t.org_id = ?${s.sql} AND t.created_at BETWEEN ? AND ?`, [req.orgId, ...s.params, ...range]);
  const converted = await query(
    `SELECT t.*, u.name AS sales_name, src.name AS source_name, q.total_buy, q.total_tax
     FROM trips t LEFT JOIN users u ON u.id = t.sales_user_id LEFT JOIN master_records src ON src.id = t.source_id LEFT JOIN quotes q ON q.id = t.converted_quote_id
     WHERE t.org_id = ?${s.sql} AND t.converted_at BETWEEN ? AND ? AND t.stage <> 'cancelled' ORDER BY t.converted_at DESC`, [req.orgId, ...s.params, ...range]
  );
  const quotes = await one(`SELECT COUNT(*) AS n FROM quotes q JOIN trips t ON t.id = q.trip_id WHERE t.org_id = ?${s.sql} AND q.created_at BETWEEN ? AND ?`, [req.orgId, ...s.params, ...range]);
  const dests = new Map((await query("SELECT id, name FROM master_records WHERE org_id = ? AND type = 'destination'", [req.orgId])).map((d) => [d.id, d.name]));
  return { leads, converted, quotes: Number(quotes.n), dests };
}

export async function operations(req, from, days, services) {
  const s = scopeFilter(req);
  const [rows] = await pool.query(
    `SELECT b.id, b.trip_id, b.service, b.title, b.service_date, b.end_date, b.status, b.details, t.trip_no, t.guest_name, t.guest_phone, t.adults, t.children_ages,
            s.name AS supplier_name, s.phone AS supplier_phone
     FROM bookings b JOIN trips t ON t.id = b.trip_id LEFT JOIN suppliers s ON s.id = b.supplier_id
     WHERE b.org_id = ?${s.sql} AND b.service IN (?) AND b.service_date BETWEEN ? AND DATE_ADD(?, INTERVAL ? DAY)
       AND t.stage IN ('converted','on_trip','past') ORDER BY b.service_date, b.service, t.trip_no`,
    [req.orgId, ...s.params, services, from, from, days - 1]
  );
  return rows;
}

export function quoteDiff(req) {
  const s = scopeFilter(req);
  return query(
    `SELECT b.id, b.trip_id, b.service, b.title, b.service_date, b.status, b.quoted_cost, b.booked_amount, t.trip_no, t.guest_name, t.stage
     FROM bookings b JOIN trips t ON t.id = b.trip_id
     WHERE b.org_id = ?${s.sql} AND t.stage IN ('converted','on_trip','past') AND b.booked_amount IS NOT NULL AND ABS(b.booked_amount - b.quoted_cost) >= 1
     ORDER BY b.service_date DESC LIMIT 500`, [req.orgId, ...s.params]
  );
}

/** Everything a printable document needs: branding, offices, banks, templates. */
export async function orgDocs(orgId) {
  const org = await one(
    `SELECT id, name, legal_name, email, phone, address, city, state, pincode, country_code, tax_id, pan, website, base_currency, logo_url,
            brand_prefix, branding, header_image, footer_image FROM organizations WHERE id = ?`, [orgId]
  );
  const offices = await query('SELECT * FROM org_offices WHERE org_id = ? ORDER BY is_head DESC, name', [orgId]);
  const banks = await query("SELECT * FROM org_bank_accounts WHERE org_id = ? AND is_active = 1 AND show_on_docs = 1 AND kind IN ('bank','upi') ORDER BY is_default DESC", [orgId]);
  const saved = await query('SELECT tkey, subject, body, settings FROM org_templates WHERE org_id = ?', [orgId]);
  const templates = Object.fromEntries(TEMPLATES.map((t) => {
    const s = saved.find((x) => x.tkey === t.key);
    return [t.key, { subject: s?.subject ?? t.subject, body: s?.body ?? t.body, settings: { ...t.settings, ...(j(s?.settings, {}) || {}) } }];
  }));
  return { org: { ...org, branding: j(org.branding, {}) }, offices, banks, templates };
}

/** Trip check-in / check-out report (accounting): trips starting or ending in the period, with money. */
export async function checkInOut(req, from, to) {
  const s = scopeFilter(req);
  const [rows] = await pool.query(
    `SELECT t.id, t.trip_no, t.guest_name, t.guest_phone, t.start_date, t.end_date, t.nights, t.adults, t.children_ages, t.stage, t.currency,
            t.package_amount, t.destination_ids, u.name AS sales_name,
            COALESCE((SELECT SUM(i.paid_amount) FROM instalments i WHERE i.trip_id = t.id AND i.direction = 'in'), 0) AS received,
            COALESCE((SELECT SUM(b.booked_amount) FROM bookings b WHERE b.trip_id = t.id), 0) AS booked_cost,
            CASE WHEN t.start_date BETWEEN ? AND ? THEN 1 ELSE 0 END AS is_checkin,
            CASE WHEN t.end_date BETWEEN ? AND ? THEN 1 ELSE 0 END AS is_checkout
     FROM trips t
     LEFT JOIN users u ON u.id = t.sales_user_id
     WHERE t.org_id = ?${s.sql} AND t.stage IN ('converted','on_trip','past') AND (t.start_date BETWEEN ? AND ? OR t.end_date BETWEEN ? AND ?)
     ORDER BY t.start_date`,
    [from, to, from, to, req.orgId, ...s.params, from, to, from, to]
  );
  const ids = [...new Set(rows.flatMap((r) => j(r.destination_ids, []) || []))];
  const names = new Map();
  if (ids.length) { const [m] = await pool.query('SELECT id, name FROM master_records WHERE org_id = ? AND id IN (?)', [req.orgId, ids]); m.forEach((x) => names.set(x.id, x.name)); }
  return rows.map((r) => ({ ...r, destinations: (j(r.destination_ids, []) || []).map((x) => names.get(Number(x))).filter(Boolean).join(', '),
    children_ages: j(r.children_ages, []), due: Number(r.package_amount || 0) - Number(r.received || 0) }));
}
