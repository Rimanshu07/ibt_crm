import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { Empty, Loading, PageHeader } from '../../core/ui.jsx';

const LABELS = {
  'org.registered': 'Organisation registered', 'org.approved': 'Organisation approved', 'org.rejected': 'Organisation rejected',
  'org.suspended': 'Organisation suspended', 'org.reactivated': 'Organisation reactivated', 'org.updated': 'Plan or price changed',
  'org.features_changed': 'Features changed', 'features.bulk': 'Features changed (bulk)', 'plan.created': 'Plan created',
  'plan.updated': 'Plan edited', 'user.created': 'User added', 'user.updated': 'User edited', 'role.created': 'Role created',
  'role.updated': 'Role edited', 'role.deleted': 'Role deleted', 'org.profile_updated': 'Organisation settings edited',
};

export default function AuditLog() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/admin/audit').then((r) => setRows(r.data)); }, []);
  if (!rows) return <Loading />;
  return (
    <>
      <PageHeader title="Audit Log" subtitle="The latest 200 actions across the platform" />
      <div className="card table-wrap">
        {rows.length === 0 ? <Empty>Nothing yet.</Empty> : (
          <table>
            <thead><tr><th>When</th><th>Who</th><th>Organisation</th><th>What</th><th>Details</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{r.created_at}</td>
                <td>{r.user_name || '—'}</td>
                <td>{r.org_name || '—'}</td>
                <td>{LABELS[r.action] || r.action}</td>
                <td className="muted small" style={{ maxWidth: 320, wordBreak: 'break-word' }}>
                  {r.details ? (typeof r.details === 'string' ? r.details : JSON.stringify(r.details)) : ''}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
