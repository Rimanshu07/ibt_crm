import { query, one } from '../../core/db.js';

export const list = (userId, unreadOnly) => query(
  `SELECT * FROM notifications WHERE user_id = ?${unreadOnly ? ' AND read_at IS NULL' : ''} ORDER BY id DESC LIMIT 200`, [userId]
);
export const unread = async (userId) => Number((await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId])).n);
export const markRead = (userId, id) => query('UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL', [id, userId]);
export const markAll = (userId) => query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [userId]);
