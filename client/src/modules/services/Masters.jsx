import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MASTER_TYPES } from '@shared/catalog.js';
import { api, download } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Field, FormError, Loading, Modal, PageHeader, useConfirm, useForm, useToast } from '../../core/ui.jsx';
import { FieldInput, defaults, displayValue } from '../../core/forms.jsx';

/** Generic masters: destinations, sources, cab types, visa, trains, passport, insurance, land packages. */
export default function Masters() {
  const { type } = useParams();
  const def = MASTER_TYPES[type];
  const { can, hasFeature } = useAuth();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const load = () => api(`/masters/${type}`).then((r) => setRows(r.data));
  useEffect(() => { setRows(null); if (def) load(); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!def) return <Empty>Unknown list.</Empty>;
  if (def.feature && !hasFeature(def.feature)) return <Empty>{def.plural} is not enabled for your organisation.</Empty>;
  const cols = def.fields.filter((f) => !['textarea', 'list'].includes(f.type)).slice(0, 7);
  const list = (rows || []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title={def.plural} actions={<>
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <button className="btn secondary" onClick={() => download(`/masters/${type}/export`, `${type}.csv`)}>Export CSV</button>
        {can('masters.manage') && <button className="btn" onClick={() => setEditing({})}>Add New</button>}
      </>} />
      {type === 'land_package' && <div className="alert">Packages you buy from DMCs / vendors (often abroad). Add one to a quote as a "Land Package", then add your own flights and margin on top.</div>}
      <div className="card flush">
        {!rows ? <Loading /> : list.length === 0 ? <Empty>Nothing here yet.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}<th /></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id} className={`clickable ${r.is_active ? '' : 'muted-row'}`} onClick={() => can('masters.manage') && setEditing(r)}>
                {cols.map((c, i) => <td key={c.key}>{i === 0 ? <strong>{r.name}</strong> : displayValue(c, r.data[c.key], r._refs?.[c.key])}</td>)}
                <td>{!r.is_active && <span className="badge">Disabled</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {editing && <RecordDialog type={type} record={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

export function RecordDialog({ type, record, onClose, onSaved }) {
  const def = MASTER_TYPES[type];
  const toast = useToast();
  const confirm = useConfirm();
  const f = useForm({ ...defaults(def.fields), ...(record.data || {}) });
  const save = () => f.submit(async (v) => { const r = await api(record.id ? `/masters/${type}/${record.id}` : `/masters/${type}`, { method: record.id ? 'PUT' : 'POST', body: v }); toast(r.message); onSaved(r.data); });
  const toggle = async () => { const r = await api(`/masters/${type}/${record.id}/active`, { method: 'PUT', body: { active: !record.is_active } }); toast(r.message); onSaved(); };
  const del = async () => {
    if (!(await confirm({ title: `Delete ${record.name}?`, message: 'If it is used anywhere, disable it instead.', confirmText: 'Delete', tone: 'danger' }))) return;
    try { const r = await api(`/masters/${type}/${record.id}`, { method: 'DELETE' }); toast(r.message); onSaved(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Modal wide title={record.id ? `Edit ${record.name}` : `New ${def.label}`} onClose={onClose}
      footer={<>{record.id && <><button className="btn secondary" onClick={toggle}>{record.is_active ? 'Disable' : 'Enable'}</button><button className="btn ghost" onClick={del}>Delete</button></>}<span className="spacer" />
        <button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={f.busy} onClick={save}>Save</button></>}>
      <FormError errors={f.errors} />
      <div className="grid grid-3">
        {def.fields.map((fd) => (
          <Field key={fd.key} label={fd.label + (fd.required ? ' *' : '')} hint={fd.hint} error={f.errors[fd.key]} className={['textarea', 'list'].includes(fd.type) ? 'span-all' : ''}>
            <FieldInput field={fd} value={f.values[fd.key]} onChange={f.set(fd.key)} />
          </Field>
        ))}
      </div>
    </Modal>
  );
}
