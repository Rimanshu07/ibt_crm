import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ENQUIRY_SERVICES, TRIP_STAGES } from '@shared/catalog.js';
import { api, qs, money, fmtDateTime, ago } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Loading, PageHeader, Pagination, Tabs } from '../../core/ui.jsx';
import { RefPicker } from '../../core/forms.jsx';
import { StageBadge, ServiceChips, TripForm, tripDates, tripPax, useStaff } from './common.jsx';

/** Trips — Sembark style: stage tabs with counts, filters, rich rows. */
export default function TripsList() {
  const { me, can, hasFeature } = useAuth();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const staff = useStaff();
  const f = Object.fromEntries(params.entries());
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(f.new === '1');
  const [showFilters, setShowFilters] = useState(false);
  const set = (patch) => setParams(Object.fromEntries(Object.entries({ ...f, page: 1, ...patch, new: undefined }).filter(([, v]) => v !== undefined && v !== '' && v !== null)));
  useEffect(() => {
    setData(null);
    const t = setTimeout(() => api(`/trips${qs({ ...f, new: undefined })}`).then(setData).catch(() => setData({ data: [], total: 0, counts: {} })), 200);
    return () => clearTimeout(t);
  }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = me.org.base_currency;
  const total = data ? Object.values(data.counts).reduce((s, n) => s + n, 0) : null;
  const active = ['destination', 'service', 'source', 'user', 'from', 'to', 'created_from', 'created_to', 'tag', 'followup'].filter((k) => f[k]).length;

  return (
    <>
      <PageHeader title="Trips" subtitle="Enquiries, quotes and converted trips"
        actions={<>
          <input placeholder="Search guest, phone, trip no." value={f.q || ''} onChange={(e) => set({ q: e.target.value })} style={{ width: 260 }} />
          <button className="btn secondary" onClick={() => setShowFilters((s) => !s)}>Filters{active ? ` (${active})` : ''}</button>
          {can('trips.create') && <button className="btn" onClick={() => setAdding(true)}>+ Add Trip</button>}
        </>} />
      {showFilters && (
        <div className="filters grid grid-4">
          <label className="field"><span className="small">Destination</span><RefPicker refType="destination" value={f.destination ? Number(f.destination) : null} onChange={(v) => set({ destination: v || '' })} /></label>
          <label className="field"><span className="small">Service</span>
            <select value={f.service || ''} onChange={(e) => set({ service: e.target.value })}><option value="">Any</option>{ENQUIRY_SERVICES.filter((s) => !s.feature || hasFeature(s.feature)).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
          <label className="field"><span className="small">Trip source</span><RefPicker refType="trip_source" value={f.source ? Number(f.source) : null} onChange={(v) => set({ source: v || '' })} /></label>
          <label className="field"><span className="small">Team member</span>
            <select value={f.user || ''} onChange={(e) => set({ user: e.target.value })}><option value="">Anyone</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="field"><span className="small">Start date from</span><input type="date" value={f.from || ''} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="field"><span className="small">Start date to</span><input type="date" value={f.to || ''} onChange={(e) => set({ to: e.target.value })} /></label>
          <label className="field"><span className="small">Created from</span><input type="date" value={f.created_from || ''} onChange={(e) => set({ created_from: e.target.value })} /></label>
          <label className="field"><span className="small">Follow-ups</span>
            <select value={f.followup || ''} onChange={(e) => set({ followup: e.target.value })}><option value="">Any</option><option value="today">Due today</option><option value="overdue">Overdue</option></select></label>
          <div className="row span-all"><label className="checkbox"><input type="checkbox" checked={f.mine === '1'} onChange={(e) => set({ mine: e.target.checked ? '1' : '' })} /> Only my trips</label>
            <span className="spacer" /><select value={f.sort || ''} onChange={(e) => set({ sort: e.target.value })} style={{ width: 220 }}>
              <option value="">Newest enquiries first</option><option value="start">Travel date (soonest)</option><option value="start_desc">Travel date (latest)</option><option value="updated">Recently updated</option></select>
            <button className="btn ghost" onClick={() => setParams({})}>Reset filters</button></div>
        </div>
      )}
      <div className="card flush">
        <div style={{ padding: '0 12px' }}>
          <Tabs value={f.stage || ''} onChange={(k) => set({ stage: k })}
            tabs={[{ key: '', label: 'All', count: total }, ...TRIP_STAGES.map((s) => ({ key: s.key, label: s.label, count: data?.counts[s.key] || 0 }))]} />
        </div>
        {!data ? <Loading /> : data.data.length === 0 ? <Empty>No trips here. {can('trips.create') && <button className="btn link" onClick={() => setAdding(true)}>Add an enquiry</button>}</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Trip</th><th>Guest</th><th>Destination & services</th><th>Travel</th><th className="num">Quote / Package</th><th>Team</th><th>Next follow-up</th><th>Stage</th></tr></thead>
              <tbody>{data.data.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => nav(`/app/trips/${t.id}`)}>
                  <td className="nowrap"><strong>#{t.trip_no}</strong><div className="muted small">{ago(t.created_at)}</div>{t.ref_id && <div className="muted small">Ref {t.ref_id}</div>}</td>
                  <td><strong>{t.guest_salutation} {t.guest_name}</strong><div className="muted small">{t.guest_phone}{t.guest_city ? ` · ${t.guest_city}` : ''}</div>{t.source_name && <div className="small">via {t.source_name}</div>}</td>
                  <td>{t.destinations && <div>{t.destinations}</div>}<ServiceChips services={t.services} />{t.tags.length > 0 && <div className="muted small">#{t.tags.join(' #')}</div>}</td>
                  <td className="nowrap">{tripDates(t)}<div className="muted small">{tripPax(t)}</div></td>
                  <td className="num">{t.package_amount ? money(t.package_amount, t.currency || cur) : '—'}<div className="muted small">{t.quote_count ? `${t.quote_count} quote${t.quote_count > 1 ? 's' : ''}` : 'No quote'}</div>
                    {Number(t.due_in) > 0 && <div className="small" style={{ color: 'var(--bad)' }}>Due {money(t.due_in, cur)}</div>}</td>
                  <td className="small">{t.sales_name || '—'}</td>
                  <td className="small nowrap" style={{ color: t.next_task_at && new Date(t.next_task_at.replace(' ', 'T')) < new Date() ? 'var(--bad)' : undefined }}>{t.next_task_at ? fmtDateTime(t.next_task_at) : '—'}</td>
                  <td><StageBadge stage={t.stage} />{t.stage_reason && <div className="muted small">{t.stage_reason}</div>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} size={data.size} total={data.total} onChange={(p) => setParams({ ...f, page: p })} /></div>}
      </div>
      {adding && <TripForm onClose={() => setAdding(false)} onSaved={(id) => nav(`/app/trips/${id}`)} />}
    </>
  );
}
