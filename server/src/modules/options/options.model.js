import { pool, query } from '../../core/db.js';

export async function lists(orgId, keys) {
  if (!keys.length) return [];
  const [rows] = await pool.query('SELECT list_key, value FROM options WHERE org_id = ? AND list_key IN (?) ORDER BY value', [orgId, keys]);
  return rows;
}
export const add = (orgId, key, value, userId) => query(
  'INSERT IGNORE INTO options (org_id, list_key, value, created_by) VALUES (?,?,?,?)', [orgId, key, value, userId]
);
export const remove = (orgId, key, value) => query('DELETE FROM options WHERE org_id = ? AND list_key = ? AND value = ?', [orgId, key, value]);
