import { query } from '../../core/db.js';
import { scopeFilter } from '../trips/trips.model.js';

export const WHEN = {
  today: 'k.done_at IS NULL AND DATE(k.due_at) = CURDATE()',
  overdue: 'k.done_at IS NULL AND k.due_at < CURDATE()',
  next7: 'k.done_at IS NULL AND DATE(k.due_at) BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)',
  upcoming: 'k.done_at IS NULL AND (k.due_at >= CURDATE() OR k.due_at IS NULL)',
  done: 'k.done_at IS NOT NULL',
  all: '1=1',
};

export function list(req, tab, mine) {
  const scope = scopeFilter(req);
  const where = ['k.org_id = ?', 'k.is_actionable = 1', `(k.trip_id IS NULL OR EXISTS (SELECT 1 FROM trips t WHERE t.id = k.trip_id${scope.sql}))`, WHEN[tab] || '1=1'];
  const params = [req.orgId, ...scope.params];
  if (mine) { where.push('(k.assignee_id = ? OR (k.assignee_id IS NULL AND k.created_by = ?))'); params.push(req.user.id, req.user.id); }
  return query(
    `SELECT k.*, t.trip_no, t.guest_name, t.stage, u.name AS assignee_name, c.name AS created_by_name
     FROM tasks k LEFT JOIN trips t ON t.id = k.trip_id LEFT JOIN users u ON u.id = k.assignee_id LEFT JOIN users c ON c.id = k.created_by
     WHERE ${where.join(' AND ')} ORDER BY k.done_at IS NOT NULL, k.due_at IS NULL, k.due_at LIMIT 500`, params
  );
}
export async function create(orgId, b, userId) {
  const r = await query('INSERT INTO tasks (org_id, trip_id, body, is_actionable, due_at, assignee_id, created_by) VALUES (?,?,?,?,?,?,?)',
    [orgId, b.trip_id || null, b.body, b.is_actionable ? 1 : 0, b.due_at, b.assignee_id || null, userId]);
  return r.insertId;
}
export const toggle = (orgId, id, userId) => query('UPDATE tasks SET done_at = IF(done_at IS NULL, NOW(), NULL), done_by = ? WHERE id = ? AND org_id = ?', [userId, id, orgId]);
export const remove = (orgId, id, userId) => query('DELETE FROM tasks WHERE id = ? AND org_id = ? AND created_by = ?', [id, orgId, userId]);
