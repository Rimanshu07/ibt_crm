import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SERVICES } from '@shared/catalog.js';
import { api, money, todayIso } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Check, Field, PageHeader } from '../../core/ui.jsx';
import { FieldInput, defaults } from '../../core/forms.jsx';
import { PRICE_TITLES } from './Prices.jsx';

const FIELDS = (s) => SERVICES[s].quoteFields.filter((f) => !['day'].includes(f.key));

/** Price calculator: enter the configuration, get the price (selling or booking). */
export default function Calculator() {
  const { service } = useParams();
  const [params] = useSearchParams();
  const { me } = useAuth();
  const blank = () => ({ date: todayIso(), details: { ...defaults(FIELDS(service)), ...(params.get('hotel_id') ? { hotel_id: Number(params.get('hotel_id')) } : {}) }, result: null, meta: {} });
  const [rows, setRows] = useState([blank()]);
  const [booking, setBooking] = useState(false);
  const set = (i, patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const calc = async (i) => {
    const r = rows[i];
    try { const res = await api(`/rates/${service}/calculate`, { method: 'POST', body: { date: r.date, details: r.details } }); set(i, { result: res.data }); }
    catch (e) { set(i, { result: { cost: null, note: e.message } }); }
  };
  const val = (r) => (r.result ? (booking ? r.result.buy_cost : r.result.cost) : null);
  const total = rows.reduce((s, r) => s + (Number(val(r)) || 0), 0);
  const cur = me.org.base_currency;
  return (
    <>
      <PageHeader crumbs={<><Link to={`/app/services/prices/${service}`}>{PRICE_TITLES[service]}</Link> › Calculator</>} title="Calculate Price"
        subtitle="Enter the configuration to get the current rates" actions={<Check checked={booking} onChange={setBooking}>Show Booking Prices</Check>} />
      {rows.map((r, i) => (
        <div key={i} className="card">
          <div className="layout-side">
            <div className="grid grid-4">
              <Field label={service === 'hotel' ? 'Check-in date' : 'Date'}><input type="date" value={r.date} onChange={(e) => set(i, { date: e.target.value, result: null })} /></Field>
              {FIELDS(service).map((f) => (
                <Field key={f.key} label={f.label} className={f.width >= 3 ? 'span-2' : ''}>
                  <FieldInput field={f} value={r.details[f.key]} onChange={(v) => set(i, { details: { ...r.details, [f.key]: v }, result: null })}
                    suggestions={f.key === 'room_type' ? (r.meta.room_types || []).map((x) => x.name) : f.key === 'cab_type' ? r.meta.cab_types || [] : []}
                    onPicked={(rec) => set(i, { meta: rec?.data || {} })} />
                </Field>
              ))}
            </div>
            <div className="price-box">
              <div className="row-between"><strong>Prices</strong><button className="btn small" onClick={() => calc(i)}>Get Prices</button></div>
              {!r.result ? <p className="muted small mt">Please fill all required details</p> : r.result.cost === null ? <p className="small mt" style={{ color: 'var(--bad)' }}>{r.result.note}</p> : (
                <div className="mt">
                  <div className="price-row total"><span>{booking ? 'Booking price' : 'Selling price'}</span><span>{money(val(r), cur, 2)}</span></div>
                  <div className="muted small">{r.result.note}</div>
                  {r.result.breakdown?.map((b) => <div key={b.date} className="price-row small"><span>{b.date} {b.day}</span><span>{b[booking ? 'ops' : 'sales'] ? money(b[booking ? 'ops' : 'sales'].total, cur) : 'no price'}</span></div>)}
                  {r.result.warnings?.map((w) => <div key={w} className="badge warn mt">⚠ {w}</div>)}
                </div>
              )}
              <div className="row mt"><button className="btn ghost small" onClick={() => setRows([...rows, { ...r, result: null }])}>⧉ Duplicate</button>{rows.length > 1 && <button className="btn ghost small" onClick={() => setRows(rows.filter((_, k) => k !== i))}>✕ Remove</button>}</div>
            </div>
          </div>
        </div>
      ))}
      <div className="row-between"><button className="btn secondary" onClick={() => setRows([...rows, blank()])}>+ Add another</button>
        <div className="kpi" style={{ background: '#fff7d6' }}><span className="stat-value">Total Price: {total ? money(total, cur, 2) : 'N/A'}</span></div></div>
    </>
  );
}
