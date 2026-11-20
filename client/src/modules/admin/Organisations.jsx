import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, fmtDate } from '../../core/api.js';
import { Empty, Loading, PageHeader, StatusBadge } from '../../core/ui.jsx';

const TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Waiting for approval' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'rejected', label: 'Rejected' },
];

export default function Organisations() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    setRows(null);
    const qs = new URLSearchParams({ ...(status && { status }), ...(q && { q }) });
    const t = setTimeout(() => api(`/admin/orgs?${qs}`).then((r) => setRows(r.data)), 250);
    return () => clearTimeout(t);
  }, [status, q]);

  return (
    <>
      <PageHeader title="Organisations" subtitle="Travel companies using IBT Travels CRM" />
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${status === t.key ? 'active' : ''}`}
            onClick={() => setParams(t.key ? { status: t.key } : {})}>{t.label}</button>
        ))}
      </div>
      <div className="card">
        <input placeholder="Search by name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360, marginBottom: 12 }} />
        {!rows ? <Loading /> : rows.length === 0 ? <Empty>No organisations here.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Organisation</th><th>Country</th><th>Plan</th><th>Users</th><th>Registered</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => nav(`/admin/orgs/${o.id}`)}>
                  <td><strong>{o.name}</strong><div className="muted small">{o.email} · {o.phone}</div></td>
                  <td>{o.country_code}{o.city ? `, ${o.city}` : ''}</td>
                  <td>{o.plan_name || <span className="muted">—</span>}</td>
                  <td>{o.active_users}</td>
                  <td>{fmtDate(o.created_at)}</td>
                  <td><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
