import { query } from '../../core/db.js';
import { j } from '../../core/http.js';

export async function list(orgId, type, f = {}) {
  const params = [orgId, type];
  let where = 'org_id = ? AND type = ?';
  if (f.q) { where += ' AND name LIKE ?'; params.push(`%${f.q}%`); }
  if (f.active === '1') where += ' AND is_active = 1';
  const rows = await query(`SELECT id, name, data, is_active, updated_at FROM master_records WHERE ${where} ORDER BY name LIMIT 5000`, params);
  return rows.map((r) => ({ ...r, data: j(r.data, {}) }));
}
export const findByName = async (orgId, type, name) => (await query('SELECT id FROM master_records WHERE org_id = ? AND type = ? AND LOWER(name) = LOWER(?) LIMIT 1', [orgId, type, name]))[0] || null;
export async function insert(orgId, type, name, data, userId) {
  const r = await query('INSERT INTO master_records (org_id, type, name, data, created_by) VALUES (?,?,?,?,?)', [orgId, type, name, JSON.stringify(data), userId]);
  return r.insertId;
}
export const update = (orgId, type, id, name, data) => query('UPDATE master_records SET name = ?, data = ? WHERE id = ? AND org_id = ? AND type = ?', [name, JSON.stringify(data), id, orgId, type]);
export const setActive = (orgId, type, id, on) => query('UPDATE master_records SET is_active = ? WHERE id = ? AND org_id = ? AND type = ?', [on ? 1 : 0, id, orgId, type]);
export const remove = (orgId, type, id) => query('DELETE FROM master_records WHERE id = ? AND org_id = ? AND type = ?', [id, orgId, type]);
