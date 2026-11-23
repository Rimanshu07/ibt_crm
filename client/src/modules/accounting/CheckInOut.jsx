import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs, money, fmtDate, todayIso, addDaysIso, paxText } from '../../core/api.js';
import { Empty, Kpi, Loading, PageHeader, Pills } from '../../core/ui.jsx';
import { toCsv, downloadFile } from '../../core/forms.jsx';
import { useAuth } from '../../core/auth.jsx';

const monthStart = (d) => `${d.slice(0, 7)}-01`;
const monthEnd = (d) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).toISOString().slice(0, 10);
const weekStart = (d) => { const x = new Date(`${d}T00:00:00Z`); const w = (x.getUTCDay() + 6) % 7; return addDaysIso(d, -w); };

/** Trip Check In/Out report (accounting): trips starting / ending in a month, week or day, with received and due amounts. */
export default function CheckInOut() {
  const { me } = useAuth();
  const [mode, setMode] = useState('month');
  const [anchor, setAnchor] = useState(todayIso());
  const [tab, setTab] = useState('out');
  const [data, setData] = useState(null);
  const from = mode === 'month' ? monthStart(anchor) : mode === 'week' ? weekStart(anchor) : anchor;
  const to = mode === 'month' ? monthEnd(anchor) : mode === 'week' ? addDaysIso(from, 6) : anchor;
  useEffect(() => { setData(null); api(`/reports/check-in-out${qs({ from, to })}`).then((r) => setData(r.data)).catch(() => setData({ rows: [], totals: {} })); }, [from, to]);
  const move = (k) => setAnchor(mode === 'month' ? addDaysIso(monthStart(anchor), k > 0 ? 32 : -1) : addDaysIso(anchor, k * (mode === 'week' ? 7 : 1)));
  const cur = me.org.base_currency;
  const rows = (data?.rows || []).filter((r) => (tab === 'out' ? r.is_checkout : r.is_checkin));
  const csv = () => downloadFile(`trip-check-${tab === 'out' ? 'outs' : 'ins'}-${from}-to-${to}.csv`, toCsv([
    ['Trip', 'Guest', 'Phone', 'Destinations', 'Start', 'End', 'Nights', 'Travellers', 'Package', 'Received', 'Due', 'Booked cost', 'Sales'],
    ...rows.map((r) => [r.trip_no, r.guest_name, r.guest_phone, r.destinations, r.start_date?.slice(0, 10), r.end_date?.slice(0, 10), r.nights, paxText(r.adults, r.children_ages), r.package_amount, r.received, r.due, r.booked_cost, r.sales_name]),
  ]));
  const t = data?.totals || {};
  return (
    <>
      <PageHeader title="Trip Check In/Out Report" subtitle={`${fmtDate(from)} – ${fmtDate(to)}`}
        actions={<>
          <Pills value={mode} onChange={setMode} options={[{ key: 'month', label: 'Month' }, { key: 'week', label: 'Week' }, { key: 'day', label: 'Day' }]} />
          <button className="btn secondary" onClick={() => move(-1)}>←</button>
          <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value || todayIso())} style={{ width: 150 }} />
          <button className="btn secondary" onClick={() => move(1)}>→</button>
          <button className="btn secondary" disabled={!rows.length} onClick={csv}>⬇ Download Report</button>
        </>} />
      <div className="grid grid-4">
        <Kpi label="Check-ins" value={t.checkins ?? '—'} sub={money(t.checkin_amount || 0, cur)} onClick={() => setTab('in')} />
        <Kpi label="Check-outs" value={t.checkouts ?? '—'} sub={money(t.checkout_amount || 0, cur)} onClick={() => setTab('out')} />
        <Kpi label="Received" value={money(t.received || 0, cur)} />
        <Kpi label="Due from customers" value={money(t.due || 0, cur)} />
      </div>
      <div className="card flush mt">
        <div className="card-head"><Pills value={tab} onChange={setTab} options={[{ key: 'out', label: `Check Outs (${t.checkouts ?? 0})` }, { key: 'in', label: `Check Ins (${t.checkins ?? 0})` }]} /></div>
        {!data ? <Loading /> : rows.length === 0 ? <Empty>No trips in this period.</Empty> : (
          <table>
            <thead><tr><th>Trip</th><th>Dates</th><th>Destination</th><th>Travellers</th><th className="num">Package</th><th className="num">Received</th><th className="num">Due</th><th className="num">Booked cost</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/app/trips/${r.id}?tab=accounting`}>#{r.trip_no}</Link> {r.guest_name}<div className="muted small">{r.guest_phone}{r.sales_name ? ` · ${r.sales_name}` : ''}</div></td>
                <td className="nowrap">{fmtDate(r.start_date)} – {fmtDate(r.end_date)}<div className="muted small">{r.nights}N</div></td>
                <td>{r.destinations}</td><td className="small">{paxText(r.adults, r.children_ages)}</td>
                <td className="num">{money(r.package_amount, r.currency || cur)}</td><td className="num">{money(r.received, r.currency || cur)}</td>
                <td className="num" style={{ color: r.due > 0 ? 'var(--bad)' : undefined }}>{money(r.due, r.currency || cur)}</td><td className="num">{money(r.booked_cost, r.currency || cur)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={4}><b>Total</b></td><td className="num"><b>{money(rows.reduce((s, r) => s + Number(r.package_amount || 0), 0), cur)}</b></td>
              <td className="num">{money(rows.reduce((s, r) => s + Number(r.received || 0), 0), cur)}</td><td className="num">{money(rows.reduce((s, r) => s + Number(r.due || 0), 0), cur)}</td>
              <td className="num">{money(rows.reduce((s, r) => s + Number(r.booked_cost || 0), 0), cur)}</td></tr></tfoot>
          </table>
        )}
      </div>
    </>
  );
}
