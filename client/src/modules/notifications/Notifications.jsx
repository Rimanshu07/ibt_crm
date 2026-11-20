import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDateTime, ago } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Loading, PageHeader, Pills } from '../../core/ui.jsx';

const ICON = { 'trip.assigned': '🧳', 'trip.converted': '✅', 'task.assigned': '📌', 'payment.logged': '💰', 'payment.verified': '✔️' };

export default function Notifications() {
  const { setUnread } = useAuth();
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState(null);
  const load = () => api(`/notifications${filter ? '?unread=1' : ''}`).then((r) => { setRows(r.data); setUnread(r.unread); });
  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const read = async (n) => { if (!n.read_at) { await api(`/notifications/${n.id}/read`, { method: 'POST' }); load(); } };
  const readAll = async () => { await api('/notifications/read-all', { method: 'POST' }); load(); };
  return (
    <>
      <PageHeader title="Notifications" subtitle="Assignments, conversions and payments that need you"
        actions={<><Pills value={filter} onChange={setFilter} options={[{ key: '', label: 'All' }, { key: 'unread', label: 'Unread' }]} /><button className="btn secondary" onClick={readAll}>Mark all as read</button></>} />
      <div className="card flush">
        {!rows ? <Loading /> : rows.length === 0 ? <Empty>No notifications.</Empty> : (
          <table><tbody>{rows.map((n) => (
            <tr key={n.id} style={{ background: n.read_at ? undefined : '#f5f8ff' }} onClick={() => read(n)}>
              <td style={{ width: 36, fontSize: 18 }}>{ICON[n.type] || '🔔'}</td>
              <td>{n.link ? <Link to={n.link}><strong>{n.title}</strong></Link> : <strong>{n.title}</strong>}<div className="muted small">{n.body}</div></td>
              <td className="nowrap small muted" title={fmtDateTime(n.created_at)}>{ago(n.created_at)}</td>
              <td>{!n.read_at && <span className="badge info">New</span>}</td>
            </tr>
          ))}</tbody></table>
        )}
      </div>
    </>
  );
}
