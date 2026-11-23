import { query, one } from '../../core/db.js';
import { j, todayIso } from '../../core/http.js';
import { hasPerm } from '../../core/auth.js';
import { refreshStages, getTrip } from '../trips/trips.model.js';
import { tripProfit } from '../finance/finance.model.js';
import { SERVICES, isClosedStatus } from '../../../../shared/catalog.js';
import * as M from './reports.model.js';

export async function dashboard(req, res) {
  await refreshStages(req.orgId);
  res.json({ data: await M.dashboard(req) });
}

export async function liveDues(req, res) { res.json({ data: await M.liveDues(req) }); }

export async function sales(req, res) {
  const from = String(req.query.from || `${todayIso().slice(0, 8)}01`);
  const to = String(req.query.to || todayIso());
  const { leads, converted, quotes, dests } = await M.sales(req, from, to);
  const canProfit = hasPerm(req, 'reports.profit');
  const trips = []; const bySales = {}; const bySource = {}; const byDest = {}; const byService = {};
  const add = (map, k, t, p) => { const g = (map[k] = map[k] || { name: k, trips: 0, revenue: 0, profit: 0 }); g.trips += 1; g.revenue += Number(t.package_amount) || 0; g.profit += p; };
  for (const t of converted) {
    const p = canProfit ? await tripProfit(t) : null;
    const destNames = (j(t.destination_ids, []) || []).map((d) => dests.get(d)).filter(Boolean);
    trips.push({ id: t.id, trip_no: t.trip_no, guest_name: t.guest_name, start_date: t.start_date, nights: t.nights, converted_at: t.converted_at,
      sales_name: t.sales_name, source_name: t.source_name, destinations: destNames.join(', '), services: j(t.services, []),
      package_amount: Number(t.package_amount), profit: p?.profit ?? null, profit_pct: p?.profit_pct ?? null });
    add(bySales, t.sales_name || 'Unassigned', t, p?.profit || 0);
    add(bySource, t.source_name || 'Direct', t, p?.profit || 0);
    (destNames.length ? destNames : ['—']).forEach((d) => add(byDest, d, t, p?.profit || 0));
    (j(t.services, []) || []).forEach((sv) => add(byService, sv, t, p?.profit || 0));
  }
  res.json({ data: {
    from, to, trips,
    totals: { leads: leads.length, quotes, conversions: trips.length, dropped: leads.filter((l) => l.stage === 'dropped').length,
      conversion_pct: leads.length ? Math.round((trips.length / leads.length) * 1000) / 10 : 0,
      revenue: trips.reduce((x, t) => x + t.package_amount, 0), profit: canProfit ? trips.reduce((x, t) => x + (t.profit || 0), 0) : null },
    by_sales: Object.values(bySales), by_source: Object.values(bySource), by_destination: Object.values(byDest), by_service: Object.values(byService),
  } });
}

export async function operations(req, res) {
  const from = String(req.query.from || todayIso());
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 31);
  const services = Object.keys(SERVICES).filter((x) => (!SERVICES[x].feature || req.features.includes(SERVICES[x].feature)) && (!req.query.service || req.query.service === x));
  if (!services.length) return res.json({ data: [] });
  const rows = await M.operations(req, from, days, services);
  res.json({ data: rows.filter((r) => !isClosedStatus(r.service, r.status)).map((r) => ({ ...r, details: j(r.details, {}), children_ages: j(r.children_ages, []) })) });
}

export async function quoteDiff(req, res) { res.json({ data: await M.quoteDiff(req) }); }

/** Printable documents for a trip: quote, vouchers, invoice, receipts. */
export async function documents(req, res) {
  const t = await getTrip(req, req.params.id);
  const base = await M.orgDocs(req.orgId);
  const quoteId = Number(req.query.quote_id) || t.converted_quote_id || t.latest_quote_id;
  const quote = quoteId ? await one('SELECT * FROM quotes WHERE id = ? AND trip_id = ?', [quoteId, t.id]) : null;
  const items = quote ? await query('SELECT id, service, title, details, day_no, cost, buy_cost, selling_override FROM quote_items WHERE quote_id = ? ORDER BY sort_order', [quote.id]) : [];
  const bookings = await query(
    `SELECT b.*, s.name AS supplier_name, s.phone AS supplier_phone, s.email AS supplier_email FROM bookings b LEFT JOIN suppliers s ON s.id = b.supplier_id
     WHERE b.trip_id = ? ORDER BY b.service_date IS NULL, b.service_date, b.id`, [t.id]
  );
  const parsed = [...items, ...bookings].map((x) => j(x.details, {}));
  const hotelIds = [...new Set(parsed.map((d) => d.hotel_id).filter(Boolean))];
  const hotels = hotelIds.length ? await query(`SELECT id, name, location, city, star, address, phone, email, checkin_time, checkout_time FROM hotels WHERE org_id = ? AND id IN (${hotelIds.map(() => '?').join(',')})`, [req.orgId, ...hotelIds]) : [];
  const tsIds = [...new Set(parsed.map((d) => d.transport_service_id).filter(Boolean))];
  const transport = tsIds.length ? await query(`SELECT id, from_location, to_location, service, distance_km, duration_mins FROM transport_services WHERE org_id = ? AND id IN (${tsIds.map(() => '?').join(',')})`, [req.orgId, ...tsIds]) : [];
  const instalments = await query("SELECT id, amount, due_date, paid_amount FROM instalments WHERE trip_id = ? AND direction = 'in' AND amount > 0 ORDER BY due_date", [t.id]);
  const receipts = await query("SELECT id, amount, paid_at, mode, reference, verified_at FROM transactions WHERE trip_id = ? AND direction = 'in' ORDER BY paid_at", [t.id]);
  const users = await query('SELECT id, name, phone, email FROM users WHERE org_id = ? AND id IN (?, ?, ?)', [req.orgId, t.sales_user_id || 0, t.resv_user_id || 0, t.ops_user_id || 0]);
  const [dest] = t.destination_ids.length ? [await query(`SELECT name FROM master_records WHERE id IN (${t.destination_ids.map(() => '?').join(',')})`, t.destination_ids)] : [[]];
  res.json({ data: {
    ...base,
    trip: { ...t, destinations: dest.map((d) => d.name).join(', '), sales: users.find((u) => u.id === t.sales_user_id) || null, ops: users.find((u) => u.id === t.ops_user_id) || null },
    quote: quote ? { ...quote, pricing: j(quote.pricing, {}), itinerary: j(quote.itinerary, null), children_ages: j(quote.children_ages, []) } : null,
    items: items.map((i) => ({ ...i, details: j(i.details, {}) })),
    bookings: bookings.map((b) => ({ ...b, details: j(b.details, {}) })),
    hotels, transport, instalments, receipts,
    can_see_cost: hasPerm(req, 'quotes.view_cost'),
  } });
}

/** Trip check-in / check-out report: ?from=&to= (defaults to this month). */
export async function checkInOut(req, res) {
  const today = todayIso();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : `${today.slice(0, 7)}-01`;
  const last = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : last;
  const rows = await M.checkInOut(req, from, to);
  const sum = (list, k) => list.reduce((s, r) => s + Number(r[k] || 0), 0);
  const ins = rows.filter((r) => r.is_checkin); const outs = rows.filter((r) => r.is_checkout);
  res.json({ data: { from, to, rows, totals: {
    checkins: ins.length, checkouts: outs.length,
    checkin_amount: sum(ins, 'package_amount'), checkout_amount: sum(outs, 'package_amount'),
    received: sum(rows, 'received'), due: sum(rows, 'due'), booked_cost: sum(rows, 'booked_cost'),
  } } });
}
