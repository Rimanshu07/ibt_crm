import { z } from 'zod';
import { validate, notFound, badRequest, zText, zOptId } from '../../core/http.js';
import { SUPPLIER_SERVICES } from '../../../../shared/catalog.js';
import { parseCsv } from '../rates/grid.js';
import * as M from './suppliers.model.js';

export async function list(req, res) {
  const r = await M.list(req.orgId, req.query);
  res.json({ data: r.rows, total: r.total, page: r.page, size: r.size, counts: await M.counts(req.orgId) });
}

export async function get(req, res) {
  const s = await M.get(req.orgId, Number(req.params.id));
  if (!s) throw notFound('Supplier');
  res.json({ data: { ...s, ...(await M.activity(req.orgId, s.id)) } });
}

const schema = z.object({
  name: z.string().trim().min(2, 'Supplier name is required').max(200), kind: z.string().trim().max(40).default('Company'),
  services: z.array(z.enum(SUPPLIER_SERVICES)).min(1, 'Choose what this supplier provides'),
  email: zText(150), phone: zText(40), address: zText(500), city: zText(100), state: zText(100), country: zText(100),
  tax_id: zText(50), pan: zText(20), notes: zText(5000), payment_pref_id: zOptId,
  contacts: z.array(z.object({ name: zText(120), designation: zText(80), phone: zText(40), email: zText(150) })).default([]),
  bank_accounts: z.array(z.object({ bank_name: zText(120), account_name: zText(150), account_no: zText(60), ifsc: zText(30), branch: zText(150), upi_id: zText(100) })).default([]),
  cab_types: z.array(z.string().max(100)).default([]),
});

export async function save(req, res) {
  const b = validate(schema, req.body);
  b.contacts = b.contacts.filter((c) => c.name || c.phone || c.email);
  b.bank_accounts = b.bank_accounts.filter((x) => x.account_no || x.upi_id);
  let id = Number(req.params.id) || null;
  if (id) { const r = await M.update(req.orgId, id, b); if (!r.affectedRows) throw notFound('Supplier'); }
  else {
    if (await M.byName(req.orgId, b.name)) throw badRequest('A supplier with this name already exists', { name: 'Already exists' });
    id = await M.create(req.orgId, b, req.user.id);
  }
  res.status(req.params.id ? 200 : 201).json({ data: { id }, message: 'Supplier saved' });
}

export async function setActive(req, res) {
  const { active } = validate(z.object({ active: z.boolean() }), req.body);
  await M.setActive(req.orgId, Number(req.params.id), active);
  res.json({ message: active ? 'Supplier enabled' : 'Supplier disabled' });
}

/* Flat CSV: name, services (a|b), kind, contact_name, contact_phone, email, phone, city, state, country, tax_id, pan */
const HEAD = ['name', 'services', 'kind', 'contact_name', 'contact_phone', 'email', 'phone', 'city', 'state', 'country', 'tax_id', 'pan'];
const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function exportCsv(req, res) {
  const { rows } = await M.list(req.orgId, { ...req.query, size: 500, status: 'all' });
  const lines = [HEAD.join(','), ...rows.map((s) => [s.name, s.services.join('|'), s.kind, s.contacts[0]?.name, s.contacts[0]?.phone, s.email, s.phone, s.city, s.state, s.country, s.tax_id, s.pan].map(cell).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="suppliers.csv"');
  res.send(lines.join('\n'));
}

export async function importCsv(req, res) {
  const { text, dry_run: dry } = validate(z.object({ text: z.string().min(5, 'The file is empty'), dry_run: z.boolean().default(false) }), req.body);
  const rows = parseCsv(text);
  const head = rows.shift().map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const errors = []; let created = 0; let updated = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const r = Object.fromEntries(head.map((h, k) => [h, rows[i][k] || '']));
    const services = r.services.split('|').map((s) => s.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean);
    const parsed = schema.safeParse({ ...r, services, contacts: r.contact_name || r.contact_phone ? [{ name: r.contact_name, phone: r.contact_phone }] : [] });
    if (!parsed.success) { errors.push(`Row ${i + 2}: ${parsed.error.issues[0].path.join('.')} – ${parsed.error.issues[0].message}`); continue; }
    if (dry) continue;
    const found = await M.byName(req.orgId, parsed.data.name);
    if (found) { await M.update(req.orgId, found.id, parsed.data); updated += 1; } else { await M.create(req.orgId, parsed.data, req.user.id); created += 1; }
  }
  res.json({ data: { errors, created, updated, rows: rows.length }, message: dry ? `Checked ${rows.length} rows, ${errors.length} problem(s)` : `${created} created, ${updated} updated` });
}
