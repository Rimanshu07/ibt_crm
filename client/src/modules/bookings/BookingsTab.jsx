import { useEffect, useState } from 'react';
import { SERVICES, SERVICE_ORDER } from '@shared/catalog.js';
import { api } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Loading } from '../../core/ui.jsx';
import BookingTable from './BookingTable.jsx';
import BookingDialog from './BookingDialog.jsx';

/** All bookings of one trip, grouped by service. */
export default function BookingsTab({ trip }) {
  const { me } = useAuth();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api(`/bookings/trip/${trip.id}`).then((r) => setRows(r.data));
  useEffect(() => { load(); }, [trip.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return <Loading />;
  if (!rows.length) return <Empty>No bookings. Bookings are created when the trip is converted.</Empty>;
  const cur = trip.currency || me.org.base_currency;
  const groups = SERVICE_ORDER.filter((s) => rows.some((r) => r.service === s));
  return (
    <div className="stack" style={{ marginTop: 4 }}>
      {groups.map((s) => (
        <div key={s} className="card flush">
          <div className="card-head"><h2>{SERVICES[s].icon} {SERVICES[s].plural}</h2><span className="muted small">{rows.filter((r) => r.service === s).length} booking(s)</span></div>
          <BookingTable list={rows.filter((r) => r.service === s)} service={s} cur={cur} onEdit={setEditing} />
        </div>
      ))}
      {editing && <BookingDialog booking={editing} cur={cur} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
