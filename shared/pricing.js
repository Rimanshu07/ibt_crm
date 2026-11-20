/**
 * Quote pricing engine — shared by the API (saved totals) and the React
 * quote builder (live preview), so both always agree.
 *
 * pricing = { strategy: 'overall'|'per_component', markup_type: 'percent'|'amount', markup_value,
 *             per_component: { hotel: 10, ... }, tax_name, tax_rate, tax_basis: 'cost_markup'|'markup', rounding }
 * items   = [{ service, cost, buy_cost, selling_override }]
 *   cost      = given / quotation price (sales rate) — markup is added on this
 *   buy_cost  = what we pay the supplier (ops rate); defaults to cost
 *   selling_override = fixed selling price before tax (e.g. visa fee)
 */
import { PAYMENT_EVENTS } from './catalog.js';

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => Number(v) || 0;

export function defaultPricing(taxRate = 0, taxName = 'GST') {
  return {
    strategy: 'overall', markup_type: 'percent', markup_value: 10, per_component: {},
    tax_name: taxName, tax_rate: Number(taxRate) || 0, tax_basis: 'cost_markup', rounding: 1,
  };
}

export function priceQuote(items, pricing, pax = 1) {
  const p = { ...defaultPricing(), ...(pricing || {}) };
  const lines = items.map((it) => ({
    ...it, cost: r2(it.cost), buy_cost: r2(it.buy_cost === null || it.buy_cost === undefined || it.buy_cost === '' ? it.cost : it.buy_cost), markup: 0,
  }));
  const isFixed = (l) => !(l.selling_override === null || l.selling_override === undefined || l.selling_override === '');
  const auto = lines.filter((l) => !isFixed(l));
  lines.filter(isFixed).forEach((l) => { l.markup = r2(Number(l.selling_override) - l.cost); });

  if (p.strategy === 'per_component') {
    auto.forEach((l) => { l.markup = r2(l.cost * num(p.per_component?.[l.service]) / 100); });
  } else if (p.markup_type === 'amount') {
    const base = auto.reduce((s, l) => s + l.cost, 0);
    const amount = num(p.markup_value);
    auto.forEach((l) => { l.markup = base > 0 ? r2(amount * l.cost / base) : r2(amount / (auto.length || 1)); });
  } else {
    auto.forEach((l) => { l.markup = r2(l.cost * num(p.markup_value) / 100); });
  }

  const rate = num(p.tax_rate) / 100;
  lines.forEach((l) => {
    const taxable = p.tax_basis === 'markup' ? l.cost + l.markup - l.buy_cost : l.cost + l.markup;
    l.tax = r2(Math.max(taxable, 0) * rate);
    l.selling = r2(l.cost + l.markup);
    l.total = r2(l.selling + l.tax);
  });

  const totalCost = r2(lines.reduce((s, l) => s + l.cost, 0));
  const totalBuy = r2(lines.reduce((s, l) => s + l.buy_cost, 0));
  let totalMarkup = r2(lines.reduce((s, l) => s + l.markup, 0));
  const totalTax = r2(lines.reduce((s, l) => s + l.tax, 0));
  let total = r2(totalCost + totalMarkup + totalTax);

  const step = num(p.rounding) || 1;
  const rounded = step > 1 ? Math.ceil(total / step) * step : Math.round(total);
  totalMarkup = r2(totalMarkup + (rounded - total));
  total = r2(rounded);

  const people = Math.max(num(pax) || 1, 1);
  const byService = {};
  lines.forEach((l) => {
    const b = (byService[l.service] = byService[l.service] || { cost: 0, buy: 0, selling: 0, tax: 0 });
    b.cost = r2(b.cost + l.cost); b.buy = r2(b.buy + l.buy_cost); b.selling = r2(b.selling + l.selling); b.tax = r2(b.tax + l.tax);
  });
  const profit = r2(total - totalTax - totalBuy);

  return {
    lines,
    total_cost: totalCost,
    total_buy: totalBuy,
    total_markup: totalMarkup,
    total_tax: totalTax,
    total_selling: total,
    per_person: r2(total / people),
    profit,
    profit_pct: total > 0 ? r2((profit / total) * 100) : 0,
    by_service: byService,
  };
}

/**
 * Cost that can be worked out from the line itself (no price master needed).
 * Returns null when the service needs a price lookup instead.
 */
export function autoCost(service, d = {}) {
  switch (service) {
    case 'flight':
      return r2(num(d.adults) * num(d.fare_adult) + num(d.children) * num(d.fare_child) + num(d.infants) * num(d.fare_infant));
    case 'land_package': {
      const base = num(d.adults_twin) * num(d.rate_adult_twin) + num(d.adults_single) * num(d.rate_adult_single)
        + num(d.extra_adults) * num(d.rate_extra_adult) + num(d.child_bed) * num(d.rate_child_bed)
        + num(d.child_nobed) * num(d.rate_child_nobed);
      return r2(base * (num(d.fx_rate) || 1));
    }
    case 'other':
      return r2(Math.max(num(d.qty), 1) * num(d.unit_price));
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Payment preferences: [{event, offset_days, pct}]                    */
/* ------------------------------------------------------------------ */
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(n || 0)); return iso(d); };
const monthEnd = (date) => { const d = new Date(`${date}T00:00:00Z`); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); };

/** Human description: "50% on Booking Date, 50% 15 days before Checkin Date". */
export function describePref(parts = []) {
  return parts.map((p) => {
    const ev = PAYMENT_EVENTS.find((e) => e.key === p.event)?.label || p.event;
    const off = num(p.offset_days);
    const when = off === 0 ? `on ${ev}` : `${Math.abs(off)} day${Math.abs(off) === 1 ? '' : 's'} ${off < 0 ? 'before' : 'after'} ${ev}`;
    return `${num(p.pct)}% ${when}`;
  }).join(', ');
}

/**
 * Turn a preference into dated amounts. `dates` = { booking_date, checkin_date, checkout_date, trip_start, trip_end }.
 * Dates in the past move to today. The last part absorbs rounding.
 */
export function scheduleFromPref(total, parts, dates, today = new Date().toISOString().slice(0, 10)) {
  if (!parts?.length) return [{ amount: r2(total), due_date: today }];
  const base = (ev) => {
    switch (ev) {
      case 'booking_month_end': return monthEnd(dates.booking_date || today);
      case 'checkout_month_end': return monthEnd(dates.checkout_date || dates.checkin_date || today);
      default: return dates[ev] || dates.checkin_date || dates.trip_start || today;
    }
  };
  let left = r2(total);
  return parts.map((p, i) => {
    const amount = i === parts.length - 1 ? left : r2(total * num(p.pct) / 100);
    left = r2(left - amount);
    const due = addDays(base(p.event), num(p.offset_days));
    return { amount, due_date: due < today ? today : due };
  }).filter((x) => x.amount > 0);
}

/** Customer instalments when no preference is set: 50% now, 50% 15 days before travel. */
export function defaultInstalments(total, startDate, today = new Date().toISOString().slice(0, 10)) {
  if (!startDate) return [{ amount: r2(total), due_date: today }];
  return scheduleFromPref(total, [
    { event: 'booking_date', offset_days: 0, pct: 50 },
    { event: 'trip_start', offset_days: -15, pct: 50 },
  ], { booking_date: today, trip_start: startDate }, today);
}
