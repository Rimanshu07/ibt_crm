/**
 * Turns a season-grid sheet into hotels / transport services / activities and their rates.
 * Records that do not exist yet are created ("Entry method: Uploaded").
 * Uploading replaces a record's existing prices for the uploaded date window.
 */
import { pool } from '../../core/db.js';
import { j } from '../../core/http.js';
import { readGrid, parseCsv, price, markers, parseClosings, stripClosings } from './grid.js';
import { insertMany, clearWindow } from './rates.model.js';

const FIXED = { hotel: 5, transport: 8, activity: 7 };
const lc = (s) => String(s || '').trim().toLowerCase();
const nameShort = (s) => { const m = String(s || '').match(/^(.*?)\s*\(([^)]+)\)\s*$/); return m ? { name: m[1].trim(), short: m[2].trim() } : { name: String(s || '').trim(), short: null }; };
const time = (s) => (String(s || '').match(/\b(\d{1,2}:\d{2})\b/) || [])[1] || null;
const int = (s) => { const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };

function dateWindow(rates) {
  let from = '9999-12-31'; let to = '0000-01-01';
  for (const r of rates) { if (r.date_from < from) from = r.date_from; if (r.date_to > to) to = r.date_to; }
  return { from, to };
}

function rateRows(ctx, cols, cells, base, errors, line) {
  const out = [];
  for (const col of cols) {
    const p = price(cells[col.index]);
    if (p === null) continue;
    if (Number.isNaN(p)) { errors.push(`Row ${line}: "${cells[col.index]}" is not a price`); continue; }
    for (const rg of col.ranges) {
      out.push({ ...base(col), org_id: ctx.orgId, rate_type: col.rate_type, season: col.season, date_from: rg.from, date_to: rg.to,
        weekdays: rg.weekdays, price: p, currency: ctx.currency, upload_id: ctx.uploadId, created_by: ctx.userId });
    }
  }
  return out;
}

/* ------------------------------- Hotels ------------------------------- */
function parseRoom(text) {
  const { code, rest } = markers(text);
  let name = rest; const info = { occupancies: [], eb: null, rooms: null, aweb: null, cweb: null, cnb: null };
  for (const m of rest.matchAll(/\(([^)]*)\)/g)) {
    const inner = m[1].replace(/\s+/g, '');
    let hit = true;
    if (/^(\d+P,?)+$/i.test(inner)) info.occupancies = inner.split(',').map((x) => parseInt(x, 10)).filter(Boolean);
    else if (/^\d+EB$/i.test(inner)) info.eb = parseInt(inner, 10);
    else if (/^\d+R$/i.test(inner)) info.rooms = parseInt(inner, 10);
    else if (/^\d+AWEB$/i.test(inner)) info.aweb = parseInt(inner, 10);
    else if (/^\d+CWEB$/i.test(inner)) info.cweb = parseInt(inner, 10);
    else if (/^\d+CNB$/i.test(inner)) info.cnb = parseInt(inner, 10);
    else hit = false;
    if (hit) name = name.replace(m[0], '');
  }
  return { name: name.replace(/\s+/g, ' ').trim(), code, ...info };
}

async function hotels(conn, ctx, grid, errors) {
  const map = new Map(); const cur = {}; let extras = false;
  for (const { line, cells } of grid.rows) {
    const [g, loc, name, star, room] = cells;
    if (g) cur.group = /^na$/i.test(g) ? '' : g;
    if (loc) cur.location = loc;
    if (name) {
      if (/^extras?$/i.test(name)) extras = true;
      else { cur.name = name; cur.star = star || ''; extras = false; }
    } else if (star && !extras) cur.star = star;
    if (!room) continue;
    if (!cur.name || !cur.location) { errors.push(`Row ${line}: hotel name and location are required`); continue; }
    const key = `${lc(cur.name)}|${lc(cur.location)}`;
    if (!map.has(key)) map.set(key, { name: cur.name, location: cur.location, city: cur.location.split(',')[0].trim(), star: cur.star, group: cur.group || '', rooms: new Map(), meals: new Set(), rates: [], ages: null });
    const h = map.get(key);
    if (cur.star) h.star = cur.star;
    if (extras) {
      const kind = /without|cnb|no\s*bed/i.test(room) ? 'cnb' : /child/i.test(room) ? 'cweb' : /adult|extra/i.test(room) ? 'aweb' : null;
      if (!kind) { errors.push(`Row ${line}: unknown extra "${room}" (use Extra Bed (Adult), Extra Bed (Child), Child without Bed (CNB))`); continue; }
      const age = room.match(/\((\d+)\s*-\s*(\d+)\)/);
      if (age) h.ages = [Number(age[1]), Number(age[2])];
      h.rates.push(...rateRows(ctx, grid.columns, cells, (col) => ({ service: 'hotel', variant: '', meal_plan: col.variant.toUpperCase(), occupancy: null, kind }), errors, line));
    } else {
      const r = parseRoom(room);
      if (!r.name) { errors.push(`Row ${line}: room name is empty`); continue; }
      const existing = h.rooms.get(lc(r.name)) || { name: r.name };
      for (const k of ['aweb', 'cweb', 'cnb', 'rooms', 'eb']) if (r[k] !== null) existing[k] = r[k];
      h.rooms.set(lc(r.name), existing);
      const occs = r.occupancies.length ? r.occupancies : [null];
      for (const occ of occs) {
        h.rates.push(...rateRows(ctx, grid.columns, cells, (col) => ({ service: 'hotel', variant: r.name, meal_plan: col.variant.toUpperCase(), occupancy: occ, kind: 'base', code: r.code }), errors, line));
      }
    }
    grid.columns.forEach((c) => h.meals.add(c.variant.toUpperCase()));
  }
  const summary = { created: 0, updated: 0, rates: 0, records: [] };
  for (const h of map.values()) {
    const [[found]] = await conn.query('SELECT * FROM hotels WHERE org_id = ? AND LOWER(name) = ? AND (LOWER(location) = ? OR LOWER(city) = ?) LIMIT 1',
      [ctx.orgId, lc(h.name), lc(h.location), lc(h.city)]);
    let id;
    if (found) {
      const rooms = j(found.room_types, []) || [];
      for (const r of h.rooms.values()) { const i = rooms.findIndex((x) => lc(x.name) === lc(r.name)); if (i >= 0) rooms[i] = { ...rooms[i], ...r }; else rooms.push(r); }
      const meals = [...new Set([...(j(found.meal_plans, []) || []), ...h.meals])];
      await conn.execute('UPDATE hotels SET room_types = ?, meal_plans = ?, star = COALESCE(NULLIF(?, \'\'), star), group_name = COALESCE(NULLIF(?, \'\'), group_name), child_age_from = ?, child_age_to = ?, updated_by = ? WHERE id = ?',
        [JSON.stringify(rooms), JSON.stringify(meals), h.star, h.group, h.ages?.[0] ?? found.child_age_from, h.ages?.[1] ?? found.child_age_to, ctx.userId, found.id]);
      id = found.id; summary.updated += 1;
    } else {
      const [r] = await conn.execute(
        `INSERT INTO hotels (org_id, name, group_name, location, city, star, meal_plans, room_types, child_age_from, child_age_to, entry_method, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'upload', ?)`,
        [ctx.orgId, h.name, h.group || null, h.location, h.city, h.star || null, JSON.stringify([...h.meals]), JSON.stringify([...h.rooms.values()]), h.ages?.[0] ?? 6, h.ages?.[1] ?? 12, ctx.userId]
      );
      id = r.insertId; summary.created += 1;
    }
    if (h.rates.length) {
      const w = dateWindow(h.rates);
      if (!ctx.append) await clearWindow(conn, ctx.orgId, 'hotel', id, w.from, w.to);
      await insertMany(conn, h.rates.map((x) => ({ ...x, ref_id: id })));
    }
    summary.rates += h.rates.length;
    summary.records.push({ id, name: `${h.name} · ${h.city}`, rates: h.rates.length, rooms: [...h.rooms.values()].map((r) => r.name) });
  }
  return summary;
}

/* ------------------------------ Transport ----------------------------- */
async function ensureCabType(conn, ctx, variant, cache) {
  const m = markers(variant);
  const name = m.rest;
  if (!name || cache.has(lc(name))) return name;
  const seats = int(m.tags.find((t) => /pax/i.test(t)));
  const childAge = int(m.tags.find((t) => /y/i.test(t) && !/pax/i.test(t)));
  const [[found]] = await conn.query("SELECT id FROM master_records WHERE org_id = ? AND type = 'cab_type' AND LOWER(name) = ?", [ctx.orgId, lc(name)]);
  if (!found) {
    await conn.execute("INSERT INTO master_records (org_id, type, name, data, created_by) VALUES (?, 'cab_type', ?, ?, ?)",
      [ctx.orgId, name, JSON.stringify({ name, seats, child_age: childAge, code: m.code }), ctx.userId]);
  }
  cache.add(lc(name));
  return name;
}

async function transport(conn, ctx, grid, errors) {
  const cabs = new Set();
  for (const col of grid.columns) col.cab = await ensureCabType(conn, ctx, col.variant, cabs);
  const summary = { created: 0, updated: 0, rates: 0, records: [] };
  let prev = {};
  for (const { line, cells } of grid.rows) {
    const [duty, a, b, svcCell, dist, start, dur, sched] = cells;
    const row = a ? { duty, a, b } : { ...prev, duty: duty || prev.duty };
    prev = row;
    if (!row.a) { errors.push(`Row ${line}: column A (start point) is required`); continue; }
    if (!svcCell) { errors.push(`Row ${line}: Service is required`); continue; }
    const closings = parseClosings([svcCell, start, dur]);
    const mk = markers(svcCell);
    const service = stripClosings(mk.rest);
    const A = nameShort(row.a); const B = nameShort(row.b);
    const [[found]] = await conn.query(
      `SELECT id FROM transport_services WHERE org_id = ? AND LOWER(from_location) = ? AND LOWER(COALESCE(to_location,'')) = ? AND LOWER(service) = ? AND COALESCE(duty_code,'') = ? LIMIT 1`,
      [ctx.orgId, lc(A.name), lc(B.name), lc(service), row.duty || '']
    );
    const vals = [int(dist), time(start), int(dur), sched || null, mk.code, closings.weekdays, JSON.stringify(closings.dates)];
    let id;
    if (found) {
      await conn.execute(`UPDATE transport_services SET distance_km = COALESCE(?, distance_km), start_time = COALESCE(?, start_time), duration_mins = COALESCE(?, duration_mins),
        day_schedule = COALESCE(?, day_schedule), code = COALESCE(?, code), closing_weekdays = ?, closing_dates = ? WHERE id = ?`, [...vals, found.id]);
      id = found.id; summary.updated += 1;
    } else {
      const [r] = await conn.execute(
        `INSERT INTO transport_services (org_id, duty_code, from_location, from_short, to_location, to_short, service, distance_km, start_time, duration_mins, day_schedule, code, closing_weekdays, closing_dates, entry_method)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'upload')`,
        [ctx.orgId, row.duty || null, A.name, A.short, B.name || null, B.short, service, ...vals]
      );
      id = r.insertId; summary.created += 1;
    }
    const rates = rateRows(ctx, grid.columns, cells, (col) => ({ service: 'transport', variant: col.cab, meal_plan: '', occupancy: null, kind: 'base' }), errors, line);
    if (rates.length) {
      const w = dateWindow(rates);
      if (!ctx.append) await clearWindow(conn, ctx.orgId, 'transport', id, w.from, w.to);
      await insertMany(conn, rates.map((x) => ({ ...x, ref_id: id })));
    }
    summary.rates += rates.length;
    summary.records.push({ id, name: `${A.name}${B.name ? ` → ${B.name}` : ''} · ${service}`, rates: rates.length });
  }
  return summary;
}

/* ------------------------------ Activities ---------------------------- */
async function activities(conn, ctx, grid, errors) {
  const summary = { created: 0, updated: 0, rates: 0, records: [] };
  let activity = null;
  for (const col of grid.columns) {
    const age = col.variant.match(/\((\d+)\s*-\s*(\d+)\)/);
    col.age = age ? [Number(age[1]), Number(age[2])] : null;
    col.tourist = /child/i.test(col.variant) ? 'Child' : /adult/i.test(col.variant) ? 'Adult' : col.variant.replace(/\(.*\)/, '').trim();
  }
  for (const { line, cells } of grid.rows) {
    const [name, svcCell, desc, open, close, dur, slots] = cells;
    if (name) activity = name;
    if (!activity) { errors.push(`Row ${line}: activity name is required`); continue; }
    if (!svcCell) { errors.push(`Row ${line}: Service is required`); continue; }
    let [[a]] = await conn.query('SELECT id FROM activities WHERE org_id = ? AND LOWER(name) = ? LIMIT 1', [ctx.orgId, lc(activity)]);
    if (!a) {
      const [r] = await conn.execute("INSERT INTO activities (org_id, name, entry_method) VALUES (?,?, 'upload')", [ctx.orgId, activity]);
      a = { id: r.insertId };
    }
    const closings = parseClosings([svcCell, open, close, slots]);
    const mk = markers(svcCell);
    const service = stripClosings(mk.rest);
    const childAge = grid.columns.find((c) => c.age)?.age;
    const [[found]] = await conn.query('SELECT id FROM activity_services WHERE activity_id = ? AND LOWER(name) = ? LIMIT 1', [a.id, lc(service)]);
    const slotList = String(slots || '').split(/[,;]/).map(time).filter(Boolean).join(',') || null;
    const vals = [mk.code, desc || null, time(open), time(close), int(dur), slotList, childAge?.[0] ?? 6, childAge?.[1] ?? 12, closings.weekdays, JSON.stringify(closings.dates)];
    let id;
    if (found) {
      await conn.execute(`UPDATE activity_services SET code = COALESCE(?, code), description = COALESCE(?, description), open_time = COALESCE(?, open_time), close_time = COALESCE(?, close_time),
        duration_mins = COALESCE(?, duration_mins), slots = COALESCE(?, slots), child_age_from = ?, child_age_to = ?, closing_weekdays = ?, closing_dates = ? WHERE id = ?`, [...vals, found.id]);
      id = found.id; summary.updated += 1;
    } else {
      const [r] = await conn.execute(
        `INSERT INTO activity_services (activity_id, org_id, name, code, description, open_time, close_time, duration_mins, slots, child_age_from, child_age_to, closing_weekdays, closing_dates)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [a.id, ctx.orgId, service, ...vals]
      );
      id = r.insertId; summary.created += 1;
    }
    const rates = rateRows(ctx, grid.columns, cells, (col) => ({ service: 'activity', variant: col.tourist, meal_plan: '', occupancy: null, kind: 'base' }), errors, line);
    if (rates.length) {
      const w = dateWindow(rates);
      if (!ctx.append) await clearWindow(conn, ctx.orgId, 'activity', id, w.from, w.to);
      await insertMany(conn, rates.map((x) => ({ ...x, ref_id: id })));
    }
    summary.rates += rates.length;
    summary.records.push({ id, name: `${activity} – ${service}`, rates: rates.length });
  }
  return summary;
}

const HANDLERS = { hotel: hotels, transport, activity: activities };

/**
 * Process one or more CSV files. dryRun = check everything and roll back.
 * Returns { ok, errors, summary }.
 */
export async function upload({ orgId, userId, service, currency, files, dryRun = false, append = false }) {
  const conn = await pool.getConnection();
  const errors = [];
  const total = { created: 0, updated: 0, rates: 0, records: [] };
  try {
    await conn.beginTransaction();
    const [log] = await conn.execute('INSERT INTO rate_uploads (org_id, service, file_name, currency, created_by) VALUES (?,?,?,?,?)',
      [orgId, service, files.map((f) => f.name).join(', ').slice(0, 200), currency, userId]);
    const ctx = { orgId, userId, currency, uploadId: log.insertId, append };
    for (const f of files) {
      const grid = readGrid(parseCsv(f.text), FIXED[service]);
      errors.push(...grid.errors.map((e) => `${f.name}: ${e}`));
      if (!grid.columns.length) { errors.push(`${f.name}: no price columns found. Check the season, date and ${service === 'hotel' ? 'meal plan' : service === 'transport' ? 'cab type' : 'Adult/Child'} rows.`); continue; }
      const fileErrors = [];
      const s = await HANDLERS[service](conn, ctx, grid, fileErrors);
      errors.push(...fileErrors.map((e) => `${f.name}: ${e}`));
      total.created += s.created; total.updated += s.updated; total.rates += s.rates; total.records.push(...s.records);
    }
    await conn.execute('UPDATE rate_uploads SET summary = ? WHERE id = ?', [JSON.stringify({ created: total.created, updated: total.updated, rates: total.rates, errors: errors.length }), log.insertId]);
    if (dryRun || !total.rates) await conn.rollback(); else await conn.commit();
    return { ok: !dryRun && total.rates > 0, errors: errors.slice(0, 200), summary: total, upload_id: dryRun ? null : log.insertId };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
