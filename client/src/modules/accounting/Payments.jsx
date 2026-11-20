import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs, money } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Loading, PageHeader, Pills, Tabs } from '../../core/ui.jsx';
import { InstalmentTable, PayDialog } from './shared.jsx';

const TABS = [['today', 'Today'], ['overdue', 'Overdue'], ['next7', 'Next 7 days'], ['upcoming', 'All upcoming'], ['unverified', 'Unverified'], ['paid', 'Paid'], ['all', 'All']];

/** Incoming (customers) and outgoing (suppliers / hotels) payments — Sembark style. */
export default function Payments() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(params.entries());
  const direction = f.direction || 'in';
  const tab = f.tab || 'today';
  const [data, setData] = useState(null);
  const [paying, setPaying] = useState(null);
  const cur = me.org.base_currency;
  const set = (patch) => setParams(Object.fromEntries(Object.entries({ ...f, ...patch }).filter(([, v]) => v)));
  const load = () => api(`/finance/instalments${qs({ ...f, direction, tab })}`).then(setData).catch(() => setData({ data: [], counts: {} }));
  useEffect(() => { setData(null); const t = setTimeout(load, 200); return () => clearTimeout(t); }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = (k) => data?.counts?.[k];
  return (
    <>
      <PageHeader title={direction === 'in' ? 'Incoming Payments' : 'Outgoing Payments'} subtitle={direction === 'in' ? 'Money to collect from customers' : 'Money to pay suppliers and hotels'}
        actions={<>
          <Pills value={direction} onChange={(k) => set({ direction: k })} options={[{ key: 'in', label: 'Incoming' }, { key: 'out', label: 'Outgoing' }]} />
          <input placeholder="Search party, guest, trip no." value={f.q || ''} onChange={(e) => set({ q: e.target.value })} style={{ width: 240 }} />
          {direction === 'out' && <select value={f.party_type || ''} onChange={(e) => set({ party_type: e.target.value })} style={{ width: 150 }}><option value="">All parties</option><option value="supplier">Suppliers</option><option value="hotel">Hotels (direct)</option></select>}
        </>} />
      <div className="grid grid-4">
        {[['today', 'Due today'], ['overdue', 'Overdue'], ['next7', 'Next 7 days'], ['unverified', 'Waiting for verification']].map(([k, l]) => (
          <div key={k} className="kpi" style={{ cursor: 'pointer', borderColor: tab === k ? 'var(--primary)' : undefined }} onClick={() => set({ tab: k })}>
            <span className="stat-label">{l}</span><span className="stat-value" style={{ color: k === 'overdue' && c(k)?.due ? 'var(--bad)' : undefined }}>{c(k) ? money(c(k).due, cur) : '…'}</span>
            <span className="muted small">{c(k)?.n ?? '…'} instalment(s)</span>
          </div>
        ))}
      </div>
      <div className="card flush">
        <div style={{ padding: '0 12px' }}><Tabs value={tab} onChange={(k) => set({ tab: k })} tabs={TABS.map(([k, l]) => ({ key: k, label: l, count: c(k)?.n }))} /></div>
        {!data ? <Loading /> : data.data.length === 0 ? <Empty>Nothing here.</Empty>
          : <InstalmentTable rows={data.data} cur={cur} onPay={setPaying} showTrip showBooking={direction === 'out'} />}
      </div>
      {paying && <PayDialog inst={paying} cur={cur} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
    </>
  );
}
