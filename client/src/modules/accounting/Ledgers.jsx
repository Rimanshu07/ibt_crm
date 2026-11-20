import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Loading, Modal, PageHeader, Pills } from '../../core/ui.jsx';

const TYPE = { customer: 'Customer', supplier: 'Supplier', hotel: 'Hotel (direct)' };

/** Balance with every customer (per trip), supplier and hotel. */
export default function Ledgers() {
  const { me } = useAuth();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [ledger, setLedger] = useState(null);
  const cur = me.org.base_currency;
  useEffect(() => { setRows(null); api(`/finance/parties${type ? `?type=${type}` : ''}`).then((r) => setRows(r.data)); }, [type]);
  const open = async (p) => {
    const qsx = p.party_type === 'customer' ? `trip_id=${p.trip_id}` : `party_id=${p.party_id}`;
    const { data } = await api(`/finance/ledger?party_type=${p.party_type}&${qsx}`);
    setLedger({ party: p, ...data });
  };
  const list = (rows || []).filter((p) => !q || p.party_name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="Ledgers & Balances" subtitle="What each customer owes you and what you owe each supplier"
        actions={<><Pills value={type} onChange={setType} options={[{ key: '', label: 'All' }, { key: 'customer', label: 'Customers' }, { key: 'supplier', label: 'Suppliers' }, { key: 'hotel', label: 'Hotels' }]} />
          <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} /></>} />
      <div className="card flush">
        {!rows ? <Loading /> : list.length === 0 ? <Empty>No balances yet.</Empty> : (
          <table>
            <thead><tr><th>Party</th><th>Type</th><th>Trips</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th className="num">Overdue</th></tr></thead>
            <tbody>{list.map((p, i) => (
              <tr key={i} className="clickable" onClick={() => open(p)}>
                <td><strong>{p.party_name}</strong></td><td>{TYPE[p.party_type]} · {p.direction === 'in' ? 'receivable' : 'payable'}</td><td>{p.trips}</td>
                <td className="num">{money(p.total, cur)}</td><td className="num">{money(p.paid, cur)}</td><td className="num"><strong>{money(p.balance, cur)}</strong></td>
                <td className="num" style={{ color: Number(p.overdue) > 0 ? 'var(--bad)' : undefined }}>{money(p.overdue, cur)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {ledger && (
        <Modal wide title={`Ledger – ${ledger.party.party_name}`} onClose={() => setLedger(null)}>
          <h3>Instalments</h3>
          <table><thead><tr><th>Due</th><th>Trip</th><th>For</th><th className="num">Amount</th><th className="num">Paid</th></tr></thead>
            <tbody>{ledger.instalments.map((i) => <tr key={i.id}><td>{fmtDate(i.due_date)}</td><td><Link to={`/app/trips/${i.trip_id}?tab=accounting`}>#{i.trip_no}</Link></td><td className="small">{i.booking_title || i.guest_name}</td><td className="num">{money(i.amount, cur)}</td><td className="num">{money(i.paid_amount, cur)}</td></tr>)}</tbody></table>
          <h3 className="mt">Payments</h3>
          {ledger.transactions.length === 0 ? <p className="muted">None yet.</p> : (
            <table><thead><tr><th>Date</th><th>Mode</th><th>Reference</th><th className="num">Amount</th><th>Verified</th></tr></thead>
              <tbody>{ledger.transactions.map((x) => <tr key={x.id}><td>{fmtDate(x.paid_at)}</td><td>{x.mode}{x.account_name && <div className="muted small">{x.account_name}</div>}</td><td>{x.reference}</td><td className="num">{money(x.amount, cur)}</td><td>{x.verified_at ? '✓' : '—'}</td></tr>)}</tbody></table>
          )}
        </Modal>
      )}
    </>
  );
}
