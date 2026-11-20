/**
 * One place that knows how to find any record a form can point to ("ref" fields):
 * hotels, transport services, activity tickets, suppliers and every generic master.
 */
import { pool } from '../../core/db.js';
import { j } from '../../core/http.js';
import { MASTER_TYPES } from '../../../../shared/catalog.js';

const DEDICATED = {
  hotel: {
    sql: `SELECT id, name, CONCAT(city, IF(star IS NULL OR star = '', '', CONCAT(' · ', star, IF(star REGEXP '^[0-9]$', '★', '')))) AS sub,
                 JSON_OBJECT('room_types', room_types, 'meal_plans', meal_plans, 'location', location, 'city', city, 'supplier_id', supplier_id) AS data
          FROM hotels WHERE org_id = ? AND is_active = 1`,
    search: '(name LIKE ? OR city LIKE ? OR location LIKE ?)', n: 3, order: 'name',
  },
  transport_service: {
    sql: `SELECT ts.id, CONCAT(ts.from_location, IF(ts.to_location IS NULL OR ts.to_location = '', '', CONCAT(' → ', ts.to_location)), ' · ', ts.service) AS name,
                 CONCAT_WS(' · ', ts.duty_code, IF(ts.distance_km IS NULL, NULL, CONCAT(ts.distance_km, ' km'))) AS sub,
                 JSON_OBJECT('start_time', ts.start_time, 'duration_mins', ts.duration_mins,
                   'cab_types', (SELECT GROUP_CONCAT(DISTINCT r.variant ORDER BY r.variant SEPARATOR '|') FROM rates r WHERE r.service = 'transport' AND r.ref_id = ts.id)) AS data
          FROM transport_services ts WHERE ts.org_id = ? AND ts.is_active = 1`,
    search: '(ts.from_location LIKE ? OR ts.to_location LIKE ? OR ts.service LIKE ? OR ts.duty_code LIKE ?)', n: 4, order: 'ts.from_location, ts.service', alias: 'ts',
  },
  activity_service: {
    sql: `SELECT s.id, CONCAT(a.name, ' – ', s.name) AS name, a.city AS sub,
                 JSON_OBJECT('slots', s.slots, 'open_time', s.open_time, 'child_age_from', s.child_age_from, 'child_age_to', s.child_age_to) AS data
          FROM activity_services s JOIN activities a ON a.id = s.activity_id WHERE s.org_id = ? AND s.is_active = 1 AND a.is_active = 1`,
    search: '(a.name LIKE ? OR s.name LIKE ? OR a.city LIKE ?)', n: 3, order: 'a.name, s.name', alias: 's',
  },
  supplier: {
    sql: `SELECT id, name, CONCAT_WS(' · ', city, phone) AS sub, JSON_OBJECT('services', services, 'payment_pref_id', payment_pref_id) AS data
          FROM suppliers WHERE org_id = ? AND is_active = 1`,
    search: '(name LIKE ? OR city LIKE ? OR phone LIKE ?)', n: 3, order: 'name',
  },
};

const idCol = (def) => `${def.alias ? `${def.alias}.` : ''}id`;

export function isRef(ref) { return Boolean(DEDICATED[ref] || MASTER_TYPES[ref]); }

/** Search records of one ref type. opts: { q, ids, service, limit } */
export async function search(orgId, ref, { q = '', ids = null, service = '', limit = 50 } = {}) {
  const def = DEDICATED[ref];
  let sql; const params = [orgId];
  if (def) {
    sql = def.sql;
    if (q) { sql += ` AND ${def.search}`; for (let i = 0; i < def.n; i += 1) params.push(`%${q}%`); }
    if (ref === 'supplier' && service) { sql += ' AND JSON_CONTAINS(services, ?)'; params.push(JSON.stringify(service)); }
    if (ids) { if (!ids.length) return []; sql += ` AND ${idCol(def)} IN (?)`; params.push(ids); }
    sql += ` ORDER BY ${def.order} LIMIT ${Number(limit) || 50}`;
  } else if (MASTER_TYPES[ref]) {
    sql = "SELECT id, name, '' AS sub, data FROM master_records WHERE org_id = ? AND type = ? AND is_active = 1";
    params.push(ref);
    if (q) { sql += ' AND name LIKE ?'; params.push(`%${q}%`); }
    if (ids) { if (!ids.length) return []; sql += ' AND id IN (?)'; params.push(ids); }
    sql += ` ORDER BY name LIMIT ${Number(limit) || 50}`;
  } else return [];
  const [rows] = await pool.query(sql, params);
  return rows.map((r) => {
    const data = j(r.data, {}) || {};
    for (const k of Object.keys(data)) if (typeof data[k] === 'string' && /^[[{]/.test(data[k])) data[k] = j(data[k], data[k]);
    if (typeof data.cab_types === 'string') data.cab_types = data.cab_types.split('|').filter(Boolean);
    return { id: r.id, name: r.name, sub: r.sub || '', data };
  });
}

export async function get(orgId, ref, id) {
  if (!id) return null;
  const [row] = await search(orgId, ref, { ids: [Number(id)], limit: 1 });
  return row || null;
}

/** id → name for many ids of one ref type. */
export async function names(orgId, ref, ids) {
  const clean = [...new Set(ids.filter(Boolean).map(Number))];
  const rows = await search(orgId, ref, { ids: clean, limit: clean.length || 1 });
  return new Map(rows.map((r) => [r.id, r.name]));
}
