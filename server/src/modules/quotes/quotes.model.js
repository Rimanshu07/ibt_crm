import { pool, query, one } from '../../core/db.js';
import { j, addDays, r2 } from '../../core/http.js';
import { names, get as lookupGet } from '../lookup/lookup.model.js';
import { hotelPrice, transportPrice, activityPrice } from '../rates/rates.pricing.js';
import { autoCost, priceQuote } from '../../../../shared/pricing.js';

const num = (v) => Number(v) || 0;

export async function load(orgId, id) {
  const q = await one('SELECT * FROM quotes WHERE id = ? AND org_id = ?', [id, orgId]);
  if (!q) return null;
  const items = (await query('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order, id', [q.id])).map((i) => ({ ...i, details: j(i.details, {}) }));
  const pricing = j(q.pricing, {});
  const children = j(q.children_ages, []);
  const priced = priceQuote(items, pricing, num(q.adults) + children.length);
  return {
    ...q, pricing, children_ages: children, itinerary: j(q.itinerary, null),
    items: items.map((i, k) => ({ ...i, markup: priced.lines[k].markup, tax: priced.lines[k].tax, selling: priced.lines[k].selling })),
    summary: { per_person: priced.per_person, profit: priced.profit, profit_pct: priced.profit_pct, by_service: priced.by_service },
  };
}

export const tripQuoteIds = (tripId) => query('SELECT id FROM quotes WHERE trip_id = ? ORDER BY version DESC', [tripId]);

/** Readable one-line title for a quote item / booking. */
export async function itemTitle(orgId, service, d) {
  const n = async (ref, id) => (id ? (await names(orgId, ref, [id])).get(Number(id)) || '' : '');
  const pax = (a, c, i) => [a && `${a}A`, c && `${c}C`, i && `${i}I`].filter(Boolean).join(' + ');
  switch (service) {
    case 'hotel': return `${await n('hotel', d.hotel_id)} · ${d.room_type} · ${d.meal_plan} · ${d.rooms}×${d.pax_per_room}P${num(d.aweb) ? ` +${d.aweb}AWEB` : ''}${num(d.cweb) ? ` +${d.cweb}CWEB` : ''}${num(d.cnb) ? ` +${d.cnb}CNB` : ''} · ${d.nights}N`;
    case 'transport': return `${await n('transport_service', d.transport_service_id)} · ${d.qty} × ${d.cab_type}`;
    case 'activity': return `${await n('activity_service', d.activity_service_id)} · ${pax(num(d.adults), num(d.children))}`;
    case 'land_package': return `${d.title || await n('land_package', d.land_package_id)} · ${d.nights}N · ${await n('supplier', d.supplier_id)}`;
    case 'flight': return `${d.airline || 'Flight'} ${d.flight_no || ''} · ${d.from_city} → ${d.to_city}${d.trip_way && d.trip_way !== 'One way' ? ` (${d.trip_way})` : ''} · ${pax(num(d.adults), num(d.children), num(d.infants))}`.replace(/\s+/g, ' ');
    case 'train': return `${await n('train', d.train_id)} · ${d.travel_class}${d.from_station ? ` · ${d.from_station} → ${d.to_station || ''}` : ''} · ${pax(num(d.adults), num(d.children))}`;
    case 'visa': return `${await n('visa_service', d.visa_service_id)} · ${pax(num(d.adults), num(d.children))}`;
    case 'passport': return `${await n('passport_service', d.passport_service_id)} · ${d.adults} applicant(s)`;
    case 'insurance': return `${await n('insurance_plan', d.insurance_plan_id)} · ${d.adults} traveller(s)`;
    default: return `${d.description || 'Service'}${num(d.qty) > 1 ? ` × ${d.qty}` : ''}`;
  }
}

async function master(orgId, type, id) { return id ? (await lookupGet(orgId, type, id))?.data || null : null; }

/**
 * Cost of one quote line. date = date of the service (start date + day − 1).
 * Returns { cost, buy_cost, selling_override?, note, warnings?, breakdown?, fill? }
 */
export async function lookupPrice(orgId, service, d, date) {
  const auto = autoCost(service, d);
  switch (service) {
    case 'hotel': return hotelPrice(orgId, d, date);
    case 'transport': return transportPrice(orgId, d, date);
    case 'activity': return activityPrice(orgId, d, date);
    case 'land_package': {
      const p = await master(orgId, 'land_package', d.land_package_id);
      if (p) {
        const fill = { supplier_id: p.supplier_id, title: d.title || (await names(orgId, 'land_package', [d.land_package_id])).get(Number(d.land_package_id)), nights: p.nights, currency: p.currency,
          rate_adult_twin: p.rate_adult_twin, rate_adult_single: p.rate_adult_single, rate_extra_adult: p.rate_extra_adult, rate_child_bed: p.rate_child_bed,
          rate_child_nobed: p.rate_child_nobed, description: (p.inclusions || []).join('\n') };
        const cost = autoCost('land_package', { ...d, ...fill });
        const warnings = (p.valid_to && date && date > p.valid_to) ? [`Vendor rates valid only until ${p.valid_to}`] : [];
        return { cost, buy_cost: cost, note: `${p.currency || ''} rates from the vendor package × ${d.fx_rate || 1}`, fill, warnings };
      }
      return { cost: auto, buy_cost: auto, note: 'Rates entered manually' };
    }
    case 'train': {
      const rows = await query("SELECT data FROM master_records WHERE org_id = ? AND type = 'train_fare' AND is_active = 1", [orgId]);
      const fare = rows.map((r) => j(r.data, {})).find((x) => Number(x.train_id) === Number(d.train_id) && x.travel_class === d.travel_class
        && (!date || ((!x.valid_from || x.valid_from <= date) && (!x.valid_to || x.valid_to >= date))));
      if (!fare) return { cost: null, note: 'No fare found for this train and class' };
      const p = num(d.adults) + num(d.children);
      return { cost: r2(num(fare.fare) * p), buy_cost: r2(num(fare.fare) * p), selling_override: r2((num(fare.fare) + num(fare.service_fee)) * p), note: `fare ${fare.fare} + fee ${fare.service_fee || 0}` };
    }
    case 'visa': {
      const v = await master(orgId, 'visa_service', d.visa_service_id);
      if (!v) return { cost: null, note: 'Choose a visa' };
      const cost = num(v.cost_adult) * num(d.adults) + num(v.cost_child ?? v.cost_adult) * num(d.children);
      const sell = v.selling_adult ? num(v.selling_adult) * num(d.adults) + num(v.selling_child ?? v.selling_adult) * num(d.children) : null;
      return { cost: r2(cost), buy_cost: r2(cost), selling_override: sell === null ? null : r2(sell), note: `${v.cost_adult} per adult${v.processing_days ? ` · ${v.processing_days} days processing` : ''}` };
    }
    case 'passport': {
      const v = await master(orgId, 'passport_service', d.passport_service_id);
      if (!v) return { cost: null, note: 'Choose a service' };
      const n = Math.max(num(d.adults), 1);
      return { cost: r2(num(v.cost_price) * n), buy_cost: r2(num(v.cost_price) * n), selling_override: v.selling_price ? r2(num(v.selling_price) * n) : null, note: `${v.cost_price} per applicant` };
    }
    case 'insurance': {
      const v = await master(orgId, 'insurance_plan', d.insurance_plan_id);
      if (!v) return { cost: null, note: 'Choose a plan' };
      const n = Math.max(num(d.adults), 1);
      return { cost: r2(num(v.premium_cost) * n), buy_cost: r2(num(v.premium_cost) * n), selling_override: v.premium_selling ? r2(num(v.premium_selling) * n) : null, note: `${v.premium_cost} per traveller` };
    }
    default:
      return { cost: auto, buy_cost: auto, note: auto === null ? 'Enter the price' : 'Calculated from the fares you entered' };
  }
}

/** Day-wise itinerary draft from the quote's items. */
export async function draftItinerary(orgId, nights, items) {
  const days = Array.from({ length: Math.max(num(nights), 0) + 1 }, () => ({ title: '', description: '' }));
  const add = (i, text) => { const k = Math.min(Math.max(i, 0), days.length - 1); days[k].description += `${days[k].description ? '\n\n' : ''}${text}`; };
  const sorted = [...items].sort((a, b) => num(a.details?.day) - num(b.details?.day));
  for (const it of sorted) {
    const d = it.details || {}; const i = (num(d.day) || 1) - 1;
    if (it.service === 'transport') {
      const s = await one('SELECT * FROM transport_services WHERE id = ? AND org_id = ?', [d.transport_service_id, orgId]);
      if (!s) continue;
      const k = Math.min(Math.max(i, 0), days.length - 1);
      if (!days[k].title) days[k].title = s.to_location ? `${s.from_location} to ${s.to_location}` : `${s.from_location} ${s.service}`;
      add(i, s.day_schedule || `${s.service}${s.to_location ? ` from ${s.from_location} to ${s.to_location}` : ` in ${s.from_location}`}.`);
      if (s.distance_km || s.duration_mins) add(i, `Approx. ${s.distance_km ? `${s.distance_km} km` : ''}${s.distance_km && s.duration_mins ? ' / ' : ''}${s.duration_mins ? `${Math.round(s.duration_mins / 6) / 10} hrs` : ''} drive.`);
    } else if (it.service === 'activity') {
      const a = await one('SELECT s.*, a.name AS activity FROM activity_services s JOIN activities a ON a.id = s.activity_id WHERE s.id = ? AND s.org_id = ?', [d.activity_service_id, orgId]);
      if (a) add(i, `${a.activity} – ${a.name}${d.slot ? ` (${d.slot})` : ''}.${a.description ? ` ${a.description}` : ''}`);
    } else if (it.service === 'hotel') {
      const h = await one('SELECT name, city FROM hotels WHERE id = ? AND org_id = ?', [d.hotel_id, orgId]);
      if (h) for (let n = 0; n < Math.max(num(d.nights), 1); n += 1) add(i + n, `Overnight stay at ${h.name}, ${h.city} (${d.meal_plan}).`);
    } else if (it.service === 'land_package') {
      const p = await master(orgId, 'land_package', d.land_package_id);
      const paras = String(p?.itinerary || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
      paras.forEach((para, k) => {
        const [first, ...rest] = para.split('\n');
        const idx = Math.min(Math.max(i + k, 0), days.length - 1);
        if (!days[idx].title && rest.length) days[idx].title = first.replace(/^day\s*\d+\s*[:–-]\s*/i, '');
        add(i + k, rest.length ? rest.join('\n') : first);
      });
      if (!paras.length) add(i, `Land services by the vendor: ${it.title}`);
    } else if (['flight', 'train'].includes(it.service)) {
      add(i, `${it.service === 'flight' ? '✈' : '🚆'} ${it.title}${d.depart_time ? ` · departs ${d.depart_time}` : ''}${d.arrive_time ? `, arrives ${d.arrive_time}` : ''}`);
    }
  }
  days.forEach((day, k) => { if (!day.title) day.title = k === days.length - 1 && k > 0 ? 'Departure' : k === 0 ? 'Arrival' : `Day ${k + 1}`; });
  return days;
}

/** Inclusions, exclusions and T&C for the services in the quote. */
export async function contentFor(orgId, services) {
  const rows = await query("SELECT * FROM org_content WHERE org_id = ? AND is_default = 1 ORDER BY FIELD(service, 'general') DESC, id", [orgId]);
  const pick = rows.filter((r) => r.service === 'general' || services.includes(r.service));
  return {
    inclusions: pick.filter((r) => r.kind === 'inc_exc').flatMap((r) => j(r.inclusions, [])),
    exclusions: pick.filter((r) => r.kind === 'inc_exc').flatMap((r) => j(r.exclusions, [])),
    tnc: pick.filter((r) => r.kind === 'tnc').map((r) => `${r.title}\n${r.body}`).join('\n\n'),
  };
}

export async function suggestions(orgId, t) {
  const rows = await query(
    `SELECT q.id, q.nights, q.total_selling, q.currency, q.created_at, tr.trip_no, tr.guest_name, tr.destination_ids
     FROM quotes q JOIN trips tr ON tr.id = q.trip_id WHERE q.org_id = ? AND q.trip_id <> ? ORDER BY q.id DESC LIMIT 300`, [orgId, t.id]
  );
  const nights = num(t.nights);
  const scored = rows.map((r) => ({ ...r, overlap: (j(r.destination_ids, []) || []).filter((d) => t.destination_ids.includes(d)).length }))
    .filter((r) => (!t.destination_ids.length || r.overlap > 0) && Math.abs(num(r.nights) - nights) <= 1).slice(0, 6);
  if (scored.length) {
    const [items] = await pool.query('SELECT quote_id, service, title, day_no FROM quote_items WHERE quote_id IN (?) ORDER BY sort_order', [scored.map((s) => s.id)]);
    scored.forEach((s) => { s.items = items.filter((i) => i.quote_id === s.id); });
  }
  return scored;
}

export const serviceDate = (start, d, service) => {
  if (service === 'flight' && d.depart_date) return d.depart_date;
  if (service === 'visa') return d.travel_date || start || null;
  if (!start) return null;
  return addDays(start, Math.max(num(d.day || 1) - 1, 0));
};
