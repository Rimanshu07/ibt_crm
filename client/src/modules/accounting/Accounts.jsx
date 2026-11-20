import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Kpi, Loading, PageHeader } from '../../core/ui.jsx';

const KIND = { bank: '🏦 Bank', cash: '💵 Cash', upi: '📱 UPI', card: '💳 Card', gateway: '🌐 Payment gateway' };

/** Bank / cash / UPI accounts money moves through, with balances. */
export default function Accounts() {
  const { me, can } = useAuth();
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/finance/accounts').then((r) => setRows(r.data)); }, []);
  const total = (rows || []).filter((a) => a.is_active).reduce((s, a) => s + Number(a.balance), 0);
  return (
    <>
      <PageHeader title="Accounts" subtitle="Bank, cash and UPI accounts and their balances"
        actions={can('settings.manage') && <Link className="btn" to="/app/organization?tab=bank-accounts">+ Add account</Link>} />
      {!rows ? <Loading /> : rows.length === 0 ? <div className="card"><Empty>No accounts yet. Add your bank accounts under Organization → Bank Accounts.</Empty></div> : (
        <>
          <div className="grid grid-3"><Kpi label="Total balance (active accounts)" value={money(total, me.org.base_currency)} /></div>
          <div className="card flush">
            <table>
              <thead><tr><th>Account</th><th>Type</th><th>Details</th><th className="num">Opening</th><th className="num">Money in</th><th className="num">Money out</th><th className="num">Balance</th><th /></tr></thead>
              <tbody>{rows.map((a) => (
                <tr key={a.id} className={a.is_active ? '' : 'muted-row'}>
                  <td><strong>{a.name}</strong>{a.is_default ? <span className="badge info" style={{ marginLeft: 6 }}>Default</span> : null}{!a.is_active && <span className="badge">Inactive</span>}</td>
                  <td>{KIND[a.kind]}</td>
                  <td className="small">{a.bank_name}{a.account_no && ` · ${a.account_no}`}{a.ifsc && ` · ${a.ifsc}`}{a.upi_id && ` · ${a.upi_id}`}</td>
                  <td className="num">{money(a.opening_balance, a.currency)}</td>
                  <td className="num" style={{ color: 'var(--good)' }}>{money(a.money_in, a.currency)}</td>
                  <td className="num" style={{ color: 'var(--bad)' }}>{money(a.money_out, a.currency)}</td>
                  <td className="num"><strong>{money(a.balance, a.currency)}</strong>{Number(a.unverified) > 0 && <div><span className="badge warn">{a.unverified} unverified</span></div>}</td>
                  <td><Link className="btn secondary small" to={`/app/accounting/transactions?account_id=${a.id}&from=2000-01-01`}>Statement</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
