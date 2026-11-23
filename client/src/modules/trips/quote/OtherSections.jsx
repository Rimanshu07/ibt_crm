import { useEffect, useRef, useState } from 'react';
import { SERVICES } from '@shared/catalog.js';
import { autoCost } from '@shared/pricing.js';
import { flightCost, visaCost, r2 } from '@shared/quoteItems.js';
import { searchLinks, parseFlightText } from '@shared/flightSearch.js';
import { api, money } from '../../../core/api.js';
import { RefPicker, FieldInput, useOptions } from '../../../core/forms.jsx';
import { Field, Modal, Pills } from '../../../core/ui.jsx';
import { Section, ExtrasEditor, LineError, num } from './common.jsx';

/* --------------------------------- flights --------------------------------- */
const leg = (dir = 'Onward', from = '', to = '') => ({ dir, from_city: from, to_city: to, airline: '', flight_no: '', depart_date: '', depart_time: '', arrive_date: '', arrive_time: '', terminal: '' });
export const emptyFlight = (head) => ({
  trip_way: 'Return', travel_class: 'Economy', baggage: '', notes: '', day: 1,
  adults: num(head.adults), children: (head.children_ages || []).filter((a) => a >= 2).length, infants: num(head.infants),
  cost: { adult: '', child: '', infant: '' }, sell: { adult: '', child: '', infant: '' }, supplier_id: null,
  legs: [{ ...leg('Onward'), depart_date: head.start_date || '' }, { ...leg('Return'), depart_date: head.start_date && head.nights !== '' ? addDays(head.start_date, num(head.nights)) : '' }],
});
const addDays = (d, k) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };

export function FlightsSection({ lines, extras, head, cur, showCost, onAdd, onChange, onRemove, onAddExtra }) {
  const opts = useOptions(['airports', 'airlines']);
  const [paste, setPaste] = useState(null);
  const applyPaste = (key, legIdx, vals) => onChange(key, (x) => {
    const d = x.details;
    const legs = d.legs.map((g, i) => (i === legIdx ? { ...g, ...Object.fromEntries(['airline', 'flight_no', 'depart_time', 'arrive_time'].filter((k) => vals[k] !== undefined).map((k) => [k, vals[k]])) } : g));
    const patch = { legs };
    if (vals.fare !== undefined) {
      // return / multi-city: fares of the legs add up; the first leg starts from zero
      const base = legIdx === 0 ? 0 : Number(d.cost.adult) || 0;
      patch.cost = { ...d.cost, adult: base + vals.fare };
    }
    if (vals.baggage) patch.baggage = vals.baggage;
    if (vals.stops || vals.duration) patch.notes = [d.notes, `${legs[legIdx].from_city}→${legs[legIdx].to_city}: ${[vals.stops, vals.duration].filter(Boolean).join(', ')}`].filter(Boolean).join(' · ');
    return { details: { ...d, ...patch } };
  });
  const total = lines.reduce((s, l) => s + (flightCost(l.details).selling_override ?? flightCost(l.details).cost), 0);
  return (
    <Section id="q-flights" title="Flight Details" total={total} cur={cur} actions={<button className="btn secondary small" onClick={() => onAdd(emptyFlight(head))}>+ Add Flight</button>}>
      {lines.map((l, idx) => {
        const d = l.details; const set = (patch) => onChange(l.key, (x) => ({ details: { ...x.details, ...patch } }));
        const setLeg = (i, patch) => set({ legs: d.legs.map((g, k) => (k === i ? { ...g, ...patch } : g)) });
        const way = (w) => {
          const first = d.legs[0] || leg();
          if (w === 'One way') set({ trip_way: w, legs: [{ ...first, dir: 'Onward' }] });
          else if (w === 'Return') set({ trip_way: w, legs: [{ ...first, dir: 'Onward' }, d.legs[1] ? { ...d.legs[1], dir: 'Return' } : leg('Return', first.to_city, first.from_city)] });
          else set({ trip_way: w, legs: d.legs.map((g, k) => ({ ...g, dir: `Leg ${k + 1}` })) });
        };
        const c = flightCost(d);
        const search = searchLinks(d, head.children_ages || []);
        return (
          <div key={l.key} className={`q-row ${l.meta?.error ? 'has-error' : ''}`}>
            <div className="q-row-head"><span className="badge">Flight {idx + 1}</span><Pills value={d.trip_way} onChange={way} options={['Return', 'One way', 'Multi-city'].map((k) => ({ key: k, label: k === 'Return' ? 'Round Trip' : k }))} />
              <span className="spacer" /><b>{money(c.selling_override ?? c.cost, cur)}</b></div>
            {d.legs.map((g, i) => (
              <div key={i} className="q-leg">
                <div className="small"><b>{g.dir}</b></div>
                <div className="q-grid">
                  <div className="q-field w3"><label>Departure airport *</label><input list="q-airports" value={g.from_city} onChange={(e) => setLeg(i, { from_city: e.target.value })} /></div>
                  <div className="q-field w2"><label>Date</label><input type="date" value={g.depart_date} onChange={(e) => setLeg(i, { depart_date: e.target.value })} /></div>
                  <div className="q-field w1"><label>Time</label><input type="time" value={g.depart_time} onChange={(e) => setLeg(i, { depart_time: e.target.value })} /></div>
                  <div className="q-field w3"><label>Arrival airport *</label><input list="q-airports" value={g.to_city} onChange={(e) => setLeg(i, { to_city: e.target.value })} /></div>
                  <div className="q-field w1"><label>Arr. time</label><input type="time" value={g.arrive_time} onChange={(e) => setLeg(i, { arrive_time: e.target.value })} /></div>
                  <div className="q-field w2"><label>Airline · Flight no.</label><div className="row"><input list="q-airlines" value={g.airline} placeholder="Airline" onChange={(e) => setLeg(i, { airline: e.target.value })} /><input value={g.flight_no} placeholder="6E 123" style={{ width: 80 }} onChange={(e) => setLeg(i, { flight_no: e.target.value })} /></div></div>
                </div>
                {d.trip_way === 'Multi-city' && d.legs.length > 1 && <button className="btn ghost small" onClick={() => set({ legs: d.legs.filter((_, k) => k !== i) })}>Remove leg</button>}
              </div>
            ))}
            {d.trip_way === 'Multi-city' && <button className="btn ghost small" onClick={() => set({ legs: [...d.legs, leg(`Leg ${d.legs.length + 1}`, d.legs[d.legs.length - 1]?.to_city || '')] })}>+ Add leg</button>}
            <div className="flight-search">
              <span className="small"><b>Search fares:</b></span>
              {search.links.map((x) => <a key={x.key} className={`btn secondary small fs-${x.key}`} href={x.url} target="_blank" rel="noopener noreferrer">{x.label} ↗</a>)}
              <button className="btn small" onClick={() => setPaste({ key: l.key, legs: d.legs })}>Paste flight details</button>
              {search.problems.length > 0 && <span className="muted small">{search.problems[0]}</span>}
            </div>
            <datalist id="q-airports">{(opts.airports || []).map((x) => <option key={x} value={x} />)}</datalist>
            <datalist id="q-airlines">{(opts.airlines || []).map((x) => <option key={x} value={x} />)}</datalist>
            <div className="q-grid mt">
              <div className="q-field w2"><label>Travel class</label><select value={d.travel_class} onChange={(e) => set({ travel_class: e.target.value })}>{['Economy', 'Premium Economy', 'Business', 'First'].map((x) => <option key={x}>{x}</option>)}</select></div>
              <div className="q-field w3"><label>Baggage</label><input value={d.baggage} placeholder="15 kg check-in + 7 kg cabin" onChange={(e) => set({ baggage: e.target.value })} /></div>
              <div className="q-field w3"><label>Ticketing vendor</label><RefPicker refType="supplier" service="flight" value={d.supplier_id} onChange={(v) => set({ supplier_id: v })} /></div>
              <div className="q-field w4"><label>Notes</label><input value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
            </div>
            <table className="q-table mt">
              <thead><tr><th>Passengers</th><th>Count</th>{showCost && <th className="r">Cost / person</th>}<th className="r">Selling / person</th><th className="r">Total</th></tr></thead>
              <tbody>{[['adults', 'adult', 'Adults (12y+)'], ['children', 'child', 'Children (2-12y)'], ['infants', 'infant', 'Infants (<2y)']].map(([k, p, label]) => (
                <tr key={k}>
                  <td>{label}</td>
                  <td><input type="number" min={0} value={d[k]} style={{ width: 70 }} onChange={(e) => set({ [k]: e.target.value })} /></td>
                  {showCost && <td className="r"><input type="number" min={0} value={d.cost[p]} style={{ width: 110 }} onChange={(e) => set({ cost: { ...d.cost, [p]: e.target.value } })} /></td>}
                  <td className="r"><input type="number" min={0} value={d.sell[p]} placeholder="markup applies" style={{ width: 120 }} onChange={(e) => set({ sell: { ...d.sell, [p]: e.target.value } })} /></td>
                  <td className="r">{money(r2(num(d[k]) * num(d.sell[p] !== '' ? d.sell[p] : d.cost[p])), cur)}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="muted small">Leave selling empty to apply your markup on the cost.</div>
            <LineError line={l} />
            <div className="q-row-actions"><button className="btn secondary small" onClick={() => onAdd({ ...d, legs: d.legs.map((g) => ({ ...g })) })}>Duplicate</button><span className="spacer" /><button className="btn remove small" onClick={() => onRemove(l.key)}>Remove</button></div>
          </div>
        );
      })}
      {paste && <PasteFlight legs={paste.legs} cur={cur} onClose={() => setPaste(null)} onApply={(idx, vals) => { applyPaste(paste.key, idx, vals); setPaste(null); }} />}
      <ExtrasEditor title="Any extra services in flights (seat, meal, baggage…)" category="flight" lines={extras} cur={cur} showCost={showCost} onAdd={onAddExtra} onChange={onChange} onRemove={onRemove} />
    </Section>
  );
}

/** Paste text copied from MakeMyTrip / Goibibo / Skyscanner; tick the details to fill in. */
function PasteFlight({ legs, cur, onClose, onApply }) {
  const [legIdx, setLegIdx] = useState(0);
  const [text, setText] = useState('');
  const found = parseFlightText(text);
  const [skip, setSkip] = useState({});
  const FIELDS = [['airline', 'Airline'], ['flight_no', 'Flight number'], ['depart_time', 'Departure time'], ['arrive_time', 'Arrival time'], ['stops', 'Stops'], ['duration', 'Duration'], ['fare', `Fare per adult (${cur}) → cost`]];
  const picked = Object.fromEntries(Object.entries(found).filter(([k]) => !skip[k]));
  return (
    <Modal title="Fill flight details from a search result" wide onClose={onClose} footer={<>
      <button className="btn secondary" onClick={onClose}>Cancel</button>
      <button className="btn" disabled={!Object.keys(picked).length} onClick={() => onApply(legIdx, picked)}>Fill {Object.keys(picked).length} detail(s)</button>
    </>}>
      <ol className="small muted" style={{ marginTop: 0, paddingLeft: 18 }}>
        <li>Open MakeMyTrip, Goibibo or Skyscanner with the buttons in the flight section.</li>
        <li>Select the flight card text (airline, flight number, times, price) and copy it (Ctrl + C).</li>
        <li>Paste it below, untick anything you don't want, and fill.</li>
      </ol>
      {legs.length > 1 && (
        <div className="row wrap mb"><span className="small"><b>For leg:</b></span>
          {legs.map((g, i) => <button key={i} className={`btn small ${i === legIdx ? '' : 'secondary'}`} onClick={() => setLegIdx(i)}>{g.dir}: {g.from_city || '?'} → {g.to_city || '?'}</button>)}
        </div>
      )}
      <textarea rows={7} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={'e.g.\nIndiGo\n6E 6017\n06:15  Bhopal\n2h 05m  Non stop\n08:20  Mumbai\n₹ 5,432'} />
      {text.trim() && (
        <table className="q-table mt">
          <thead><tr><th>Use</th><th>Detail</th><th>Found</th></tr></thead>
          <tbody>{FIELDS.map(([k, label]) => (
            <tr key={k} className={found[k] === undefined ? 'muted' : ''}>
              <td><input type="checkbox" disabled={found[k] === undefined} checked={found[k] !== undefined && !skip[k]} onChange={(e) => setSkip({ ...skip, [k]: !e.target.checked })} /></td>
              <td>{label}</td><td>{found[k] === undefined ? <span className="muted small">not found</span> : <b>{k === 'fare' ? money(found[k], cur) : found[k]}</b>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <p className="muted small mt">Fares change quickly – re-check the price before you send the quote.</p>
    </Modal>
  );
}

/* ----------------------------------- visa ----------------------------------- */
export const emptyVisa = (head) => ({ country: '', visa_service_id: null, visa_type: '', pax: num(head.adults) + (head.children_ages || []).length, currency: head.currency || 'INR', fx_rate: 1, rate: '', given: '', travel_date: head.start_date || '', notes: '' });

export function VisaSection({ lines, extras, head, cur, showCost, onAdd, onChange, onRemove, onAddExtra }) {
  const opts = useOptions(['visa_countries', 'visa_types', 'currencies']);
  const total = lines.reduce((s, l) => s + (visaCost(l.details).selling_override ?? visaCost(l.details).cost), 0);
  return (
    <Section id="q-visa" title="Visa Details" total={total} cur={cur} actions={<button className="btn secondary small" onClick={() => onAdd(emptyVisa(head))}>+ Add Visa</button>}>
      {lines.map((l) => {
        const d = l.details; const info = l.meta?.info;
        const set = (patch) => onChange(l.key, (x) => ({ details: { ...x.details, ...patch } }));
        const picked = (rec) => {
          if (!rec) return; const x = rec.data || {};
          onChange(l.key, (ln) => ({ meta: { ...ln.meta, info: x }, details: { ...ln.details, country: x.country || ln.details.country, visa_type: x.visa_type || ln.details.visa_type, currency: x.currency || ln.details.currency,
            rate: x.cost_adult ?? ln.details.rate, given: x.selling_adult ?? ln.details.given, fx_rate: (x.currency || 'INR') === cur ? 1 : ln.details.fx_rate } }));
        };
        const c = visaCost(d);
        return (
          <div key={l.key} className="q-row">
            <VisaInfoLoader line={l} onLoaded={picked} />
            <div className="q-grid">
              <div className="q-field w2"><label>Country *</label><select value={d.country} onChange={(e) => set({ country: e.target.value, visa_service_id: null })}><option value="">Select…</option>{(opts.visa_countries || []).map((x) => <option key={x}>{x}</option>)}</select></div>
              <div className="q-field w4"><label>Visa</label><RefPicker refType="visa_service" value={d.visa_service_id} onChange={(v) => set({ visa_service_id: v })} onPicked={picked} placeholder={d.country ? `${d.country} visas` : 'Search visa'} /></div>
              <div className="q-field w2"><label>Visa type</label><select value={d.visa_type} onChange={(e) => set({ visa_type: e.target.value })}><option value="">—</option>{(opts.visa_types || []).map((x) => <option key={x}>{x}</option>)}</select></div>
              <div className="q-field w2"><label>Travel date</label><input type="date" value={d.travel_date} onChange={(e) => set({ travel_date: e.target.value })} /></div>
              <div className="q-field w2"><label>Notes</label><input value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
            </div>
            {info && <div className="q-info small">{[info.duration_days && `Stay ${info.duration_days} days`, info.validity_days && `Valid ${info.validity_days} days`, info.entries && `${info.entries} entry`, info.purpose, info.processing_days && `Processing ${info.processing_days} days`].filter(Boolean).join(' · ')}
              {info.documents?.length > 0 && <div className="muted">Documents: {(Array.isArray(info.documents) ? info.documents : String(info.documents).split('|')).join(', ')}</div>}</div>}
            <table className="q-table">
              <thead><tr><th>PAX</th><th>Currency</th><th>Exchange rate</th>{showCost && <th className="r">Rate (× pax)</th>}<th className="r">Given (× pax)</th><th className="r">Total ({cur})</th></tr></thead>
              <tbody><tr>
                <td><input type="number" min={1} value={d.pax} style={{ width: 70 }} onChange={(e) => set({ pax: e.target.value })} /></td>
                <td><select value={d.currency} onChange={(e) => set({ currency: e.target.value, fx_rate: e.target.value === cur ? 1 : d.fx_rate })}>{[...new Set([cur, ...(opts.currencies || [])])].map((x) => <option key={x}>{x}</option>)}</select></td>
                <td><input type="number" min={0} step="0.0001" value={d.fx_rate} disabled={d.currency === cur} style={{ width: 90 }} onChange={(e) => set({ fx_rate: e.target.value })} title={`1 ${d.currency} = ? ${cur}`} /></td>
                {showCost && <td className="r"><input type="number" min={0} value={d.rate} style={{ width: 100 }} onChange={(e) => set({ rate: e.target.value })} /></td>}
                <td className="r"><input type="number" min={0} value={d.given ?? ''} placeholder="markup applies" style={{ width: 110 }} onChange={(e) => set({ given: e.target.value })} /></td>
                <td className="r"><b>{money(c.selling_override ?? c.cost, cur)}</b></td>
              </tr></tbody>
            </table>
            <LineError line={l} />
            <div className="q-row-actions"><button className="btn secondary small" onClick={() => onAdd({ ...d }, l.meta)}>Duplicate</button><span className="spacer" /><button className="btn remove small" onClick={() => onRemove(l.key)}>Remove</button></div>
          </div>
        );
      })}
      <ExtrasEditor title="Any extra services in visa (insurance letter, courier…)" category="visa" lines={extras} cur={cur} showCost={showCost} onAdd={onAddExtra} onChange={onChange} onRemove={onRemove} />
    </Section>
  );
}
function VisaInfoLoader({ line, onLoaded }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !line.details.visa_service_id || line.meta?.info) return;
    done.current = true;
    api(`/lookup/visa_service/${line.details.visa_service_id}`).then((r) => onLoaded(r.data)).catch(() => {});
  }, [line.details.visa_service_id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* --------------------- train / passport / insurance (form fields) --------------------- */
export function ClassicSection({ service, lines, head, cur, showCost, onAdd, onChange, onRemove, defaultsFor }) {
  const def = SERVICES[service];
  const total = lines.reduce((s, l) => s + num(l.cost), 0);
  return (
    <Section id={`q-${service}`} icon={def.icon} title={def.plural} total={total} cur={cur} actions={<button className="btn secondary small" onClick={() => onAdd(defaultsFor(service))}>+ Add {def.label}</button>}>
      {lines.map((l) => <ClassicLine key={l.key} line={l} head={head} cur={cur} showCost={showCost} onChange={(p) => onChange(l.key, p)} onRemove={() => onRemove(l.key)} />)}
    </Section>
  );
}
function ClassicLine({ line, head, cur, showCost, onChange, onRemove }) {
  const def = SERVICES[line.service];
  const timer = useRef(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (line.manual) return undefined;
    const local = autoCost(line.service, line.details);
    if (!def.priceLookup) { if (local !== null) onChange({ cost: local }); return undefined; }
    const ready = def.quoteFields.filter((f) => f.required && f.type === 'ref').every((f) => line.details[f.key]);
    if (!ready) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = (await api('/quotes/price', { method: 'POST', body: { service: line.service, details: line.details, start_date: head.start_date || null } })).data;
        onChange((l) => ({ cost: r.cost ?? l.cost, buy_cost: r.buy_cost ?? '', selling_override: r.selling_override ?? '' })); setNote(r.note || '');
      } catch { /* helper */ }
    }, 400);
    return () => clearTimeout(timer.current);
  }, [JSON.stringify(line.details), head.start_date, line.manual]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="q-row">
      <div className="svc-line">
        {def.quoteFields.map((f) => (
          <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.hint} className={`w${f.width || 2}`}>
            <FieldInput field={f} value={line.details[f.key]} onChange={(v) => onChange((l) => ({ details: { ...l.details, [f.key]: v } }))} />
          </Field>
        ))}
      </div>
      <LineError line={line} />
      <div className="row wrap mt" style={{ alignItems: 'flex-end' }}>
        <Field label={`Price (${cur})`} hint={line.manual ? 'Entered manually' : note}><input type="number" value={line.cost} style={{ width: 130 }} onChange={(e) => onChange({ cost: e.target.value, manual: true })} /></Field>
        {showCost && <Field label="Buying price"><input type="number" value={line.buy_cost} placeholder={String(line.cost || '')} style={{ width: 130 }} onChange={(e) => onChange({ buy_cost: e.target.value, manual: true })} /></Field>}
        <Field label="Fixed selling" hint="Skips markup"><input type="number" value={line.selling_override} style={{ width: 130 }} onChange={(e) => onChange({ selling_override: e.target.value })} /></Field>
        {line.manual && <button className="btn ghost small" onClick={() => onChange({ manual: false })}>↻ Re-price</button>}
        <span className="spacer" /><button className="btn remove small" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

/* --------------------------- other special services --------------------------- */
export function OtherServicesSection({ extras, head, cur, showCost, onChange, onRemove, onAddExtra }) {
  const total = extras.filter((e) => e.details.category === 'trip').reduce((s, e) => s + num(e.details.price) * num(e.details.qty), 0);
  return (
    <Section id="q-other" title="Any other special service for this trip" total={total} cur={cur}>
      <ExtrasEditor title="Guide, SIM card, forex, celebration, etc." category="trip" lines={extras} cur={cur} showCost={showCost} daysTotal={num(head.nights) + 1} start={head.start_date}
        onAdd={onAddExtra} onChange={onChange} onRemove={onRemove} />
    </Section>
  );
}
