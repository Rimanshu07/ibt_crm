import { z } from 'zod';
import { validate, notFound, badRequest, zDate, zOptId, zText } from '../../core/http.js';
import { audit } from '../../core/tenancy.js';
import * as M from './hotels.model.js';

export async function list(req, res) {
  const r = await M.list(req.orgId, req.query);
  res.json({ data: r.rows, total: r.total, page: r.page, size: r.size });
}

export async function get(req, res) {
  const h = await M.get(req.orgId, Number(req.params.id));
  if (!h) throw notFound('Hotel');
  res.json({ data: { ...h, ...(await M.activity(req.orgId, h.id)) } });
}

const room = z.object({ name: z.string().trim().min(1).max(150), aweb: z.coerce.number().int().min(0).default(1), cweb: z.coerce.number().int().min(0).default(1), cnb: z.coerce.number().int().min(0).default(1), rooms: z.union([z.coerce.number().int().min(0), z.null()]).optional() });
const contact = z.object({ name: zText(120), designation: zText(80), phone: zText(40), email: zText(150) });
const schema = z.object({
  name: z.string().trim().min(2, 'Hotel name is required').max(200),
  group_name: zText(150), location: z.string().trim().min(2, 'Location is required').max(255),
  star: zText(20), address: zText(500),
  meal_plans: z.array(z.string().trim().max(20)).min(1, 'Choose at least one meal plan'),
  room_types: z.array(room).min(1, 'Add at least one room type'),
  checkin_time: z.string().max(10).default('12:00'), checkout_time: z.string().max(10).default('11:00'),
  child_age_from: z.coerce.number().int().min(0).max(17).default(6), child_age_to: z.coerce.number().int().min(0).max(17).default(12),
  payment_pref_id: zOptId, supplier_id: zOptId, phone: zText(40), email: zText(150), link: zText(255),
  contacts: z.array(contact).default([]), notes: zText(5000),
});

export async function save(req, res) {
  const b = validate(schema, req.body);
  b.city = b.location.split(',')[0].trim();
  if (b.child_age_to < b.child_age_from) throw badRequest('Child age range is wrong', { child_age_to: 'Must be more than the start age' });
  let id = Number(req.params.id) || null;
  if (id) { const r = await M.update(req.orgId, id, b, req.user.id); if (!r.affectedRows) throw notFound('Hotel'); }
  else id = await M.create(req.orgId, b, req.user.id);
  res.status(req.params.id ? 200 : 201).json({ data: { id }, message: 'Hotel saved' });
}

export async function setActive(req, res) {
  const { active } = validate(z.object({ active: z.boolean() }), req.body);
  await M.setActive(req.orgId, Number(req.params.id), active);
  res.json({ message: active ? 'Hotel enabled' : 'Hotel disabled. It no longer appears in quotes.' });
}

export async function saveNotes(req, res) {
  const { notes } = validate(z.object({ notes: zText(5000) }), req.body);
  await M.updateNotes(req.orgId, Number(req.params.id), notes);
  res.json({ message: 'Notes saved' });
}

export async function saveClosures(req, res) {
  const h = await M.get(req.orgId, Number(req.params.id));
  if (!h) throw notFound('Hotel');
  const { closures } = validate(z.object({ closures: z.array(z.object({
    kind: z.enum(['soldout', 'blackout']), room_types: z.array(z.string()).default([]), date_from: zDate, date_to: zDate,
  })) }), req.body);
  if (closures.some((c) => c.date_to < c.date_from)) throw badRequest('An end date is before its start date');
  await M.saveClosures(h.id, closures);
  res.json({ message: 'Soldout and blackout dates saved' });
}

export async function merge(req, res) {
  const b = validate(z.object({ target_id: z.coerce.number().int(), source_ids: z.array(z.coerce.number().int()).min(1, 'Choose the duplicates') }), req.body);
  if (b.source_ids.includes(b.target_id)) throw badRequest('The hotel to keep cannot also be a duplicate');
  for (const id of [b.target_id, ...b.source_ids]) if (!(await M.get(req.orgId, id))) throw notFound('Hotel');
  await M.merge(req.orgId, b.target_id, b.source_ids);
  await audit(req, 'hotels.merged', 'hotel', b.target_id, b);
  res.json({ message: `${b.source_ids.length} hotel(s) merged` });
}

export async function meta(req, res) { res.json({ data: { groups: await M.groups(req.orgId), cities: await M.cities(req.orgId) } }); }
