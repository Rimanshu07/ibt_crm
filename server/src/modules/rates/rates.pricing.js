/**
 * Prices for quote lines and the price calculators.
 * Every result: { cost (selling/quotation), buy_cost (ops), note, breakdown[], missing[], warnings[], blocked }
 */
import { query, one } from '../../core/db.js';
import { addDays, j, r2 } from '../../core/http.js';
import { ratesFor, pick, weekday } from './rates.model.js';

const num = (v) => Number(v) || 0;

export async function hotelPrice(orgId, d, checkin) {
  const hotel = await one('SELECT * FROM hotels WHERE id = ? AND org_id = ?', [d.hotel_id, orgId]);
  if (!hotel) return { cost: null, note: 'Choose a hotel' };
  const nights = Math.max(num(d.nights), 1);
  const checkout = addDays(checkin, nights);
  const rates = await ratesFor(orgId, 'hotel', hotel.id, checkin, addDays(checkout, -1));
  const closures = await query('SELECT * FROM hotel_closures WHERE hotel_id = ? AND date_from <= ? AND date_to >= ?', [hotel.id, addDays(checkout, -1), checkin]);
  const rooms = Math.max(num(d.rooms), 1);
  const out = { cost: 0, buy_cost: 0, breakdown: [], missing: [], warnings: [], blocked: false };
  for (let n = 0; n < nights; n += 1) {
    const date = addDays(checkin, n);
    for (const c of closures) {
      const types = j(c.room_types, null);
      const hits = date >= String(c.date_from).slice(0, 10) && date <= String(c.date_to).slice(0, 10)
        && (!types || !types.length || types.map((x) => x.toLowerCase()).includes(String(d.room_type).toLowerCase()));
      if (!hits) continue;
      if (c.kind === 'soldout') { out.blocked = true; out.warnings.push(`Sold out on ${date}`); }
      else out.warnings.push(`Blackout on ${date} – confirm the rate with the hotel and enter it manually`);
    }
    const q = { variant: d.room_type, meal_plan: d.meal_plan, occupancy: num(d.pax_per_room) || null };
    const line = { date, day: weekday(date) };
    for (const mode of ['sales', 'ops']) {
      const room = pick(rates, { ...q, kind: 'base' }, date, mode);
      const ex = (kind) => pick(rates, { variant: '', meal_plan: d.meal_plan, kind }, date, mode);
      if (!room) { if (mode === 'sales') out.missing.push(date); continue; }
      const aweb = ex('aweb'); const cweb = ex('cweb'); const cnb = ex('cnb');
      if (num(d.aweb) && !aweb) out.warnings.push(`No adult extra-bed price on ${date}`);
      if (num(d.cweb) && !cweb) out.warnings.push(`No child extra-bed price on ${date}`);
      if (num(d.cnb) && !cnb) out.warnings.push(`No child-without-bed price on ${date}`);
      const total = num(room.price) * rooms + num(aweb?.price) * num(d.aweb) + num(cweb?.price) * num(d.cweb) + num(cnb?.price) * num(d.cnb);
      line[mode] = { room: num(room.price), aweb: aweb ? num(aweb.price) : null, cweb: cweb ? num(cweb.price) : null, cnb: cnb ? num(cnb.price) : null, total: r2(total), season: room.season, occupancy: room.occupancy };
      out[mode === 'sales' ? 'cost' : 'buy_cost'] += total;
    }
    out.breakdown.push(line);
  }
  out.warnings = [...new Set(out.warnings)];
  if (out.missing.length === nights) return { ...out, cost: null, buy_cost: null, note: `No ${d.room_type || ''} ${d.meal_plan || ''} price for these dates. Upload prices or enter manually.` };
  out.cost = r2(out.cost); out.buy_cost = r2(out.buy_cost || out.cost);
  const first = out.breakdown.find((b) => b.sales)?.sales;
  out.note = `${hotel.name}: ${first ? `${first.room}/room/night${first.season ? ` (${first.season})` : ''}` : ''}${out.missing.length ? ` · missing ${out.missing.length} night(s)` : ''}`;
  return out;
}

export async function transportPrice(orgId, d, date) {
  const svc = await one('SELECT * FROM transport_services WHERE id = ? AND org_id = ?', [d.transport_service_id, orgId]);
  if (!svc) return { cost: null, note: 'Choose a transport service' };
  const rates = await ratesFor(orgId, 'transport', svc.id, date, date);
  const qty = Math.max(num(d.qty), 1);
  const sales = pick(rates, { variant: d.cab_type }, date, 'sales');
  const ops = pick(rates, { variant: d.cab_type }, date, 'ops');
  const warnings = [];
  if (svc.closing_weekdays && svc.closing_weekdays.split(',').includes(weekday(date))) warnings.push(`Service is closed on ${weekday(date)}`);
  for (const c of j(svc.closing_dates, []) || []) if (date >= c.from && date <= c.to) warnings.push(`Service is closed on ${date}`);
  if (!sales) return { cost: null, note: `No price for ${d.cab_type || 'this cab'} on ${date}`, warnings };
  return { cost: r2(num(sales.price) * qty), buy_cost: r2(num((ops || sales).price) * qty), note: `${sales.price} per cab${sales.season ? ` (${sales.season})` : ''}`, warnings };
}

export async function activityPrice(orgId, d, date) {
  const svc = await one('SELECT s.*, a.name AS activity_name FROM activity_services s JOIN activities a ON a.id = s.activity_id WHERE s.id = ? AND s.org_id = ?', [d.activity_service_id, orgId]);
  if (!svc) return { cost: null, note: 'Choose an activity' };
  const rates = await ratesFor(orgId, 'activity', svc.id, date, date);
  const get = (variant, mode) => pick(rates, { variant }, date, mode);
  const aS = get('Adult', 'sales'); const cS = get('Child', 'sales') || aS;
  const aO = get('Adult', 'ops') || aS; const cO = get('Child', 'ops') || cS;
  const warnings = [];
  if (svc.closing_weekdays && svc.closing_weekdays.split(',').includes(weekday(date))) warnings.push(`Closed on ${weekday(date)}`);
  for (const c of j(svc.closing_dates, []) || []) if (date >= c.from && date <= c.to) warnings.push(`Closed on ${date}`);
  if (!aS) return { cost: null, note: 'No ticket price for this date', warnings };
  const cost = num(aS.price) * num(d.adults) + num(cS?.price) * num(d.children);
  const buy = num(aO?.price) * num(d.adults) + num(cO?.price) * num(d.children);
  return { cost: r2(cost), buy_cost: r2(buy), note: `Adult ${aS.price}${cS ? ` · Child ${cS.price}` : ''}`, warnings };
}

/**
 * System rates for the quote form's price popups.
 * hotel:     details {hotel_id, room_type, meal_plan, pax_per_room} → per date { room, aweb, cweb, cnb } each { rate, buy }
 * transport: details {transport_service_id, cab_type}               → per date { rate, buy, closed }
 * activity:  details {activity_service_id}                          → per date { Adult:{rate,buy}, Child:{rate,buy}, closed }
 */
export async function breakdown(orgId, service, d, dates) {
  const sorted = [...dates].filter(Boolean).sort();
  if (!sorted.length) return { dates: {}, warnings: [] };
  const from = sorted[0]; const to = sorted[sorted.length - 1];
  const out = {}; const warnings = [];
  const cell = (rates, q, date) => {
    const s = pick(rates, q, date, 'sales'); const o = pick(rates, q, date, 'ops');
    return s ? { rate: num(s.price), buy: num((o || s).price), season: s.season || '' } : null;
  };
  if (service === 'hotel') {
    const hotel = await one('SELECT id, child_age_from, child_age_to FROM hotels WHERE id = ? AND org_id = ?', [d.hotel_id, orgId]);
    if (!hotel) return { dates: {}, warnings: ['Choose a hotel'] };
    const rates = await ratesFor(orgId, 'hotel', hotel.id, from, to);
    const closures = await query('SELECT * FROM hotel_closures WHERE hotel_id = ? AND date_from <= ? AND date_to >= ?', [hotel.id, to, from]);
    for (const date of sorted) {
      const room = cell(rates, { variant: d.room_type, meal_plan: d.meal_plan, occupancy: num(d.pax_per_room) || null, kind: 'base' }, date);
      const ex = (kind) => cell(rates, { variant: '', meal_plan: d.meal_plan, kind }, date);
      let closed = null;
      for (const c of closures) {
        const types = j(c.room_types, null);
        if (date >= String(c.date_from).slice(0, 10) && date <= String(c.date_to).slice(0, 10)
          && (!types || !types.length || types.map((x) => x.toLowerCase()).includes(String(d.room_type || '').toLowerCase()))) closed = c.kind;
      }
      if (closed) warnings.push(`${date}: ${closed === 'soldout' ? 'sold out' : 'blackout – confirm the rate with the hotel'}`);
      if (!room) warnings.push(`${date}: no ${d.room_type || ''} ${d.meal_plan || ''} price`);
      out[date] = { room, aweb: ex('aweb'), cweb: ex('cweb'), cnb: ex('cnb'), closed };
    }
  } else if (service === 'transport') {
    const svc = await one('SELECT * FROM transport_services WHERE id = ? AND org_id = ?', [d.transport_service_id, orgId]);
    if (!svc) return { dates: {}, warnings: ['Choose a service'] };
    const rates = await ratesFor(orgId, 'transport', svc.id, from, to);
    for (const date of sorted) {
      const c = cell(rates, { variant: d.cab_type }, date);
      const closed = (svc.closing_weekdays && svc.closing_weekdays.split(',').includes(weekday(date))) || (j(svc.closing_dates, []) || []).some((x) => date >= x.from && date <= x.to);
      if (closed) warnings.push(`${date}: service closed`);
      out[date] = { ...(c || { rate: null, buy: null }), closed };
    }
  } else if (service === 'activity') {
    const svc = await one('SELECT * FROM activity_services WHERE id = ? AND org_id = ?', [d.activity_service_id, orgId]);
    if (!svc) return { dates: {}, warnings: ['Choose an activity'] };
    const rates = await ratesFor(orgId, 'activity', svc.id, from, to);
    const variants = [...new Set(rates.map((r) => r.variant))];
    for (const date of sorted) {
      const closed = (svc.closing_weekdays && svc.closing_weekdays.split(',').includes(weekday(date))) || (j(svc.closing_dates, []) || []).some((x) => date >= x.from && date <= x.to);
      if (closed) warnings.push(`${date}: closed`);
      out[date] = { closed };
      for (const v of variants.length ? variants : ['Adult', 'Child']) out[date][v] = cell(rates, { variant: v }, date);
    }
  }
  return { dates: out, warnings: [...new Set(warnings)] };
}
