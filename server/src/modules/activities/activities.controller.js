import { z } from 'zod';
import { validate, notFound, zText, zDate } from '../../core/http.js';
import * as M from './activities.model.js';

export async function list(req, res) { const r = await M.list(req.orgId, req.query); res.json({ data: r.rows, total: r.total, page: r.page, size: r.size }); }
export async function get(req, res) { const a = await M.get(req.orgId, Number(req.params.id)); if (!a) throw notFound('Activity'); res.json({ data: a }); }
export async function cities(req, res) { res.json({ data: await M.cities(req.orgId) }); }

const optNum = z.union([z.coerce.number().min(0), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v === undefined ? null : v));
const schema = z.object({
  name: z.string().trim().min(2, 'Activity name is required').max(200), city: zText(100), description: zText(5000),
  services: z.array(z.object({
    id: z.coerce.number().int().optional(), name: z.string().trim().min(1, 'Ticket / service name is required').max(200), code: zText(60),
    description: zText(5000), open_time: zText(10), close_time: zText(10), duration_mins: optNum, slots: zText(255),
    child_age_from: z.coerce.number().int().min(0).default(6), child_age_to: z.coerce.number().int().min(0).default(12),
    closing_weekdays: zText(40), closing_dates: z.array(z.object({ from: zDate, to: zDate })).default([]), is_active: z.boolean().default(true),
  })).min(1, 'Add at least one ticket type / service'),
});
export async function save(req, res) {
  const b = validate(schema, req.body);
  const id = await M.save(req.orgId, Number(req.params.id) || null, b);
  if (!id) throw notFound('Activity');
  res.status(req.params.id ? 200 : 201).json({ data: { id }, message: 'Activity saved' });
}
export async function setActive(req, res) {
  const { active } = validate(z.object({ active: z.boolean() }), req.body);
  await M.setActive(req.orgId, Number(req.params.id), active);
  res.json({ message: active ? 'Enabled' : 'Disabled' });
}
