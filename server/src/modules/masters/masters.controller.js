import { z } from 'zod';
import { ApiError, validate, notFound, badRequest } from '../../core/http.js';
import { normalizeFields, refIdSets } from '../../core/fields.js';
import { names, search } from '../lookup/lookup.model.js';
import { MASTER_TYPES } from '../../../../shared/catalog.js';
import { parseCsv } from '../rates/grid.js';
import * as M from './masters.model.js';

/** Resolves :type and checks its feature is on. */
export function typeGuard(req, _res, next) {
  const def = MASTER_TYPES[req.params.type];
  if (!def) return next(notFound('Master'));
  if (def.feature && !req.features.includes(def.feature)) return next(new ApiError(403, 'FEATURE_DISABLED', 'This feature is not enabled for your organisation'));
  req.def = def;
  next();
}

const refFields = (def) => def.fields.filter((f) => f.type === 'ref');
const recordName = (type, d, refs) => (type === 'train_fare'
  ? `${refs.train?.get(Number(d.train_id)) || ''} · ${d.travel_class} · ${d.valid_from}→${d.valid_to}`
  : type === 'train' ? `${d.number} ${d.name}` : String(d.name || ''));

async function refMaps(orgId, def, rows) {
  const maps = {};
  for (const f of refFields(def)) maps[f.ref] = await names(orgId, f.ref, rows.map((r) => r[f.key]));
  return maps;
}

export async function list(req, res) {
  const rows = await M.list(req.orgId, req.params.type, req.query);
  const maps = await refMaps(req.orgId, req.def, rows.map((r) => r.data));
  res.json({ data: rows.map((r) => {
    const _refs = {};
    refFields(req.def).forEach((f) => { if (r.data[f.key]) _refs[f.key] = maps[f.ref]?.get(Number(r.data[f.key])) || ''; });
    return { ...r, _refs };
  }) });
}

async function clean(req, input) {
  const sets = await refIdSets(req.orgId, req.def.fields, [input]);
  const { data, errors } = normalizeFields(req.def.fields, input, { refIds: sets });
  if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields', errors);
  const name = recordName(req.params.type, data, await refMaps(req.orgId, req.def, [data])).slice(0, 200);
  if (!name.trim()) throw badRequest('Name is required', { name: 'Required' });
  return { data, name };
}

export async function save(req, res) {
  const { data, name } = await clean(req, req.body);
  let id = Number(req.params.id) || null;
  if (id) { const r = await M.update(req.orgId, req.params.type, id, name, data); if (!r.affectedRows) throw notFound(); }
  else id = await M.insert(req.orgId, req.params.type, name, data, req.user.id);
  res.status(req.params.id ? 200 : 201).json({ data: { id, name }, message: `${req.def.label} saved` });
}

export async function setActive(req, res) {
  const { active } = validate(z.object({ active: z.boolean() }), req.body);
  await M.setActive(req.orgId, req.params.type, Number(req.params.id), active);
  res.json({ message: active ? 'Enabled' : 'Disabled' });
}

export async function remove(req, res) {
  try { await M.remove(req.orgId, req.params.type, Number(req.params.id)); } catch { throw badRequest('This record is in use. Disable it instead.'); }
  res.json({ message: 'Deleted' });
}

/* ------------------------------ CSV ------------------------------ */
const cell = (v) => { const s = Array.isArray(v) ? v.join('|') : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function exportCsv(req, res) {
  const rows = await M.list(req.orgId, req.params.type);
  const maps = await refMaps(req.orgId, req.def, rows.map((r) => r.data));
  const head = req.def.fields.map((f) => f.key);
  const lines = [head.join(','), ...rows.map((r) => req.def.fields.map((f) => cell(f.type === 'ref' ? maps[f.ref]?.get(Number(r.data[f.key])) || '' : r.data[f.key])).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}.csv"`);
  res.send(lines.join('\n'));
}

/** Rows keyed by field key; ref columns hold the referenced record's name. Matching names are updated. */
export async function importCsv(req, res) {
  const { text, dry_run: dry } = validate(z.object({ text: z.string().min(5, 'The file is empty').max(10_000_000), dry_run: z.boolean().default(false) }), req.body);
  const rows = parseCsv(text);
  if (rows.length < 2) throw badRequest('The file has no data rows');
  const head = rows.shift().map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const unknown = head.filter((h) => !req.def.fields.some((f) => f.key === h));
  // ref name → id
  const refIds = {};
  for (const f of refFields(req.def)) {
    const all = await search(req.orgId, f.ref, { limit: 5000 });
    refIds[f.key] = new Map(all.map((r) => [r.name.toLowerCase(), r.id]));
  }
  const errors = []; let created = 0; let updated = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const input = Object.fromEntries(head.map((h, k) => [h, rows[i][k] ?? '']));
    for (const f of refFields(req.def)) {
      if (!input[f.key]) continue;
      const id = refIds[f.key].get(String(input[f.key]).toLowerCase());
      if (!id) { errors.push(`Row ${i + 2}: ${f.label} "${input[f.key]}" not found`); input[f.key] = '__missing__'; } else input[f.key] = id;
    }
    if (Object.values(input).includes('__missing__')) continue;
    try {
      const { data, name } = await clean(req, input);
      if (dry) continue;
      const found = await M.findByName(req.orgId, req.params.type, name);
      if (found) { await M.update(req.orgId, req.params.type, found.id, name, data); updated += 1; } else { await M.insert(req.orgId, req.params.type, name, data, req.user.id); created += 1; }
    } catch (e) {
      errors.push(`Row ${i + 2}: ${Object.entries(e.fields || {}).map(([k, v]) => `${k} – ${v}`).join('; ') || e.message}`);
    }
  }
  res.json({ data: { rows: rows.length, created, updated, errors: errors.slice(0, 300), unknown_columns: unknown },
    message: dry ? `Checked ${rows.length} rows: ${errors.length} problem(s)` : `${created} created, ${updated} updated${errors.length ? `, ${errors.length} skipped` : ''}` });
}

export async function template(req, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-template.csv"`);
  res.send(`${req.def.fields.map((f) => f.key).join(',')}\n`);
}
