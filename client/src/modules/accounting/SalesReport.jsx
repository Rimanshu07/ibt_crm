import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ENQUIRY_SERVICES, SERVICES } from '@shared/catalog.js';
import { api, money, fmtDate, todayIso } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Kpi, Loading, PageHeader, Pills, Tabs } from '../../core/ui.jsx';
import { downloadFile, toCsv } from '../../core/forms.jsx';

/** Sales Report (renamed from "Reports"): revenue, profit and conversion by team, source, destination and service. */
export default function SalesReport() {
  const { me, can } = useAuth();
  const cur = me.org.base_currency;
  const [range, setRange] = useState({ from: `${todayIso().slice(0, 8)}01`, to: todayIso() });
  const [by, setBy] = useState('trips');
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); api(`/reports/sales?from=${range.from}&to=${range.to}`).then((r) => setD(r.data)); }, [range]);
  const showProfit = can('reports.profit');
  const preset = (k) => {
    const t = todayIso(); const y = t.slice(0, 4);
    const m = { month: [`${t.slice(0, 8)}01`, t], last30: [new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10), t], year: [`${y}-01-01`, t], fy: [Number(t.slice(5, 7)) >= 4 ? `${y}-04-01` : `${Number(y) - 1}-04-01`, t] }[k];
    setRange({ from: m[0], to: m[1] });
  };
  const exportCsv = () => downloadFile(`sales-report-${range.from}-${range.to}.csv`, toCsv([
    ['Trip', 'Guest', 'Destinations', 'Services', 'Start', 'Nights', 'Sales person', 'Source', 'Converted', 'Package', ...(showProfit ? ['Profit', 'Profit %'] : [])],
    ...d.trips.map((t) => [t.trip_no, t.guest_name, t.destinations, t.services.join(' | '), t.start_date, t.nights, t.sales_name, t.source_name, t.converted_at?.slice(0, 10), t.package_amount, ...(showProfit ? [t.profit, t.profit_pct] : [])]),
  ]));
  const groups = d ? { sales: d.by_sales, source: d.by_source, dest: d.by_destination, service: d.by_service.map((g) => ({ ...g, name: ENQUIRY_SERVICES.find((s) => s.key === g.name)?.label || SERVICES[g.name]?.label || g.name })) }[by] : null;
  return (
    <>
      <PageHeader title="Sales Report" subtitle="Leads, quotes, conversions, revenue and profit"
        actions={<>
          <Pills value="" onChange={preset} options={[{ key: 'month', label: 'This month' }, { key: 'last30', label: 'Last 30 days' }, { key: 'fy', label: 'This FY' }, { key: 'year', label: 'This year' }]} />
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} style={{ width: 150 }} />
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} style={{ width: 150 }} />
          {d?.trips.length > 0 && <button className="btn secondary" onClick={exportCsv}>Download CSV</button>}
        </>} />
      {!d ? <Loading /> : <>
        <div className="grid grid-4">
          <Kpi label="Revenue (converted)" value={money(d.totals.revenue, cur)} />
          {showProfit && <Kpi label="Profit" value={money(d.totals.profit, cur)} sub={d.totals.revenue ? `${Math.round((d.totals.profit / d.totals.revenue) * 1000) / 10}% margin` : ''} />}
          <Kpi label="Leads · Quotes" value={`${d.totals.leads} · ${d.totals.quotes}`} />
          <Kpi label="Conversions" value={d.totals.conversions} sub={`${d.totals.conversion_pct}% of leads · ${d.totals.dropped} dropped`} />
        </div>
        <div className="card flush">
          <div style={{ padding: '0 12px' }}><Tabs value={by} onChange={setBy} tabs={[{ key: 'trips', label: 'Trips', count: d.trips.length }, { key: 'sales', label: 'Sales team' }, { key: 'source', label: 'Trip sources' }, { key: 'dest', label: 'Destinations' }, { key: 'service', label: 'Services' }]} /></div>
          {by === 'trips' ? (d.trips.length === 0 ? <Empty>No conversions in these dates.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Trip</th><th>Guest</th><th>Destination</th><th>Sales / source</th><th>Converted</th><th className="num">Package</th>{showProfit && <th className="num">Profit</th>}</tr></thead>
              <tbody>{d.trips.map((t) => (
                <tr key={t.id}>
                  <td><Link to={`/app/trips/${t.id}`}>#{t.trip_no}</Link></td><td>{t.guest_name}</td>
                  <td>{t.destinations || '—'}<div className="muted small">{t.start_date ? `${fmtDate(t.start_date)} · ${t.nights ?? 0}N` : 'No dates'}</div></td>
                  <td>{t.sales_name || '—'}<div className="muted small">{t.source_name || 'Direct'}</div></td>
                  <td>{fmtDate(t.converted_at)}</td><td className="num">{money(t.package_amount, cur)}</td>
                  {showProfit && <td className="num">{money(t.profit, cur)} <span className="muted small">{t.profit_pct}%</span></td>}
                </tr>
              ))}</tbody>
            </table></div>
          )) : (
            <table>
              <thead><tr><th>Name</th><th>Trips</th><th className="num">Revenue</th>{showProfit && <th className="num">Profit</th>}<th style={{ width: '30%' }} /></tr></thead>
              <tbody>{[...groups].sort((a, b) => b.revenue - a.revenue).map((g) => (
                <tr key={g.name}><td>{g.name}</td><td>{g.trips}</td><td className="num">{money(g.revenue, cur)}</td>{showProfit && <td className="num">{money(g.profit, cur)}</td>}
                  <td><div style={{ background: 'var(--primary)', height: 8, borderRadius: 4, width: `${(g.revenue / Math.max(...groups.map((x) => x.revenue), 1)) * 100}%` }} /></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </>}
    </>
  );
}
