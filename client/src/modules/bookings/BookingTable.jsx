import { Link } from 'react-router-dom';
import { SERVICES } from '@shared/catalog.js';
import { money, fmtDate, fmtShort, paxText } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { BookingStatus } from '../trips/common.jsx';

const d = (b) => b.details || {};
const Trip = ({ b }) => (
  <td className="nowrap"><Link to={`/app/trips/${b.trip_id}?tab=bookings`} onClick={(e) => e.stopPropagation()}>#{b.trip_no}</Link>
    <div className="small">{b.guest_salutation} {b.guest_name}</div><div className="muted small">{b.guest_phone}</div></td>
);
const Supplier = ({ b }) => <td>{b.supplier_name || (b.service === 'hotel' && b.hotel_name ? <span className="muted">Direct with hotel</span> : <span className="badge warn">Not assigned</span>)}{b.supplier_phone && <div className="muted small">{b.supplier_phone}</div>}</td>;
function Price({ b, cur, showCost }) {
  if (!showCost) return <td />;
  const diff = b.booked_amount !== null && b.booked_amount !== undefined ? Number(b.booked_amount) - Number(b.quoted_cost) : null;
  return (
    <td className="num">{b.booked_amount !== null && b.booked_amount !== undefined ? money(b.booked_amount, cur) : <span className="muted">—</span>}
      <div className="muted small">quoted {money(b.quoted_cost, cur)}</div>
      {diff ? <div className="small" style={{ color: diff > 0 ? 'var(--bad)' : 'var(--good)' }}>{diff > 0 ? '+' : ''}{money(diff, cur)}</div> : null}
      {Number(b.payable) > 0 && <div className="small">paid {money(b.paid, cur)} / {money(b.payable, cur)}</div>}</td>
  );
}

/** Columns per service, like Sembark's booking boards. */
const COLUMNS = {
  hotel: {
    head: ['Hotel', 'Stay', 'Rooms & meal plan', 'Booked via'],
    cells: (b) => [
      <td key="h"><strong>{b.hotel_name || b.title}</strong><div className="muted small">{b.hotel_city}</div></td>,
      <td key="s" className="nowrap">{fmtShort(b.service_date)} → {fmtShort(b.end_date)}<div className="muted small">{d(b).nights} night{d(b).nights > 1 ? 's' : ''}</div></td>,
      <td key="r">{d(b).room_type} · <strong>{d(b).meal_plan}</strong><div className="small">{d(b).rooms} room{d(b).rooms > 1 ? 's' : ''} × {d(b).pax_per_room} pax
        {Number(d(b).aweb) ? ` · ${d(b).aweb} AWEB` : ''}{Number(d(b).cweb) ? ` · ${d(b).cweb} CWEB` : ''}{Number(d(b).cnb) ? ` · ${d(b).cnb} CNB` : ''}</div>
        {d(b).confirmation_no && <div className="small">Conf. <strong>{d(b).confirmation_no}</strong></div>}{d(b).tag && <span className="badge info">{d(b).tag}</span>}</td>,
      <Supplier key="v" b={b} />,
    ],
  },
  transport: {
    head: ['Date & time', 'Service', 'Cab', 'Supplier & driver'],
    cells: (b) => [
      <td key="t" className="nowrap">{fmtShort(b.service_date)}<div className="muted small">{d(b).start_time || '—'}</div></td>,
      <td key="s">{b.title.split(' · ')[0]}{d(b).pickup_point && <div className="muted small">Pickup: {d(b).pickup_point}</div>}</td>,
      <td key="c">{d(b).qty} × {d(b).cab_type}</td>,
      <td key="v">{b.supplier_name || <span className="badge warn">Unassigned</span>}{d(b).driver_name && <div className="small">{d(b).driver_name} {d(b).driver_phone}</div>}{d(b).vehicle_no && <div className="muted small">{d(b).vehicle_no}</div>}</td>,
    ],
  },
  activity: {
    head: ['Date', 'Activity', 'Tickets', 'Supplier'],
    cells: (b) => [
      <td key="t" className="nowrap">{fmtShort(b.service_date)}<div className="muted small">{d(b).slot}</div></td>,
      <td key="a">{b.title.split(' · ')[0]}{d(b).ticket_ref && <div className="small">Ref {d(b).ticket_ref}</div>}</td>,
      <td key="p">{paxText(Number(d(b).adults), Array(Number(d(b).children) || 0).fill('?'))}</td>, <Supplier key="v" b={b} />,
    ],
  },
  flight: {
    head: ['Date', 'Flight', 'Passengers', 'PNR'],
    cells: (b) => [
      <td key="t" className="nowrap">{fmtShort(b.service_date)}<div className="muted small">{d(b).depart_time}{d(b).arrive_time ? ` → ${d(b).arrive_time}` : ''}</div></td>,
      <td key="f"><strong>{d(b).from_city} → {d(b).to_city}</strong><div className="small">{d(b).airline} {d(b).flight_no} · {d(b).travel_class}</div></td>,
      <td key="p">{[d(b).adults && `${d(b).adults}A`, Number(d(b).children) && `${d(b).children}C`, Number(d(b).infants) && `${d(b).infants}I`].filter(Boolean).join(' ')}</td>,
      <td key="n">{d(b).pnr || '—'}{d(b).ticket_numbers && <div className="muted small">{d(b).ticket_numbers}</div>}</td>,
    ],
  },
  visa: {
    head: ['Applicant', 'Visa', 'Appointment', 'Vendor'],
    cells: (b) => [
      <td key="a">{d(b).guest_name || <span className="muted">Add name</span>}{d(b).passport_no && <div className="muted small">PP {d(b).passport_no}</div>}</td>,
      <td key="v">{b.title.split(' · ')[0]}{d(b).application_no && <div className="small">App. {d(b).application_no}</div>}</td>,
      <td key="d" className="nowrap">{fmtDate(d(b).appointment_date)}{d(b).visa_expiry && <div className="muted small">valid till {fmtDate(d(b).visa_expiry)}</div>}</td>, <Supplier key="s" b={b} />,
    ],
  },
  land_package: {
    head: ['Dates', 'Package', 'Travellers', 'Vendor'],
    cells: (b) => [
      <td key="t" className="nowrap">{fmtShort(b.service_date)} → {fmtShort(b.end_date)}</td>,
      <td key="p">{d(b).title || b.title}<div className="muted small">{d(b).currency} · rate {d(b).fx_rate}</div>{d(b).confirmation_no && <div className="small">Conf. {d(b).confirmation_no}</div>}</td>,
      <td key="x" className="small">{[Number(d(b).adults_twin) && `${d(b).adults_twin} twin`, Number(d(b).adults_single) && `${d(b).adults_single} single`, Number(d(b).extra_adults) && `${d(b).extra_adults} extra`, Number(d(b).child_bed) && `${d(b).child_bed} CWB`, Number(d(b).child_nobed) && `${d(b).child_nobed} CNB`].filter(Boolean).join(', ')}</td>,
      <Supplier key="v" b={b} />,
    ],
  },
};
COLUMNS.passport = { ...COLUMNS.visa, head: ['Applicant', 'Service', 'PSK appointment', 'Agent'] };
const GENERIC = { head: ['Date', 'Service', 'Supplier'], cells: (b) => [<td key="t" className="nowrap">{b.service_date ? fmtShort(b.service_date) : '—'}</td>, <td key="s">{b.title}</td>, <Supplier key="v" b={b} />] };

export default function BookingTable({ list, cur, onEdit, showTrip, service, selected, onSelect, actions }) {
  const { can } = useAuth();
  const showCost = can('quotes.view_cost');
  const cols = (s) => COLUMNS[s] || GENERIC;
  const mixed = !service;
  const c = cols(service);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>
          {onSelect && <th><input type="checkbox" checked={list.length > 0 && list.every((b) => selected.includes(b.id))} onChange={(e) => onSelect(e.target.checked ? list.map((b) => b.id) : [])} /></th>}
          {showTrip && <th>Trip</th>}{mixed && <th>Service</th>}
          {(mixed ? GENERIC.head : c.head).map((h) => <th key={h}>{h}</th>)}
          {showCost && <th className="num">Booked / quoted</th>}<th>Status</th>{actions && <th />}
        </tr></thead>
        <tbody>{list.map((b) => (
          <tr key={b.id} className={onEdit ? 'clickable' : ''} onClick={() => onEdit?.(b)}>
            {onSelect && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.includes(b.id)} onChange={(e) => onSelect(e.target.checked ? [...selected, b.id] : selected.filter((x) => x !== b.id))} /></td>}
            {showTrip && <Trip b={b} />}
            {mixed && <td className="nowrap">{SERVICES[b.service]?.icon} {SERVICES[b.service]?.label}</td>}
            {(mixed ? GENERIC : c).cells(b)}
            <Price b={b} cur={cur} showCost={showCost} />
            <td><BookingStatus service={b.service} status={b.status} />{b.updated_by_name && <div className="muted small">{b.updated_by_name}</div>}</td>
            {actions && <td onClick={(e) => e.stopPropagation()} className="nowrap">{actions(b)}</td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
