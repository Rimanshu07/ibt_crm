import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs, fmtDate } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Field, FormError, Input, Loading, Modal, PageHeader, Pagination, useForm, useToast } from '../../core/ui.jsx';
import { CreatableSelect } from '../../core/forms.jsx';

export default function Activities() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(params.entries());
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const set = (p) => setParams(Object.fromEntries(Object.entries({ ...f, page: 1, ...p }).filter(([, v]) => v)));
  const load = () => api(`/activities${qs(f)}`).then(setData);
  useEffect(() => { setData(null); const t = setTimeout(load, 200); return () => clearTimeout(t); }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <PageHeader title="Travel Activities" subtitle="Sightseeing, tickets, ferries and experiences with their ticket types"
        actions={<>
          <input placeholder="Search activity or city" value={f.q || ''} onChange={(e) => set({ q: e.target.value })} style={{ width: 240 }} />
          <Link className="btn secondary" to="/app/services/prices/activity">Prices</Link>
          {can('masters.manage') && <button className="btn" onClick={() => setEditing({ services: [] })}>Add New</button>}
        </>} />
      <div className="card flush">
        {!data ? <Loading /> : data.data.length === 0 ? <Empty>No activities yet. Add one or <Link to="/app/services/prices/activity/upload">upload a price sheet</Link>.</Empty> : (
          <table>
            <thead><tr><th>Activity</th><th>Ticket types / services</th><th>Timings</th><th>Rate validity</th></tr></thead>
            <tbody>{data.data.map((a) => (
              <tr key={a.id} className={`clickable ${a.is_active ? '' : 'muted-row'}`} onClick={() => can('masters.manage') && api(`/activities/${a.id}`).then((r) => setEditing(r.data))}>
                <td><strong>{a.name}</strong><div className="muted small">{a.city || '—'} · {a.entry_method === 'upload' ? 'Uploaded' : 'Manual'}</div></td>
                <td>{(a.services || []).filter((s) => s.is_active).map((s) => <div key={s.id}>{s.name}{s.code && <span className="muted small"> [[{s.code}]]</span>}</div>)}</td>
                <td className="small">{(a.services || []).filter((s) => s.is_active).map((s) => <div key={s.id}>{s.open_time ? `${s.open_time}–${s.close_time || ''}` : '—'}{s.slots ? ` · slots ${s.slots}` : ''}{s.closing_weekdays ? ` · closed ${s.closing_weekdays}` : ''}</div>)}</td>
                <td className="small">{(a.services || []).map((s) => <div key={s.id}>{s.rate_to ? fmtDate(s.rate_to) : <span className="badge warn">No prices</span>}</div>)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} size={data.size} total={data.total} onChange={(p) => setParams({ ...f, page: p })} /></div>}
      </div>
      {editing && <ActivityDialog activity={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

const blankSvc = () => ({ name: '', code: '', description: '', open_time: '', close_time: '', duration_mins: '', slots: '', child_age_from: 6, child_age_to: 12, closing_weekdays: '', closing_dates: [], is_active: true });

function ActivityDialog({ activity, onClose, onSaved }) {
  const toast = useToast();
  const f = useForm({ name: activity.name || '', city: activity.city || '', description: activity.description || '',
    services: activity.services?.length ? activity.services.filter((s) => s.is_active).map((s) => ({ ...blankSvc(), ...Object.fromEntries(Object.entries(s).map(([k, x]) => [k, x ?? ''])), closing_dates: s.closing_dates || [] })) : [blankSvc()] });
  const v = f.values;
  const setSvc = (i, patch) => f.set('services')(v.services.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const save = () => f.submit(async (val) => { const r = await api(activity.id ? `/activities/${activity.id}` : '/activities', { method: activity.id ? 'PUT' : 'POST', body: val }); toast(r.message); onSaved(); });
  const toggleActive = async () => { const r = await api(`/activities/${activity.id}/active`, { method: 'PUT', body: { active: !activity.is_active } }); toast(r.message); onSaved(); };
  return (
    <Modal xwide title={activity.id ? `Edit ${activity.name}` : 'New activity'} onClose={onClose}
      footer={<>{activity.id && <button className="btn secondary" onClick={toggleActive}>{activity.is_active ? 'Disable' : 'Enable'}</button>}<span className="spacer" /><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={f.busy} onClick={save}>Save</button></>}>
      <FormError errors={f.errors} />
      <div className="grid grid-3">
        <Input label="Activity name *" value={v.name} onChange={f.set('name')} error={f.errors.name} />
        <Field label="City"><CreatableSelect list="cities" value={v.city || null} onChange={(x) => f.set('city')(x || '')} /></Field>
        <Input label="Short description" value={v.description} onChange={f.set('description')} />
      </div>
      <h3 className="mt">Ticket types / services</h3>
      {v.services.map((s, i) => (
        <div key={i} className="svc-block"><div className="svc-line">
          <Field label="Name *" className="w3"><input value={s.name} onChange={(e) => setSvc(i, { name: e.target.value })} placeholder="e.g. Premium ferry, Entry ticket" /></Field>
          <Field label="Opens" className="w1"><input type="time" value={s.open_time} onChange={(e) => setSvc(i, { open_time: e.target.value })} /></Field>
          <Field label="Closes" className="w1"><input type="time" value={s.close_time} onChange={(e) => setSvc(i, { close_time: e.target.value })} /></Field>
          <Field label="Duration (min)" className="w1"><input type="number" value={s.duration_mins} onChange={(e) => setSvc(i, { duration_mins: e.target.value })} /></Field>
          <Field label="Slots" className="w2" hint="08:00,10:45"><input value={s.slots} onChange={(e) => setSvc(i, { slots: e.target.value })} /></Field>
          <Field label="Child age" className="w2"><div className="row"><input type="number" value={s.child_age_from} onChange={(e) => setSvc(i, { child_age_from: e.target.value })} />–<input type="number" value={s.child_age_to} onChange={(e) => setSvc(i, { child_age_to: e.target.value })} /></div></Field>
          <Field label="Closed on" className="w2" hint="Mon,Tue"><input value={s.closing_weekdays} onChange={(e) => setSvc(i, { closing_weekdays: e.target.value })} /></Field>
          <Field label="Description (itinerary)" className="w6"><input value={s.description} onChange={(e) => setSvc(i, { description: e.target.value })} /></Field>
          <Field label="Internal code" className="w2"><input value={s.code} onChange={(e) => setSvc(i, { code: e.target.value })} /></Field>
          <div className="w1"><button className="icon-btn" onClick={() => f.set('services')(v.services.filter((_, k) => k !== i))}>🗑</button></div>
        </div></div>
      ))}
      <button className="btn secondary small" onClick={() => f.set('services')([...v.services, blankSvc()])}>+ Add ticket type</button>
    </Modal>
  );
}
