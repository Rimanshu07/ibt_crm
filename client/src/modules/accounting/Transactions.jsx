import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs, money, todayIso } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Kpi, Loading, PageHeader, Pills } from '../../core/ui.jsx';
import { downloadFile, toCsv } from '../../core/forms.jsx';
import { TxnTable } from './shared.jsx';

export default function Transactions() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const f = { from: `${todayIso().slice(0, 8)}01`, to: todayIso(), ...Object.fromEntries(params.entries()) };
  const [rows, setRows] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const cur = me.org.base_currency;
  const set = (patch) => setParams(Object.fromEntries(Object.entries({ ...f, ...patch }).filter(([, v]) => v)));
  const load = () => api(`/finance/transactions${qs(f)}`).then((r) => setRows(r.data));
  useEffect(() => { api('/finance/accounts').then((r) => setAccounts(r.data)).catch(() => {}); }, []);
  useEffect(() => { setRows(null); const t = setTimeout(load, 200); return () => clearTimeout(t); }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = (d) => (rows || []).filter((x) => x.direction === d).reduce((s, x) => s + Number(x.amount), 0);
  const exportCsv = () => downloadFile(`transactions-${f.from}-${f.to}.csv`, toCsv([
    ['Date', 'Trip', 'Direction', 'Party', 'Amount', 'Mode', 'Account', 'Reference', 'Logged by', 'Verified by'],
    ...rows.map((x) => [x.paid_at.slice(0, 10), x.trip_no || '', x.direction === 'in' ? 'Received' : 'Paid', x.party_name, x.amount, x.mode, x.account_name || '', x.reference, x.created_by_name, x.verified_by_name || '']),
  ]));
  return (
    <>
      <PageHeader title="Transactions" subtitle="Every receipt and payment logged"
        actions={<>
          <Pills value={f.verified || ''} onChange={(k) => set({ verified: k })} options={[{ key: '', label: 'All' }, { key: '0', label: 'Not verified' }, { key: '1', label: 'Verified' }]} />
          <Pills value={f.direction || ''} onChange={(k) => set({ direction: k })} options={[{ key: '', label: 'In & out' }, { key: 'in', label: 'Received' }, { key: 'out', label: 'Paid' }]} />
        </>} />
      <div className="filters row wrap">
        <span className="small muted">From</span><input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} style={{ width: 150 }} />
        <span className="small muted">To</span><input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} style={{ width: 150 }} />
        <select value={f.account_id || ''} onChange={(e) => set({ account_id: e.target.value })} style={{ width: 200 }}><option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <input placeholder="Search party, reference, trip" value={f.q || ''} onChange={(e) => set({ q: e.target.value })} style={{ width: 220 }} />
        <span className="spacer" />{rows?.length > 0 && <button className="btn secondary small" onClick={exportCsv}>Export CSV</button>}
      </div>
      <div className="grid grid-3">
        <Kpi label="Received" value={money(sum('in'), cur)} /><Kpi label="Paid" value={money(sum('out'), cur)} /><Kpi label="Net" value={money(sum('in') - sum('out'), cur)} />
      </div>
      <div className="card flush">{!rows ? <Loading /> : rows.length === 0 ? <Empty>No transactions.</Empty> : <TxnTable rows={rows} cur={cur} onChange={load} showTrip />}</div>
    </>
  );
}
