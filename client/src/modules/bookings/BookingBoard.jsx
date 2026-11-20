import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SERVICES } from '@shared/catalog.js';
import { api, qs } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Field, Loading, Modal, PageHeader, Pills, Tabs, useToast } from '../../core/ui.jsx';
import { RefPicker } from '../../core/forms.jsx';
import BookingTable from './BookingTable.jsx';
import BookingDialog from './BookingDialog.jsx';

/** Every booking of one service across converted trips (Sembark "Hotel Bookings", "Cab Bookings"...). */
export default function BookingBoard() {
  const { service } = useParams();
  const [params, setParams] = useSearchParams();
  const { me, hasFeature, can } = useAuth();
  const def = SERVICES[service];
  const f = Object.fromEntries(params.entries());
  const when = f.when || 'upcoming';
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const set = (patch) => setParams(Object.fromEntries(Object.entries({ ...f, ...patch }).filter(([, v]) => v)));
  const load = () => api(`/bookings/board/${service}${qs({ ...f, when: when === 'all' ? '' : when })}`).then(setData).catch(() => setData({ data: [], counts: {} }));
  useEffect(() => { setData(null); setSelected([]); const t = setTimeout(load, 200); return () => clearTimeout(t); }, [service, params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!def) return <Empty>Unknown service.</Empty>;
  if (def.feature && !hasFeature(def.feature)) return <Empty>{def.label} is not enabled for your organisation.</Empty>;
  const total = data ? Object.values(data.counts).reduce((s, n) => s + n, 0) : null;
  const bulk = ['transport', 'activity'].includes(service) && can(def.perm);
  return (
    <>
      <PageHeader title={`${def.icon} ${def.plural} Bookings`} subtitle="Bookings from every converted trip"
        actions={<>
          <Pills value={when} onChange={(k) => set({ when: k })} options={[{ key: 'today', label: 'Today' }, { key: 'next7', label: 'Next 7 days' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }, { key: 'all', label: 'All' }]} />
          <input placeholder="Search guest, trip, supplier" value={f.q || ''} onChange={(e) => set({ q: e.target.value })} style={{ width: 230 }} />
          {bulk && selected.length > 0 && <button className="btn" onClick={() => setAssigning(true)}>Assign supplier ({selected.length})</button>}
        </>} />
      <div className="filters row wrap">
        <span className="small muted">Supplier</span><div style={{ width: 240 }}><RefPicker refType="supplier" service={service} value={f.supplier_id ? Number(f.supplier_id) : null} onChange={(v) => set({ supplier_id: v || '' })} /></div>
        {service === 'hotel' && <><span className="small muted">Hotel</span><div style={{ width: 240 }}><RefPicker refType="hotel" value={f.hotel_id ? Number(f.hotel_id) : null} onChange={(v) => set({ hotel_id: v || '' })} /></div></>}
        <span className="small muted">From</span><input type="date" value={f.from || ''} onChange={(e) => set({ from: e.target.value })} style={{ width: 150 }} />
        <span className="small muted">To</span><input type="date" value={f.to || ''} onChange={(e) => set({ to: e.target.value })} style={{ width: 150 }} />
      </div>
      <div className="card flush">
        <div style={{ padding: '0 12px' }}>
          <Tabs value={f.status || ''} onChange={(k) => set({ status: k })} tabs={[{ key: '', label: 'All', count: total }, ...def.statuses.map((s) => ({ key: s.key, label: s.label, count: data?.counts[s.key] || 0 }))]} />
        </div>
        {!data ? <Loading /> : data.data.length === 0 ? <Empty>No bookings here.</Empty>
          : <BookingTable list={data.data} service={service} cur={me.org.base_currency} showTrip onEdit={setEditing} selected={selected} onSelect={bulk ? setSelected : null} />}
      </div>
      {editing && <BookingDialog booking={editing} cur={me.org.base_currency} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {assigning && <AssignDialog service={service} ids={selected} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); load(); }} />}
    </>
  );
}

function AssignDialog({ service, ids, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ supplier_id: null, driver_name: '', driver_phone: '', vehicle_no: '', confirm: false });
  const go = async () => {
    try {
      const fields = service === 'transport' ? { driver_name: v.driver_name, driver_phone: v.driver_phone, vehicle_no: v.vehicle_no } : {};
      const r = await api('/bookings/assign', { method: 'POST', body: { booking_ids: ids, supplier_id: v.supplier_id, fields, confirm: v.confirm } });
      toast(r.message); onDone();
    } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Modal title={`Assign ${ids.length} booking(s)`} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={!v.supplier_id} onClick={go}>Assign</button></>}>
      <div className="stack">
        <Field label="Supplier *"><RefPicker refType="supplier" service={service} value={v.supplier_id} onChange={(x) => setV({ ...v, supplier_id: x })} /></Field>
        {service === 'transport' && <div className="grid grid-3">
          <Field label="Driver"><input value={v.driver_name} onChange={(e) => setV({ ...v, driver_name: e.target.value })} /></Field>
          <Field label="Driver phone"><input value={v.driver_phone} onChange={(e) => setV({ ...v, driver_phone: e.target.value })} /></Field>
          <Field label="Vehicle no."><input value={v.vehicle_no} onChange={(e) => setV({ ...v, vehicle_no: e.target.value })} /></Field>
        </div>}
        <label className="checkbox"><input type="checkbox" checked={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.checked })} /> Mark as confirmed (uses the quoted price as booked price unless changed later)</label>
      </div>
    </Modal>
  );
}
