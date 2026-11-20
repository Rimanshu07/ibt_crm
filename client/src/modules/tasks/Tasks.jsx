import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDateTime } from '../../core/api.js';
import { Empty, Loading, PageHeader, Tabs } from '../../core/ui.jsx';

const TABS = [['today', 'Today'], ['overdue', 'Overdue'], ['next7', 'Next 7 days'], ['upcoming', 'All upcoming'], ['done', 'Done'], ['all', 'All']];

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'today';
  const [mine, setMine] = useState(true);
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api(`/tasks?tab=${tab}${mine ? '&mine=1' : ''}`).then((r) => setRows(r.data)), [tab, mine]);
  useEffect(() => { setRows(null); load(); }, [load]);
  const toggle = async (t) => { await api(`/tasks/${t.id}/done`, { method: 'POST' }); load(); };
  return (
    <>
      <PageHeader title="Tasks & Follow-ups" subtitle="Add follow-ups from a trip's Overview tab"
        actions={<label className="checkbox"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only mine</label>} />
      <div className="card flush">
        <div style={{ padding: '0 12px' }}><Tabs value={tab} onChange={(k) => setParams({ tab: k })} tabs={TABS.map(([k, l]) => ({ key: k, label: l }))} /></div>
        {!rows ? <Loading /> : rows.length === 0 ? <Empty>Nothing here. 🎉</Empty> : (
          <table>
            <thead><tr><th /><th>Follow-up</th><th>Trip</th><th>Due</th><th>Assigned to</th></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.id}>
                <td style={{ width: 36 }}><input type="checkbox" checked={Boolean(t.done_at)} onChange={() => toggle(t)} aria-label="Done" /></td>
                <td style={{ textDecoration: t.done_at ? 'line-through' : 'none' }}>{t.body}</td>
                <td>{t.trip_id ? <Link to={`/app/trips/${t.trip_id}`}>#{t.trip_no} · {t.guest_name}</Link> : '—'}</td>
                <td className="nowrap" style={{ color: !t.done_at && t.due_at && new Date(t.due_at.replace(' ', 'T')) < new Date() ? 'var(--bad)' : undefined }}>{t.due_at ? fmtDateTime(t.due_at) : '—'}</td>
                <td>{t.assignee_name || t.created_by_name}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
