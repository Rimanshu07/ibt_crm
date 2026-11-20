import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../../core/api.js';
import { FormError, Input, Loading, Modal, PageHeader, Select, StatusBadge, useForm, useToast } from '../../core/ui.jsx';

export default function Admins() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api('/admin/admins').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  if (!rows) return <Loading />;
  return (
    <>
      <PageHeader title="Super Admins" subtitle="People who can manage the whole platform" actions={<button className="btn" onClick={() => setEditing({})}>+ Add super admin</button>} />
      <div className="card flush">
        <table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Last login</th><th /></tr></thead>
          <tbody>{rows.map((u) => <tr key={u.id}><td>{u.name}<div className="muted small">{u.phone}</div></td><td>{u.email}</td><td><StatusBadge status={u.status} /></td><td className="small">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td><td><button className="btn secondary small" onClick={() => setEditing(u)}>Edit</button></td></tr>)}</tbody></table>
      </div>
      {editing && <AdminDialog user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function AdminDialog({ user, onClose, onSaved }) {
  const toast = useToast();
  const f = useForm({ name: user.name || '', email: user.email || '', phone: user.phone || '', password: '', status: user.status || 'active' });
  const save = () => f.submit(async (v) => { const r = await api(user.id ? `/admin/admins/${user.id}` : '/admin/admins', { method: user.id ? 'PUT' : 'POST', body: v }); toast(r.message); onSaved(); });
  return (
    <Modal title={user.id ? 'Edit super admin' : 'New super admin'} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={f.busy} onClick={save}>Save</button></>}>
      <FormError errors={f.errors} />
      <div className="stack">
        <Input label="Name" value={f.values.name} onChange={f.set('name')} error={f.errors.name} />
        <Input label="Email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} />
        <Input label="Phone" value={f.values.phone} onChange={f.set('phone')} />
        <Input type="password" label={user.id ? 'New password (optional)' : 'Password'} value={f.values.password} onChange={f.set('password')} error={f.errors.password} />
        <Select label="Status" value={f.values.status} onChange={f.set('status')} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
      </div>
    </Modal>
  );
}
