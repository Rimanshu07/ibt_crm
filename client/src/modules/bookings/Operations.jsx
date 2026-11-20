import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SERVICES } from '@shared/catalog.js';
import { api, qs, fmtDay, todayIso, addDaysIso, paxText } from '../../core/api.js';
import { Empty, Loading, PageHeader, Pills } from '../../core/ui.jsx';
import { BookingStatus } from '../trips/common.jsx';

/** Day-by-day plan: check-ins, cabs, activities, flights, trains. ?service=hotel = Hotel Check-In/Outs. */
export default function Operations() {
  const [params, setParams] = useSearchParams();
  const service = params.get('service') || '';
  const [from, setFrom] = useState(todayIso());
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState(null);
  useEffect(() => { setRows(null); api(`/reports/operations${qs({ from: addDaysIso(from, service === 'hotel' ? -31 : 0), days: service === 'hotel' ? days + 31 : days, service })}`).then((r) => setRows(r.data)); }, [from, days, service]);
  const dates = Array.from({ length: days }, (_, i) => addDaysIso(from, i));
  const forDay = (d) => (rows || []).filter((r) => (service === 'hotel' ? (r.service_date.slice(0, 10) === d || String(r.end_date || '').slice(0, 10) === d) : r.service_date.slice(0, 10) === d));
  return (
    <>
      <PageHeader title={service === 'hotel' ? 'Hotel Check-In/Outs' : 'Operations Calendar'} subtitle="What is happening each day"
        actions={<>
          <Pills value={service} onChange={(k) => setParams(k ? { service: k } : {})} options={[{ key: '', label: 'All services' }, { key: 'hotel', label: 'Check-ins/outs' }, { key: 'transport', label: 'Cabs' }, { key: 'activity', label: 'Activities' }, { key: 'flight', label: 'Flights' }]} />
          <button className="btn secondary" onClick={() => setFrom(addDaysIso(from, -days))}>←</button>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
          <button className="btn secondary" onClick={() => setFrom(addDaysIso(from, days))}>→</button>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 100 }}>{[1, 3, 7, 14].map((n) => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''}</option>)}</select>
        </>} />
      {!rows ? <Loading /> : dates.map((d) => {
        const list = forDay(d);
        return (
          <div key={d} className="card flush">
            <div className="card-head"><h2>{fmtDay(d)}{d === todayIso() && <span className="badge info" style={{ marginLeft: 8 }}>Today</span>}</h2><span className="muted small">{list.length} item(s)</span></div>
            {list.length === 0 ? <p className="muted small" style={{ padding: '0 16px 12px' }}>Nothing scheduled.</p> : (
              <table><tbody>{list.map((r) => (
                <tr key={r.id}>
                  <td style={{ width: 130 }}>{SERVICES[r.service]?.icon} {r.service === 'hotel' ? (r.service_date.slice(0, 10) === d ? 'Check-in' : 'Check-out') : SERVICES[r.service]?.label}{r.details.start_time && <div className="muted small">{r.details.start_time}</div>}</td>
                  <td><Link to={`/app/trips/${r.trip_id}?tab=bookings`}>#{r.trip_no}</Link> · {r.guest_name}<div className="muted small">{r.guest_phone} · {paxText(r.adults, r.children_ages)}</div></td>
                  <td>{r.title}{r.details.pickup_point && <div className="muted small">Pickup: {r.details.pickup_point}</div>}</td>
                  <td>{r.supplier_name || <span className="badge warn">No supplier</span>}{r.details.driver_name && <div className="small">{r.details.driver_name} {r.details.driver_phone} {r.details.vehicle_no}</div>}</td>
                  <td><BookingStatus service={r.service} status={r.status} /></td>
                </tr>
              ))}</tbody></table>
            )}
          </div>
        );
      })}
      {rows && rows.length === 0 && <Empty>No services in these dates.</Empty>}
    </>
  );
}
