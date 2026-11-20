import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SERVICES, SERVICE_ORDER, datesNeeded } from '@shared/catalog.js';
import { priceQuote, autoCost, defaultPricing } from '@shared/pricing.js';
import { api, money, addDaysIso, fmtDay, qs } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Field, Loading, PageHeader, Pills, Select, useToast } from '../../core/ui.jsx';
import { ChildrenAges, CreatableSelect, FieldInput, defaults } from '../../core/forms.jsx';

let seq = 0;
const newLine = (service, details = {}) => ({
  key: (seq += 1), service, details: { ...defaults(SERVICES[service].quoteFields), ...details },
  cost: '', buy_cost: '', selling_override: '', manual: false, note: '', warnings: [], meta: {},
});

const CUSTOM_ORDER = SERVICE_ORDER;
const VENDOR_ORDER = ['land_package', 'flight', 'visa', 'insurance', 'train', 'hotel', 'transport', 'activity', 'passport', 'other'];

export default function QuoteBuilder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { me, hasFeature, can } = useAuth();
  const [trip, setTrip] = useState(null);
  const [head, setHead] = useState(null);
  const [lines, setLines] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [itinerary, setItinerary] = useState({ days: [], inclusions: [], exclusions: [], notes: '', tnc: '' });
  const [remarks, setRemarks] = useState({ internal: '', customer: '' });
  const [taxes, setTaxes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    (async () => {
      const t = (await api(`/trips/${id}`)).data;
      const tx = (await api('/org/tax-types')).data;
      setTrip(t); setTaxes(tx);
      const def = tx.find((x) => x.is_default) || tx[0];
      const from = params.get('from');
      if (from) {
        const q = (await api(`/quotes/${from}`)).data;
        setHead({ quote_type: q.quote_type, start_date: q.start_date ? String(q.start_date).slice(0, 10) : '', nights: q.nights ?? '', adults: q.adults, children_ages: q.children_ages, infants: q.infants || 0, currency: q.currency });
        setLines(q.items.map((i) => ({ ...newLine(i.service, i.details), cost: i.cost, buy_cost: i.buy_cost ?? '', selling_override: i.selling_override ?? '', manual: true })));
        setPricing(q.pricing);
        if (q.itinerary) setItinerary(q.itinerary);
        setRemarks({ internal: q.remarks_internal || '', customer: q.remarks_customer || '' });
      } else {
        const vendor = t.services.includes('land_package');
        setHead({ quote_type: vendor ? 'vendor_package' : 'custom', start_date: t.start_date ? String(t.start_date).slice(0, 10) : '', nights: t.nights ?? '', adults: t.adults, children_ages: t.children_ages, infants: t.infants || 0, currency: t.currency || me.org.base_currency });
        setPricing(defaultPricing(def?.rate ?? me.org.default_tax_rate, def?.name || 'GST'));
        const wanted = t.services.flatMap((s) => (s === 'package' ? ['hotel', 'transport'] : [s])).filter((s) => SERVICES[s] && (!SERVICES[s].feature || hasFeature(SERVICES[s].feature)));
        setLines([...new Set(wanted)].map((s) => newLine(s, s === 'hotel' ? { nights: t.nights || 1, pax_per_room: Math.min(t.adults, 2), rooms: Math.max(Math.ceil(t.adults / 2), 1) }
          : ['activity', 'flight', 'train', 'visa'].includes(s) ? { adults: t.adults, children: (t.children_ages || []).length, ...(s === 'flight' ? { infants: t.infants || 0 } : {}) }
            : s === 'land_package' ? { nights: t.nights || 1, adults_twin: t.adults } : s === 'passport' || s === 'insurance' ? { adults: t.adults + (t.children_ages || []).length } : {})));
      }
    })().catch((e) => toast(e.message, 'bad'));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pax = head ? Number(head.adults || 0) + (head.children_ages || []).length : 1;
  const priced = useMemo(() => (pricing ? priceQuote(lines.map((l) => ({ service: l.service, cost: Number(l.cost) || 0, buy_cost: l.buy_cost === '' ? null : Number(l.buy_cost), selling_override: l.selling_override === '' ? null : Number(l.selling_override) })), pricing, pax) : null), [lines, pricing, pax]);
  if (!trip || !head || !pricing) return <Loading />;

  const need = datesNeeded(lines.map((l) => l.service));
  const order = head.quote_type === 'vendor_package' ? VENDOR_ORDER : CUSTOM_ORDER;
  const services = order.filter((s) => !SERVICES[s].feature || hasFeature(SERVICES[s].feature));
  const update = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l)));
  const cur = head.currency;
  const showCost = can('quotes.view_cost');

  const save = async () => {
    setBusy(true); setErrors({});
    try {
      const body = {
        ...head, children_ages: (head.children_ages || []).map(Number), nights: head.nights === '' ? null : head.nights, start_date: head.start_date || null, pricing,
        items: lines.map((l) => ({ service: l.service, details: l.details, cost: Number(l.cost) || 0, buy_cost: l.buy_cost === '' ? null : l.buy_cost, selling_override: l.selling_override === '' ? null : l.selling_override })),
        itinerary: cleanItinerary(itinerary), remarks_internal: remarks.internal, remarks_customer: remarks.customer,
      };
      await api(`/quotes/trip/${trip.id}`, { method: 'POST', body });
      toast('Quote saved');
      nav(`/app/trips/${trip.id}?tab=quotes`);
    } catch (e) { setErrors({ _form: e.message, ...e.fields }); toast(e.message, 'bad'); window.scrollTo(0, 0); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader crumbs={<><Link to="/app/trips">Trips</Link> › <Link to={`/app/trips/${trip.id}`}>#{trip.trip_no}</Link> › Build quote</>}
        title={`Build Quote · ${trip.guest_name}`} subtitle={trip.destinations.map((d) => d.name).join(', ')}
        actions={<><Link className="btn secondary" to={`/app/trips/${trip.id}?tab=quotes`}>Cancel</Link><button className="btn" disabled={busy || !lines.length} onClick={save}>{busy ? 'Saving…' : 'Save quote'}</button></>} />
      {errors._form && <div className="alert bad">{errors._form}</div>}
      <div className="layout-side">
        <div>
          <div className="card">
            <div className="row-between mb">
              <h2>Trip basics</h2>
              {hasFeature('land_package') && <Pills value={head.quote_type} onChange={(k) => setHead({ ...head, quote_type: k })} options={[{ key: 'custom', label: 'Customised package' }, { key: 'vendor_package', label: 'Vendor land package + own flights' }]} />}
            </div>
            <div className="grid grid-6">
              <Field label={need === 'stay' ? 'Start date *' : need === 'date' ? 'Travel date *' : 'Travel date'} className="span-2" error={errors.start_date}>
                <input type="date" value={head.start_date} onChange={(e) => setHead({ ...head, start_date: e.target.value })} /></Field>
              {need === 'stay' && <Field label="Nights *" error={errors.nights}><input type="number" min={0} value={head.nights} onChange={(e) => setHead({ ...head, nights: e.target.value })} /></Field>}
              <Field label="Adults *"><input type="number" min={1} value={head.adults} onChange={(e) => setHead({ ...head, adults: e.target.value })} /></Field>
              <Field label="Infants"><input type="number" min={0} value={head.infants} onChange={(e) => setHead({ ...head, infants: e.target.value })} /></Field>
              <Field label="Currency"><CreatableSelect list="currencies" value={head.currency} onChange={(v) => setHead({ ...head, currency: v || me.org.base_currency })} /></Field>
              <div className="span-all"><ChildrenAges ages={head.children_ages || []} onChange={(a) => setHead({ ...head, children_ages: a })} /></div>
            </div>
            {head.quote_type === 'vendor_package' && <div className="alert mt">Add the land package you buy from your DMC / vendor (in their currency with an exchange rate), then add your own flights, visa and insurance. Your markup applies on top.</div>}
          </div>

          {services.map((s) => {
            const ls = lines.filter((l) => l.service === s);
            const def = SERVICES[s];
            if (!ls.length) return null;
            return (
              <div key={s} className="svc-block mt">
                <div className="svc-head">
                  <strong>{def.icon} {def.plural}</strong>
                  <span className="row"><span className="muted small">{money(ls.reduce((x, l) => x + (Number(l.cost) || 0), 0), cur)}</span>
                    <button className="btn secondary small" onClick={() => setLines([...lines, newLine(s, ls.length ? { day: Number(ls[ls.length - 1].details.day || 1) + (s === 'hotel' ? Number(ls[ls.length - 1].details.nights || 1) : 1) } : {})])}>+ Add {def.label}</button></span>
                </div>
                {ls.map((l) => (
                  <Line key={l.key} line={l} head={head} cur={cur} showCost={showCost} errors={errors} index={lines.indexOf(l)}
                    onChange={(patch) => update(l.key, patch)} onRemove={() => setLines(lines.filter((x) => x.key !== l.key))}
                    onCopy={() => setLines([...lines, { ...l, key: (seq += 1), details: { ...l.details } }])} />
                ))}
              </div>
            );
          })}
          <div className="card mt">
            <div className="row wrap"><span className="muted">Add a service:</span>
              {services.map((s) => <button key={s} className="btn secondary small" onClick={() => setLines([...lines, newLine(s, ['activity', 'flight', 'train', 'visa'].includes(s) ? { adults: head.adults, children: (head.children_ages || []).length } : s === 'hotel' ? { nights: Math.max(Number(head.nights) || 1, 1) } : s === 'land_package' ? { nights: Number(head.nights) || 1, adults_twin: head.adults } : {})])}>{SERVICES[s].icon} {SERVICES[s].label}</button>)}
            </div>
          </div>

          <div className="card mt">
            <div className="card-head"><h2>Itinerary, inclusions & terms</h2></div>
            <ItineraryEditor value={itinerary} onChange={setItinerary} nights={Number(head.nights) || 0} startDate={head.start_date}
              onGenerate={async () => {
                const r = await api('/quotes/itinerary-draft', { method: 'POST', body: { nights: Number(head.nights) || 0, items: lines.map((l) => ({ service: l.service, details: l.details })) } });
                setItinerary((it) => ({ ...it, days: r.data }));
              }}
              onDefaults={async () => {
                const r = await api(`/quotes/defaults${qs({ services: [...new Set(lines.map((l) => l.service))].join(',') })}`);
                setItinerary((it) => ({ ...it, inclusions: r.data.inclusions, exclusions: r.data.exclusions, tnc: it.tnc || r.data.tnc }));
              }} />
            <div className="grid grid-2 mt">
              <Field label="Internal remarks (not shared)"><textarea value={remarks.internal} onChange={(e) => setRemarks({ ...remarks, internal: e.target.value })} /></Field>
              <Field label="Note for the customer"><textarea value={remarks.customer} onChange={(e) => setRemarks({ ...remarks, customer: e.target.value })} /></Field>
            </div>
          </div>
        </div>

        <div className="sticky">
          <PricingCard pricing={pricing} setPricing={setPricing} priced={priced} taxes={taxes} cur={cur} pax={pax} showCost={showCost} services={[...new Set(lines.map((l) => l.service))]} />
          <button className="btn mt" style={{ width: '100%' }} disabled={busy || !lines.length} onClick={save}>{busy ? 'Saving…' : 'Save quote'}</button>
        </div>
      </div>
    </>
  );
}

/* ---------------------------- One service line ---------------------------- */
function Line({ line, head, cur, showCost, errors, index, onChange, onRemove, onCopy }) {
  const def = SERVICES[line.service];
  const timer = useRef(null);
  const date = head.start_date && line.details.day ? addDaysIso(head.start_date, Math.max(Number(line.details.day) - 1, 0)) : head.start_date;
  const setDetail = (k, v) => onChange((l) => ({ details: { ...l.details, [k]: v } }));

  // automatic price: lookups from season rates / masters, or computed from fares
  useEffect(() => {
    if (line.manual) return undefined;
    const local = autoCost(line.service, line.details);
    if (!def.priceLookup) {
      if (local !== null) onChange({ cost: local, buy_cost: '', note: 'Calculated from the fares you entered' });
      return undefined;
    }
    const ready = def.quoteFields.filter((f) => f.required && f.type === 'ref').every((f) => line.details[f.key]);
    if (!ready && line.service !== 'land_package') return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = (await api('/quotes/price', { method: 'POST', body: { service: line.service, details: line.details, start_date: head.start_date || null } })).data;
        onChange((l) => ({
          details: r.fill ? { ...l.details, ...Object.fromEntries(Object.entries(r.fill).filter(([k, v]) => v !== null && v !== undefined && (l.details[k] === '' || l.details[k] === null || l.details[k] === 0 || k.startsWith('rate_') || k === 'currency'))) } : l.details,
          cost: r.cost ?? l.cost, buy_cost: r.buy_cost ?? '', selling_override: r.selling_override ?? '', note: r.note || '', warnings: r.warnings || [], breakdown: r.breakdown || null,
        }));
      } catch { /* price lookup is a helper only */ }
    }, 400);
    return () => clearTimeout(timer.current);
  }, [JSON.stringify(line.details), head.start_date, line.manual]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = (f) => {
    if (f.suggestFrom === 'room_types') return (line.meta.room_types || []).map((r) => r.name || r);
    if (f.key === 'meal_plan') return line.meta.meal_plans || [];
    if (f.key === 'cab_type') return line.meta.cab_types || [];
    if (f.suggestFrom === 'slots') return String(line.meta.slots || '').split(',').filter(Boolean);
    return [];
  };
  const picked = (f) => (rec) => {
    if (!rec) return;
    const d = rec.data || {};
    if (f.ref === 'hotel') onChange((l) => ({ meta: { ...l.meta, room_types: d.room_types || [], meal_plans: d.meal_plans || [] }, details: { ...l.details, room_type: l.details.room_type || d.room_types?.[0]?.name || '', meal_plan: (d.meal_plans || []).includes(l.details.meal_plan) ? l.details.meal_plan : d.meal_plans?.[0] || l.details.meal_plan } }));
    if (f.ref === 'transport_service') onChange((l) => ({ meta: { ...l.meta, cab_types: d.cab_types || [] }, details: { ...l.details, cab_type: l.details.cab_type || d.cab_types?.[0] || '', start_time: l.details.start_time || d.start_time || '' } }));
    if (f.ref === 'activity_service') onChange((l) => ({ meta: { ...l.meta, slots: d.slots || '' } }));
    if (f.ref === 'land_package') onChange({ manual: false });
  };
  // load suggestion data when a line comes from an existing quote
  useEffect(() => {
    const ref = def.quoteFields.find((f) => ['hotel', 'transport_service', 'activity_service'].includes(f.ref));
    if (ref && line.details[ref.key]) api(`/lookup/${ref.ref}/${line.details[ref.key]}`).then((r) => picked(ref)(r.data)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const err = (k) => errors[`items.${index}.${k}`];
  return (
    <div className="svc-line">
      {def.quoteFields.map((f) => (
        <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.key === 'day' && date ? fmtDay(date) : f.hint} error={err(f.key)} className={`w${f.width || 2}`}>
          <FieldInput field={f} value={line.details[f.key]} onChange={(v) => setDetail(f.key, v)} suggestions={suggestions(f)} onPicked={picked(f)} />
        </Field>
      ))}
      <div className="w12 row wrap" style={{ alignItems: 'flex-end', borderTop: '1px solid var(--line2)', paddingTop: 8 }}>
        <Field label={`Price (${cur})`} hint={line.manual ? 'Entered manually' : line.note}>
          <input type="number" value={line.cost} style={{ width: 130 }} onChange={(e) => onChange({ cost: e.target.value, manual: true })} />
        </Field>
        {showCost && <Field label="Buying price" hint="What you pay the supplier"><input type="number" value={line.buy_cost} placeholder={String(line.cost || '')} style={{ width: 130 }} onChange={(e) => onChange({ buy_cost: e.target.value, manual: true })} /></Field>}
        <Field label="Fixed selling" hint="Optional, skips markup"><input type="number" value={line.selling_override} style={{ width: 130 }} onChange={(e) => onChange({ selling_override: e.target.value })} /></Field>
        {line.manual && <button className="btn ghost small" onClick={() => onChange({ manual: false })}>↻ Re-price</button>}
        <span className="spacer" />
        {line.warnings?.length > 0 && <span className="badge warn" title={line.warnings.join('\n')}>⚠ {line.warnings[0]}{line.warnings.length > 1 ? ` +${line.warnings.length - 1}` : ''}</span>}
        {line.breakdown?.length > 1 && <span className="muted small" title={line.breakdown.map((b) => `${b.date} ${b.day}: ${b.sales?.total ?? 'no price'}`).join('\n')}>{line.breakdown.length} nights priced ⓘ</span>}
        <button className="icon-btn" title="Duplicate" onClick={onCopy}>⧉</button>
        <button className="icon-btn" title="Remove" onClick={onRemove}>🗑</button>
      </div>
    </div>
  );
}

/* ------------------------------ Pricing card ------------------------------ */
function PricingCard({ pricing, setPricing, priced, taxes, cur, pax, showCost, services }) {
  const set = (k, v) => setPricing({ ...pricing, [k]: v });
  return (
    <div className="card">
      <h2>Pricing</h2>
      <div className="stack mt">
        <Select label="Markup" value={pricing.strategy} onChange={(e) => set('strategy', e.target.value)} options={[{ value: 'overall', label: 'One markup on the total' }, { value: 'per_component', label: 'Markup per service' }]} />
        {pricing.strategy === 'overall' ? (
          <div className="row">
            <select value={pricing.markup_type} onChange={(e) => set('markup_type', e.target.value)} style={{ width: 90 }}><option value="percent">%</option><option value="amount">{cur}</option></select>
            <input type="number" value={pricing.markup_value} onChange={(e) => set('markup_value', e.target.value)} />
          </div>
        ) : services.map((s) => (
          <div key={s} className="row"><span style={{ width: 120 }} className="small">{SERVICES[s].label} %</span>
            <input type="number" value={pricing.per_component?.[s] ?? ''} onChange={(e) => set('per_component', { ...pricing.per_component, [s]: e.target.value })} /></div>
        ))}
        <div className="row">
          <select value={`${pricing.tax_name}|${pricing.tax_rate}`} onChange={(e) => { const [n, r] = e.target.value.split('|'); setPricing({ ...pricing, tax_name: n, tax_rate: Number(r) }); }}>
            {taxes.map((t) => <option key={t.id} value={`${t.name}|${t.rate}`}>{t.name} {t.rate}%</option>)}
            <option value="No tax|0">No tax</option>
          </select>
          <select value={pricing.tax_basis} onChange={(e) => set('tax_basis', e.target.value)} title="Tax on"><option value="cost_markup">on full price</option><option value="markup">on margin only</option></select>
        </div>
        <Select label="Round total up to" value={pricing.rounding} onChange={(e) => set('rounding', Number(e.target.value))} options={[1, 10, 50, 100, 500, 1000].map((n) => ({ value: n, label: n === 1 ? 'No rounding' : `Nearest ${n}` }))} />
      </div>
      <div className="price-box mt">
        <div className="price-row"><span>Given price</span><span>{money(priced.total_cost, cur)}</span></div>
        {showCost && <div className="price-row muted"><span>Buying price</span><span>{money(priced.total_buy, cur)}</span></div>}
        <div className="price-row"><span>Markup</span><span>{money(priced.total_markup, cur)}</span></div>
        <div className="price-row"><span>{pricing.tax_name} {pricing.tax_rate}%</span><span>{money(priced.total_tax, cur)}</span></div>
        <div className="price-row total"><span>Total</span><span>{money(priced.total_selling, cur)}</span></div>
        <div className="price-row muted small"><span>Per person ({pax})</span><span>{money(priced.per_person, cur)}</span></div>
        {showCost && <div className="price-row small" style={{ color: priced.profit < 0 ? 'var(--bad)' : 'var(--good)' }}><span>Profit</span><span>{money(priced.profit, cur)} ({priced.profit_pct}%)</span></div>}
      </div>
    </div>
  );
}

/* ----------------------------- Itinerary editor ---------------------------- */
export function cleanItinerary(it) {
  const lines = (a) => (a || []).map((x) => String(x).trim()).filter(Boolean);
  return { days: (it.days || []).map((d) => ({ title: d.title || '', description: d.description || '' })), inclusions: lines(it.inclusions), exclusions: lines(it.exclusions), notes: it.notes || '', tnc: it.tnc || '' };
}

export function ItineraryEditor({ value, onChange, nights, startDate, onGenerate, onDefaults }) {
  const days = value.days || [];
  const setDay = (i, patch) => onChange({ ...value, days: days.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  const fit = () => {
    const n = (Number(nights) || 0) + 1;
    onChange({ ...value, days: Array.from({ length: n }, (_, i) => days[i] || { title: i === 0 ? 'Arrival' : i === n - 1 ? 'Departure' : `Day ${i + 1}`, description: '' }) });
  };
  return (
    <div className="stack">
      <div className="row wrap">
        {onGenerate && <button className="btn secondary small" onClick={onGenerate}>✨ Generate day-wise plan from services</button>}
        {nights !== undefined && <button className="btn secondary small" onClick={fit}>Match days to nights</button>}
        <button className="btn secondary small" onClick={() => onChange({ ...value, days: [...days, { title: `Day ${days.length + 1}`, description: '' }] })}>+ Add day</button>
        {onDefaults && <button className="btn secondary small" onClick={onDefaults}>Load inclusions, exclusions & T&C for these services</button>}
      </div>
      {days.map((d, i) => (
        <div key={i} className="grid" style={{ gridTemplateColumns: '90px 1fr 32px', alignItems: 'start' }}>
          <div className="small"><strong>Day {i + 1}</strong>{startDate && <div className="muted">{fmtDay(addDaysIso(startDate, i))}</div>}</div>
          <div className="stack">
            <input value={d.title} onChange={(e) => setDay(i, { title: e.target.value })} placeholder="Title" />
            <textarea rows={3} value={d.description} onChange={(e) => setDay(i, { description: e.target.value })} placeholder="What happens on this day" />
          </div>
          <button className="icon-btn" onClick={() => onChange({ ...value, days: days.filter((_, k) => k !== i) })}>✕</button>
        </div>
      ))}
      <div className="grid grid-2">
        <Field label="Inclusions (one per line)"><textarea rows={6} value={(value.inclusions || []).join('\n')} onChange={(e) => onChange({ ...value, inclusions: e.target.value.split('\n') })} /></Field>
        <Field label="Exclusions (one per line)"><textarea rows={6} value={(value.exclusions || []).join('\n')} onChange={(e) => onChange({ ...value, exclusions: e.target.value.split('\n') })} /></Field>
        <Field label="Other notes"><textarea value={value.notes || ''} onChange={(e) => onChange({ ...value, notes: e.target.value })} /></Field>
        <Field label="Terms & conditions"><textarea value={value.tnc || ''} onChange={(e) => onChange({ ...value, tnc: e.target.value })} /></Field>
      </div>
    </div>
  );
}
