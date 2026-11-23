import { pool, query, one } from '../../core/db.js';
import { DEFAULT_ROLES } from '../../config/permissions.js';
import { DEFAULT_CONTENT } from '../../../../shared/templates.js';
import { describePref } from '../../../../shared/pricing.js';

export const statusCounts = () => query('SELECT status, COUNT(*) AS n FROM organizations GROUP BY status');
export const activeUsers = async () => Number((await one("SELECT COUNT(*) AS n FROM users WHERE org_id IS NOT NULL AND status = 'active'")).n);
export const newThisMonth = async () => Number((await one("SELECT COUNT(*) AS n FROM organizations WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')")).n);
export const activeOrgIds = () => query("SELECT id FROM organizations WHERE status = 'active'");
export const pendingOrgs = () => query("SELECT id, name, email, country_code, city, created_at FROM organizations WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10");
export const signups = () => query(
  "SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS n FROM organizations WHERE created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 5 MONTH) GROUP BY month ORDER BY month"
);
export const platformTotals = async () => one(
  `SELECT (SELECT COUNT(*) FROM trips) AS trips, (SELECT COUNT(*) FROM quotes) AS quotes, (SELECT COUNT(*) FROM bookings) AS bookings,
          (SELECT COUNT(*) FROM trips WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS trips_30d,
          (SELECT COUNT(*) FROM users WHERE last_login_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS users_active_7d,
          (SELECT COALESCE(SUM(amount),0) FROM platform_invoices WHERE status = 'due') AS invoices_due`
);
export const topOrgs = () => query(
  `SELECT o.id, o.name, (SELECT COUNT(*) FROM trips t WHERE t.org_id = o.id AND t.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS trips_30d,
          (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.status = 'active') AS users
   FROM organizations o WHERE o.status = 'active' ORDER BY trips_30d DESC LIMIT 8`
);
export const trialsEnding = () => query(
  "SELECT id, name, trial_ends_at FROM organizations WHERE status = 'active' AND trial_ends_at BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY) ORDER BY trial_ends_at"
);

export function orgs(f) {
  const where = []; const params = [];
  if (f.status) { where.push('o.status = ?'); params.push(f.status); }
  if (f.plan_id) { where.push('o.plan_id = ?'); params.push(Number(f.plan_id)); }
  if (f.country) { where.push('o.country_code = ?'); params.push(f.country); }
  if (f.q) { const q = `%${f.q}%`; where.push('(o.name LIKE ? OR o.email LIKE ? OR o.phone LIKE ? OR o.city LIKE ?)'); params.push(q, q, q, q); }
  return query(
    `SELECT o.id, o.name, o.email, o.phone, o.country_code, o.city, o.base_currency, o.status, o.created_at, o.trial_ends_at, p.name AS plan_name,
            (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.status = 'active') AS active_users,
            (SELECT COUNT(*) FROM trips t WHERE t.org_id = o.id) AS trips,
            (SELECT MAX(u.last_login_at) FROM users u WHERE u.org_id = o.id) AS last_login_at,
            (SELECT u.name FROM users u WHERE u.org_id = o.id AND u.is_org_owner = 1 LIMIT 1) AS owner_name
     FROM organizations o LEFT JOIN plans p ON p.id = o.plan_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY FIELD(o.status,'pending','active','suspended','rejected'), o.created_at DESC`, params
  );
}

export const org = (id) => one('SELECT o.*, c.name AS country_name, p.name AS plan_name FROM organizations o LEFT JOIN countries c ON c.code = o.country_code LEFT JOIN plans p ON p.id = o.plan_id WHERE o.id = ?', [id]);
export const orgUsers = (id) => query(
  `SELECT u.id, u.name, u.email, u.phone, u.designation, u.status, u.is_org_owner, u.last_login_at, u.created_at, GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ', ') AS roles
   FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id WHERE u.org_id = ? GROUP BY u.id ORDER BY u.is_org_owner DESC, u.name`, [id]
);
export const orgFeatureList = (id) => query(
  `SELECT f.code, f.module, f.name, f.description, COALESCE(ofe.enabled, 0) AS enabled FROM features f
   LEFT JOIN org_features ofe ON ofe.feature_code = f.code AND ofe.org_id = ? ORDER BY f.sort_order`, [id]
);
export const orgUsage = (id) => one(
  `SELECT (SELECT COUNT(*) FROM trips WHERE org_id = ?) AS trips,
          (SELECT COUNT(*) FROM trips WHERE org_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS trips_30d,
          (SELECT COUNT(*) FROM trips WHERE org_id = ? AND converted_at IS NOT NULL) AS conversions,
          (SELECT COUNT(*) FROM quotes WHERE org_id = ?) AS quotes,
          (SELECT COUNT(*) FROM bookings WHERE org_id = ?) AS bookings,
          (SELECT COUNT(*) FROM hotels WHERE org_id = ?) AS hotels,
          (SELECT COUNT(*) FROM suppliers WHERE org_id = ?) AS suppliers,
          (SELECT COUNT(*) FROM rates WHERE org_id = ?) AS rates,
          (SELECT COALESCE(SUM(package_amount),0) FROM trips WHERE org_id = ? AND converted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS sales_30d,
          (SELECT MAX(created_at) FROM audit_logs WHERE org_id = ?) AS last_activity`, Array(10).fill(id)
);
export const orgNotes = (id) => query('SELECT n.*, u.name AS user_name FROM admin_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.org_id = ? ORDER BY n.id DESC', [id]);
export const addNote = (orgId, userId, body) => query('INSERT INTO admin_notes (org_id, user_id, body) VALUES (?,?,?)', [orgId, userId, body]);
export const orgAudit = (id) => query('SELECT a.*, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.org_id = ? ORDER BY a.id DESC LIMIT 100', [id]);

export async function applyPlanFeatures(conn, orgId, planId, adminId) {
  await conn.execute('DELETE FROM org_features WHERE org_id = ?', [orgId]);
  await conn.execute(
    `INSERT INTO org_features (org_id, feature_code, enabled, updated_by) SELECT ?, f.code, IF(pf.feature_code IS NULL, 0, 1), ?
     FROM features f LEFT JOIN plan_features pf ON pf.feature_code = f.code AND pf.plan_id = ?`, [orgId, adminId, planId]
  );
}

const SUPPLIER_PREFS = [
  [{ event: 'checkin_date', offset_days: -7, pct: 100 }], [{ event: 'checkout_month_end', offset_days: 15, pct: 100 }],
  [{ event: 'booking_date', offset_days: 0, pct: 100 }], [{ event: 'checkout_date', offset_days: 7, pct: 100 }],
  [{ event: 'booking_date', offset_days: 0, pct: 40 }, { event: 'checkin_date', offset_days: -7, pct: 60 }],
  [{ event: 'booking_date', offset_days: 0, pct: 50 }, { event: 'checkin_date', offset_days: -30, pct: 50 }],
  [{ event: 'booking_date', offset_days: 0, pct: 50 }, { event: 'checkin_date', offset_days: -15, pct: 50 }],
  [{ event: 'booking_date', offset_days: 0, pct: 25 }, { event: 'checkin_date', offset_days: -2, pct: 75 }],
];
const CUSTOMER_PREFS = [
  [{ event: 'booking_date', offset_days: 0, pct: 50 }, { event: 'trip_start', offset_days: -15, pct: 50 }],
  [{ event: 'booking_date', offset_days: 0, pct: 100 }],
  [{ event: 'booking_date', offset_days: 0, pct: 25 }, { event: 'trip_start', offset_days: -30, pct: 50 }, { event: 'trip_start', offset_days: -7, pct: 25 }],
];

/** First approval: roles, tax, starter content, payment preferences, a cash account. */
export async function seedOrganisation(c, org) {
  const [[existing]] = await c.execute('SELECT COUNT(*) AS n FROM roles WHERE org_id = ?', [org.id]);
  if (Number(existing.n) > 0) return;
  for (const role of DEFAULT_ROLES) {
    const [r] = await c.execute('INSERT INTO roles (org_id, name, description, scope, is_system) VALUES (?,?,?,?,1)', [org.id, role.name, role.description, role.scope]);
    for (const p of role.permissions) await c.execute('INSERT INTO role_permissions (role_id, permission) VALUES (?,?)', [r.insertId, p]);
    if (role.name === 'Admin') await c.execute('INSERT IGNORE INTO user_roles (user_id, role_id) SELECT id, ? FROM users WHERE org_id = ? AND is_org_owner = 1', [r.insertId, org.id]);
  }
  const india = org.country_code === 'IN';
  await c.execute('INSERT INTO tax_types (org_id, name, rate, is_default) VALUES (?,?,?,1)', [org.id, india ? 'GST' : 'Tax', india ? 5 : 0]);
  await c.execute('UPDATE organizations SET default_tax_rate = ? WHERE id = ?', [india ? 5 : 0, org.id]);
  for (const x of DEFAULT_CONTENT) {
    await c.execute('INSERT INTO org_content (org_id, kind, service, title, inclusions, exclusions, body) VALUES (?,?,?,?,?,?,?)',
      [org.id, x.kind, x.service, x.title, JSON.stringify(x.inclusions || []), JSON.stringify(x.exclusions || []), x.body || null]);
  }
  for (const [i, parts] of SUPPLIER_PREFS.entries()) {
    await c.execute("INSERT INTO payment_preferences (org_id, kind, service, name, parts, is_default) VALUES (?, 'supplier', 'all', ?, ?, ?)", [org.id, describePref(parts), JSON.stringify(parts), i === 0 ? 1 : 0]);
  }
  for (const [i, parts] of CUSTOMER_PREFS.entries()) {
    await c.execute("INSERT INTO payment_preferences (org_id, kind, service, name, parts, is_default) VALUES (?, 'customer', 'all', ?, ?, ?)", [org.id, describePref(parts), JSON.stringify(parts), i === 0 ? 1 : 0]);
  }
  await c.execute("INSERT INTO org_bank_accounts (org_id, kind, name, currency, show_on_docs, is_default) VALUES (?, 'cash', 'Cash in hand', ?, 0, 0)", [org.id, org.base_currency]);
  await c.execute("INSERT INTO org_offices (org_id, name, address, city, country, phone, email, tax_id, is_head) VALUES (?, 'Head Office', ?, ?, ?, ?, ?, ?, 1)",
    [org.id, org.address || null, org.city || null, org.country_code, org.phone || null, org.email, org.tax_id || null]);
}

/* Plans & features */
export async function plans() {
  const list = await query('SELECT p.*, (SELECT COUNT(*) FROM organizations o WHERE o.plan_id = p.id) AS org_count FROM plans p ORDER BY p.id');
  const pf = await query('SELECT plan_id, feature_code FROM plan_features');
  list.forEach((p) => { p.features = pf.filter((x) => x.plan_id === p.id).map((x) => x.feature_code); });
  return list;
}
export async function savePlanFeatures(planId, features) {
  await query('DELETE FROM plan_features WHERE plan_id = ?', [planId]);
  if (features.length) await pool.query('INSERT INTO plan_features (plan_id, feature_code) SELECT ?, code FROM features WHERE code IN (?)', [planId, features]);
}
export const features = () => query('SELECT f.*, (SELECT COUNT(*) FROM org_features o WHERE o.feature_code = f.code AND o.enabled = 1) AS org_count FROM features f ORDER BY f.sort_order');

/* Invoices */
export const invoices = (f) => query(
  `SELECT i.*, o.name AS org_name FROM platform_invoices i JOIN organizations o ON o.id = i.org_id
   WHERE (? = '' OR i.period = ?) AND (? = '' OR i.status = ?) AND (? = 0 OR i.org_id = ?) ORDER BY i.period DESC, o.name`,
  [f.period || '', f.period || '', f.status || '', f.status || '', Number(f.org_id) || 0, Number(f.org_id) || 0]
);

/* Super admins */
export const superAdmins = () => query('SELECT id, name, email, phone, status, last_login_at, created_at FROM users WHERE is_super_admin = 1 ORDER BY name');
