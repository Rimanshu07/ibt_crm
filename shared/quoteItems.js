/**
 * Structured quote lines (Sembark-style quote form) — shared by the quote builder and the API,
 * so the price the user sees is exactly the price that is saved.
 *
 * Price cells: { rate, given, buy }  rate = system (season) selling rate, given = price used in the quote
 * (editable), buy = buying / ops rate. Missing given → rate. Missing buy → given.
 *
 * hotel     { nights:[1,2], hotel_id, meal_plan, room_type, pax_per_room, rooms, aweb, cweb, cnb,
 *             prices:[{ night, date, room:{rate,given,buy}, aweb:{…}, cweb:{…}, cnb:{…} }] }
 * transport { days:[1,2], location, service_type, transport_service_id, start_time, duration_mins, pickup_point,
 *             cabs:[{ cab_type, qty, prices:[{ day, date, rate, given, buy }] }] }
 * activity  { days:[2], activity_service_id, slot, duration_mins,
 *             tickets:[{ type:'Adult'|'Child', qty, prices:[{ day, date, rate, given, buy }] }] }
 * flight    { trip_way, legs:[{ dir, from_city, to_city, airline, flight_no, depart_date, depart_time, arrive_date, arrive_time, terminal }],
 *             travel_class, adults, children, infants, cost:{adult,child,infant}, sell:{adult,child,infant}, baggage, notes }
 * visa      { country, visa_service_id, visa_type, pax, currency, fx_rate, rate, given }  (rate = cost / pax, given = selling / pax)
 * land_package { supplier_id, attachment_id, source, package:{…vendor package…}, currency, fx_rate,
 *             price_basis:'per_person'|'total', rate_adult, rate_child, rate_infant, adults, children, infants, total_amount }
 * other     { category:'hotel'|'transport'|'trip'|…, description, day, night, hotel_ref, qty, price, buy, comments }
 */

const n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const has = (v) => v !== null && v !== undefined && v !== '';
export const r2 = (v) => Math.round(n(v) * 100) / 100;
const pick = (c, k) => (c ? (has(c[k]) ? n(c[k]) : k === 'given' ? n(c.rate) : k === 'buy' ? (has(c.given) ? n(c.given) : n(c.rate)) : 0) : 0);

/* ----------------------------- dates ----------------------------- */
const ORD = (k) => `${k}${['th', 'st', 'nd', 'rd'][(k % 100 > 10 && k % 100 < 14) ? 0 : k % 10] || 'th'}`;
export const ordinal = ORD;
export function addDays(date, k) {
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(k || 0));
  return d.toISOString().slice(0, 10);
}
/** Date of night / day k (1-based) from the trip start. */
export const dateOf = (start, k) => (start ? addDays(start, Number(k) - 1) : null);
export const dayName = (date) => (date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
export const nightLabel = (k, start) => `${ORD(k)} N${start ? ` (${dayName(dateOf(start, k))})` : ''}`;
export const dayLabel = (k, start) => `${ORD(k)} Day${start ? ` (${dayName(dateOf(start, k))})` : ''}`;
export const durationLabel = (nights) => (nights === null || nights === undefined || nights === '' ? '' : `${nights} Night${Number(nights) === 1 ? '' : 's'}, ${Number(nights) + 1} Day${Number(nights) === 0 ? '' : 's'}`);

/** "1-2, 4" → readable list of night/day numbers. */
export function ranges(list = []) {
  const s = [...new Set(list.map(Number))].sort((a, b) => a - b);
  const out = []; let a = null; let b = null;
  for (const x of s) { if (a === null) { a = b = x; } else if (x === b + 1) b = x; else { out.push([a, b]); a = b = x; } }
  if (a !== null) out.push([a, b]);
  return out;
}
export const rangesText = (list) => ranges(list).map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');

/* ----------------------------- hotels ----------------------------- */
export const EXTRAS = ['aweb', 'cweb', 'cnb'];
export function hotelNightTotal(d, p, k = 'given') {
  if (!p) return 0;
  return r2(pick(p.room, k) * n(d.rooms) + EXTRAS.reduce((s, x) => s + pick(p[x], k) * n(d[x]), 0));
}
export function hotelCost(d) {
  const nights = d.nights || [];
  const prices = (d.prices || []).filter((p) => nights.includes(Number(p.night)));
  return { cost: r2(prices.reduce((s, p) => s + hotelNightTotal(d, p, 'given'), 0)), buy_cost: r2(prices.reduce((s, p) => s + hotelNightTotal(d, p, 'buy'), 0)) };
}

/** Max extra beds per room: one extra bed (adult OR child) per room; CNB can go with either. */
export function extraBedLimits(d, roomInfo = {}) {
  const rooms = Math.max(n(d.rooms), 0);
  const eb = has(roomInfo.eb) ? n(roomInfo.eb) : 1; // extra beds allowed per room
  const awebPer = has(roomInfo.aweb) ? n(roomInfo.aweb) : eb;
  const cwebPer = has(roomInfo.cweb) ? n(roomInfo.cweb) : eb;
  const cnbPer = has(roomInfo.cnb) ? n(roomInfo.cnb) : 1;
  const bedSlots = rooms * eb;
  return {
    aweb: Math.max(Math.min(rooms * awebPer, bedSlots - n(d.cweb)), 0),
    cweb: Math.max(Math.min(rooms * cwebPer, bedSlots - n(d.aweb)), 0),
    cnb: rooms * cnbPer,
  };
}

/** Children: below the hotel's child age = complimentary, inside = child, above = adult. */
export function paxSplit(adults, childAges = [], ageFrom = 6, ageTo = 12) {
  const ages = (childAges || []).map(Number);
  return {
    adults: n(adults) + ages.filter((a) => a > ageTo).length,
    children: ages.filter((a) => a >= ageFrom && a <= ageTo).length,
    comp: ages.filter((a) => a < ageFrom).length,
  };
}

/** Who a hotel line accommodates: adults in base beds + AWEB, children in CWEB + CNB. */
export function hotelPaxCovered(d) {
  const base = n(d.rooms) * n(d.pax_per_room);
  return { adults: base + n(d.aweb), children: n(d.cweb) + n(d.cnb), total: base + n(d.aweb) + n(d.cweb) + n(d.cnb) };
}

/**
 * Night-by-night accommodation summary. lines = hotel details, need = paxSplit(...).
 * Returns [{ night, date, hotels:[…], covered:{adults, children}, status: 'missing'|'complete'|'short'|'extra', message }]
 */
export function accommodationSummary(lines, nights, start, need) {
  const out = [];
  for (let k = 1; k <= Math.max(n(nights), 0); k += 1) {
    const on = lines.filter((l) => (l.nights || []).map(Number).includes(k) && !l.similar);
    const covered = on.reduce((s, l) => { const c = hotelPaxCovered(l); return { adults: s.adults + c.adults, children: s.children + c.children }; }, { adults: 0, children: 0 });
    let status = 'complete'; const msgs = [];
    if (!on.length) { status = 'missing'; msgs.push('No hotel added'); } else {
      const ad = need.adults - covered.adults;
      const ch = need.children - covered.children;
      // spare adult beds can take children
      const spare = Math.max(-ad, 0);
      const chLeft = ch - Math.min(spare, Math.max(ch, 0));
      if (ad > 0) { status = 'short'; msgs.push(`${ad} adult${ad > 1 ? 's' : ''} without a bed`); }
      if (chLeft > 0) { status = 'short'; msgs.push(`${chLeft} child${chLeft > 1 ? 'ren' : ''} not accommodated`); }
      const extraBeds = (covered.adults + covered.children) - (need.adults + need.children);
      if (status === 'complete' && extraBeds > 0) { status = 'extra'; msgs.push(`${extraBeds} extra bed/space configured`); }
    }
    const rooms = on.reduce((s, l) => s + n(l.rooms), 0);
    out.push({ night: k, date: dateOf(start, k), hotels: on.map((l) => l._name || l.hotel_name || ''), covered, rooms, need, status, message: msgs.join(', ') || 'Complete' });
  }
  return out;
}

/* ------------------------ transport & activities ------------------------ */
export function cabCost(cab) {
  const prices = cab.prices || [];
  return { cost: r2(prices.reduce((s, p) => s + pick(p, 'given') * n(cab.qty), 0)), buy_cost: r2(prices.reduce((s, p) => s + pick(p, 'buy') * n(cab.qty), 0)) };
}
export function transportCost(d) {
  // priced together with "One price for all transport" (an 'other' line with lump: true)
  if (d.included) return { cost: 0, buy_cost: 0 };
  const days = (d.days || []).map(Number);
  return (d.cabs || []).reduce((s, c) => {
    const x = cabCost({ ...c, prices: (c.prices || []).filter((p) => days.includes(Number(p.day))) });
    return { cost: r2(s.cost + x.cost), buy_cost: r2(s.buy_cost + x.buy_cost) };
  }, { cost: 0, buy_cost: 0 });
}
export const activityCost = (d) => transportCost({ days: d.days, cabs: d.tickets, included: d.included });

/** Seats needed vs seats configured for each transport day. seatsOf(cabType) → number|null */
export function transportSummary(lines, days, start, totalPax, seatsOf = () => null) {
  const out = [];
  for (let k = 1; k <= Math.max(n(days), 0); k += 1) {
    const on = lines.filter((l) => (l.days || []).map(Number).includes(k));
    const cabs = on.flatMap((l) => l.cabs || []);
    const known = cabs.every((c) => seatsOf(c.cab_type) !== null);
    // services run one after another in a day, so capacity = the smallest group of cabs used that day
    const caps = on.map((l) => (l.cabs || []).reduce((s, c) => s + (seatsOf(c.cab_type) || 0) * n(c.qty), 0)).filter((x) => x > 0);
    const seats = caps.length ? Math.min(...caps) : 0;
    let status = 'complete'; let message = 'Complete';
    if (!on.length) { status = 'missing'; message = 'No transport'; }
    else if (!cabs.length) { status = 'short'; message = 'No cab selected'; }
    else if (known && seats < totalPax) { status = 'short'; message = `${totalPax - seats} seat${totalPax - seats > 1 ? 's' : ''} missing (${seats} seats for ${totalPax} pax)`; }
    else if (!known) { status = 'complete'; message = 'Seats not set for this cab type'; }
    out.push({ day: k, date: dateOf(start, k), services: on.length, cabs: cabs.reduce((s, c) => s + n(c.qty), 0), cab_types: [...new Set(cabs.map((c) => c.cab_type).filter(Boolean))], seats, pax: totalPax, known, status, message });
  }
  return out;
}

/* ------------------------------ flights ------------------------------ */
export function flightCost(d) {
  const cnt = { adult: n(d.adults), child: n(d.children), infant: n(d.infants) };
  const c = d.cost || {}; const s = d.sell || {};
  const cost = r2(Object.keys(cnt).reduce((x, k) => x + n(c[k]) * cnt[k], 0));
  const sell = r2(Object.keys(cnt).reduce((x, k) => x + n(s[k]) * cnt[k], 0));
  return { cost, buy_cost: cost, selling_override: sell > 0 ? sell : null };
}

/* ------------------------------- visa -------------------------------- */
export function visaCost(d) {
  const fx = n(d.fx_rate) || 1;
  const cost = r2(n(d.rate) * n(d.pax) * fx);
  return { cost, buy_cost: cost, selling_override: has(d.given) && n(d.given) > 0 ? r2(n(d.given) * n(d.pax) * fx) : null };
}

/* ---------------------------- land package ---------------------------- */
export function landPackageCost(d) {
  const fx = n(d.fx_rate) || 1;
  const base = d.price_basis === 'total' ? n(d.total_amount)
    : n(d.rate_adult) * n(d.adults) + n(d.rate_child) * n(d.children) + n(d.rate_infant) * n(d.infants);
  const cost = r2(base * fx);
  return { cost, buy_cost: cost };
}

/* ------------------------------- other -------------------------------- */
export function otherCost(d) {
  const q = has(d.qty) ? n(d.qty) : 1;
  return { cost: r2(n(d.price) * q), buy_cost: r2((has(d.buy) ? n(d.buy) : n(d.price)) * q) };
}

/** Cost for any structured line; null = the service still uses the classic fields (train, passport, insurance). */
export function computeItem(service, d = {}) {
  switch (service) {
    case 'hotel': return hotelCost(d);
    case 'transport': return transportCost(d);
    case 'activity': return activityCost(d);
    case 'flight': return flightCost(d);
    case 'visa': return visaCost(d);
    case 'land_package': return landPackageCost(d);
    case 'other': return otherCost(d);
    default: return null;
  }
}

/** First night / day of a line (for sorting and the booking date). */
export function firstDay(service, d = {}) {
  const list = service === 'hotel' ? d.nights : d.days;
  if (Array.isArray(list) && list.length) return Math.min(...list.map(Number));
  return n(d.day || d.night) || null;
}
