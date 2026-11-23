import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SERVICES } from '@shared/catalog.js';
import { api, money, fmtDate } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Kpi, Loading, PageHeader, Tabs, useConfirm, useToast } from '../../core/ui.jsx';
import Attachments from '../documents/Attachments.jsx';
import { BookingStatus } from '../trips/common.jsx';
import { dueState } from '../accounting/shared.jsx';

export default function SupplierDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { me, can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [s, setS] = useState(null);
  const tab = params.get('tab') || 'details';
  const load = () => api(`/suppliers/${id}`).then((r) => setS(r.data));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return <Loading />;
  const cur = me.org.base_currency;
  const due = s.dues.reduce((x, i) => x + Number(i.amount) - Number(i.paid_amount), 0);
  const overdue = s.dues.filter((i) => String(i.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10)).reduce((x, i) => x + Number(i.amount) - Number(i.paid_amount), 0);
  const toggle = async () => {
    if (s.is_active && !(await confirm({ title: `Disable ${s.name}?`, message: 'They will no longer appear when assigning bookings.', confirmText: 'Disable', tone: 'danger' }))) return;
    const r = await api(`/suppliers/${s.id}/active`, { method: 'PUT', body: { active: !s.is_active } }); toast(r.message); load();
  };
  return (
    <>
      <PageHeader crumbs={<><Link to="/app/suppliers">Suppliers</Link> › {s.name}</>} title={<span className="row">{s.name} {!s.is_active && <span className="badge bad">Disabled</span>}</span>}
        subtitle={`${s.kind} · ${s.services.map((x) => SERVICES[x]?.label).join(', ')}`}
        actions={can('suppliers.manage', 'masters.manage') && <><button className="btn secondary" onClick={toggle}>{s.is_active ? 'Disable' : 'Enable'}</button><Link className="btn" to={`/app/suppliers/${s.id}/edit`}>Edit</Link></>} />
      <div className="grid grid-4">
        <Kpi label="Balance to pay" value={money(due, cur)} /><Kpi label="Overdue" value={money(overdue, cur)} />
        <Kpi label="Bookings" value={s.bookings.length} /><Kpi label="Paid so far" value={money(s.payments.reduce((x, p) => x + Number(p.amount), 0), cur)} />
      </div>
      <div className="card flush">
        <div style={{ padding: '0 12px' }}><Tabs value={tab} onChange={(k) => setParams({ tab: k })} tabs={[{ key: 'details', label: 'Details' }, { key: 'bookings', label: 'Bookings', count: s.bookings.length }, { key: 'dues', label: 'Due Payments', count: s.dues.filter((i) => Number(i.paid_amount) < Number(i.amount)).length }, { key: 'payments', label: 'Accounting', count: s.payments.length }, { key: 'files', label: s.services?.includes('land_package') ? 'Packages received' : 'Files' }]} /></div>
        <div style={{ padding: '0 16px 16px' }}>
          {tab === 'details' && (
            <div className="grid grid-2">
              <dl className="kv">
                <dt>Phone</dt><dd>{s.phone || '—'}</dd><dt>Email</dt><dd>{s.email || '—'}</dd>
                <dt>Address</dt><dd>{[s.address, s.city, s.state, s.country].filter(Boolean).join(', ') || '—'}</dd>
                <dt>GSTIN / Tax</dt><dd>{s.tax_id || '—'}</dd><dt>PAN</dt><dd>{s.pan || '—'}</dd>
                <dt>Payment preference</dt><dd>{s.payment_pref || 'Organisation default'}</dd>
                {s.cab_types.length > 0 && <><dt>Cab types</dt><dd>{s.cab_types.join(', ')}</dd></>}
                <dt>Notes</dt><dd className="pre">{s.notes || '—'}</dd>
              </dl>
              <div className="stack">
                <div><h3>Contacts</h3>{s.contacts.length === 0 ? <p className="muted small">No contacts</p> : s.contacts.map((c, i) => <div key={i} className="small mb"><strong>{c.name}</strong> {c.designation && `· ${c.designation}`}<div className="muted">{c.phone} {c.email}</div></div>)}</div>
                <div><h3>Bank accounts</h3>{s.bank_accounts.length === 0 ? <p className="muted small">None added</p> : s.bank_accounts.map((b, i) => <div key={i} className="small mb"><strong>{b.bank_name}</strong> · {b.account_name}<div className="muted">{b.account_no} {b.ifsc} {b.upi_id}</div></div>)}</div>
              </div>
            </div>
          )}
          {tab === 'bookings' && (s.bookings.length === 0 ? <Empty>No bookings yet.</Empty> : (
            <table><thead><tr><th>Date</th><th>Trip</th><th>Service</th><th className="num">Booked</th><th>Status</th></tr></thead>
              <tbody>{s.bookings.map((b) => <tr key={b.id}><td>{fmtDate(b.service_date)}</td><td><Link to={`/app/trips/${b.trip_id}?tab=bookings`}>#{b.trip_no}</Link> {b.guest_name}</td><td>{SERVICES[b.service]?.icon} {b.title}</td><td className="num">{b.booked_amount ? money(b.booked_amount, cur) : '—'}</td><td><BookingStatus service={b.service} status={b.status} /></td></tr>)}</tbody></table>
          ))}
          {tab === 'dues' && (s.dues.length === 0 ? <Empty>Nothing due.</Empty> : (
            <table><thead><tr><th>Due</th><th>Trip</th><th>For</th><th className="num">Amount</th><th className="num">Paid</th><th>Status</th></tr></thead>
              <tbody>{s.dues.map((i) => <tr key={i.id}><td>{fmtDate(i.due_date)}</td><td><Link to={`/app/trips/${i.trip_id}?tab=accounting`}>#{i.trip_no}</Link></td><td className="small">{i.booking_title}</td><td className="num">{money(i.amount, cur)}</td><td className="num">{money(i.paid_amount, cur)}</td><td>{dueState(i)}</td></tr>)}</tbody></table>
          ))}
          {tab === 'files' && <div style={{ padding: 12 }}><Attachments supplierId={s.id} title={s.services?.includes('land_package') ? 'Packages received from this vendor' : 'Files kept for records'} /></div>}
          {tab === 'payments' && (s.payments.length === 0 ? <Empty>No payments yet.</Empty> : (
            <table><thead><tr><th>Date</th><th>Trip</th><th>Mode</th><th>Reference</th><th className="num">Amount</th><th>Verified</th></tr></thead>
              <tbody>{s.payments.map((x) => <tr key={x.id}><td>{fmtDate(x.paid_at)}</td><td>{x.trip_no ? `#${x.trip_no}` : '—'}</td><td>{x.mode}</td><td>{x.reference}</td><td className="num">{money(x.amount, cur)}</td><td>{x.verified_at ? '✓' : '—'}</td></tr>)}</tbody></table>
          ))}
        </div>
      </div>
    </>
  );
}
