import { query, one } from '../../core/db.js';

const LIST = `SELECT a.id, a.trip_id, a.quote_id, a.supplier_id, a.kind, a.title, a.file_name, a.mime, a.size, a.amount, a.currency, a.created_at,
                     (a.data IS NOT NULL) AS has_file, s.name AS supplier_name, t.trip_no, t.guest_name, u.name AS created_by_name
              FROM attachments a LEFT JOIN suppliers s ON s.id = a.supplier_id LEFT JOIN trips t ON t.id = a.trip_id LEFT JOIN users u ON u.id = a.created_by`;

export function list(orgId, f) {
  const where = ['a.org_id = ?']; const params = [orgId];
  for (const k of ['trip_id', 'supplier_id', 'quote_id']) if (f[k]) { where.push(`a.${k} = ?`); params.push(Number(f[k])); }
  if (f.kind) { where.push('a.kind = ?'); params.push(f.kind); }
  return query(`${LIST} WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT 500`, params);
}
export const get = (orgId, id) => one('SELECT * FROM attachments WHERE id = ? AND org_id = ?', [id, orgId]);
export async function create(orgId, b, userId) {
  const r = await query(
    `INSERT INTO attachments (org_id, trip_id, quote_id, supplier_id, kind, title, file_name, mime, size, data, text, amount, currency, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [orgId, b.trip_id, b.quote_id, b.supplier_id, b.kind, b.title, b.file_name, b.mime, b.size, b.data, b.text, b.amount, b.currency, userId]
  );
  return r.insertId;
}
export const update = (orgId, id, b) => query('UPDATE attachments SET title = ?, supplier_id = ?, quote_id = ?, amount = ?, currency = ?, text = COALESCE(?, text) WHERE id = ? AND org_id = ?',
  [b.title, b.supplier_id, b.quote_id, b.amount, b.currency, b.text, id, orgId]);
export const remove = (orgId, id) => query('DELETE FROM attachments WHERE id = ? AND org_id = ?', [id, orgId]);
