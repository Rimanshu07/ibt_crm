import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SERVICES } from '@shared/catalog.js';
import { api, money, fmtDate, fmtShort, fmtDateTime, paxText } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Kpi, Loading, PageHeader, Pills } from '../../core/ui.jsx';
import { stageLabel } from '../trips/common.jsx';

const BUCKETS = [{ key: 'today', label: 'Today' }, { key: 'overdue', label: 'Overdue' }, { key: 'next7', label: 'Next 7 days' }];
const DATE_BUCKETS = [{ key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' }, { key: 'next7', label: 'Next 7 days' }];

/** One dashboard card with Today / Overdue (Yesterday) / Next 7 days tabs. */
function Block({ title, data, buckets = BUCKETS, link, render, amount, cur, empty = 'Nothing here' }) {
  const first = buckets.find((b) => data[b.key]?.n) || buckets[0];
  const [tab, setTab] = useState(first.key);
  const cell = data[tab] || { n: 0, items: [] };
  return (
    <div className="card">
      <div className="card-head"><h2>{title}</h2>{link && <Link className="small" to={link}>View all</Link>}</div>
      <div className="grid grid-3" style={{ gap: 8 }}>
        {buckets.map((b) => (
          <button key={b.key} className="kpi" onClick={() => setTab(b.key)} style={{ cursor: 'pointer', textAlign: 'left', borderColor: tab === b.key ? 'var(--primary)' : undefined, background: tab === b.key ? 'var(--primary-l)' : '#fff' }}>
            <span className="stat-label">{b.label}</span>
            <span className="stat-value" style={{ fontSize: 20, color: b.key === 'overdue' && data[b.key]?.n ? 'var(--bad)' : undefined }}>{amount ? money(data[b.key]?.amount || 0, cur) : data[b.key]?.n || 0}</span>
            {amount && <span className="muted small">{data[b.key]?.n || 0} item(s)</span>}
          </button>
        ))}
      </div>
      <div className="mt">
        {cell.items.length === 0 ? <p className="muted small">{empty}</p> : (
          <table><tbody>{cell.items.map((x) => <tr key={x.id}>{render(x)}</tr>)}</tbody></table>
        )}
        {cell.n > cell.items.length && <p className="muted small">+ {cell.n - cell.items.length} more</p>}
      </div>
    </div>
  );
}

const TripCell = ({ x }) => <td><Link to={`/app/trips/${x.trip_id || x.id}`}>#{x.trip_no}</Link> <span className="small">{x.guest_name}</span></td>;

export default function Dashboard() {
  const { me, can, hasFeature } = useAuth();
  const [d, setD] = useState(null);
  const [period, setPeriod] = useState('month');
  useEffect(() => { api('/reports/dashboard').then((r) => setD(r.data)).catch(() => setD(false)); }, []);
  const cur = me.org.base_currency;
  const s = d?.sales?.[period];
  return (
    <>
      <PageHeader title={`Welcome, ${me.user.name.split(' ')[0]}`} subtitle={`${me.org.name} · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={hasFeature('crm_leads') && can('trips.create') && <Link className="btn" to="/app/trips?new=1">+ New Enquiry</Link>} />
      {d === null ? <Loading /> : d === false ? <div className="card">Could not load the dashboard.</div> : <>
        <div className="card">
          <div className="card-head"><h2>Sales</h2><Pills value={period} onChange={setPeriod} options={[{ key: 'today', label: 'Today' }, { key: 'week', label: 'Last 7 days' }, { key: 'month', label: 'This month' }]} /></div>
          <div className="grid grid-4">
            <Kpi label="Revenue (conversions)" value={money(s.revenue, cur)} />
            <Kpi label="New enquiries" value={s.leads} />
            <Kpi label="Quotes given" value={s.quotes} />
            <Kpi label="Conversions" value={s.conversions} sub={s.leads ? `${Math.round((s.conversions / s.leads) * 100)}% of enquiries` : ''} />
          </div>
          <div className="row wrap mt">{['new', 'in_progress', 'quote_given', 'on_hold', 'converted', 'on_trip'].map((k) => (
            <Link key={k} className="chip" to={`/app/trips?stage=${k}`}>{stageLabel(k)} <span className="count">{d.stages[k] || 0}</span></Link>
          ))}</div>
        </div>

        <div className="card" style={{ borderColor: d.live_dues.length ? '#f5c2bd' : undefined }}>
          <div className="card-head"><h2>🔴 Live trips with due payments</h2><span className="muted small">On trip now or starting within 7 days, with money still to collect</span></div>
          {d.live_dues.length === 0 ? <p className="muted small">All live trips are fully paid. 👍</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Trip</th><th>Travel</th><th>Sales</th><th className="num">Package</th><th className="num">Received</th><th className="num">Due</th><th className="num">Overdue</th><th /></tr></thead>
              <tbody>{d.live_dues.map((t) => (
                <tr key={t.id}>
                  <td><Link to={`/app/trips/${t.id}?tab=accounting`}>#{t.trip_no}</Link> {t.guest_name}<div className="muted small">{t.guest_phone}</div></td>
                  <td className="nowrap">{fmtShort(t.start_date)} → {fmtShort(t.end_date)}<div>{t.stage === 'on_trip' ? <span className="badge good">On trip</span> : <span className="badge info">Starts soon</span>}</div></td>
                  <td className="small">{t.sales_name}</td>
                  <td className="num">{money(t.total, t.currency)}</td><td className="num">{money(t.received, t.currency)}</td>
                  <td className="num"><strong>{money(t.total - t.received, t.currency)}</strong>{t.next_due && <div className="muted small">next {fmtShort(t.next_due)}</div>}</td>
                  <td className="num" style={{ color: Number(t.overdue) > 0 ? 'var(--bad)' : undefined }}>{money(t.overdue, t.currency)}</td>
                  <td>{can('payments.log') && <Link className="btn small" to={`/app/trips/${t.id}?tab=accounting`}>Collect</Link>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>

        <div className="grid grid-2">
          <Block title="My follow-ups" data={d.followups} link="/app/tasks" empty="No follow-ups." render={(x) => <><td className="small nowrap">{fmtDateTime(x.due_at)}</td><td>{x.body}</td>{x.trip_id ? <TripCell x={x} /> : <td />}</>} />
          <Block title="Bookings to confirm" data={d.unconfirmed} empty="All bookings are confirmed." render={(x) => <><td className="small nowrap">{fmtShort(x.service_date)}</td><td>{SERVICES[x.service]?.icon} {x.title}</td><TripCell x={x} /></>} />
          {hasFeature('accounting') && can('payments.log') && <>
            <Block title="Incoming payments" amount cur={cur} data={d.incoming} link="/app/accounting/payments?direction=in" render={(x) => <><td className="small nowrap">{fmtShort(x.due_date)}</td><TripCell x={x} /><td className="num">{money(x.amount - x.paid_amount, cur)}</td></>} />
            <Block title="Outgoing payments" amount cur={cur} data={d.outgoing} link="/app/accounting/payments?direction=out" render={(x) => <><td className="small nowrap">{fmtShort(x.due_date)}</td><td>{x.party_name}<div className="muted small">#{x.trip_no}</div></td><td className="num">{money(x.amount - x.paid_amount, cur)}</td></>} />
          </>}
          <Block title="Trips starting" buckets={DATE_BUCKETS} data={d.trip_starts} empty="No trips." render={(x) => <><TripCell x={x} /><td className="small">{fmtDate(x.start_date)}</td><td className="small">{paxText(x.adults, x.children_ages)}</td></>} />
          <Block title="Trips ending" buckets={DATE_BUCKETS} data={d.trip_ends} empty="No trips." render={(x) => <><TripCell x={x} /><td className="small">{fmtDate(x.end_date)}</td><td /></>} />
          {hasFeature('hotel') && <Block title="Hotel check-ins" buckets={DATE_BUCKETS} data={d.checkins} link="/app/operations?service=hotel" empty="No check-ins." render={(x) => <><td>{x.title.split(' · ')[0]}</td><TripCell x={x} /><td className="small">{SERVICES.hotel.statuses.find((y) => y.key === x.status)?.label}</td></>} />}
          {hasFeature('transport') && <Block title="Cab services" buckets={DATE_BUCKETS} data={d.transport} link="/app/bookings/transport" empty="No cabs." render={(x) => <><td>{x.title}</td><TripCell x={x} /><td className="small">{SERVICES.transport.statuses.find((y) => y.key === x.status)?.label}</td></>} />}
        </div>
      </>}
    </>
  );
}
