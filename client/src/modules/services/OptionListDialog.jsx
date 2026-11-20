import { useState } from 'react';
import { DEFAULT_OPTIONS } from '@shared/catalog.js';
import { api } from '../../core/api.js';
import { Modal, useConfirm, useToast } from '../../core/ui.jsx';
import { addOption, useOptions } from '../../core/forms.jsx';

/** Manage one dropdown list (meal plans, room types, hotel groups, cab types...). */
export default function OptionListDialog({ list, title, onClose }) {
  const opts = useOptions([list])[list] || [];
  const [value, setValue] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const defaults = DEFAULT_OPTIONS[list] || [];
  const add = async () => { if (!value.trim()) return; try { await addOption(list, value.trim()); setValue(''); } catch (e) { toast(e.message, 'bad'); } };
  const remove = async (v) => {
    if (!(await confirm({ title: `Remove "${v}"?`, message: 'Existing records keep this value; it just disappears from the dropdown.', confirmText: 'Remove', tone: 'danger' }))) return;
    await api(`/options/${list}?value=${encodeURIComponent(v)}`, { method: 'DELETE' });
    location.reload();
  };
  return (
    <Modal title={title} onClose={onClose} footer={<button className="btn secondary" onClick={onClose}>Done</button>}>
      <div className="row mb"><input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a new value" /><button className="btn" onClick={add}>Add</button></div>
      <table><tbody>{opts.map((o) => (
        <tr key={o}><td>{o}</td><td className="right">{defaults.includes(o) ? <span className="muted small">built-in</span> : <button className="icon-btn" onClick={() => remove(o)}>🗑</button>}</td></tr>
      ))}</tbody></table>
    </Modal>
  );
}
