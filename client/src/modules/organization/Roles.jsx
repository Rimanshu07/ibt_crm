import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { Input, Loading, Modal, PageHeader, Select, useForm, useToast } from '../../core/ui.jsx';

const SCOPES = [
  { value: 'own', label: 'Only their own trips' },
  { value: 'team', label: "Their team's trips" },
  { value: 'all', label: 'All trips' },
];

export default function Roles() {
  const toast = useToast();
  const [roles, setRoles] = useState(null);
  const [perms, setPerms] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = () => api('/org/roles').then((r) => setRoles(r.data));
  useEffect(() => { load(); api('/org/permissions').then((r) => setPerms(r.data)); }, []);
  if (!roles) return <Loading />;

  const remove = async (r) => {
    if (!window.confirm(`Delete the role "${r.name}"?`)) return;
    try { await api(`/org/roles/${r.id}`, { method: 'DELETE' }); toast('Role deleted'); load(); } catch (e) { toast(e.message, 'bad'); }
  };

  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="A role is a set of things a user can do. Users can have more than one role."
        actions={<button className="btn" onClick={() => setEditing({})}>New role</button>} />
      <div className="card table-wrap"><table>
        <thead><tr><th>Role</th><th>Sees</th><th>Permissions</th><th>Users</th><th></th></tr></thead>
        <tbody>{roles.map((r) => (
          <tr key={r.id}>
            <td><strong>{r.name}</strong><div className="muted small">{r.description}</div></td>
            <td>{SCOPES.find((s) => s.value === r.scope)?.label}</td>
            <td>{r.permissions.length}</td>
            <td>{r.user_count}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <button className="btn link small" onClick={() => setEditing(r)}>Edit</button>
              {r.name !== 'Admin' && <button className="btn link small" onClick={() => remove(r)}>Delete</button>}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      {editing && <RoleDialog role={editing} perms={perms} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function RoleDialog({ role, perms, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !role.id;
  const { values, set, setValues, errors, busy, submit } = useForm({
    name: role.name || '', description: role.description || '', scope: role.scope || 'own', permissions: role.permissions || [],
  });
  const groups = [...new Set(perms.map((p) => p.group))];
  const has = (c) => values.permissions.includes(c);
  const toggle = (c) => setValues((s) => ({ ...s, permissions: has(c) ? s.permissions.filter((x) => x !== c) : [...s.permissions, c] }));
  const setGroup = (g, on) => setValues((s) => {
    const codes = perms.filter((p) => p.group === g).map((p) => p.code);
    const rest = s.permissions.filter((x) => !codes.includes(x));
    return { ...s, permissions: on ? [...rest, ...codes] : rest };
  });
  const save = () => submit(async (v) => {
    await api(isNew ? '/org/roles' : `/org/roles/${role.id}`, { method: isNew ? 'POST' : 'PUT', body: v });
    toast('Role saved');
    onSaved();
  });

  return (
    <Modal wide title={isNew ? 'New role' : `Edit ${role.name}`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save role'}</button></>}>
      <div className="stack">
        {errors._form && <div className="alert bad">{errors._form}</div>}
        <div className="grid grid-3">
          <Input label="Role name" value={values.name} onChange={set('name')} error={errors.name} disabled={role.name === 'Admin'} />
          <Input label="Description" value={values.description} onChange={set('description')} />
          <Select label="Which trips can they see?" value={values.scope} onChange={set('scope')} options={SCOPES} />
        </div>
        <div className="grid grid-2">
          {groups.map((g) => (
            <div key={g} className="card" style={{ padding: 14, marginTop: 0 }}>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <h3>{g}</h3>
                <span className="small">
                  <button className="btn link small" onClick={() => setGroup(g, true)}>All</button>
                  <button className="btn link small" onClick={() => setGroup(g, false)}>None</button>
                </span>
              </div>
              {perms.filter((p) => p.group === g).map((p) => (
                <label key={p.code} className="checkbox" style={{ padding: '4px 0' }}>
                  <input type="checkbox" checked={has(p.code)} onChange={() => toggle(p.code)} /> {p.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
