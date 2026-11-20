/** In-app notifications (bell icon). Failures never break the main action. */
import { query } from './db.js';

/** Notify specific users. `conn` may be a transaction connection or null. */
export async function notify(conn, { orgId, userIds, type, title, body = '', link = '' }) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(Number))];
  try {
    for (const uid of ids) {
      const sql = 'INSERT INTO notifications (org_id, user_id, type, title, body, link) VALUES (?,?,?,?,?,?)';
      const params = [orgId, uid, type, String(title).slice(0, 200), String(body || '').slice(0, 500), link || null];
      if (conn) await conn.execute(sql, params); else await query(sql, params);
    }
  } catch (e) {
    console.error('notify failed', e.message);
  }
}

/** Users of the organisation who hold a permission (owners always included). */
export async function usersWithPermission(orgId, perm) {
  const rows = await query(
    `SELECT DISTINCT u.id FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
     WHERE u.org_id = ? AND u.status = 'active' AND (u.is_org_owner = 1 OR rp.permission = ?)`, [orgId, perm]
  );
  return rows.map((r) => r.id);
}
