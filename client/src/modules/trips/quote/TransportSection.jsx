import { useEffect, useMemo, useState } from 'react';
import { dateOf, dayName, dayLabel, transportCost, activityCost, transportSummary, r2 } from '@shared/quoteItems.js';
import { api, money, qs } from '../../../core/api.js';
import { RefPicker, useOptions } from '../../../core/forms.jsx';
import { GivenPriceModal, SlotPicker, Section, Stepper, SummaryTable, ExtrasEditor, LineError, has, num, useDebounced } from './common.jsx';

export const emptyTransport = (days = []) => ({ days, location: '', service_type: '', transport_service_id: null, start_time: '', duration_mins: null, pickup_point: '', cabs: [{ cab_type: '', qty: 1, prices: [] }], notes: '' });
export const emptyActivity = (days = [], adults = 2, children = 0) => ({ days, activity_service_id: null, slot: '', tickets: [{ type: 'Adult', qty: adults, prices: [] }, ...(children ? [{ type: 'Child', qty: children, prices: [] }] : [])], notes: '' });

/** Seats of a cab type: from the Cab Type master, else the number in its name, else common sizes. */
export function useSeats() {
  const [master, setMaster] = useState([]);
  useEffect(() => { api(`/lookup/cab_type${qs({ limit: 200 })}`).then((r) => setMaster(r.data)).catch(() => {}); }, []);
  return useMemo(() => (type) => {
    if (!type) return null;
    const m = master.find((x) => x.name.toLowerCase() === String(type).toLowerCase());
    if (m && num(m.data?.seats)) return num(m.data.seats);
    const t = String(type).toLowerCase();
    const n = t.match(/\b(\d{1,2})\s*(seat|seater|pax)?\b/); if (n && Number(n[1]) >= 3) return Number(n[1]);
    if (/sedan|dzire|etios|wagon|hatch|indica/.test(t)) return 4;
    if (/innova|ertiga|suv|xylo|crysta|scorpio/.test(t)) return 6;
    return null;
  }, [master]);
}

export default function TransportSection({ lines, extras, head, cur, showCost, onAdd, onChange, onRemove, onAddExtra, hasActivity, hasTransport }) {
  const days = Math.max(num(head.nights), 0) + 1;
  const start = head.start_date;
  const pax = num(head.adults) + (head.children_ages || []).length;
  const seatsOf = useSeats();
  const transport = lines.filter((l) => l.service === 'transport');
  const [sameCab, setSameCab] = useState(false);
  const lump = extras.find((e) => e.details.lump);
  const setLump = (on) => {
    transport.forEach((l) => onChange(l.key, (x) => ({ details: { ...x.details, included: on } })));
    if (on && !lump) onAddExtra({ category: 'transport', lump: true, description: 'Transport – all days (as per itinerary)', qty: 1, price: '', buy: '', day: 1 });
    if (!on && lump) onRemove(lump.key);
  };
  const setLumpVal = (patch) => lump && onChange(lump.key, (x) => ({ details: { ...x.details, ...patch } }));
  const total = lines.reduce((s, l) => s + (l.service === 'transport' ? transportCost(l.details).cost : activityCost(l.details).cost), 0)
    + extras.filter((e) => e.details.category === 'transport').reduce((s, e) => s + num(e.details.price) * num(e.details.qty), 0);
  const ts = transport.length ? transportSummary(transport.map((l) => l.details), days, start, pax, seatsOf) : [];
  const sumRows = ts.map((r) => ({ key: r.day, date: r.date ? dayName(r.date) : '', status: r.status, statusLabel: r.status === 'short' ? 'Short Seats' : r.status === 'missing' ? 'No Transport' : 'Complete',
    pax: r.pax, cabs: r.cabs ? `${r.cabs} (${r.cab_types.join(', ')})` : 0, seats: r.known ? r.seats : '—' }));
  const problems = ts.filter((r) => r.status !== 'complete').map((r) => `${dayLabel(r.day, start)}: ${r.status === 'missing' ? 'No transport configured. Add a transport service if a cab is needed this day.' : r.message}`);
  const sorted = [...lines].sort((a, b) => (Math.min(99, ...a.details.days) - Math.min(99, ...b.details.days)) || a.key - b.key);
  const lastDay = (l) => Math.max(0, ...l.details.days.map(Number));
  const childCount = (head.children_ages || []).length;
  const fresh = (l, dayList) => (l.service === 'transport' ? emptyTransport(dayList) : emptyActivity(dayList, num(head.adults), childCount));
  const applyCab = (type) => transport.forEach((l) => onChange(l.key, (x) => ({ details: { ...x.details, cabs: x.details.cabs.map((c) => ({ ...c, cab_type: type, prices: [] })) } })));
  return (
    <Section id="q-transport" title="Transports and Activities" total={total} cur={cur}
      actions={<>
        {hasTransport && <label className="checkbox small"><input type="checkbox" checked={sameCab} onChange={(e) => { setSameCab(e.target.checked); const t = transport[0]?.details.cabs[0]?.cab_type; if (e.target.checked && t) applyCab(t); }} /> Same cab type for all</label>}
        {hasTransport && <button className="btn secondary small" onClick={() => onAdd('transport', { ...emptyTransport([1]), included: Boolean(lump) })}>+ Transport Service</button>}
        {hasActivity && <button className="btn secondary small" onClick={() => onAdd('activity', emptyActivity([1], num(head.adults), childCount))}>+ Activity / Ticket</button>}
      </>}>
      {hasTransport && transport.length > 0 && (
        <div className={`q-lump ${lump ? 'on' : ''}`}>
          <label className="checkbox"><input type="checkbox" checked={Boolean(lump)} onChange={(e) => setLump(e.target.checked)} /> <b>One price for all transport</b>
            <span className="muted small"> – enter a single amount for the whole transport instead of per day / per cab</span></label>
          {lump && (
            <div className="q-grid mt">
              <div className="q-field w3"><label>Total transport price ({cur}) *</label><input type="number" min={0} value={lump.details.price} onChange={(e) => setLumpVal({ price: e.target.value })} /></div>
              {showCost && <div className="q-field w3"><label>Buying price ({cur})</label><input type="number" min={0} value={lump.details.buy ?? ''} placeholder={String(lump.details.price || '')} onChange={(e) => setLumpVal({ buy: e.target.value })} /></div>}
              <div className="q-field w6"><label>Shown as</label><input value={lump.details.description} onChange={(e) => setLumpVal({ description: e.target.value })} /></div>
            </div>
          )}
        </div>
      )}
      {lines.length === 0 && <div className="empty">No transport or activity yet.</div>}
      {sorted.map((l) => {
        const common = {
          key: l.key, line: l, head, cur, showCost, days,
          onChange: (patch) => onChange(l.key, patch), onRemove: () => onRemove(l.key),
          onAllDays: () => onChange(l.key, (x) => ({ details: { ...x.details, days: Array.from({ length: days }, (_, i) => i + 1) } })),
          onNextDay: () => onAdd(l.service, { ...fresh(l, lastDay(l) < days ? [lastDay(l) + 1] : []), included: l.details.included }),
          onSimilar: () => onAdd(l.service, { ...fresh(l, [...l.details.days]), included: l.details.included }),
          onDuplicate: () => onAdd(l.service, { ...l.details, days: lastDay(l) < days ? [lastDay(l) + 1] : [], cabs: l.details.cabs?.map((c) => ({ ...c, prices: [] })), tickets: l.details.tickets?.map((c) => ({ ...c, prices: [] })) }, l.meta),
        };
        return l.service === 'transport'
          ? <TransportRow {...common} seatsOf={seatsOf} pax={pax} onCabType={sameCab ? applyCab : null} />
          : <ActivityRow {...common} />;
      })}
      {sumRows.length > 0 && <SummaryTable title="Transport Summary" kind="day" rows={sumRows} problems={problems}
        columns={[{ key: 'pax', label: 'Travellers' }, { key: 'cabs', label: 'Cabs' }, { key: 'seats', label: 'Seats' }]} />}
      <ExtrasEditor title="Any extra or sightseeing in transportation" category="transport" lines={extras} cur={cur} showCost={showCost} daysTotal={days} start={start}
        onAdd={onAddExtra} onChange={onChange} onRemove={onRemove} />
    </Section>
  );
}

function RowActions({ onAllDays, onNextDay, onSimilar, onDuplicate, onRemove, canNext }) {
  return (
    <div className="q-row-actions">
      <button className="btn secondary small" onClick={onAllDays} title="Use on every day of the trip">Apply to all days</button>
      <button className="btn secondary small" disabled={!canNext} onClick={onNextDay} title="Empty row for the next day">Next Day</button>
      <button className="btn secondary small" onClick={onSimilar} title="Another service on the same day(s)">Similar</button>
      <button className="btn secondary small" onClick={onDuplicate} title="Same service on the next day">Duplicate</button>
      <span className="spacer" />
      <button className="btn remove small" onClick={onRemove}>Remove</button>
    </div>
  );
}

/* ------------------------------- transport ------------------------------- */
function TransportRow({ line, head, cur, showCost, days, seatsOf, pax, onChange, onRemove, onCabType, ...actions }) {
  const d = line.details; const meta = line.meta || {};
  const opts = useOptions(['cab_types']);
  const [locations, setLocations] = useState([]);
  const [services, setServices] = useState([]);
  const [popup, setPopup] = useState(null);
  const set = (patch) => onChange((l) => ({ details: { ...l.details, ...patch } }));
  useEffect(() => { api('/transport/locations').then((r) => setLocations(r.data.map((x) => x.name))).catch(() => {}); }, []);
  useEffect(() => {
    api(`/lookup/transport_service${qs({ q: d.location || '', limit: 200 })}`).then((r) => setServices(r.data)).catch(() => {});
  }, [d.location]);
  const types = [...new Set(services.map((s) => s.data.service).filter(Boolean))];
  const routes = services.filter((s) => !d.service_type || s.data.service === d.service_type);
  const chosen = services.find((s) => s.id === Number(d.transport_service_id));
  const cabTypes = (chosen?.data.cab_types?.length ? chosen.data.cab_types : meta.cab_types?.length ? meta.cab_types : opts.cab_types) || [];
  const pick = (id) => {
    const s = services.find((x) => x.id === Number(id));
    onChange((l) => ({
      meta: { ...l.meta, cab_types: s?.data.cab_types || [], pickup_points: s?.data.pickup_points || [] },
      details: { ...l.details, transport_service_id: s?.id || null, service_type: s?.data.service || l.details.service_type, start_time: l.details.start_time || s?.data.start_time || '', duration_mins: s?.data.duration_mins || null,
        cabs: l.details.cabs.map((c) => ({ ...c, cab_type: c.cab_type || s?.data.cab_types?.[0] || '', prices: [] })) },
    }));
  };
  // per day system rate for each cab
  useDebounced(async () => {
    if (!d.transport_service_id || !d.days.length || !head.start_date) return;
    const dates = d.days.map((k) => dateOf(head.start_date, k));
    const out = [];
    for (const c of d.cabs) {
      if (!c.cab_type) { out.push(c.prices || []); continue; }
      try {
        const r = (await api('/rates/transport/breakdown', { method: 'POST', body: { details: { transport_service_id: d.transport_service_id, cab_type: c.cab_type }, dates } })).data;
        const old = new Map((c.prices || []).map((p) => [Number(p.day), p]));
        out.push(d.days.map((k) => { const date = dateOf(head.start_date, k); const s = r.dates[date] || {}; const o = old.get(Number(k));
          return { day: Number(k), date, rate: s.rate ?? null, given: o?.edited ? o.given : (s.rate ?? null), buy: o?.edited ? o.buy : (s.buy ?? null), edited: Boolean(o?.edited), closed: s.closed || false }; }));
      } catch { out.push(c.prices || []); }
    }
    onChange((l) => ({ details: { ...l.details, cabs: l.details.cabs.map((c, i) => ({ ...c, prices: out[i] || c.prices })) } }));
  }, [d.transport_service_id, d.days.join(','), d.cabs.map((c) => c.cab_type).join(','), head.start_date]);

  const setCab = (i, patch) => set({ cabs: d.cabs.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const priceOfDay = (c, k) => (c.prices || []).find((p) => Number(p.day) === Number(k)) || { day: k, date: dateOf(head.start_date, k) };
  const cabTotal = (c) => d.days.reduce((s, k) => { const p = priceOfDay(c, k); return s + num(has(p.given) ? p.given : p.rate) * num(c.qty); }, 0);
  const seats = d.cabs.reduce((s, c) => s + (seatsOf(c.cab_type) || 0) * num(c.qty), 0);
  const unknown = d.cabs.some((c) => c.cab_type && seatsOf(c.cab_type) === null);
  const openGiven = (i) => {
    const c = d.cabs[i];
    setPopup({ i, rows: d.days.map((k) => { const p = priceOfDay(c, k); return { key: String(k), label: `${dayLabel(k, head.start_date)} · ${c.cab_type}`, rate: p.rate, given: p.given, buy: p.buy, qty: num(c.qty) }; }) });
  };
  const saveGiven = (rows) => {
    const c = d.cabs[popup.i];
    setCab(popup.i, { prices: d.days.map((k) => { const r = rows.find((x) => x.key === String(k)); const p = priceOfDay(c, k); return { ...p, day: Number(k), given: r?.given ?? null, buy: r?.buy ?? null, edited: true }; }) });
    setPopup(null);
  };
  const c = transportCost(d);
  return (
    <div className={`q-row ${line.meta?.error ? 'has-error' : ''}`}>
      <div className="q-row-head"><span className="badge info">Transport Service</span><span className="spacer" /><b>{money(c.cost, cur)}</b></div>
      <div className="q-field"><label>Day(s) *</label><SlotPicker kind="day" total={days} start={head.start_date} value={d.days} onChange={(v) => set({ days: v })} /></div>
      <div className="q-grid">
        <div className="q-field w3"><label>Service location</label>
          <select value={d.location} onChange={(e) => set({ location: e.target.value, service_type: '', transport_service_id: null })}><option value="">All locations</option>{locations.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="q-field w3"><label>Service type</label>
          <select value={d.service_type} onChange={(e) => set({ service_type: e.target.value, transport_service_id: null })}><option value="">Any type</option>{types.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="q-field w6"><label>Service / route *</label>
          <select value={d.transport_service_id || ''} onChange={(e) => pick(e.target.value)}>
            <option value="">Select…</option>
            {chosen && !routes.some((r) => r.id === chosen.id) && <option value={chosen.id}>{chosen.name}</option>}
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.sub ? ` (${r.sub})` : ''}</option>)}
          </select></div>
      </div>
      <div className="q-grid">
        <div className="q-field w2"><label>Start time</label><input type="time" value={d.start_time} onChange={(e) => set({ start_time: e.target.value })} /></div>
        <div className="q-field w2"><label>Duration</label><div className="muted small" style={{ paddingTop: 8 }}>{d.duration_mins ? `${Math.round(d.duration_mins / 6) / 10} hrs` : '—'}</div></div>
        <div className="q-field w4"><label>Pick-up point</label><input list={`pp-${line.key}`} value={d.pickup_point} onChange={(e) => set({ pickup_point: e.target.value })} placeholder="Airport / hotel / station" />
          <datalist id={`pp-${line.key}`}>{(meta.pickup_points || []).map((x) => <option key={x} value={x} />)}</datalist></div>
        <div className="q-field w4"><label>Notes</label><input value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
      </div>
      <table className="q-table">
        <thead><tr><th>Transportation type</th><th>Qty</th><th className="r">Rate / day</th><th className="r">Given</th><th className="r">Total</th><th /></tr></thead>
        <tbody>{d.cabs.map((cab, i) => {
          const first = priceOfDay(cab, d.days[0] || 1);
          return (
            <tr key={i}>
              <td><select value={cab.cab_type} onChange={(e) => { if (onCabType) onCabType(e.target.value); else setCab(i, { cab_type: e.target.value, prices: [] }); }}>
                <option value="">Select…</option>{[...new Set([...cabTypes, cab.cab_type].filter(Boolean))].map((x) => <option key={x}>{x}</option>)}</select>
                {seatsOf(cab.cab_type) && <span className="muted small"> {seatsOf(cab.cab_type)} seats</span>}</td>
              <td><Stepper value={cab.qty} min={1} max={50} onChange={(v) => setCab(i, { qty: v })} /></td>
              {d.included ? <td className="r muted small" colSpan={3}>Included in the transport price</td> : <>
                <td className="r muted">{has(first.rate) ? money(first.rate, cur) : '—'}{d.days.length > 1 ? <span className="small"> × {d.days.length}d</span> : ''}</td>
                <td className="r"><button className="btn secondary small" onClick={() => openGiven(i)}>{has(first.given) ? money(first.given, cur) : 'Enter price'} ✎</button></td>
                <td className="r"><b>{money(r2(cabTotal(cab)), cur)}</b></td></>}
              <td>{d.cabs.length > 1 && <button className="btn remove xs" onClick={() => set({ cabs: d.cabs.filter((_, k) => k !== i) })}>Remove</button>}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <div className="row mt">
        <button className="btn ghost small" onClick={() => set({ cabs: [...d.cabs, { cab_type: '', qty: 1, prices: [] }] })}>+ Add cab</button>
        {d.cabs.some((x) => x.cab_type) && !unknown && seats < pax && <span className="badge warn">⚠ {pax - seats} seat(s) missing ({seats} seats for {pax} pax)</span>}
        {d.cabs.some((x) => x.prices?.some((p) => p.closed)) && <span className="badge warn">Service closed on a chosen day</span>}
      </div>
      <LineError line={line} />
      <RowActions {...actions} onRemove={onRemove} canNext={Math.max(0, ...d.days) < days} />
      {popup && <GivenPriceModal title={`Given Price – ${d.cabs[popup.i].cab_type || 'Cab'}`} rows={popup.rows} cur={cur} showCost={showCost} onClose={() => setPopup(null)} onSave={saveGiven} />}
    </div>
  );
}

/* -------------------------------- activity -------------------------------- */
function ActivityRow({ line, head, cur, showCost, days, onChange, onRemove, ...actions }) {
  const d = line.details; const meta = line.meta || {};
  const [popup, setPopup] = useState(null);
  const set = (patch) => onChange((l) => ({ details: { ...l.details, ...patch } }));
  const picked = (rec) => { if (rec) onChange((l) => ({ meta: { ...l.meta, slots: rec.data?.slots || '', ticket_types: rec.data?.ticket_types || [], name: rec.name } })); };
  useEffect(() => { if (d.activity_service_id && !meta.ticket_types) api(`/lookup/activity_service/${d.activity_service_id}`).then((r) => picked(r.data)).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useDebounced(async () => {
    if (!d.activity_service_id || !d.days.length || !head.start_date) return;
    const dates = d.days.map((k) => dateOf(head.start_date, k));
    try {
      const r = (await api('/rates/activity/breakdown', { method: 'POST', body: { details: { activity_service_id: d.activity_service_id }, dates } })).data;
      onChange((l) => ({ details: { ...l.details, tickets: l.details.tickets.map((t) => {
        const old = new Map((t.prices || []).map((p) => [Number(p.day), p]));
        return { ...t, prices: l.details.days.map((k) => { const date = dateOf(head.start_date, k); const s = r.dates[date] || {}; const sys = s[t.type] || s[Object.keys(s).find((x) => x.toLowerCase() === String(t.type).toLowerCase())] || null; const o = old.get(Number(k));
          return { day: Number(k), date, rate: sys?.rate ?? null, given: o?.edited ? o.given : (sys?.rate ?? null), buy: o?.edited ? o.buy : (sys?.buy ?? null), edited: Boolean(o?.edited), closed: Boolean(s.closed) }; }) };
      }) } }));
    } catch { /* helper */ }
  }, [d.activity_service_id, d.days.join(','), d.tickets.map((t) => t.type).join(','), head.start_date]);
  const types = [...new Set(['Adult', 'Child', ...(meta.ticket_types || [])])];
  const setT = (i, patch) => set({ tickets: d.tickets.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
  const priceOfDay = (t, k) => (t.prices || []).find((p) => Number(p.day) === Number(k)) || { day: k, date: dateOf(head.start_date, k) };
  const openGiven = (i) => {
    const t = d.tickets[i];
    setPopup({ i, rows: d.days.map((k) => { const p = priceOfDay(t, k); return { key: String(k), label: `${dayLabel(k, head.start_date)} · ${t.type}`, rate: p.rate, given: p.given, buy: p.buy, qty: num(t.qty) }; }) });
  };
  const saveGiven = (rows) => {
    const t = d.tickets[popup.i];
    setT(popup.i, { prices: d.days.map((k) => { const r = rows.find((x) => x.key === String(k)); return { ...priceOfDay(t, k), day: Number(k), given: r?.given ?? null, buy: r?.buy ?? null, edited: true }; }) });
    setPopup(null);
  };
  const c = activityCost(d);
  return (
    <div className={`q-row activity ${line.meta?.error ? 'has-error' : ''}`}>
      <div className="q-row-head"><span className="badge good">Activity / Ticket</span><span className="spacer" /><b>{money(c.cost, cur)}</b></div>
      <div className="q-field"><label>Day(s) *</label><SlotPicker kind="day" total={days} start={head.start_date} value={d.days} onChange={(v) => set({ days: v })} /></div>
      <div className="q-grid">
        <div className="q-field w6"><label>Activity *</label><RefPicker refType="activity_service" value={d.activity_service_id} onChange={(v) => set({ activity_service_id: v })} onPicked={picked} placeholder="Search activity / ticket" /></div>
        <div className="q-field w3"><label>Slot</label>
          <select value={d.slot} onChange={(e) => set({ slot: e.target.value })}><option value="">Any</option>{String(meta.slots || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="q-field w3"><label>Notes</label><input value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
      </div>
      <table className="q-table">
        <thead><tr><th>Ticket</th><th>Qty</th><th className="r">Rate</th><th className="r">Given</th><th className="r">Total</th><th /></tr></thead>
        <tbody>{d.tickets.map((t, i) => {
          const first = priceOfDay(t, d.days[0] || 1);
          const tot = d.days.reduce((s, k) => { const p = priceOfDay(t, k); return s + num(has(p.given) ? p.given : p.rate) * num(t.qty); }, 0);
          return (
            <tr key={i}>
              <td><select value={t.type} onChange={(e) => setT(i, { type: e.target.value, prices: [] })}>{[...new Set([...types, t.type])].map((x) => <option key={x}>{x}</option>)}</select></td>
              <td><Stepper value={t.qty} min={0} max={500} onChange={(v) => setT(i, { qty: v })} /></td>
              <td className="r muted">{has(first.rate) ? money(first.rate, cur) : '—'}</td>
              <td className="r"><button className="btn secondary small" onClick={() => openGiven(i)}>{has(first.given) ? money(first.given, cur) : 'Enter price'} ✎</button></td>
              <td className="r"><b>{money(r2(tot), cur)}</b></td>
              <td>{d.tickets.length > 1 && <button className="btn remove xs" onClick={() => set({ tickets: d.tickets.filter((_, k) => k !== i) })}>Remove</button>}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <div className="row mt"><button className="btn ghost small" onClick={() => set({ tickets: [...d.tickets, { type: 'Adult', qty: 1, prices: [] }] })}>+ Add ticket type</button>
        {d.tickets.some((t) => t.prices?.some((p) => p.closed)) && <span className="badge warn">Closed on a chosen day</span>}</div>
      <LineError line={line} />
      <RowActions {...actions} onRemove={onRemove} canNext={Math.max(0, ...d.days) < days} />
      {popup && <GivenPriceModal title={`Given Price – ${d.tickets[popup.i].type}`} rows={popup.rows} cur={cur} showCost={showCost} onClose={() => setPopup(null)} onSave={saveGiven} />}
    </div>
  );
}

export { dayName };
