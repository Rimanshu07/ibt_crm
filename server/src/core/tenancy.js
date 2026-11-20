/** Organisation-level helpers: features, permissions, billing, audit log. */
import { query, one } from './db.js';
import { PERMISSIONS } from '../config/permissions.js';

export async function audit(req, action, targetType, targetId, details) {
  try {
    await query(
      'INSERT INTO audit_logs (org_id, user_id, action, target_type, target_id, details) VALUES (?,?,?,?,?,?)',
      [req.user?.org_id ?? null, req.user?.id ?? null, action, targetType, targetId == null ? null : String(targetId),
        details ? JSON.stringify(details) : null]
    );
  } catch (e) {
    console.error('audit failed', e.message);
  }
}

export async function orgFeatures(orgId) {
  const rows = await query('SELECT feature_code FROM org_features WHERE org_id = ? AND enabled = 1', [orgId]);
  return rows.map((r) => r.feature_code);
}

/** Role permissions limited to features the organisation has. */
export async function userPermissions(userId, features) {
  const rows = await query(
    `SELECT DISTINCT rp.permission FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id WHERE ur.user_id = ?`, [userId]
  );
  const enabled = new Set(features);
  const allowed = new Set(PERMISSIONS.filter((p) => !p.feature || enabled.has(p.feature)).map((p) => p.code));
  return rows.map((r) => r.permission).filter((p) => allowed.has(p));
}

/** Monthly charge for one organisation: org fee + user fee x active users. */
export async function orgBilling(orgId) {
  const row = await one(
    `SELECT o.id, o.org_fee_override, o.user_fee_override, p.id AS plan_id, p.name AS plan_name, p.currency,
            p.org_fee_monthly, p.user_fee_monthly, p.max_users,
            (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.status = 'active') AS active_users
     FROM organizations o LEFT JOIN plans p ON p.id = o.plan_id WHERE o.id = ?`, [orgId]
  );
  if (!row) return null;
  const orgFee = Number(row.org_fee_override ?? row.org_fee_monthly ?? 0);
  const userFee = Number(row.user_fee_override ?? row.user_fee_monthly ?? 0);
  const users = Number(row.active_users || 0);
  return {
    plan_id: row.plan_id, plan_name: row.plan_name, currency: row.currency || 'INR',
    org_fee: orgFee, user_fee: userFee, active_users: users, max_users: row.max_users,
    monthly_total: Math.round((orgFee + userFee * users) * 100) / 100,
  };
}
