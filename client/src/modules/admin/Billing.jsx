import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate } from '../../core/api.js';
import { Kpi, Loading, PageHeader, StatusBadge, Tabs, useConfirm, useToast } from '../../core/ui.jsx';

export default function Billing() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('current');
  const [rows, setRows] = useState(null);
  const [inv, setInv] = useState(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const loadInv = () => api('/admin/invoices').then((r) => setInv(r.data));
  useEffect(() => { api('/admin/billing').then((r) => setRows(r.data)); loadInv(); }, []);
  const generate = async () => {
    if (!(await confirm({ title: `Create invoices for ${period}?`, message: 'One invoice per active organisation at its current plan price. Existing invoices for this month are skipped.' }))) return;
    const r = await api('/admin/invoices/generate', { method: 'POST', body: { period } }); toast(r.message); loadInv();
  };
  const mark = async (i, status) => {
    const ref = status === 'paid' ? window.prompt('Payment reference (optional)') ?? '' : '';
    await api(`/admin/invoices/${i.id}`, { method: 'PUT', body: { status, payment_ref: ref } }); loadInv();
  };
  if (!rows || !inv) return <Loading />;
  const totals = rows.reduce((a, r) => ({ ...a, [r.currency]: (a[r.currency] || 0) + Number(r.monthly_total || 0) }), {});
  const due = inv.filter((i) => i.status === 'due').reduce((a, i) => ({ ...a, [i.currency]: (a[i.currency] || 0) + Number(i.amount) }), {});
  return (
    <>
      <PageHeader title="Billing & Invoices" subtitle="Charge = fee per organisation + fee per active user" />
      <div className="grid grid-3">
        <Kpi label="Monthly recurring" value={Object.entries(totals).map(([c, v]) => money(v, c)).join(' + ') || '0'} />
        <Kpi label="Unpaid invoices" value={Object.entries(due).map(([c, v]) => money(v, c)).join(' + ') || '0'} sub={`${inv.filter((i) => i.status === 'due').length} invoice(s)`} />
        <div className="kpi"><span className="stat-label">Create invoices for</span><div className="row"><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /><button className="btn" onClick={generate}>Generate</button></div></div>
      </div>
      <div className="card flush">
        <div style={{ padding: '0 12px' }}><Tabs value={tab} onChange={setTab} tabs={[{ key: 'current', label: 'Current charges' }, { key: 'invoices', label: 'Invoices', count: inv.length }]} /></div>
        {tab === 'current' ? (
          <table><thead><tr><th>Organisation</th><th>Plan</th><th className="num">Org fee</th><th className="num">Users × fee</th><th className="num">Monthly</th><th>Trial</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td><Link to={`/admin/orgs/${r.id}`}>{r.name}</Link> <StatusBadge status={r.status} /></td><td>{r.plan_name}</td><td className="num">{money(r.org_fee, r.currency)}</td><td className="num">{r.active_users} × {money(r.user_fee, r.currency)}</td><td className="num"><strong>{money(r.monthly_total, r.currency)}</strong></td><td className="small">{r.trial_ends_at ? fmtDate(r.trial_ends_at) : '—'}</td></tr>)}</tbody></table>
        ) : (
          <table><thead><tr><th>Invoice</th><th>Organisation</th><th>Month</th><th>Plan</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
            <tbody>{inv.map((i) => <tr key={i.id}><td>{i.invoice_no}</td><td><Link to={`/admin/orgs/${i.org_id}`}>{i.org_name}</Link></td><td>{i.period}</td><td className="small">{i.plan_name} · {i.users} users</td><td className="num">{money(i.amount, i.currency)}</td>
              <td><StatusBadge status={i.status} />{i.payment_ref && <div className="muted small">{i.payment_ref}</div>}</td>
              <td className="right">{i.status === 'due' && <><button className="btn small good" onClick={() => mark(i, 'paid')}>Mark paid</button><button className="btn ghost small" onClick={() => mark(i, 'void')}>Void</button></>}</td></tr>)}</tbody></table>
        )}
      </div>
    </>
  );
}
