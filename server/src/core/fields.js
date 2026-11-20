/** Validates and cleans values for catalogue field definitions (shared/catalog.js). */
import { names } from '../modules/lookup/lookup.model.js';

export function normalizeFields(fields, input, { refIds = null, partial = false } = {}) {
  const data = {};
  const errors = {};
  for (const f of fields) {
    if (partial && !(f.key in (input || {}))) continue;
    let v = input?.[f.key];
    if (v === undefined || v === null || v === '') v = f.default ?? null;
    switch (f.type) {
      case 'number':
        if (v !== null) {
          const n = Number(String(v).replace(/,/g, ''));
          if (Number.isNaN(n)) { errors[f.key] = 'Must be a number'; continue; }
          v = n;
        }
        break;
      case 'date':
        if (v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) { errors[f.key] = 'Use YYYY-MM-DD'; continue; }
        break;
      case 'time':
        if (v !== null && !/^\d{1,2}:\d{2}$/.test(String(v))) { errors[f.key] = 'Use HH:MM'; continue; }
        break;
      case 'select':
        if (v !== null) {
          v = String(v).trim();
          if (f.strict && f.options && !f.options.includes(v)) { errors[f.key] = `Choose one of: ${f.options.join(', ')}`; continue; }
        }
        break;
      case 'multiselect':
      case 'list': {
        const arr = Array.isArray(v) ? v : v === null ? [] : String(v).split('|');
        v = arr.map((x) => String(x).trim()).filter(Boolean);
        if (f.strict && f.options) {
          const bad = v.filter((x) => !f.options.includes(x));
          if (bad.length) { errors[f.key] = `Unknown: ${bad.join(', ')}`; continue; }
        }
        if (f.required && !v.length) { errors[f.key] = 'Required'; continue; }
        break;
      }
      case 'ref':
        if (v !== null) {
          v = Number(v);
          if (!Number.isInteger(v) || (refIds && !refIds[f.ref]?.has(v))) { errors[f.key] = 'Choose from the list'; continue; }
        }
        break;
      case 'boolean':
        v = v === true || v === 'true' || v === '1' || v === 1 || v === 'yes';
        break;
      default:
        v = v === null ? null : String(v).trim();
    }
    if (f.required && (v === null || v === '')) { errors[f.key] = 'Required'; continue; }
    data[f.key] = v;
  }
  return { data, errors };
}

/** Sets of existing ids for the ref fields used in `input` (only ids actually given are checked). */
export async function refIdSets(orgId, fields, inputs) {
  const sets = {};
  for (const f of fields.filter((x) => x.type === 'ref')) {
    const ids = inputs.map((i) => i?.[f.key]).filter((v) => v !== undefined && v !== null && v !== '').map(Number);
    const m = await names(orgId, f.ref, ids);
    sets[f.ref] = new Set([...(sets[f.ref] || []), ...m.keys()]);
  }
  return sets;
}
