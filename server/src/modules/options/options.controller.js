import { z } from 'zod';
import { validate } from '../../core/http.js';
import { DEFAULT_OPTIONS } from '../../../../shared/catalog.js';
import * as M from './options.model.js';

const KEY = /^[a-z0-9_]{2,60}$/;

/** GET /options?lists=cities,airlines → { cities: [...defaults + created], ... } */
export async function get(req, res) {
  const keys = String(req.query.lists || '').split(',').map((k) => k.trim()).filter((k) => KEY.test(k));
  const rows = await M.lists(req.orgId, keys);
  const out = {};
  for (const k of keys) {
    const created = rows.filter((r) => r.list_key === k).map((r) => r.value);
    out[k] = [...new Set([...(DEFAULT_OPTIONS[k] || []), ...created])];
  }
  res.json({ data: out });
}

/** Create a new dropdown value: POST /options/:list { value } */
export async function add(req, res) {
  const key = validate(z.string().regex(KEY, 'Unknown list'), req.params.list);
  const { value } = validate(z.object({ value: z.string().trim().min(1, 'Enter a value').max(150) }), req.body);
  await M.add(req.orgId, key, value, req.user.id);
  res.status(201).json({ data: { value }, message: `"${value}" added` });
}

export async function remove(req, res) {
  const { value } = validate(z.object({ value: z.string().min(1) }), req.query);
  await M.remove(req.orgId, req.params.list, value);
  res.json({ message: 'Removed' });
}
