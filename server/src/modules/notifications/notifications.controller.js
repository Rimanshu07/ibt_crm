import * as M from './notifications.model.js';

export async function list(req, res) {
  res.json({ data: await M.list(req.user.id, req.query.unread === '1'), unread: await M.unread(req.user.id) });
}
export async function count(req, res) { res.json({ data: { unread: await M.unread(req.user.id) } }); }
export async function read(req, res) { await M.markRead(req.user.id, Number(req.params.id)); res.json({ message: 'Marked as read' }); }
export async function readAll(req, res) { await M.markAll(req.user.id); res.json({ message: 'All notifications marked as read' }); }
