import { one, query, transaction } from '../../core/db.js';

export const findUserByEmail = (email) => one('SELECT * FROM users WHERE email = ?', [email]);
export const findUserById = (id) => one('SELECT * FROM users WHERE id = ?', [id]);
export const orgEmailTaken = (email) => one('SELECT id FROM organizations WHERE email = ?', [email]);
export const countryExists = (code) => one('SELECT code FROM countries WHERE code = ?', [code]);
export const orgStatus = (orgId) => one('SELECT status, status_reason FROM organizations WHERE id = ?', [orgId]);
export const touchLogin = (id) => query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id]);

export function createOrgWithOwner(org, owner, hash) {
  return transaction(async (c) => {
    const [r] = await c.execute(
      `INSERT INTO organizations (name, email, phone, country_code, city, address, tax_id, base_currency, timezone, plan_id, status)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'pending')`,
      [org.name, org.email, org.phone, org.country_code, org.city, org.address, org.tax_id, org.base_currency, org.timezone, org.plan_id || null]
    );
    await c.execute('INSERT INTO users (org_id, is_org_owner, name, email, phone, designation, password_hash) VALUES (?,1,?,?,?,?,?)',
      [r.insertId, owner.name, owner.email, owner.phone, 'Owner', hash]);
    return r.insertId;
  });
}

export const meOrg = (orgId) => one(
  `SELECT o.id, o.name, o.legal_name, o.email, o.phone, o.country_code, o.city, o.base_currency, o.timezone,
          o.default_tax_rate, o.brand_prefix, o.logo_url, o.status, o.trial_ends_at, c.symbol AS currency_symbol
   FROM organizations o LEFT JOIN currencies c ON c.code = o.base_currency WHERE o.id = ?`, [orgId]
);
export const userRoles = (userId) => query('SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?', [userId]);
export const unreadCount = async (userId) => Number((await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId])).n);
export const updateProfile = (id, b) => query('UPDATE users SET name=?, phone=?, designation=? WHERE id=?', [b.name, b.phone, b.designation, id]);
export const updatePassword = (id, hash) => query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
