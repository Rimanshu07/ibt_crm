import { z } from 'zod';
import { validate, notFound, zOptId } from '../../core/http.js';
import { notify } from '../../core/notify.js';
import { getTrip } from '../trips/trips.model.js';
import * as M from './tasks.model.js';

export async function list(req, res) { res.json({ data: await M.list(req, String(req.query.tab || 'today'), req.query.mine === '1') }); }

export async function create(req, res) {
  const b = validate(z.object({
    trip_id: zOptId, body: z.string().trim().min(1, 'Write something').max(1000), is_actionable: z.boolean().default(true),
    due_at: z.string().max(25).nullable().optional(), assignee_id: zOptId,
  }), req.body);
  const trip = b.trip_id ? await getTrip(req, b.trip_id) : null;
  b.due_at = b.due_at ? b.due_at.replace('T', ' ').slice(0, 16) : null;
  const id = await M.create(req.orgId, b, req.user.id);
  if (b.assignee_id && b.assignee_id !== req.user.id) {
    await notify(null, { orgId: req.orgId, userIds: [b.assignee_id], type: 'task.assigned', title: `${req.user.name} gave you a follow-up${trip ? ` on Trip ${trip.trip_no}` : ''}`, body: b.body, link: trip ? `/app/trips/${trip.id}` : '/app/tasks' });
  }
  res.status(201).json({ data: { id }, message: b.is_actionable ? 'Follow-up added' : 'Comment added' });
}

export async function toggle(req, res) {
  const r = await M.toggle(req.orgId, Number(req.params.id), req.user.id);
  if (!r.affectedRows) throw notFound('Task');
  res.json({ message: 'Updated' });
}
export async function remove(req, res) { await M.remove(req.orgId, Number(req.params.id), req.user.id); res.json({ message: 'Deleted' }); }
