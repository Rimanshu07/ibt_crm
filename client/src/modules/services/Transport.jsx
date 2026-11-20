import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs, fmtDate } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Field, FormError, Input, Loading, Modal, PageHeader, Pagination, useForm, useToast } from '../../core/ui.jsx';
import { CreatableSelect } from '../../core/forms.jsx';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Transport() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(params.entries());
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const set = (p) => setParams(Object.fromEntries(Object.entries({ ...f, page: 1, ...p }).filter(([, v]) => v)));
  const load = () => api(`/transport${qs(f)}`).then(setData);
  useEffect(() => { setData(null); const t = setTimeout(load, 200); return () => clearTimeout(t); }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <PageHeader title="Transport Services" subtitle="Pickups, transfers and sightseeing between places. Prices per cab type come from Transport Prices."
        actions={<>
          <input placeholder="Search place, service, duty code" value={f.q || ''} onChange={(e) => set({ q: e.target.value })} style={{ width: 260 }} />
          <select value={f.status || ''} onChange={(e) => set({ status: e.target.value })} style={{ width: 120 }}><option value="">Active</option><option value="disabled">Disabled</option><option value="all">All</option></select>
          <Link className="btn secondary" to="/app/services/prices/transport">Prices</Link>
          {can('masters.manage') && <button className="btn" onClick={() => setEditing({})}>Add New</button>}
        </>} />
      <div className="card flush">
        {!data ? <Loading /> : data.data.length === 0 ? <Empty>No transport services. Add one or <Link to="/app/services/prices/transport/upload">upload a price sheet</Link>.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Duty</th><th>From (A)</th><th>To (B)</th><th>Service</th><th>Distance / time</th><th>Cab types priced</th><th>Rate validity</th><th>Closed</th></tr></thead>
            <tbody>{data.data.map((s) => (
              <tr key={s.id} className={`clickable ${s.is_active ? '' : 'muted-row'}`} onClick={() => can('masters.manage') && setEditing(s)}>
                <td>{s.duty_code || '—'}</td><td>{s.from_location}{s.from_short && <div className="muted small">{s.from_short}</div>}</td>
                <td>{s.to_location || '—'}{s.to_short && <div className="muted small">{s.to_short}</div>}</td>
                <td>{s.service}{s.code && <div className="muted small">[[{s.code}]]</div>}</td>
                <td className="small">{s.distance_km ? `${s.distance_km} km` : '—'}{s.duration_mins ? ` · ${Math.round(s.duration_mins / 6) / 10} h` : ''}{s.start_time && <div className="muted">starts {s.start_time}</div>}</td>
                <td className="small">{s.cab_types || <span className="badge warn">No prices</span>}</td>
                <td className="small">{s.rate_to ? fmtDate(s.rate_to) : '—'}</td>
                <td className="small">{[s.closing_weekdays, ...(s.closing_dates || []).map((c) => `${c.from}${c.to !== c.from ? `→${c.to}` : ''}`)].filter(Boolean).join(', ') || '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} size={data.size} total={data.total} onChange={(p) => setParams({ ...f, page: p })} /></div>}
      </div>
      {editing && <ServiceDialog service={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function ServiceDialog({ service, onClose, onSaved }) {
  const toast = useToast();
  const f = useForm({
    from_location: '', service: 'Transfer', closing_dates: [], ...service,
    ...Object.fromEntries(['duty_code', 'from_short', 'to_location', 'to_short', 'code', 'start_time', 'day_schedule', 'closing_weekdays', 'distance_km', 'duration_mins'].map((k) => [k, service[k] ?? ''])),
  });
  const v = f.values;
  const days = v.closing_weekdays ? v.closing_weekdays.split(',') : [];
  const save = () => f.submit(async (val) => {
    const body = Object.fromEntries(['duty_code', 'from_location', 'from_short', 'to_location', 'to_short', 'service', 'code', 'distance_km', 'start_time', 'duration_mins', 'day_schedule', 'closing_weekdays', 'closing_dates'].map((k) => [k, val[k]]));
    const r = await api(service.id ? `/transport/${service.id}` : '/transport', { method: service.id ? 'PUT' : 'POST', body }); toast(r.message); onSaved();
  });
  const toggleActive = async () => { const r = await api(`/transport/${service.id}/active`, { method: 'PUT', body: { active: !service.is_active } }); toast(r.message); onSaved(); };
  return (
    <Modal wide title={service.id ? 'Edit transport service' : 'New transport service'} onClose={onClose}
      footer={<>{service.id && <button className="btn secondary" onClick={toggleActive}>{service.is_active ? 'Disable' : 'Enable'}</button>}<span className="spacer" /><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={f.busy} onClick={save}>Save</button></>}>
      <FormError errors={f.errors} />
      <div className="grid grid-4">
        <Input label="Duty code" value={v.duty_code} onChange={f.set('duty_code')} hint="e.g. 101" />
        <Field label="From (A) *" className="span-2" error={f.errors.from_location}><CreatableSelect list="cities" value={v.from_location || null} onChange={(x) => f.set('from_location')(x || '')} /></Field>
        <Input label="A short name" value={v.from_short} onChange={f.set('from_short')} hint="Shown on the cab calendar" />
        <Field label="To (B)" className="span-2"><CreatableSelect list="cities" value={v.to_location || null} onChange={(x) => f.set('to_location')(x || '')} /></Field>
        <Input label="B short name" value={v.to_short} onChange={f.set('to_short')} />
        <Field label="Service *" error={f.errors.service}><CreatableSelect list="transport_services" value={v.service} onChange={(x) => f.set('service')(x || '')} /></Field>
        <Input label="Distance (km)" type="number" value={v.distance_km} onChange={f.set('distance_km')} />
        <Input label="Start time" type="time" value={v.start_time} onChange={f.set('start_time')} />
        <Input label="Duration (mins)" type="number" value={v.duration_mins} onChange={f.set('duration_mins')} />
        <Input label="Internal code" value={v.code} onChange={f.set('code')} hint="Never shared with customers" />
        <Field label="Day schedule (added to the itinerary)" className="span-all"><textarea rows={4} value={v.day_schedule} onChange={(e) => f.set('day_schedule')(e.target.value)} /></Field>
        <Field label="Closed on" className="span-all"><div className="chips">{DAYS.map((d) => <span key={d} className={`chip ${days.includes(d) ? 'on' : ''}`} onClick={() => f.set('closing_weekdays')((days.includes(d) ? days.filter((x) => x !== d) : [...days, d]).join(','))}>{d}</span>)}</div></Field>
        <div className="span-all">{v.closing_dates.map((c, i) => (
          <div key={i} className="row mb"><span className="small">Closed</span><input type="date" value={c.from} onChange={(e) => f.set('closing_dates')(v.closing_dates.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)))} style={{ width: 160 }} />
            <span>to</span><input type="date" value={c.to} onChange={(e) => f.set('closing_dates')(v.closing_dates.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)))} style={{ width: 160 }} />
            <button className="icon-btn" onClick={() => f.set('closing_dates')(v.closing_dates.filter((_, k) => k !== i))}>✕</button></div>
        ))}<button className="btn link" onClick={() => f.set('closing_dates')([...v.closing_dates, { from: '', to: '' }])}>+ Add closing dates</button></div>
      </div>
    </Modal>
  );
}
