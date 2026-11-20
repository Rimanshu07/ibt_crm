import { useEffect, useState } from 'react';
import { api, fmtDate } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Input, Loading, Modal, PageHeader, Select, StatusBadge, useForm, useToast } from '../../core/ui.jsx';

export default function Users() {
  const { me, refresh } = useAuth();
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = () => api('/org/users').then((r) => setUsers(r.data));
  useEffect(() => { load(); api('/org/roles').then((r) => setRoles(r.data)); }, []);
  if (!users) return <Loading />;

  const b = me.billing;
  const active = users.filter((u) => u.status === 'active').length;
  return (
    <>
      <PageHeader title="Users" subtitle={`${active} active${b?.max_users ? ` of ${b.max_users} allowed on your plan` : ''}`}
        actions={<button className="btn" onClick={() => setEditing({})}>Add user</button>} />
      <div className="card table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Last login</th><th>Status</th><th></th></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.id}>
            <td>{u.name} {u.is_org_owner ? <span className="badge info">Owner</span> : null}<div className="muted small">{u.designation ? `${u.designation} · ` : ''}{u.phone}</div></td>
            <td>{u.email}</td>
            <td>{u.roles.map((r) => r.name).join(', ') || '—'}</td>
            <td>{fmtDate(u.last_login_at)}</td>
            <td><StatusBadge status={u.status} /></td>
            <td style={{ textAlign: 'right' }}><button className="btn link small" onClick={() => setEditing(u)}>Edit</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      {editing && <UserDialog user={editing} roles={roles} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); refresh(); }} />}
    </>
  );
}

function UserDialog({ user, roles, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !user.id;
  const { values, set, setValues, errors, busy, submit } = useForm({
    name: user.name || '', email: user.email || '', phone: user.phone || '', designation: user.designation || '', password: '',
    status: user.status || 'active', role_ids: user.roles?.map((r) => r.id) || [],
  });
  const toggleRole = (id) => setValues((s) => ({
    ...s, role_ids: s.role_ids.includes(id) ? s.role_ids.filter((x) => x !== id) : [...s.role_ids, id],
  }));
  const save = () => submit(async (v) => {
    const body = { ...v, password: v.password || undefined };
    const r = await api(isNew ? '/org/users' : `/org/users/${user.id}`, { method: isNew ? 'POST' : 'PUT', body });
    toast(r.message || 'Saved');
    onSaved();
  });
  return (
    <Modal title={isNew ? 'Add user' : `Edit ${user.name}`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="stack">
        {errors._form && <div className="alert bad">{errors._form}</div>}
        <Input label="Full name" value={values.name} onChange={set('name')} error={errors.name} />
        <div className="grid grid-2">
          <Input label="Email (login)" type="email" value={values.email} onChange={set('email')} error={errors.email} />
          <Input label="Phone" value={values.phone} onChange={set('phone')} />
          <Input label="Designation" value={values.designation} onChange={set('designation')} />
        </div>
        <div className="grid grid-2">
          <Input label={isNew ? 'Starting password' : 'New password'} type="password" value={values.password} onChange={set('password')}
            error={errors.password} hint={isNew ? 'Share it with the user; they can change it later' : 'Leave empty to keep the current one'} />
          <Select label="Status" value={values.status} onChange={set('status')} disabled={user.is_org_owner}
            options={[{ value: 'active', label: 'Active (can log in)' }, { value: 'inactive', label: 'Inactive (blocked)' }]} />
        </div>
        <div>
          <label style={{ fontWeight: 600, fontSize: 13.5 }}>Roles</label>
          {errors.role_ids && <div className="error small" style={{ color: 'var(--bad)' }}>{errors.role_ids}</div>}
          <div className="grid grid-2" style={{ marginTop: 8 }}>
            {roles.map((r) => (
              <label key={r.id} className="checkbox">
                <input type="checkbox" checked={values.role_ids.includes(r.id)} onChange={() => toggleRole(r.id)} />
                <span>{r.name}<div className="muted small">{r.description}</div></span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
