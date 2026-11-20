import { z } from 'zod';
import { validate, notFound, zText, zDate } from '../../core/http.js';
import * as M from './transport.model.js';

export async function list(req, res) { const r = await M.list(req.orgId, req.query); res.json({ data: r.rows, total: r.total, page: r.page, size: r.size }); }
export async function get(req, res) { const s = await M.get(req.orgId, Number(req.params.id)); if (!s) throw notFound('Service'); res.json({ data: s }); }
export async function locations(req, res) { res.json({ data: await M.locations(req.orgId) }); }

const optNum = z.union([z.coerce.number().min(0), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v === undefined ? null : v));
const schema = z.object({
  duty_code: zText(30), from_location: z.string().trim().min(2, 'Start point is required').max(150), from_short: zText(30),
  to_location: zText(150), to_short: zText(30), service: z.string().trim().min(2, 'Service is required').max(150), code: zText(60),
  distance_km: optNum, start_time: zText(10), duration_mins: optNum, day_schedule: zText(5000),
  closing_weekdays: zText(40), closing_dates: z.array(z.object({ from: zDate, to: zDate })).default([]),
});
export async function save(req, res) {
  const b = validate(schema, req.body);
  let id = Number(req.params.id) || null;
  if (id) { const r = await M.update(req.orgId, id, b); if (!r.affectedRows) throw notFound('Service'); } else id = await M.create(req.orgId, b);
  res.status(req.params.id ? 200 : 201).json({ data: { id }, message: 'Transport service saved' });
}
export async function setActive(req, res) {
  const { active } = validate(z.object({ active: z.boolean() }), req.body);
  await M.setActive(req.orgId, Number(req.params.id), active);
  res.json({ message: active ? 'Enabled' : 'Disabled' });
}
