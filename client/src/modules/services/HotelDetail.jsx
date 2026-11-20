import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SERVICES } from '@shared/catalog.js';
import { api, money, fmtDate, fmtDateTime } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Loading, PageHeader, Tabs, useConfirm, useToast } from '../../core/ui.jsx';
import { BookingStatus } from '../trips/common.jsx';
import { dueState } from '../accounting/shared.jsx';
import PriceList from './PriceList.jsx';

export default function HotelDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { me, can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [h, setH] = useState(null);
  const [notes, setNotes] = useState('');
  const tab = params.get('tab') || 'details';
  const load = () => api(`/hotels/${id}`).then((r) => { setH(r.data); setNotes(r.data.notes || ''); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!h) return <Loading />;
  const cur = me.org.base_currency;
  const toggle = async () => {
    if (h.is_active && !(await confirm({ title: `Disable ${h.name}?`, message: 'It will no longer appear in quotes. Existing bookings are not affected.', confirmText: 'Disable', tone: 'danger' }))) return;
    const r = await api(`/hotels/${h.id}/active`, { method: 'PUT', body: { active: !h.is_active } }); toast(r.message); load();
  };
  const saveNotes = async () => { const r = await api(`/hotels/${h.id}/notes`, { method: 'PUT', body: { notes } }); toast(r.message); };
  const closures = (k) => h.closures.filter((c) => c.kind === k);
  return (
    <>
      <PageHeader crumbs={<><Link to="/app/services/hotels">Hotels</Link> › {h.name}</>}
        title={<span className="row">{h.name} {!h.is_active && <span className="badge bad">Disabled</span>}</span>}
        subtitle={`${h.location}${h.star ? ` · ${h.star}${/^\d$/.test(h.star) ? '★' : ''}` : ''}${h.group_name ? ` · ${h.group_name}` : ''}`}
        actions={can('masters.manage') && <><button className="btn secondary" onClick={toggle}>{h.is_active ? 'Disable' : 'Enable'}</button><Link className="btn" to={`/app/services/hotels/${h.id}/edit`}>Edit</Link></>} />
      <div className="card flush">
        <div style={{ padding: '0 12px' }}>
          <Tabs value={tab} onChange={(k) => setParams({ tab: k })} tabs={[{ key: 'details', label: 'Details' }, { key: 'prices', label: 'Prices' }, { key: 'notes', label: 'Hotel Notes' }, { key: 'bookings', label: 'Bookings', count: h.bookings.length }, { key: 'payments', label: 'Payments', count: h.dues.length }]} />
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          {tab === 'details' && (
            <div className="grid grid-2">
              <div className="stack">
                <dl className="kv">
                  <dt>Available Meal Plans</dt><dd>{h.meal_plans.join(' • ')}</dd>
                  <dt>Check-In / Out</dt><dd>{h.checkin_time} / {h.checkout_time} hrs</dd>
                  <dt>Extra bed child ages</dt><dd>From {h.child_age_from} to {h.child_age_to} years</dd>
                  <dt>Payment Preference</dt><dd>{h.payment_pref || 'Default'}</dd>
                  <dt>Booked via</dt><dd>{h.supplier_name || 'Direct with hotel'}</dd>
                  <dt>Address</dt><dd>{h.address || '—'}</dd>
                  <dt>Contact</dt><dd>{h.phone || '—'} {h.email}</dd>
                  <dt>Link</dt><dd>{h.link ? <a href={h.link} target="_blank" rel="noreferrer">Open</a> : '—'}</dd>
                  <dt>Created</dt><dd>{fmtDateTime(h.created_at)} by {h.created_by_name || '—'} · {h.entry_method === 'upload' ? 'Uploaded' : 'Added manually'}</dd>
                </dl>
                <div><h3>Available Room Types</h3>
                  <table><thead><tr><th>Room</th><th>AWEB</th><th>CWEB</th><th>CNB</th><th>Rooms</th></tr></thead>
                    <tbody>{h.room_types.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.aweb ?? '—'}</td><td>{r.cweb ?? '—'}</td><td>{r.cnb ?? '—'}</td><td>{r.rooms ?? '—'}</td></tr>)}</tbody></table></div>
              </div>
              <div className="stack">
                {['soldout', 'blackout'].map((k) => (
                  <div key={k}><h3>{k === 'soldout' ? 'Soldout' : 'Blackout'} Room Types</h3>
                    {closures(k).length === 0 ? <p className="muted small">No {k} date set for any type of room.</p> : closures(k).map((c) => (
                      <div key={c.id} className="small">{fmtDate(c.date_from)} – {fmtDate(c.date_to)} · {c.room_types?.length ? c.room_types.join(', ') : 'All rooms'}</div>
                    ))}</div>
                ))}
                <div><h3>Price coverage</h3>
                  {h.rate_summary.length === 0 ? <p className="muted small">No prices. <Link to="/app/services/prices/hotel/upload">Upload prices</Link></p> : (
                    <table><tbody>{h.rate_summary.map((r, i) => <tr key={i}><td>{r.kind === 'base' ? r.variant : { aweb: 'Extra bed (adult)', cweb: 'Extra bed (child)', cnb: 'Child no bed' }[r.kind]}</td><td>{r.meal_plan}</td><td className="small">{fmtDate(r.date_from)} → {fmtDate(r.date_to)}</td></tr>)}</tbody></table>
                  )}</div>
                <div><h3>Contacts</h3>{h.contacts.length === 0 ? <p className="muted small">No contacts found.</p> : h.contacts.map((c, i) => <div key={i} className="small">{c.name} {c.designation && `(${c.designation})`} · {c.phone} {c.email}</div>)}</div>
              </div>
            </div>
          )}
          {tab === 'prices' && <><div className="row mb"><Link className="btn secondary small" to={`/app/services/prices/hotel/calculate?hotel_id=${h.id}`}>Calculate price</Link><Link className="btn secondary small" to="/app/services/prices/hotel/upload">Upload prices</Link></div><PriceList service="hotel" refId={h.id} /></>}
          {tab === 'notes' && <div className="stack"><textarea rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes: best rooms, contact preferences, policies…" />{can('masters.manage') && <button className="btn" style={{ width: 'fit-content' }} onClick={saveNotes}>Save notes</button>}</div>}
          {tab === 'bookings' && (h.bookings.length === 0 ? <Empty>No bookings yet.</Empty> : (
            <table><thead><tr><th>Check-in</th><th>Trip</th><th>Booking</th><th className="num">Booked</th><th>Status</th></tr></thead>
              <tbody>{h.bookings.map((b) => <tr key={b.id}><td>{fmtDate(b.service_date)}</td><td><Link to={`/app/trips/${b.trip_id}?tab=bookings`}>#{b.trip_no}</Link> {b.guest_name}</td><td className="small">{b.title}</td><td className="num">{b.booked_amount ? money(b.booked_amount, cur) : '—'}</td><td><BookingStatus service="hotel" status={b.status} /></td></tr>)}</tbody></table>
          ))}
          {tab === 'payments' && (h.dues.length === 0 ? <Empty>No payments to this hotel directly. <Link to="/app/accounting/payments?direction=out">View due payments</Link></Empty> : (
            <table><thead><tr><th>Due</th><th>Trip</th><th className="num">Amount</th><th className="num">Paid</th><th>Status</th></tr></thead>
              <tbody>{h.dues.map((i) => <tr key={i.id}><td>{fmtDate(i.due_date)}</td><td><Link to={`/app/trips/${i.trip_id}?tab=accounting`}>#{i.trip_no}</Link> {i.guest_name}</td><td className="num">{money(i.amount, cur)}</td><td className="num">{money(i.paid_amount, cur)}</td><td>{dueState(i)}</td></tr>)}</tbody></table>
          ))}
        </div>
      </div>
      <p className="muted small">{SERVICES.hotel.icon} Prices for this hotel come from season-wise uploads. Uploading again replaces the prices for the same dates.</p>
    </>
  );
}
