import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate, ago } from '../../core/api.js';
import { Kpi, Loading, PageHeader } from '../../core/ui.jsx';

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/admin/dashboard').then((r) => setD(r.data)); }, []);
  if (!d) return <Loading />;
  const max = Math.max(...d.signups.map((s) => Number(s.n)), 1);
  return (
    <>
      <PageHeader title="Platform dashboard" subtitle="IBT Travels CRM – all organisations" />
      <div className="grid grid-4">
        <Kpi label="Waiting for approval" value={d.counts.pending} sub={<Link to="/admin/orgs?status=pending">Review now</Link>} />
        <Kpi label="Active organisations" value={d.counts.active} sub={`${d.counts.suspended} suspended · ${d.counts.rejected} rejected`} />
        <Kpi label="Active users" value={d.active_users} sub={`${d.totals.users_active_7d} logged in this week`} />
        <Kpi label="Monthly recurring revenue" value={Object.entries(d.monthly_revenue).map(([c, v]) => money(v, c)).join(' + ') || '0'} sub={`${money(d.totals.invoices_due, 'INR')} invoices due`} />
      </div>
      <div className="grid grid-4">
        <Kpi label="Trips (all time)" value={d.totals.trips} sub={`${d.totals.trips_30d} in the last 30 days`} />
        <Kpi label="Quotes" value={d.totals.quotes} /><Kpi label="Bookings" value={d.totals.bookings} /><Kpi label="New this month" value={d.new_this_month} />
      </div>
      <div className="grid grid-3">
        <div className="card"><h2>Sign-ups (6 months)</h2>
          <div className="bars">{d.signups.map((s) => <div key={s.month}><span>{s.n}</span><div className="bar" style={{ height: `${(Number(s.n) / max) * 100}%` }} /><span>{s.month.slice(5)}/{s.month.slice(2, 4)}</span></div>)}</div></div>
        <div className="card"><h2>Pending approvals</h2>
          {d.pending.length === 0 ? <p className="muted small">None 🎉</p> : <table><tbody>{d.pending.map((o) => <tr key={o.id}><td><Link to={`/admin/orgs/${o.id}`}>{o.name}</Link><div className="muted small">{o.email} · {o.city} {o.country_code}</div></td><td className="small muted">{ago(o.created_at)}</td></tr>)}</tbody></table>}</div>
        <div className="card"><h2>Most active (30 days)</h2>
          <table><tbody>{d.top_orgs.map((o) => <tr key={o.id}><td><Link to={`/admin/orgs/${o.id}`}>{o.name}</Link></td><td className="num">{o.trips_30d} trips</td><td className="num small muted">{o.users} users</td></tr>)}</tbody></table>
          {d.trials_ending.length > 0 && <><h3 className="mt">Trials ending soon</h3>{d.trials_ending.map((o) => <div key={o.id} className="small"><Link to={`/admin/orgs/${o.id}`}>{o.name}</Link> – {fmtDate(o.trial_ends_at)}</div>)}</>}</div>
      </div>
    </>
  );
}
