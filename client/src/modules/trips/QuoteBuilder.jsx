import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SERVICES } from '@shared/catalog.js';
import { priceQuote, defaultPricing } from '@shared/pricing.js';
import { computeItem, durationLabel } from '@shared/quoteItems.js';
import { api, money, qs, todayIso, fmtDate, paxText } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Field, Loading, PageHeader, Pills, useToast } from '../../core/ui.jsx';
import { ChildrenAges, CreatableSelect, defaults } from '../../core/forms.jsx';
import { nextKey, num } from './quote/common.jsx';
import HotelsSection from './quote/HotelsSection.jsx';
import TransportSection from './quote/TransportSection.jsx';
import LandPackageSection from './quote/LandPackageSection.jsx';
import { FlightsSection, VisaSection, ClassicSection, OtherServicesSection, emptyFlight, emptyVisa } from './quote/OtherSections.jsx';
import { PricingCard, ItineraryEditor, cleanItinerary } from './quote/Pricing.jsx';
import { emptyHotel } from './quote/HotelsSection.jsx';
import { emptyTransport, emptyActivity } from './quote/TransportSection.jsx';

export { ItineraryEditor, cleanItinerary };

const STRUCTURED = ['hotel', 'transport', 'activity', 'flight', 'visa', 'land_package', 'other'];
const CLASSIC = ['train', 'passport', 'insurance'];
/** Section order on the form (vendor quotes start with the land package). */
const ORDER = ['hotel', 'transport', 'land_package', 'flight', 'visa', 'train', 'passport', 'insurance'];
const VENDOR_ORDER = ['land_package', 'flight', 'visa', 'hotel', 'transport', 'train', 'passport', 'insurance'];

const line = (service, details, meta = {}) => ({ key: nextKey(), service, details, meta, cost: '', buy_cost: '', selling_override: '', manual: false });

/** Older quotes stored hotel/transport as "day + nights" numbers: turn them into night / day lists. */
function upgrade(service, d) {
  const span = (from, count) => Array.from({ length: Math.max(num(count), 1) }, (_, i) => num(from || 1) + i);
  if (service === 'hotel' && !Array.isArray(d.nights)) return { ...emptyHotel(span(d.day, d.nights)), ...d, nights: span(d.day, d.nights), prices: [] };
  if (service === 'transport' && !Array.isArray(d.days)) return { ...emptyTransport([num(d.day) || 1]), transport_service_id: d.transport_service_id, start_time: d.start_time || '', cabs: [{ cab_type: d.cab_type || '', qty: num(d.qty) || 1, prices: [] }] };
  if (service === 'activity' && !Array.isArray(d.days)) return { ...emptyActivity([num(d.day) || 1], num(d.adults), num(d.children)), activity_service_id: d.activity_service_id, slot: d.slot || '' };
  return d;
}

export default function QuoteBuilder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { me, hasFeature, can } = useAuth();
  const [trip, setTrip] = useState(null);
  const [head, setHead] = useState(null);
  const [editHead, setEditHead] = useState(false);
  const [lines, setLines] = useState([]);
  const [shown, setShown] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [itinerary, setItinerary] = useState({ days: [], inclusions: [], exclusions: [], notes: '', tnc: '' });
  const [remarks, setRemarks] = useState({ internal: '', customer: '' });
  const [taxes, setTaxes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const enabled = (s) => SERVICES[s] && (!SERVICES[s].feature || hasFeature(SERVICES[s].feature));

  useEffect(() => {
    (async () => {
      const t = (await api(`/trips/${id}`)).data;
      const tx = (await api('/org/tax-types')).data;
      setTrip(t); setTaxes(tx);
      const def = tx.find((x) => x.is_default) || tx[0];
      const from = params.get('edit') || params.get('from');
      if (from) {
        const q = (await api(`/quotes/${from}`)).data;
        setHead({ quote_type: q.quote_type, start_date: q.start_date ? String(q.start_date).slice(0, 10) : '', nights: q.nights ?? '', adults: q.adults, children_ages: q.children_ages, infants: q.infants || 0, currency: q.currency });
        const ls = q.items.map((i) => ({ ...line(i.service, upgrade(i.service, i.details)), cost: i.cost, buy_cost: i.buy_cost ?? '', selling_override: i.selling_override ?? '', manual: CLASSIC.includes(i.service) }));
        setLines(ls);
        setShown([...new Set(ls.map((l) => (l.service === 'activity' ? 'transport' : l.service)).filter((s) => s !== 'other'))]);
        setPricing(q.pricing);
        if (q.itinerary) setItinerary(q.itinerary);
        setRemarks({ internal: q.remarks_internal || '', customer: q.remarks_customer || '' });
      } else {
        const vendor = t.services.includes('land_package');
        const h = { quote_type: vendor ? 'vendor_package' : 'custom', start_date: t.start_date ? String(t.start_date).slice(0, 10) : '', nights: t.nights ?? '', adults: t.adults, children_ages: t.children_ages || [], infants: t.infants || 0, currency: t.currency || me.org.base_currency };
        setHead(h);
        setPricing(defaultPricing(def?.rate ?? me.org.default_tax_rate, def?.name || 'GST'));
        const wanted = [...new Set(t.services.flatMap((s) => (s === 'package' ? ['hotel', 'transport'] : s === 'activity' ? ['transport'] : [s])))].filter((s) => ORDER.includes(s) && (enabled(s) || (s === 'transport' && enabled('activity'))));
        setShown(wanted);
        setLines(wanted.flatMap((s) => starter(s, h)));
      }
    })().catch((e) => toast(e.message, 'bad'));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const starter = (s, h) => {
    if (s === 'hotel') return [line('hotel', emptyHotel(num(h.nights) ? [1] : []))];
    if (s === 'transport') return enabled('transport') ? [line('transport', emptyTransport([1]))] : [line('activity', emptyActivity([1], num(h.adults), (h.children_ages || []).length))];
    if (s === 'flight') return [line('flight', emptyFlight(h))];
    if (s === 'visa') return [line('visa', emptyVisa(h))];
    if (s === 'land_package') return [];
    if (CLASSIC.includes(s)) return [line(s, classicDefaults(s, h))];
    return [];
  };
  const classicDefaults = (s, h = head) => {
    const people = num(h.adults) + (h.children_ages || []).length;
    return { ...defaults(SERVICES[s].quoteFields), ...(s === 'train' ? { adults: num(h.adults), children: (h.children_ages || []).length } : { adults: people }) };
  };

  // price of every line (structured lines are calculated from their rows, like on the server)
  const priced = useMemo(() => {
    if (!pricing || !head) return null;
    const items = lines.map((l) => {
      const c = STRUCTURED.includes(l.service) ? computeItem(l.service, l.details) : null;
      return c ? { service: l.service, cost: c.cost, buy_cost: c.buy_cost, selling_override: c.selling_override ?? null }
        : { service: l.service, cost: num(l.cost), buy_cost: l.buy_cost === '' ? null : num(l.buy_cost), selling_override: l.selling_override === '' ? null : num(l.selling_override) };
    });
    return priceQuote(items, pricing, num(head.adults) + (head.children_ages || []).length);
  }, [lines, pricing, head]);

  if (!trip || !head || !pricing) return <Loading />;

  const cur = head.currency;
  const showCost = can('quotes.view_cost');
  const nights = Math.max(num(head.nights), 0);
  const of = (...s) => lines.filter((l) => s.includes(l.service));
  const extras = of('other');
  const add = (service) => (details, meta) => setLines((ls) => [...ls, line(service, details, meta)]);
  const addAny = (service, details, meta) => setLines((ls) => [...ls, line(service, details, meta)]);
  const change = (key, patch) => setLines((ls) => ls.map((l) => {
    if (l.key !== key) return l;
    const p = typeof patch === 'function' ? patch(l) : patch;
    const next = { ...l, ...p };
    if (p.details && !p.meta && l.meta?.error) next.meta = { ...l.meta, error: undefined };
    return next;
  }));
  const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key));
  const addExtra = (details) => setLines((ls) => [...ls, line('other', details)]);
  const toggle = (s) => {
    if (shown.includes(s)) {
      const gone = s === 'transport' ? ['transport', 'activity'] : [s];
      const cat = s === 'transport' ? 'transport' : s;
      if (lines.some((l) => gone.includes(l.service) || (l.service === 'other' && l.details.category === cat)) && !window.confirm(`Remove ${SERVICES[s].plural} from this quote?`)) return;
      setShown(shown.filter((x) => x !== s));
      setLines((ls) => ls.filter((l) => !gone.includes(l.service) && !(l.service === 'other' && l.details.category === cat)));
    } else { setShown([...shown, s]); setLines((ls) => [...ls, ...starter(s, head)]); }
  };
  const order = (head.quote_type === 'vendor_package' ? VENDOR_ORDER : ORDER).filter((s) => enabled(s) || (s === 'transport' && enabled('activity')));

  // vendor itinerary / inclusions → our quotation
  const useVendorItinerary = (d, opt = { itinerary: true, inclusions: true }) => {
    const base = num(d.day) || 1; const p = d.package || {};
    setItinerary((it) => {
      const len = Math.max(nights + 1, base + Math.max(0, ...(p.itinerary || []).map((x) => num(x.day))) - 1);
      const days = Array.from({ length: len }, (_, i) => it.days[i] || { title: '', description: '' });
      if (opt.itinerary !== false) for (const x of p.itinerary || []) { const k = base + num(x.day) - 2; if (k >= 0 && k < days.length) days[k] = { title: x.title || days[k].title, description: x.description || '' }; }
      return { ...it, days, ...(opt.inclusions !== false ? { inclusions: (p.inclusions || []).filter(Boolean), exclusions: (p.exclusions || []).filter(Boolean) } : {}), tnc: it.tnc || p.terms || '' };
    });
    if (!head.nights && d.nights) setHead((h) => ({ ...h, nights: d.nights }));
    toast('Vendor itinerary added – edit it in "Itinerary, inclusions & terms"');
  };

  const save = async () => {
    setBusy(true); setError('');
    const sent = lines.filter((l) => l.service !== 'other' || l.details.description || num(l.details.price));
    setLines((ls) => ls.map((l) => (l.meta?.error ? { ...l, meta: { ...l.meta, error: undefined } } : l)));
    try {
      const body = {
        ...head, children_ages: (head.children_ages || []).map(Number), nights: head.nights === '' ? null : head.nights, start_date: head.start_date || null, pricing,
        items: sent.map((l) => ({ service: l.service, details: l.details, cost: num(l.cost), buy_cost: l.buy_cost === '' ? null : l.buy_cost, selling_override: l.selling_override === '' ? null : l.selling_override })),
        itinerary: cleanItinerary(itinerary), remarks_internal: remarks.internal, remarks_customer: remarks.customer,
      };
      const editId = params.get('edit');
      const r = editId ? await api(`/quotes/${editId}`, { method: 'PUT', body }) : await api(`/quotes/trip/${trip.id}`, { method: 'POST', body });
      toast(r.message || 'Quote saved');
      nav(`/app/trips/${trip.id}?tab=quotes`);
    } catch (e) {
      const byKey = {};
      Object.entries(e.fields || {}).forEach(([k, m]) => { const i = k.match(/^items\.(\d+)/); if (i && sent[Number(i[1])]) byKey[sent[Number(i[1])].key] = m; });
      if (Object.keys(byKey).length) {
        setLines((ls) => ls.map((l) => (byKey[l.key] ? { ...l, meta: { ...l.meta, error: byKey[l.key] } } : l)));
        setError(`Please fix ${Object.keys(byKey).length} highlighted line(s) – the message is shown in red under each one.`);
        setTimeout(() => document.querySelector('.q-row.has-error, .field-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      } else { setError(e.message); window.scrollTo(0, 0); }
      toast(e.message, 'bad');
    } finally { setBusy(false); }
  };

  const props = { head, cur, showCost, onChange: change, onRemove: remove, onAddExtra: addExtra, extras };
  const sections = {
    hotel: <HotelsSection key="hotel" {...props} lines={of('hotel')} onAdd={add('hotel')} />,
    transport: <TransportSection key="transport" {...props} lines={of('transport', 'activity')} onAdd={addAny} hasTransport={enabled('transport')} hasActivity={enabled('activity')} />,
    land_package: <LandPackageSection key="land" {...props} trip={trip} lines={of('land_package')} onAdd={add('land_package')} onUseItinerary={useVendorItinerary} />,
    flight: <FlightsSection key="flight" {...props} lines={of('flight')} onAdd={add('flight')} />,
    visa: <VisaSection key="visa" {...props} lines={of('visa')} onAdd={add('visa')} />,
    ...Object.fromEntries(CLASSIC.map((s) => [s, <ClassicSection key={s} service={s} {...props} lines={of(s)} onAdd={add(s)} defaultsFor={classicDefaults} />])),
  };

  return (
    <>
      <PageHeader crumbs={<><Link to="/app/trips">Trips</Link> › <Link to={`/app/trips/${trip.id}`}>#{trip.trip_no}</Link> › {params.get('edit') ? 'Edit quote' : 'Create quote'}</>}
        title={`${params.get('edit') ? 'Edit Quote' : params.get('from') ? 'New Quote Version' : 'Create Quote'} · ${trip.guest_name}`} subtitle={trip.destinations.map((d) => d.name).join(', ')}
        actions={<><Link className="btn secondary" to={`/app/trips/${trip.id}?tab=quotes`}>Cancel</Link><button className="btn" disabled={busy || !lines.length} onClick={save}>{busy ? 'Saving…' : 'Save quote'}</button></>} />
      {error && <div className="alert bad">{error}</div>}
      <div className="layout-side">
        <div>
          {/* Basic details */}
          <div className="card q-basic">
            <div className="row-between">
              <h2>Basic Details</h2>
              <span className="row">
                {hasFeature('land_package') && <Pills value={head.quote_type} onChange={(k) => { setHead({ ...head, quote_type: k }); if (k === 'vendor_package' && !shown.includes('land_package')) setShown([...shown, 'land_package']); }}
                  options={[{ key: 'custom', label: 'Our own package' }, { key: 'vendor_package', label: 'Vendor land package + our services' }]} />}
                <button className="btn ghost small" onClick={() => setEditHead(!editHead)}>{editHead ? 'Done' : '✎ Edit Basic Details'}</button>
              </span>
            </div>
            {!editHead ? (
              <div className="q-facts">
                <div><span>Destination</span><b>{trip.destinations.map((d) => d.name).join(', ') || '—'}</b></div>
                <div><span>Start date</span><b>{head.start_date ? fmtDate(head.start_date) : 'Not set'}</b></div>
                <div><span>Duration</span><b>{head.nights === '' ? '—' : `${durationLabel(nights)} (${nights}N/${nights + 1}D)`}</b></div>
                <div><span>Travellers</span><b>{paxText(num(head.adults), head.children_ages, num(head.infants))}</b></div>
                <div><span>Currency</span><b>{cur}</b></div>
              </div>
            ) : (
              <div className="grid grid-6 mt">
                <Field label="Start date" className="span-2" hint="Past dates are not allowed"><input type="date" min={todayIso()} value={head.start_date} onChange={(e) => setHead({ ...head, start_date: e.target.value })} /></Field>
                <Field label="Nights" hint={head.nights !== '' ? durationLabel(nights) : ''}><input type="number" min={0} max={120} value={head.nights} onChange={(e) => setHead({ ...head, nights: e.target.value })} /></Field>
                <Field label="Adults"><input type="number" min={1} value={head.adults} onChange={(e) => setHead({ ...head, adults: e.target.value })} /></Field>
                <Field label="Infants"><input type="number" min={0} value={head.infants} onChange={(e) => setHead({ ...head, infants: e.target.value })} /></Field>
                <Field label="Currency"><CreatableSelect list="currencies" value={head.currency} onChange={(v) => setHead({ ...head, currency: v || me.org.base_currency })} /></Field>
                <div className="span-all"><ChildrenAges ages={head.children_ages || []} onChange={(a) => setHead({ ...head, children_ages: a })} /></div>
              </div>
            )}
            {head.start_date && head.start_date < todayIso() && <div className="alert warn small mt">The start date is in the past – choose today or a later date.</div>}
          </div>

          {/* Service bookings in this quote */}
          <div className="card mt q-services">
            <div className="row wrap"><b className="small">Services in this quote:</b>
              {order.map((s) => (
                <button key={s} className={`chip ${shown.includes(s) ? 'on' : ''}`} onClick={() => toggle(s)}>
                  {shown.includes(s) ? '✓' : '+'} {SERVICES[s].icon} {s === 'transport' ? 'Transport & Activities' : SERVICES[s].plural}
                </button>
              ))}
            </div>
            {head.quote_type === 'vendor_package' && <div className="muted small mt">Upload the vendor's PDF or paste their email in Land Package; add your own flights, visa and extras. The customer gets the quotation in your format.</div>}
          </div>

          {order.filter((s) => shown.includes(s)).map((s) => sections[s])}

          <OtherServicesSection {...props} />

          <div className="card mt">
            <div className="card-head"><h2>Itinerary, inclusions & terms</h2></div>
            <ItineraryEditor value={itinerary} onChange={setItinerary} nights={nights} startDate={head.start_date}
              onGenerate={async () => {
                const r = await api('/quotes/itinerary-draft', { method: 'POST', body: { nights, start_date: head.start_date || null, items: lines.map((l) => ({ service: l.service, details: l.details })) } });
                setItinerary((it) => ({ ...it, days: r.data }));
              }}
              onDefaults={async () => {
                const r = await api(`/quotes/defaults${qs({ services: [...new Set(lines.map((l) => l.service))].join(',') })}`);
                setItinerary((it) => ({ ...it, inclusions: r.data.inclusions, exclusions: r.data.exclusions, tnc: it.tnc || r.data.tnc }));
              }} />
            <div className="grid grid-2 mt">
              <Field label="Internal comments (not shared)"><textarea value={remarks.internal} onChange={(e) => setRemarks({ ...remarks, internal: e.target.value })} /></Field>
              <Field label="Remarks for the customer"><textarea value={remarks.customer} onChange={(e) => setRemarks({ ...remarks, customer: e.target.value })} /></Field>
            </div>
          </div>
        </div>

        <div className="sticky">
          <div className="card q-mini">
            <b className="small">Cost summary</b>
            {order.filter((s) => shown.includes(s)).concat(['other']).map((s) => {
              const svcs = s === 'transport' ? ['transport', 'activity'] : [s];
              const v = svcs.reduce((sum, k) => sum + (priced.by_service[k]?.cost || 0), 0);
              return v ? <div key={s} className="price-row small"><span>{s === 'other' ? 'Extras & other services' : s === 'transport' ? 'Transport & activities' : SERVICES[s].plural}</span><span>{money(v, cur)}</span></div> : null;
            })}
          </div>
          <PricingCard pricing={pricing} setPricing={setPricing} priced={priced} taxes={taxes} cur={cur} pax={num(head.adults) + (head.children_ages || []).length} showCost={showCost} services={[...new Set(lines.map((l) => l.service))]} />
          <button className="btn mt" style={{ width: '100%' }} disabled={busy || !lines.length} onClick={save}>{busy ? 'Saving…' : 'Save quote'}</button>
        </div>
      </div>
    </>
  );
}
