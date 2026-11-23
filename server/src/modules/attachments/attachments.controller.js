import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { validate, notFound, badRequest, zOptId, zText } from '../../core/http.js';
import { getTrip, logTrip } from '../trips/trips.model.js';
import * as M from './attachments.model.js';

const MAX = 12 * 1024 * 1024; // 12 MB per file

export async function list(req, res) {
  if (req.query.trip_id) await getTrip(req, Number(req.query.trip_id));
  res.json({ data: await M.list(req.orgId, req.query) });
}

const schema = z.object({
  trip_id: zOptId, quote_id: zOptId, supplier_id: zOptId,
  kind: z.enum(['vendor_package', 'confirmation', 'invoice', 'other']).default('vendor_package'),
  title: z.string().trim().min(1, 'Give it a title').max(255),
  file_name: zText(255), mime: zText(100),
  data_base64: z.string().max(17_000_000).optional().default(''),
  text: z.string().max(2_000_000).optional().default(''),
  amount: z.union([z.null(), z.literal(''), z.coerce.number()]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
  currency: z.union([z.string().length(3), z.literal(''), z.null()]).optional().transform((v) => v || null),
});

/** Upload a vendor PDF (base64) and/or keep pasted email text. */
export async function create(req, res) {
  const b = validate(schema, req.body);
  if (!b.data_base64 && !b.text.trim()) throw badRequest('Upload a file or paste the text');
  if (b.trip_id) await getTrip(req, b.trip_id);
  const data = b.data_base64 ? Buffer.from(b.data_base64.replace(/^data:[^,]+,/, ''), 'base64') : null;
  if (data && data.length > MAX) throw badRequest('The file is larger than 12 MB');
  const id = await M.create(req.orgId, { ...b, data, size: data ? data.length : Buffer.byteLength(b.text), file_name: b.file_name || null, mime: b.mime || (data ? 'application/octet-stream' : 'text/plain'), text: b.text || null }, req.user.id);
  if (b.trip_id) await logTrip(null, req, b.trip_id, `attached "${b.title}"`);
  res.status(201).json({ data: { id }, message: 'Saved for records' });
}

export async function update(req, res) {
  const b = validate(schema.pick({ title: true, supplier_id: true, quote_id: true, amount: true, currency: true }).extend({ text: z.string().max(2_000_000).optional() }), req.body);
  const a = await M.get(req.orgId, Number(req.params.id));
  if (!a) throw notFound('Attachment');
  await M.update(req.orgId, a.id, { ...b, text: b.text ?? null });
  res.json({ message: 'Saved' });
}

/** Download the original file (or the pasted text as .txt). */
export async function download(req, res) {
  const a = await M.get(req.orgId, Number(req.params.id));
  if (!a) throw notFound('Attachment');
  if (a.trip_id) await getTrip(req, a.trip_id);
  const name = (a.file_name || `${a.title}.txt`).replace(/[^\w.\- ]+/g, '_');
  if (a.data) {
    res.setHeader('Content-Type', a.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${name}"`);
    return res.send(a.data);
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name.endsWith('.txt') ? name : `${name}.txt`}"`);
  res.send(a.text || '');
}

export async function text(req, res) {
  const a = await M.get(req.orgId, Number(req.params.id));
  if (!a) throw notFound('Attachment');
  res.json({ data: { id: a.id, title: a.title, text: a.text || '' } });
}

export async function remove(req, res) {
  const a = await M.get(req.orgId, Number(req.params.id));
  if (!a) throw notFound('Attachment');
  await M.remove(req.orgId, a.id);
  res.json({ message: 'Deleted' });
}
