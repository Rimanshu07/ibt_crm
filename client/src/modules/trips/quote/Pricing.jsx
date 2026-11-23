import { SERVICES } from '@shared/catalog.js';
import { addDaysIso, fmtDay, money } from '../../../core/api.js';
import { Field, Select } from '../../../core/ui.jsx';

/* ------------------------------ Pricing card ------------------------------ */
export function PricingCard({ pricing, setPricing, priced, taxes, cur, pax, showCost, services }) {
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
        {onGenerate && <button className="btn secondary small" onClick={onGenerate}>Generate day-wise plan from services</button>}
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
