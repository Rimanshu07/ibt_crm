import { notFound } from '../../core/http.js';
import * as M from './lookup.model.js';

export async function search(req, res) {
  if (!M.isRef(req.params.ref)) throw notFound('List');
  const ids = req.query.ids ? String(req.query.ids).split(',').map(Number).filter(Boolean) : null;
  res.json({ data: await M.search(req.orgId, req.params.ref, { q: String(req.query.q || ''), ids, service: String(req.query.service || ''), limit: Math.min(Number(req.query.limit) || 50, 500) }) });
}

export async function get(req, res) {
  const row = await M.get(req.orgId, req.params.ref, req.params.id);
  if (!row) throw notFound();
  res.json({ data: row });
}
