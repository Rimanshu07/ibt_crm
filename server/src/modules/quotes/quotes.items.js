/**
 * Quote lines: validation, titles, booking expansion and itinerary drafts for the
 * structured (Sembark-style) quote form. Prices are always recomputed here with the
 * shared calculator, never trusted from the browser.
 */
import { query, one } from '../../core/db.js';
import { normalizeFields, refIdSets } from '../../core/fields.js';
import { names, get as lookupGet } from '../lookup/lookup.model.js';
import { SERVICES } from '../../../../shared/catalog.js';
import { computeItem, firstDay, ranges, rangesText, addDays, dateOf, hotelNightTotal, r2 } from '../../../../shared/quoteItems.js';

const n = (v) => Number(v) || 0;
const ints = (a) => [...new Set((Array.isArray(a) ? a : []).map(Number).filter((x) => Number.isInteger(x) && x > 0 && x <= 120))].sort((x, y) => x - y);
const str = (v, max = 255) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));
const money = (v) => (v === null || v === undefined || v === '' ? null : Math.max(Number(v) || 0, 0));
const cellOf = (c) => (c && typeof c === 'object' ? { rate: money(c.rate), given: money(c.given), buy: money(c.buy) } : null);
const STRUCTURED = ['hotel', 'transport', 'activity', 'flight', 'visa', 'land_package', 'other'];
export const isStructured = (s) => STRUCTURED.includes(s);
const OTHER_CATEGORIES = ['hotel', 'transport', 'flight', 'visa', 'land_package', 'trip'];

/** Validate + clean one line. Returns { details, errors }. */
export async function cleanDetails(req, service, d = {}, startDate) {
  const e = [];
  const exists = async (ref, id) => Boolean(id) && (await names(req.orgId, ref, [id])).has(Number(id));
  let out;
  switch (service) {
    case 'hotel': {
      out = {
        nights: ints(d.nights), hotel_id: Number(d.hotel_id) || null, meal_plan: str(d.meal_plan, 20), room_type: str(d.room_type, 150),
        pax_per_room: Math.max(n(d.pax_per_room), 1), rooms: Math.max(n(d.rooms), 1), aweb: Math.max(n(d.aweb), 0), cweb: Math.max(n(d.cweb), 0), cnb: Math.max(n(d.cnb), 0),
        comp: Math.max(n(d.comp), 0), notes: str(d.notes, 500),
        prices: (Array.isArray(d.prices) ? d.prices : []).map((p) => ({ night: Number(p.night), date: str(p.date, 10), room: cellOf(p.room), aweb: cellOf(p.aweb), cweb: cellOf(p.cweb), cnb: cellOf(p.cnb) })),
      };
      if (!out.nights.length) e.push('choose the stay night(s)');
      if (!(await exists('hotel', out.hotel_id))) e.push('choose a hotel');
      if (!out.room_type) e.push('choose the room type');
      if (!out.meal_plan) e.push('choose the meal plan');
      if (out.aweb + out.cweb > out.rooms * 2) e.push('too many extra beds for the rooms');
      break;
    }
    case 'transport':
    case 'activity': {
      const list = service === 'transport' ? d.cabs : d.tickets;
      out = {
        days: ints(d.days), location: str(d.location, 150), service_type: str(d.service_type, 150), start_time: str(d.start_time, 10), duration_mins: n(d.duration_mins) || null,
        pickup_point: str(d.pickup_point, 255), slot: str(d.slot, 20), notes: str(d.notes, 500), included: service === 'transport' && Boolean(d.included),
        [service === 'transport' ? 'transport_service_id' : 'activity_service_id']: Number(d[service === 'transport' ? 'transport_service_id' : 'activity_service_id']) || null,
        [service === 'transport' ? 'cabs' : 'tickets']: (Array.isArray(list) ? list : []).map((c) => ({
          [service === 'transport' ? 'cab_type' : 'type']: str(c.cab_type ?? c.type, 100), qty: Math.max(n(c.qty), 0),
          prices: (Array.isArray(c.prices) ? c.prices : []).map((p) => ({ day: Number(p.day), date: str(p.date, 10), ...cellOf(p) })),
        })).filter((c) => c.qty > 0),
      };
      if (!out.days.length) e.push('choose the day(s)');
      const ref = service === 'transport' ? 'transport_service' : 'activity_service';
      const idKey = service === 'transport' ? 'transport_service_id' : 'activity_service_id';
      if (!(await exists(ref, out[idKey]))) e.push(service === 'transport' ? 'choose the transport service' : 'choose the activity');
      if (!(service === 'transport' ? out.cabs : out.tickets).length && !out.included) e.push(service === 'transport' ? 'add at least one cab' : 'add at least one ticket');
      break;
    }
    case 'flight': {
      const counts = { adults: Math.max(n(d.adults), 0), children: Math.max(n(d.children), 0), infants: Math.max(n(d.infants), 0) };
      const p3 = (x) => ({ adult: money(x?.adult), child: money(x?.child), infant: money(x?.infant) });
      out = {
        trip_way: ['One way', 'Return', 'Multi-city'].includes(d.trip_way) ? d.trip_way : 'One way', travel_class: str(d.travel_class, 40), baggage: str(d.baggage, 120), notes: str(d.notes, 500),
        ...counts, cost: p3(d.cost), sell: p3(d.sell), day: n(d.day) || 1, supplier_id: Number(d.supplier_id) || null,
        legs: (Array.isArray(d.legs) ? d.legs : []).slice(0, 8).map((l) => ({
          dir: str(l.dir, 20), from_city: str(l.from_city, 100), to_city: str(l.to_city, 100), airline: str(l.airline, 80), flight_no: str(l.flight_no, 20),
          depart_date: str(l.depart_date, 10), depart_time: str(l.depart_time, 5), arrive_date: str(l.arrive_date, 10), arrive_time: str(l.arrive_time, 5), terminal: str(l.terminal, 20),
        })),
      };
      if (!out.legs.length || out.legs.some((l) => !l.from_city || !l.to_city)) e.push('enter departure and arrival airports');
      if (!counts.adults && !counts.children) e.push('enter the passengers');
      break;
    }
    case 'visa': {
      out = { country: str(d.country, 100), visa_service_id: Number(d.visa_service_id) || null, visa_type: str(d.visa_type, 100), pax: Math.max(n(d.pax), 1),
        currency: str(d.currency, 3) || 'INR', fx_rate: n(d.fx_rate) || 1, rate: money(d.rate) ?? 0, given: money(d.given), travel_date: str(d.travel_date, 10), notes: str(d.notes, 500) };
      if (!out.country && !out.visa_service_id) e.push('choose the country / visa');
      if (out.visa_service_id && !(await exists('visa_service', out.visa_service_id))) e.push('choose a visa from the list');
      break;
    }
    case 'land_package': {
      const pkg = d.package && typeof d.package === 'object' ? d.package : {};
      out = {
        supplier_id: Number(d.supplier_id) || null, attachment_id: Number(d.attachment_id) || null, source: ['pdf', 'email', 'manual', 'master'].includes(d.source) ? d.source : 'manual',
        land_package_id: Number(d.land_package_id) || null, title: str(d.title || pkg.title, 255), day: Math.max(n(d.day), 1), nights: Math.max(n(d.nights ?? pkg.nights), 0),
        currency: str(d.currency, 3) || 'INR', fx_rate: n(d.fx_rate) || 1, price_basis: d.price_basis === 'total' ? 'total' : 'per_person',
        rate_adult: money(d.rate_adult) ?? 0, rate_child: money(d.rate_child) ?? 0, rate_infant: money(d.rate_infant) ?? 0,
        adults: Math.max(n(d.adults), 0), children: Math.max(n(d.children), 0), infants: Math.max(n(d.infants), 0), total_amount: money(d.total_amount) ?? 0,
        option_name: str(d.option_name, 150), vendor_ref: str(d.vendor_ref, 80), description: str(d.description, 5000),
        package: {
          destination: str(pkg.destination, 150), vehicle: str(pkg.vehicle, 300),
          hotels: (pkg.hotels || []).slice(0, 60).map((h) => ({ nights: ints(h.nights), city: str(h.city, 150), hotel: str(h.hotel, 200), meal_plan: str(h.meal_plan, 40), room: str(h.room, 200) })),
          transport: (pkg.transport || []).slice(0, 60).map((x) => ({ day: n(x.day), service: str(x.service, 300) })),
          itinerary: (pkg.itinerary || []).slice(0, 60).map((x) => ({ day: n(x.day), title: str(x.title, 200), description: str(x.description, 10000) })),
          inclusions: (pkg.inclusions || []).slice(0, 80).map((x) => str(x, 500)).filter(Boolean),
          exclusions: (pkg.exclusions || []).slice(0, 80).map((x) => str(x, 500)).filter(Boolean),
          paid_activities: (pkg.paid_activities || []).slice(0, 40).map((x) => ({ name: str(x.name, 200), price: money(x.price), currency: str(x.currency, 3) })),
          terms: str(pkg.terms, 10000),
        },
      };
      if (!(await exists('supplier', out.supplier_id))) e.push('choose the vendor');
      if (!out.title) e.push('give the package a title');
      break;
    }
    case 'other': {
      out = { category: OTHER_CATEGORIES.includes(d.category) ? d.category : 'trip', description: str(d.description, 300), day: n(d.day) || null, night: n(d.night) || null,
        hotel_ref: str(d.hotel_ref, 200), qty: d.qty === '' || d.qty === undefined ? 1 : Math.max(n(d.qty), 0), price: money(d.price) ?? 0, buy: money(d.buy), comments: str(d.comments, 500),
        supplier_id: Number(d.supplier_id) || null, lump: Boolean(d.lump) };
      if (!out.description) e.push('describe the service');
      break;
    }
    default: {
      const def = SERVICES[service];
      const sets = await refIdSets(req.orgId, def.quoteFields, [d]);
      const r = normalizeFields(def.quoteFields, d, { refIds: sets });
      out = r.data;
      for (const [k, m] of Object.entries(r.errors)) e.push(`${def.quoteFields.find((f) => f.key === k)?.label} – ${m}`);
    }
  }
  if (SERVICES[service]?.dates === 'stay' && !startDate && service !== 'land_package') e.push('needs the start date');
  return { details: out, errors: e };
}

/** Cost from the structured line (or the given number for classic services). */
export function priceOf(service, details, given) {
  const c = computeItem(service, details);
  if (!c) return { cost: given.cost, buy_cost: given.buy_cost, selling_override: given.selling_override };
  return { cost: c.cost, buy_cost: c.buy_cost, selling_override: c.selling_override ?? null };
}

/* ------------------------------- titles ------------------------------- */
export async function itemTitle(orgId, service, d) {
  const nm = async (ref, id) => (id ? (await names(orgId, ref, [id])).get(Number(id)) || '' : '');
  const pax = (a, c, i) => [a && `${a}A`, c && `${c}C`, i && `${i}I`].filter(Boolean).join(' + ');
  switch (service) {
    case 'hotel': return `${await nm('hotel', d.hotel_id)} · ${d.room_type} · ${d.meal_plan} · ${d.rooms}×${d.pax_per_room}P${n(d.aweb) ? ` +${d.aweb}AWEB` : ''}${n(d.cweb) ? ` +${d.cweb}CWEB` : ''}${n(d.cnb) ? ` +${d.cnb}CNB` : ''} · N${rangesText(d.nights)}`;
    case 'transport': return `${await nm('transport_service', d.transport_service_id)} · ${(d.cabs || []).map((c) => `${c.qty}×${c.cab_type}`).join(', ')} · Day ${rangesText(d.days)}`;
    case 'activity': return `${await nm('activity_service', d.activity_service_id)} · ${(d.tickets || []).map((c) => `${c.qty} ${c.type}`).join(', ')} · Day ${rangesText(d.days)}`;
    case 'flight': {
      const l = d.legs || []; const first = l[0] || {};
      return [`${first.from_city} → ${first.to_city}${d.trip_way === 'Return' ? ' (return)' : d.trip_way === 'Multi-city' ? ` +${l.length - 1} leg(s)` : ''}`,
        [first.airline, first.flight_no].filter(Boolean).join(' '), pax(n(d.adults), n(d.children), n(d.infants))].filter(Boolean).join(' · ');
    }
    case 'visa': return `${d.visa_service_id ? await nm('visa_service', d.visa_service_id) : `${d.country} visa`}${d.visa_type ? ` · ${d.visa_type}` : ''} · ${d.pax} pax`;
    // the vendor (DMC) is kept in details.supplier_id only – titles reach customer documents
    case 'land_package': return `${d.title}${d.option_name ? ` (${d.option_name})` : ''} · ${d.nights}N`;
    case 'other': return d.description;
    default: return (await import('./quotes.model.js')).itemTitle(orgId, service, d);
  }
}

/* --------------------------- bookings on convert --------------------------- */
/**
 * One quote line → the bookings operations work with:
 * hotel = one per continuous stay, transport = one per day per cab type, activity = one per day,
 * visa / passport = one per applicant, others = one.
 */
export async function expandBookings(orgId, start, it) {
  const d = it.details; const out = [];
  const add = (title, date, end, details, quoted, supplierId = null) => out.push({ title, service_date: date, end_date: end, details, quoted_cost: r2(quoted), supplier_id: supplierId });
  switch (it.service) {
    case 'hotel': {
      for (const [a, b] of ranges(d.nights)) {
        const nights = []; for (let k = a; k <= b; k += 1) nights.push(k);
        const buy = (d.prices || []).filter((p) => nights.includes(Number(p.night))).reduce((s, p) => s + hotelNightTotal(d, p, 'buy'), 0);
        const name = (await names(orgId, 'hotel', [d.hotel_id])).get(Number(d.hotel_id)) || 'Hotel';
        const hotel = await one('SELECT supplier_id FROM hotels WHERE id = ?', [d.hotel_id]);
        add(`${name} · ${d.room_type} · ${d.meal_plan} · ${d.rooms}×${d.pax_per_room}P · ${b - a + 1}N`, dateOf(start, a), dateOf(start, b + 1),
          { ...d, day: a, nights: b - a + 1, night_numbers: nights, prices: undefined }, buy, hotel?.supplier_id || null);
      }
      break;
    }
    case 'transport':
    case 'activity': {
      const list = it.service === 'transport' ? d.cabs : d.tickets;
      const name = (await names(orgId, it.service === 'transport' ? 'transport_service' : 'activity_service', [d.transport_service_id || d.activity_service_id])).get(Number(d.transport_service_id || d.activity_service_id)) || it.title;
      for (const day of d.days) {
        if (it.service === 'transport') {
          for (const c of list) {
            const p = (c.prices || []).find((x) => Number(x.day) === day) || {};
            add(`${name} · ${c.qty} × ${c.cab_type}`, dateOf(start, day), dateOf(start, day),
              { transport_service_id: d.transport_service_id, cab_type: c.cab_type, qty: c.qty, start_time: d.start_time, pickup_point: d.pickup_point, service_type: d.service_type, day },
              d.included ? 0 : n(p.buy ?? p.given ?? p.rate) * c.qty);
          }
        } else {
          const qty = (t) => list.filter((x) => /adult/i.test(x.type) === t).reduce((s, x) => s + n(x.qty), 0);
          const buy = list.reduce((s, c) => { const p = (c.prices || []).find((x) => Number(x.day) === day) || {}; return s + n(p.buy ?? p.given ?? p.rate) * c.qty; }, 0);
          add(`${name} · ${list.map((c) => `${c.qty} ${c.type}`).join(', ')}`, dateOf(start, day), dateOf(start, day),
            { activity_service_id: d.activity_service_id, adults: qty(true), children: qty(false), tickets: list.map((c) => ({ type: c.type, qty: c.qty })), slot: d.slot, day }, buy);
        }
      }
      break;
    }
    case 'flight': {
      const l = d.legs[0] || {};
      add(it.title, l.depart_date || dateOf(start, d.day || 1), l.arrive_date || l.depart_date || null,
        { ...d, from_city: l.from_city, to_city: l.to_city, airline: l.airline, flight_no: l.flight_no, depart_date: l.depart_date, depart_time: l.depart_time, arrive_time: l.arrive_time }, it.buy_cost ?? it.cost, d.supplier_id);
      break;
    }
    case 'visa': {
      const per = r2(n(it.buy_cost ?? it.cost) / Math.max(d.pax, 1));
      const vendor = d.visa_service_id ? (await lookupGet(orgId, 'visa_service', d.visa_service_id))?.data?.supplier_id : null;
      for (let k = 1; k <= Math.max(d.pax, 1); k += 1) add(`${it.title} (${k}/${d.pax})`, d.travel_date || start || null, null, { ...d, adults: 1, children: 0 }, per, vendor || null);
      break;
    }
    case 'land_package': {
      const date = dateOf(start, d.day) || null;
      add(it.title, date, date && d.nights ? addDays(date, d.nights) : date, { ...d, package: { destination: d.package.destination, hotels: d.package.hotels, vehicle: d.package.vehicle, transport: d.package.transport } }, it.buy_cost ?? it.cost, d.supplier_id);
      break;
    }
    case 'other': {
      add(it.title, dateOf(start, d.day || d.night || 1) || null, null, { ...d, description: d.description }, it.buy_cost ?? it.cost, d.supplier_id);
      break;
    }
    default: {
      const def = SERVICES[it.service];
      const date = it.service === 'insurance' || it.service === 'train' ? dateOf(start, d.day || 1) : start;
      const people = n(d.adults) + n(d.children);
      const copies = def?.perGuest ? Math.max(people, 1) : 1;
      for (let k = 0; k < copies; k += 1) add(copies > 1 ? `${it.title} (${k + 1}/${copies})` : it.title, date, date, def?.perGuest ? { ...d, adults: 1, children: 0 } : d, n(it.buy_cost ?? it.cost) / copies, d.supplier_id || null);
    }
  }
  return out;
}

/* ----------------------------- itinerary draft ----------------------------- */
export async function draftItinerary(orgId, nights, items, startDate = null) {
  const days = Array.from({ length: Math.max(n(nights), 0) + 1 }, () => ({ title: '', description: '' }));
  const at = (k) => days[Math.min(Math.max(k, 1), days.length) - 1];
  const add = (k, text) => { const d = at(k); d.description += `${d.description ? '\n\n' : ''}${text}`; };
  const pkgDays = new Set();
  for (const it of items.filter((x) => x.service === 'land_package')) {
    const d = it.details; const base = n(d.day) || 1;
    for (const x of d.package?.itinerary || []) {
      const k = base + n(x.day) - 1; pkgDays.add(k);
      if (!at(k).title && x.title) at(k).title = x.title;
      add(k, x.description || '');
    }
  }
  const sorted = [...items].sort((a, b) => (firstDay(a.service, a.details) || 0) - (firstDay(b.service, b.details) || 0));
  for (const it of sorted) {
    const d = it.details || {};
    if (it.service === 'transport') {
      const s = await one('SELECT * FROM transport_services WHERE id = ? AND org_id = ?', [d.transport_service_id, orgId]);
      if (!s) continue;
      for (const k of d.days || []) {
        if (pkgDays.has(k)) continue;
        if (!at(k).title) at(k).title = s.to_location ? `${s.from_location} to ${s.to_location}` : `${s.from_location} – ${s.service}`;
        add(k, s.day_schedule || `${s.service}${s.to_location ? ` from ${s.from_location} to ${s.to_location}` : ` in ${s.from_location}`}.`);
        if (s.distance_km || s.duration_mins) add(k, `Approx. ${s.distance_km ? `${s.distance_km} km` : ''}${s.distance_km && s.duration_mins ? ' / ' : ''}${s.duration_mins ? `${Math.round(s.duration_mins / 6) / 10} hrs` : ''} drive.`);
      }
    } else if (it.service === 'activity') {
      const a = await one('SELECT s.*, a.name AS activity FROM activity_services s JOIN activities a ON a.id = s.activity_id WHERE s.id = ? AND s.org_id = ?', [d.activity_service_id, orgId]);
      if (a) for (const k of d.days || []) add(k, `${a.activity} – ${a.name}${d.slot ? ` (${d.slot})` : ''}.${a.description ? ` ${a.description}` : ''}`);
    } else if (it.service === 'hotel') {
      const h = await one('SELECT name, city FROM hotels WHERE id = ? AND org_id = ?', [d.hotel_id, orgId]);
      if (h) for (const k of d.nights || []) if (!pkgDays.has(k)) add(k, `Overnight stay at ${h.name}, ${h.city} (${d.meal_plan}).`);
    } else if (it.service === 'flight') {
      const dayOf = (date) => (date && startDate ? Math.round((Date.parse(date) - Date.parse(startDate)) / 86400000) + 1 : null);
      for (const [k, l] of (d.legs || []).entries()) add(dayOf(l.depart_date) || (k > 0 && d.trip_way === 'Return' ? days.length : n(d.day) || 1), `✈ ${l.from_city} → ${l.to_city}${l.airline ? ` · ${l.airline} ${l.flight_no || ''}` : ''}${l.depart_time ? ` · departs ${l.depart_time}` : ''}${l.arrive_time ? `, arrives ${l.arrive_time}` : ''}`);
    } else if (it.service === 'train') {
      add(n(d.day) || 1, `🚆 ${it.title}`);
    }
  }
  days.forEach((day, k) => { if (!day.title) day.title = k === days.length - 1 && k > 0 ? 'Departure' : k === 0 ? 'Arrival' : `Day ${k + 1}`; });
  return days;
}

export async function vendorAttachmentIds(items) {
  return items.filter((i) => i.service === 'land_package' && i.details.attachment_id).map((i) => i.details.attachment_id);
}
export { query };
