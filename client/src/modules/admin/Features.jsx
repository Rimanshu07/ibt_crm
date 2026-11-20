import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { Input, Loading, Modal, PageHeader, useToast } from '../../core/ui.jsx';

export default function Features() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api('/admin/features').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const save = async () => { try { await api(`/admin/features/${editing.code}`, { method: 'PUT', body: editing }); toast('Feature saved'); setEditing(null); load(); } catch (e) { toast(e.message, 'bad'); } };
  if (!rows) return <Loading />;
  return (
    <>
      <PageHeader title="Feature Catalogue" subtitle="Every module that can be switched on or off per organisation and per plan" />
      <div className="card flush">
        <table><thead><tr><th>Module</th><th>Feature</th><th>Code</th><th>Organisations using</th><th /></tr></thead>
          <tbody>{rows.map((f) => <tr key={f.code}><td>{f.module}</td><td><strong>{f.name}</strong><div className="muted small">{f.description}</div></td><td><code>{f.code}</code></td><td>{f.org_count}</td><td><button className="btn secondary small" onClick={() => setEditing({ code: f.code, name: f.name, description: f.description || '', module: f.module })}>Edit</button></td></tr>)}</tbody></table>
      </div>
      {editing && (
        <Modal title={`Edit ${editing.code}`} onClose={() => setEditing(null)} footer={<><button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
          <div className="stack"><Input label="Module" value={editing.module} onChange={(e) => setEditing({ ...editing, module: e.target.value })} /><Input label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /><Input label="Description" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
        </Modal>
      )}
    </>
  );
}
