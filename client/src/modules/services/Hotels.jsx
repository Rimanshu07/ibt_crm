import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs, fmtDate, ago } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Field, Loading, Modal, PageHeader, Pagination, useConfirm, useToast } from '../../core/ui.jsx';
import { CreatableSelect, RefPicker } from '../../core/forms.jsx';
import OptionListDialog from './OptionListDialog.jsx';

/** Hotels — Sembark style list with advanced filters. */
export default function Hotels() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(params.entries());
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(null);
  const set = (patch) => setParams(Object.fromEntries(Object.entries({ ...f, page: 1, ...patch }).filter(([, v]) => v)));
  useEffect(() => { setData(null); const t = setTimeout(() => api(`/hotels${qs(f)}`).then(setData), 200); return () => clearTimeout(t); }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = ['city', 'star', 'meal_plan', 'room_type', 'group', 'entry_method', 'updated_from', 'expiring_before', 'no_rates', 'status'].filter((k) => f[k]).length;
  const edit = can('masters.manage');
  return (
    <>
      <PageHeader title="Hotels" actions={<>
        <input placeholder="Search hotel, city, group…" value={f.q || ''} onChange={(e) => set({ q: e.target.value })} style={{ width: 280 }} />
        <button className="btn secondary" onClick={() => setFilters((x) => !x)}>⚙ Filters{active ? ` (${active})` : ''}</button>
        {edit && <Link className="btn" to="/app/services/hotels/new">Add New</Link>}
        <div className="nav-item"><button className="btn secondary" onClick={() => setMenu((m) => !m)}>⋮</button>
          {menu && <div className="menu right" onMouseLeave={() => setMenu(false)}>
            <button onClick={() => setDialog('hotel_groups')}>Hotel Groups</button>
            <button onClick={() => setDialog('meal_plans')}>Meal Plans</button>
            <button onClick={() => setDialog('room_types')}>Room Types</button>
            <Link to="/app/organization?tab=supplier-prefs">Payment Preferences</Link>
            <Link to="/app/organization?tab=content">General Hotel Notes / Inclusions</Link>
            <hr /><Link to="/app/services/prices/hotel">Hotel Prices</Link><Link to="/app/services/prices/hotel/upload">Upload Prices</Link>
            {edit && <button onClick={() => setDialog('merge')}>Merge Hotels</button>}
          </div>}
        </div>
      </>} />
      <div className={filters ? 'layout-side' : ''}>
        <div className="card flush">
          {!data ? <Loading /> : data.data.length === 0 ? <Empty>No hotels found. {edit && <>Add one or <Link to="/app/services/prices/hotel/upload">upload a price sheet</Link> – hotels are created automatically.</>}</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Name</th><th>Meal Plans</th><th>Room Type</th><th>Check-In/Out</th><th>Rate Validity</th><th>Child EB Age</th><th>Payment Preference</th></tr></thead>
              <tbody>{data.data.map((h) => (
                <tr key={h.id} className={`clickable ${h.is_active ? '' : 'muted-row'}`} onClick={() => nav(`/app/services/hotels/${h.id}`)}>
                  <td><strong>{h.name}</strong><div className="muted small">{h.city}{h.star ? ` · ${h.star}${/^\d$/.test(h.star) ? '★' : ''}` : ''} · {h.entry_method === 'upload' ? '⇪ Uploaded' : '✎ Manual'}{h.group_name ? ` · ${h.group_name}` : ''}</div></td>
                  <td>{h.meal_plans.join(' • ')}</td>
                  <td>{h.room_types.slice(0, 2).map((r) => <div key={r.name}>{r.name}</div>)}{h.room_types.length > 2 && <span className="muted small">+{h.room_types.length - 2} more</span>}</td>
                  <td className="nowrap">{h.checkin_time} – {h.checkout_time} hrs</td>
                  <td className="nowrap">{h.rate_to ? <>{h.rate_from ? fmtDate(h.rate_from) : ''} → {fmtDate(h.rate_to)}{h.rate_to < new Date().toISOString().slice(0, 10) && <div><span className="badge bad">Expired</span></div>}</> : <span className="badge warn">No prices</span>}</td>
                  <td>{h.child_age_from}-{h.child_age_to}yo</td>
                  <td className="small">{h.payment_pref || 'N/A'}{h.supplier_name && <div className="muted">via {h.supplier_name}</div>}<div className="muted">{h.updated_by_name} · {ago(h.updated_at)}</div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} size={data.size} total={data.total} onChange={(p) => setParams({ ...f, page: p })} /></div>}
        </div>
        {filters && (
          <div className="filters stack">
            <div className="row-between"><strong>Advanced Filters</strong><button className="icon-btn" onClick={() => setFilters(false)}>✕</button></div>
            <Field label="Destination / city"><CreatableSelect list="cities" value={f.city || null} onChange={(v) => set({ city: v })} /></Field>
            <Field label="Room type"><CreatableSelect list="room_types" value={f.room_type || null} onChange={(v) => set({ room_type: v })} /></Field>
            <Field label="Meal plan"><CreatableSelect list="meal_plans" value={f.meal_plan || null} onChange={(v) => set({ meal_plan: v })} /></Field>
            <Field label="Star category"><CreatableSelect list="stars" value={f.star || null} onChange={(v) => set({ star: v })} /></Field>
            <Field label="Hotel group"><CreatableSelect list="hotel_groups" value={f.group || null} onChange={(v) => set({ group: v })} /></Field>
            <Field label="Last updated from"><input type="date" value={f.updated_from || ''} onChange={(e) => set({ updated_from: e.target.value })} /></Field>
            <Field label="Entry method"><select value={f.entry_method || ''} onChange={(e) => set({ entry_method: e.target.value })}><option value="">Any</option><option value="manual">Added manually</option><option value="upload">Uploaded</option></select></Field>
            <Field label="Rate expiring before"><input type="date" value={f.expiring_before || ''} onChange={(e) => set({ expiring_before: e.target.value })} /></Field>
            <label className="checkbox"><input type="checkbox" checked={f.no_rates === '1'} onChange={(e) => set({ no_rates: e.target.checked ? '1' : '' })} /> No current prices</label>
            <Field label="Status"><select value={f.status || ''} onChange={(e) => set({ status: e.target.value })}><option value="">Active</option><option value="disabled">Disabled</option><option value="all">All</option></select></Field>
            <button className="btn secondary" onClick={() => setParams({})}>Reset Filters</button>
          </div>
        )}
      </div>
      {dialog === 'merge' && <MergeDialog onClose={() => setDialog(null)} onDone={() => { setDialog(null); setParams({ ...f }); }} />}
      {dialog && dialog !== 'merge' && <OptionListDialog list={dialog} title={{ hotel_groups: 'Hotel Groups', meal_plans: 'Meal Plans', room_types: 'Room Types' }[dialog]} onClose={() => setDialog(null)} />}
    </>
  );
}

function MergeDialog({ onClose, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [target, setTarget] = useState(null);
  const [sources, setSources] = useState([null]);
  const go = async () => {
    const ids = sources.filter(Boolean);
    if (!(await confirm({ title: 'Merge hotels?', message: `${ids.length} duplicate hotel(s) will be deleted. Their prices, bookings and payments move to the hotel you keep. This cannot be undone.`, confirmText: 'Merge', tone: 'danger' }))) return;
    try { const r = await api('/hotels/merge', { method: 'POST', body: { target_id: target, source_ids: ids } }); toast(r.message); onDone(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Modal title="Merge duplicate hotels" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn danger" disabled={!target || !sources.some(Boolean)} onClick={go}>Merge</button></>}>
      <Field label="Hotel to keep"><RefPicker refType="hotel" value={target} onChange={setTarget} /></Field>
      <h3 className="mt">Duplicates to merge into it</h3>
      {sources.map((s, i) => <div key={i} className="mb"><RefPicker refType="hotel" value={s} onChange={(v) => setSources(sources.map((x, k) => (k === i ? v : x)))} /></div>)}
      <button className="btn link" onClick={() => setSources([...sources, null])}>+ Add another duplicate</button>
    </Modal>
  );
}
