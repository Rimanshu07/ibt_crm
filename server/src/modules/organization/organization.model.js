import { pool, one, query, transaction } from '../../core/db.js';
import { j } from '../../core/http.js';

/* Profile & branding */
export async function profile(orgId) {
  const o = await one(
    `SELECT id, name, legal_name, email, phone, country_code, city, state, pincode, address, tax_id, pan, website, base_currency, timezone,
            default_tax_rate, brand_prefix, logo_url, branding, header_image, footer_image, status, trial_ends_at, plan_id
     FROM organizations WHERE id = ?`, [orgId]
  );
  return o ? { ...o, branding: j(o.branding, {}) } : null;
}
export const updateProfile = (orgId, b) => query(
  `UPDATE organizations SET name=?, legal_name=?, phone=?, country_code=?, city=?, state=?, pincode=?, address=?, tax_id=?, pan=?, website=?,
     base_currency=?, timezone=?, default_tax_rate=?, brand_prefix=? WHERE id=?`,
  [b.name, b.legal_name, b.phone, b.country_code, b.city, b.state, b.pincode, b.address, b.tax_id, b.pan, b.website,
    b.base_currency, b.timezone, b.default_tax_rate, b.brand_prefix, orgId]
);
export const updateBranding = (orgId, b) => query(
  'UPDATE organizations SET logo_url=?, header_image=?, footer_image=?, branding=? WHERE id=?',
  [b.logo_url || null, b.header_image || null, b.footer_image || null, JSON.stringify(b.branding || {}), orgId]
);
export const features = (orgId) => query(
  `SELECT f.code, f.module, f.name, f.description, COALESCE(ofe.enabled, 0) AS enabled
   FROM features f LEFT JOIN org_features ofe ON ofe.feature_code = f.code AND ofe.org_id = ? ORDER BY f.sort_order`, [orgId]
);
export const staff = (orgId) => query("SELECT id, name, phone, email, designation FROM users WHERE org_id = ? AND status = 'active' ORDER BY name", [orgId]);

/* Generic simple CRUD for org child tables */
const TABLES = {
  offices: { table: 'org_offices', cols: ['name', 'address', 'city', 'state', 'country', 'pincode', 'phone', 'email', 'tax_id', 'is_head'], order: 'is_head DESC, name', flag: 'is_head' },
  'bank-accounts': { table: 'org_bank_accounts', cols: ['kind', 'name', 'bank_name', 'account_name', 'account_no', 'ifsc', 'swift', 'branch', 'upi_id', 'currency', 'opening_balance', 'show_on_docs', 'is_default', 'is_active'], order: 'is_active DESC, is_default DESC, name', flag: 'is_default' },
  'payment-prefs': { table: 'payment_preferences', cols: ['kind', 'service', 'name', 'parts', 'is_default'], order: 'kind, service, name', json: ['parts'] },
  content: { table: 'org_content', cols: ['kind', 'service', 'title', 'inclusions', 'exclusions', 'body', 'is_default'], order: 'kind, service, title', json: ['inclusions', 'exclusions'] },
};
export const tableDef = (name) => TABLES[name];

export async function listRows(orgId, name, filters = {}) {
  const t = TABLES[name];
  const where = ['org_id = ?']; const params = [orgId];
  for (const [k, v] of Object.entries(filters)) if (v) { where.push(`${k} = ?`); params.push(v); }
  const rows = await query(`SELECT * FROM ${t.table} WHERE ${where.join(' AND ')} ORDER BY ${t.order}`, params);
  return rows.map((r) => { for (const c of t.json || []) r[c] = j(r[c], []); return r; });
}

export async function saveRow(orgId, name, id, b) {
  const t = TABLES[name];
  const vals = t.cols.map((c) => ((t.json || []).includes(c) ? JSON.stringify(b[c] ?? []) : (typeof b[c] === 'boolean' ? (b[c] ? 1 : 0) : b[c] ?? null)));
  return transaction(async (c) => {
    // only one head office / default account / default preference per kind+service
    if (t.flag && b[t.flag]) await c.execute(`UPDATE ${t.table} SET ${t.flag} = 0 WHERE org_id = ?`, [orgId]);
    if (name === 'payment-prefs' && b.is_default) await c.execute('UPDATE payment_preferences SET is_default = 0 WHERE org_id = ? AND kind = ? AND service = ?', [orgId, b.kind, b.service]);
    if (id) {
      const [r] = await c.execute(`UPDATE ${t.table} SET ${t.cols.map((x) => `${x}=?`).join(', ')} WHERE id = ? AND org_id = ?`, [...vals, id, orgId]);
      return r.affectedRows ? id : null;
    }
    const [r] = await c.execute(`INSERT INTO ${t.table} (org_id, ${t.cols.join(', ')}) VALUES (?, ${t.cols.map(() => '?').join(', ')})`, [orgId, ...vals]);
    return r.insertId;
  });
}
export const deleteRow = (orgId, name, id) => query(`DELETE FROM ${TABLES[name].table} WHERE id = ? AND org_id = ?`, [id, orgId]);

/* Templates */
export const templates = (orgId) => query('SELECT tkey, subject, body, settings, updated_at FROM org_templates WHERE org_id = ?', [orgId]);
export const saveTemplate = (orgId, key, b, userId) => query(
  `INSERT INTO org_templates (org_id, tkey, subject, body, settings, updated_by) VALUES (?,?,?,?,?,?)
   ON DUPLICATE KEY UPDATE subject = VALUES(subject), body = VALUES(body), settings = VALUES(settings), updated_by = VALUES(updated_by)`,
  [orgId, key, b.subject, b.body, JSON.stringify(b.settings || {}), userId]
);
export const resetTemplate = (orgId, key) => query('DELETE FROM org_templates WHERE org_id = ? AND tkey = ?', [orgId, key]);

/* Users */
export async function users(orgId) {
  const list = await query(
    'SELECT id, name, email, phone, designation, status, is_org_owner, last_login_at, created_at FROM users WHERE org_id = ? ORDER BY is_org_owner DESC, name', [orgId]
  );
  const links = await query('SELECT ur.user_id, r.id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.org_id = ?', [orgId]);
  list.forEach((u) => { u.roles = links.filter((l) => l.user_id === u.id).map(({ id, name }) => ({ id, name })); });
  return list;
}
export const userById = (orgId, id) => one('SELECT * FROM users WHERE id = ? AND org_id = ?', [id, orgId]);
export const emailUsedBy = (email, exceptId = 0) => one('SELECT id FROM users WHERE email = ? AND id <> ?', [email, exceptId]);
export async function roleIdsValid(orgId, ids) {
  const [rows] = await pool.query('SELECT id FROM roles WHERE org_id = ? AND id IN (?)', [orgId, ids]);
  return rows.length === new Set(ids).size;
}
export function saveUser(orgId, id, b, hash) {
  return transaction(async (c) => {
    let uid = id;
    if (uid) {
      await c.execute('UPDATE users SET name=?, email=?, phone=?, designation=?, status=? WHERE id=?', [b.name, b.email, b.phone, b.designation, b.status, uid]);
      if (hash) await c.execute('UPDATE users SET password_hash=? WHERE id=?', [hash, uid]);
      await c.execute('DELETE FROM user_roles WHERE user_id = ?', [uid]);
    } else {
      const [r] = await c.execute('INSERT INTO users (org_id, name, email, phone, designation, password_hash, status) VALUES (?,?,?,?,?,?,?)',
        [orgId, b.name, b.email, b.phone, b.designation, hash, b.status]);
      uid = r.insertId;
    }
    for (const roleId of b.role_ids) await c.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)', [uid, roleId]);
    return uid;
  });
}

/* Roles */
export async function roles(orgId) {
  const list = await query(
    `SELECT r.*, (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count FROM roles r WHERE r.org_id = ? ORDER BY r.is_system DESC, r.name`, [orgId]
  );
  const perms = await query('SELECT rp.role_id, rp.permission FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.org_id = ?', [orgId]);
  list.forEach((r) => { r.permissions = perms.filter((p) => p.role_id === r.id).map((p) => p.permission); });
  return list;
}
export const roleByName = (orgId, name, exceptId = 0) => one('SELECT id FROM roles WHERE org_id = ? AND name = ? AND id <> ?', [orgId, name, exceptId]);
export const roleById = (orgId, id) => one(
  'SELECT r.*, (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count FROM roles r WHERE r.id = ? AND r.org_id = ?', [id, orgId]
);
export function saveRole(orgId, id, b, perms) {
  return transaction(async (c) => {
    let rid = id;
    if (rid) {
      await c.execute('UPDATE roles SET name=?, description=?, scope=? WHERE id=?', [b.name, b.description, b.scope, rid]);
      await c.execute('DELETE FROM role_permissions WHERE role_id = ?', [rid]);
    } else {
      const [r] = await c.execute('INSERT INTO roles (org_id, name, description, scope) VALUES (?,?,?,?)', [orgId, b.name, b.description, b.scope]);
      rid = r.insertId;
    }
    for (const p of perms) await c.execute('INSERT INTO role_permissions (role_id, permission) VALUES (?,?)', [rid, p]);
  });
}
export const deleteRole = (id) => query('DELETE FROM roles WHERE id = ?', [id]);

/* Taxes */
export const taxes = (orgId) => query('SELECT * FROM tax_types WHERE org_id = ? ORDER BY is_default DESC, name', [orgId]);
export function saveTax(orgId, id, b) {
  return transaction(async (c) => {
    if (b.is_default) await c.execute('UPDATE tax_types SET is_default = 0 WHERE org_id = ?', [orgId]);
    if (id) await c.execute('UPDATE tax_types SET name=?, rate=?, is_default=? WHERE id=? AND org_id=?', [b.name, b.rate, b.is_default ? 1 : 0, id, orgId]);
    else await c.execute('INSERT INTO tax_types (org_id, name, rate, is_default) VALUES (?,?,?,?)', [orgId, b.name, b.rate, b.is_default ? 1 : 0]);
    if (b.is_default) await c.execute('UPDATE organizations SET default_tax_rate = ? WHERE id = ?', [b.rate, orgId]);
  });
}
export const deleteTax = (orgId, id) => query('DELETE FROM tax_types WHERE id = ? AND org_id = ?', [id, orgId]);
