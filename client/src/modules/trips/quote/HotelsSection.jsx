import { useEffect, useState } from 'react';
import { dateOf, dayName, nightLabel, hotelCost, hotelNightTotal, extraBedLimits, accommodationSummary, paxSplit, r2 } from '@shared/quoteItems.js';
import { api, money } from '../../../core/api.js';
import { RefPicker, useOptions } from '../../../core/forms.jsx';
import { GivenPriceModal, SlotPicker, Section, Stepper, SummaryTable, ExtrasEditor, LineError, has, num, useDebounced } from './common.jsx';

export const emptyHotel = (nights = []) => ({ nights, hotel_id: null, meal_plan: '', room_type: '', pax_per_room: 2, rooms: 1, aweb: 0, cweb: 0, cnb: 0, comp: 0, prices: [], notes: '' });

/** Hotels with per-night prices, accommodation summary and "special inclusions in hotels". */
export default function HotelsSection({ lines, extras, head, cur, showCost, onAdd, onChange, onRemove, onAddExtra }) {
  const nights = Math.max(num(head.nights), 0);
  const start = head.start_date;
  const covered = new Set(lines.flatMap((l) => l.details.nights.map(Number)));
  const free = Array.from({ length: nights }, (_, i) => i + 1).filter((k) => !covered.has(k));
  const lastNight = (l) => Math.max(0, ...l.details.nights.map(Number));
  const total = lines.reduce((s, l) => s + hotelCost(l.details).cost, 0) + extras.filter((e) => e.details.category === 'hotel').reduce((s, e) => s + num(e.details.price) * num(e.details.qty), 0);
  const need = paxSplit(num(head.adults), head.children_ages || [], 6, 12);
  const acc = accommodationSummary(lines.map((l) => l.details), nights, start, need);
  const sumRows = acc.map((r) => ({ key: r.night, date: r.date ? dayName(r.date) : '', status: r.status,
    exp_a: need.adults, cfg_a: r.covered.adults, exp_c: need.children, cfg_c: r.covered.children, rooms: r.rooms }));
  const problems = acc.filter((r) => r.status !== 'complete').map((r) => {
    const label = nightLabel(r.night, start);
    if (r.status === 'missing') return `${label}: No hotel configured. Please add a hotel for this night.`;
    if (r.status === 'extra') return `${label}: ${r.message} – more beds than travellers (${need.adults + need.children}).`;
    const parts = [];
    if (r.covered.adults < need.adults) parts.push(`Expected ${need.adults} Adult${need.adults > 1 ? 's' : ''}, configured ${r.covered.adults}. (Missing ${need.adults - r.covered.adults})`);
    if (r.covered.adults + r.covered.children < need.adults + need.children && r.covered.children < need.children) parts.push(`Expected ${need.children} Child${need.children > 1 ? 'ren' : ''}, configured ${r.covered.children}.`);
    return `${label}: ${parts.join(' ') || r.message}`;
  });
  return (
    <Section id="q-hotels" title="Hotels" total={total} cur={cur}
      actions={<button className="btn secondary small" disabled={!free.length && lines.length > 0} onClick={() => onAdd(emptyHotel(free.length ? [free[0]] : [1]))}>+ Add Hotel</button>}>
      {lines.length === 0 && <div className="empty">No hotel yet. <button className="btn small" onClick={() => onAdd(emptyHotel(nights ? [1] : []))}>+ Add Hotel</button></div>}
      {lines.map((l, idx) => (
        <HotelRow key={l.key} line={l} index={idx} head={head} cur={cur} showCost={showCost} taken={[...covered]}
          canNext={free.length > 0 && lastNight(l) < nights}
          onChange={(patch) => onChange(l.key, patch)} onRemove={() => onRemove(l.key)}
          onNext={() => { const n = free.find((k) => k > lastNight(l)) ?? free[0]; onAdd(emptyHotel([n])); }}
          onDuplicate={() => { const n = lastNight(l) + 1; onAdd({ ...l.details, nights: n <= nights ? [n] : [], prices: [] }, l.meta); }}
          onSimilar={() => onAdd(emptyHotel([...l.details.nights]))} />
      ))}
      {nights > 0 && (lines.length > 0) && (
        <SummaryTable title={`Accommodation Summary${need.comp ? ` · ${need.comp} complimentary child(ren) not counted` : ''}`} kind="night" rows={sumRows} problems={problems}
          columns={[{ key: 'exp_a', label: 'Expected Adults' }, { key: 'cfg_a', label: 'Configured Adults' }, { key: 'exp_c', label: 'Expected Children' }, { key: 'cfg_c', label: 'Configured Children' }, { key: 'rooms', label: 'Rooms' }]} />
      )}
      <ExtrasEditor title="Any special inclusions in hotels" category="hotel" lines={extras} cur={cur} showCost={showCost} nightsTotal={nights} start={start}
        onAdd={onAddExtra} onChange={onChange} onRemove={onRemove} />
    </Section>
  );
}

function HotelRow({ line, index, head, cur, showCost, taken, canNext, onChange, onRemove, onNext, onDuplicate, onSimilar }) {
  const d = line.details; const meta = line.meta || {};
  const nights = Math.max(num(head.nights), 0);
  const opts = useOptions(['meal_plans', 'room_types']);
  const [popup, setPopup] = useState(null);
  const [warn, setWarn] = useState([]);
  const set = (patch) => onChange((l) => ({ details: { ...l.details, ...patch } }));
  const room = (meta.room_types || []).find((r) => (r.name || r) === d.room_type) || {};
  const lim = extraBedLimits(d, typeof room === 'object' ? room : {});
  const mealPlans = meta.meal_plans?.length ? meta.meal_plans : opts.meal_plans || [];
  const roomTypes = meta.room_types?.length ? meta.room_types.map((r) => r.name || r) : opts.room_types || [];

  // the hotel's own room types / meal plans when it is picked (or the line comes from an old quote)
  const picked = (rec) => {
    if (!rec) return;
    const x = rec.data || {};
    onChange((l) => ({
      meta: { ...l.meta, room_types: x.room_types || [], meal_plans: x.meal_plans || [], child_age_from: x.child_age_from, child_age_to: x.child_age_to, hotel_name: rec.name },
      details: { ...l.details, room_type: (x.room_types || []).some((r) => (r.name || r) === l.details.room_type) ? l.details.room_type : (x.room_types?.[0]?.name || x.room_types?.[0] || ''),
        meal_plan: (x.meal_plans || []).includes(l.details.meal_plan) ? l.details.meal_plan : (x.meal_plans?.[0] || l.details.meal_plan) },
    }));
  };
  useEffect(() => { if (d.hotel_id && !meta.room_types) api(`/lookup/hotel/${d.hotel_id}`).then((r) => picked(r.data)).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // keep extra beds inside the limits (AWEB and CWEB share the one extra bed of a room)
  useEffect(() => {
    const fix = {};
    if (num(d.aweb) > lim.aweb) fix.aweb = lim.aweb;
    if (num(d.cweb) > lim.cweb) fix.cweb = lim.cweb;
    if (num(d.cnb) > lim.cnb) fix.cnb = lim.cnb;
    if (Object.keys(fix).length) set(fix);
  }, [d.rooms, d.room_type, d.aweb, d.cweb, d.cnb]); // eslint-disable-line react-hooks/exhaustive-deps

  // system rates per night → prices; given prices typed by the user stay
  useDebounced(async () => {
    if (!d.hotel_id || !d.room_type || !d.meal_plan || !d.nights.length || !head.start_date) return;
    const dates = d.nights.map((k) => dateOf(head.start_date, k));
    try {
      const r = (await api('/rates/hotel/breakdown', { method: 'POST', body: { details: { hotel_id: d.hotel_id, room_type: d.room_type, meal_plan: d.meal_plan, pax_per_room: d.pax_per_room }, dates } })).data;
      setWarn(r.warnings || []);
      onChange((l) => {
        const old = new Map((l.details.prices || []).map((p) => [Number(p.night), p]));
        const prices = l.details.nights.map((k) => {
          const date = dateOf(head.start_date, k); const sys = r.dates[date] || {}; const o = old.get(Number(k));
          const cell = (c) => {
            const prev = o?.[c];
            const keep = prev?.edited;
            return { rate: sys[c]?.rate ?? null, given: keep ? prev.given : (sys[c]?.rate ?? null), buy: keep ? prev.buy : (sys[c]?.buy ?? null), edited: Boolean(keep) };
          };
          return { night: Number(k), date, room: cell('room'), aweb: cell('aweb'), cweb: cell('cweb'), cnb: cell('cnb'), closed: sys.closed || null };
        });
        return { details: { ...l.details, prices } };
      });
    } catch { /* look-up is a helper; prices can be typed */ }
  }, [d.hotel_id, d.room_type, d.meal_plan, d.pax_per_room, d.nights.join(','), head.start_date]);

  // nights without a price row yet (no start date / no rate) still need a row to type into
  const priceRows = d.nights.map((k) => (d.prices || []).find((p) => Number(p.night) === Number(k)) || { night: Number(k), date: dateOf(head.start_date, k), room: {}, aweb: {}, cweb: {}, cnb: {} });
  const openGiven = (p) => setPopup({
    night: p.night, date: p.date,
    rows: [
      { key: 'room', label: `Room (${d.pax_per_room}P)`, rate: p.room?.rate, given: p.room?.given, buy: p.room?.buy, qty: num(d.rooms) },
      ...['aweb', 'cweb', 'cnb'].filter((k) => num(d[k]) > 0).map((k) => ({ key: k, label: k.toUpperCase(), rate: p[k]?.rate, given: p[k]?.given, buy: p[k]?.buy, qty: num(d[k]) })),
    ],
  });
  const saveGiven = (rows, all) => {
    onChange((l) => {
      const apply = (p) => {
        const out = { ...p };
        for (const r of rows) out[r.key] = { ...(p[r.key] || {}), given: r.given, buy: r.buy, edited: true };
        return out;
      };
      const list = l.details.nights.map((k) => (l.details.prices || []).find((p) => Number(p.night) === Number(k)) || { night: Number(k), date: dateOf(head.start_date, k), room: {}, aweb: {}, cweb: {}, cnb: {} });
      return { details: { ...l.details, prices: list.map((p) => (all || Number(p.night) === Number(popup.night) ? apply(p) : p)) } };
    });
    setPopup(null);
  };
  const c = hotelCost(d);
  const allNights = Array.from({ length: nights }, (_, i) => i + 1);
  return (
    <div className={`q-row ${line.meta?.error ? 'has-error' : ''}`}>
      <div className="q-row-head">
        <span className="badge">Hotel {index + 1}</span>
        <label className="checkbox small"><input type="checkbox" checked={nights > 0 && d.nights.length === nights} onChange={(e) => set({ nights: e.target.checked ? allNights : d.nights.slice(0, 1) })} /> Same hotel & configuration for all nights</label>
        <span className="spacer" />
        <b>{money(c.cost, cur)}</b>
      </div>
      <div className="q-field"><label>Stay Nights *</label><SlotPicker kind="night" total={nights} start={head.start_date} value={d.nights} taken={taken} onChange={(v) => set({ nights: v })} /></div>
      <div className="q-grid">
        <div className="q-field w4"><label>Hotel *</label><RefPicker refType="hotel" value={d.hotel_id} onChange={(v) => set({ hotel_id: v, prices: [] })} onPicked={picked} placeholder="Search hotel" /></div>
        <div className="q-field w2"><label>Meal Plan *</label>
          <select value={d.meal_plan} onChange={(e) => set({ meal_plan: e.target.value })}><option value="">Select…</option>{mealPlans.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
        <div className="q-field w3"><label>Room Type *</label>
          <select value={d.room_type} onChange={(e) => set({ room_type: e.target.value })}><option value="">Select…</option>{roomTypes.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
        <div className="q-field w2"><label>Pax / room (w/o EB)</label>
          <select value={d.pax_per_room} onChange={(e) => set({ pax_per_room: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} pax</option>)}</select></div>
        <div className="q-field w1"><label>No. of rooms</label><Stepper value={d.rooms} min={1} max={50} onChange={(v) => set({ rooms: v })} /></div>
      </div>
      <div className="q-grid">
        <div className="q-field w2"><label title="Adult with extra bed">AWEB</label><Stepper value={d.aweb} max={lim.aweb} disabled={!lim.aweb && !num(d.aweb)} title={`Up to ${lim.aweb} (shares the extra bed with CWEB)`} onChange={(v) => set({ aweb: v })} /></div>
        <div className="q-field w2"><label title="Child with extra bed">CWEB</label><Stepper value={d.cweb} max={lim.cweb} disabled={!lim.cweb && !num(d.cweb)} title={`Up to ${lim.cweb} (shares the extra bed with AWEB)`} onChange={(v) => set({ cweb: v })} /></div>
        <div className="q-field w2"><label title="Child without bed">CNB</label><Stepper value={d.cnb} max={lim.cnb} onChange={(v) => set({ cnb: v })} /></div>
        <div className="q-field w3"><label>Comp. child (upto {Math.max(num(meta.child_age_from || 6) - 1, 0)}y)</label><Stepper value={d.comp} max={10} onChange={(v) => set({ comp: v })} /></div>
        <div className="q-field w3 muted small" style={{ alignSelf: 'end' }}>{num(d.rooms) * num(d.pax_per_room) + num(d.aweb)} adult bed(s) · {num(d.cweb) + num(d.cnb)} child(ren){num(d.comp) ? ` · ${d.comp} comp.` : ''}</div>
      </div>

      <div className="q-prices">
        <table className="q-table">
          <thead><tr><th>Night</th><th className="r">Room × {num(d.rooms)}</th>{num(d.aweb) > 0 && <th className="r">AWEB × {d.aweb}</th>}{num(d.cweb) > 0 && <th className="r">CWEB × {d.cweb}</th>}{num(d.cnb) > 0 && <th className="r">CNB × {d.cnb}</th>}<th className="r">Rate</th><th className="r">Given</th></tr></thead>
          <tbody>
            {priceRows.map((p) => {
              const rate = r2(num(p.room?.rate) * num(d.rooms) + ['aweb', 'cweb', 'cnb'].reduce((s, k) => s + num(p[k]?.rate) * num(d[k]), 0));
              const given = hotelNightTotal(d, p, 'given');
              const cellTxt = (k) => (has(p[k]?.given) ? money(p[k].given, cur) : has(p[k]?.rate) ? money(p[k].rate, cur) : '—');
              return (
                <tr key={p.night} className={p.closed ? 'warn-row' : ''}>
                  <td className="nowrap">{nightLabel(p.night)} {p.date && <span className="muted small">{dayName(p.date)}</span>}{p.closed && <span className="badge warn" style={{ marginLeft: 4 }}>{p.closed}</span>}</td>
                  <td className="r">{cellTxt('room')}</td>
                  {num(d.aweb) > 0 && <td className="r">{cellTxt('aweb')}</td>}
                  {num(d.cweb) > 0 && <td className="r">{cellTxt('cweb')}</td>}
                  {num(d.cnb) > 0 && <td className="r">{cellTxt('cnb')}</td>}
                  <td className="r muted">{rate ? money(rate, cur) : '—'}</td>
                  <td className="r"><button className={`btn small ${given ? 'secondary' : ''}`} onClick={() => openGiven(p)}>{given ? money(given, cur) : 'Enter price'} ✎</button></td>
                </tr>
              );
            })}
            {!priceRows.length && <tr><td colSpan={7} className="muted small">Choose the stay night(s) to see prices.</td></tr>}
          </tbody>
          {priceRows.length > 0 && <tfoot><tr><td colSpan={2 + ['aweb', 'cweb', 'cnb'].filter((k) => num(d[k]) > 0).length + 1} className="r">Total for {d.nights.length} night(s){showCost && c.buy_cost !== c.cost ? <span className="muted"> · buying {money(c.buy_cost, cur)}</span> : null}</td><td className="r"><b>{money(c.cost, cur)}</b></td></tr></tfoot>}
        </table>
        {warn.length > 0 && <div className="alert warn small mt">{warn.slice(0, 4).join(' · ')}{warn.length > 4 ? ` +${warn.length - 4} more` : ''}</div>}
        {!head.start_date && <div className="muted small mt">Add the start date to load prices from the hotel's season rates; you can still type the given prices.</div>}
      </div>

      <LineError line={line} />
      <div className="q-row-actions">
        <button className="btn secondary small" disabled={!canNext} title={canNext ? 'Empty row for the next night' : 'All nights have a hotel'} onClick={onNext}>Next Night</button>
        <button className="btn secondary small" onClick={onDuplicate} title="Same hotel and rooms for the next night">Duplicate</button>
        <button className="btn secondary small" onClick={onSimilar} title="Another room / hotel for the same night(s)">Add Similar</button>
        <span className="spacer" />
        <button className="btn remove small" onClick={onRemove}>Remove</button>
      </div>
      {popup && <GivenPriceModal title={`Given Price – ${popup.date ? dayName(popup.date) : nightLabel(popup.night)}`} rows={popup.rows} cur={cur} showCost={showCost}
        applyLabel={d.nights.length > 1 ? 'Apply these prices to all nights of this hotel' : null} onClose={() => setPopup(null)} onSave={saveGiven} />}
    </div>
  );
}
