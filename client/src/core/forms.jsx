import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MASTER_TYPES, DEFAULT_OPTIONS, SUPPLIER_SERVICES, SERVICES, listKey } from '@shared/catalog.js';
import { api, qs } from './api.js';
import { Field, Modal, useForm, FormError, useToast } from './ui.jsx';

/* ======================================================================
   Dropdown option lists with "+ Create new" (saved per organisation)
   ====================================================================== */
const optionCache = {};
const listeners = new Set();

export function useOptions(keys) {
  const wanted = useMemo(() => [...new Set(keys.filter(Boolean))], [keys.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, force] = useState(0);
  useEffect(() => {
    const missing = wanted.filter((k) => !optionCache[k]);
    if (missing.length) {
      missing.forEach((k) => { optionCache[k] = DEFAULT_OPTIONS[k] || []; });
      api(`/options${qs({ lists: missing.join(',') })}`).then((r) => { Object.assign(optionCache, r.data); listeners.forEach((f) => f()); }).catch(() => {});
    }
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, [wanted]);
  return Object.fromEntries(wanted.map((k) => [k, optionCache[k] || DEFAULT_OPTIONS[k] || []]));
}

export async function addOption(list, value) {
  await api(`/options/${list}`, { method: 'POST', body: { value } });
  optionCache[list] = [...new Set([...(optionCache[list] || []), value])];
  listeners.forEach((f) => f());
}

/* ======================================================================
   Combo: searchable dropdown, single or multiple, with "+ Create"
   ====================================================================== */
export function Combo({ options, value, onChange, multiple, placeholder = 'Select…', onCreate, createLabel = 'Create', onQuery, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 260, flip: false });

  const updatePos = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = 260;
    const flip = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    const width = Math.max(rect.width, 280);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(8, window.innerWidth - width - 12);
    }
    setPos({
      top: flip ? undefined : Math.round(rect.bottom + 2),
      bottom: flip ? Math.round(window.innerHeight - rect.top + 2) : undefined,
      left: Math.round(left),
      width: Math.round(width),
      flip,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const handleScrollOrResize = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      if (rect.bottom < -50 || rect.top > window.innerHeight + 50) {
        setOpen(false);
      } else {
        updatePos();
      }
    };
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (
        ref.current && !ref.current.contains(e.target) &&
        listRef.current && !listRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (open && listRef.current && listRef.current.children[hi]) {
      listRef.current.children[hi].scrollIntoView({ block: 'nearest' });
    }
  }, [hi, open]);

  useEffect(() => { if (onQuery) onQuery(q); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const norm = options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) }));
  const selected = multiple ? (value || []) : value;
  const shown = onQuery ? norm : norm.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const exact = norm.some((o) => o.label.toLowerCase() === q.trim().toLowerCase());
  const canCreate = onCreate && q.trim() && !exact;
  const pick = (v) => {
    if (multiple) onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    else { onChange(v); setOpen(false); }
    setQ('');
  };
  const create = async () => { const v = q.trim(); await onCreate(v); setQ(''); if (!multiple) setOpen(false); };
  const labelOf = (v) => norm.find((o) => String(o.value) === String(v))?.label ?? String(v);
  const key = (e) => {
    if (e.key === 'ArrowDown') { setHi((h) => Math.min(h + 1, shown.length - (canCreate ? 0 : 1))); e.preventDefault(); }
    if (e.key === 'ArrowUp') { setHi((h) => Math.max(h - 1, 0)); e.preventDefault(); }
    if (e.key === 'Enter') { e.preventDefault(); if (hi < shown.length) pick(shown[hi]?.value); else if (canCreate) create(); }
    if (e.key === 'Backspace' && !q && multiple && selected.length) onChange(selected.slice(0, -1));
    if (e.key === 'Escape') setOpen(false);
  };
  return (
    <div className="combo" ref={ref}>
      <div className="combo-input" onClick={() => { if (!disabled) { setOpen(true); updatePos(); } }} style={disabled ? { background: '#f9fafb' } : undefined}>
        {multiple && selected.map((v) => <span key={v} className="tag">{labelOf(v)}<span className="x" onClick={(e) => { e.stopPropagation(); pick(v); }}>✕</span></span>)}
        <input disabled={disabled} value={open ? q : (!multiple && selected !== null && selected !== undefined && selected !== '' ? labelOf(selected) : '')}
          placeholder={multiple && selected.length ? '' : placeholder} onFocus={() => { setOpen(true); setHi(0); updatePos(); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); updatePos(); }} onKeyDown={key} />
        {!multiple && selected && !disabled && <span className="icon-btn remove-x" onClick={(e) => { e.stopPropagation(); onChange(null); }}>✕</span>}
      </div>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={listRef}
          className={`combo-list portal ${pos.flip ? 'flipped' : ''}`}
          style={{
            position: 'fixed',
            top: pos.top !== undefined ? `${pos.top}px` : undefined,
            bottom: pos.bottom !== undefined ? `${pos.bottom}px` : undefined,
            left: `${pos.left}px`,
            width: `${pos.width}px`,
            maxHeight: '260px',
            zIndex: 99999,
          }}
        >
          {shown.slice(0, 200).map((o, i) => (
            <div key={o.value} className={i === hi ? 'hi' : ''} onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}>
              {multiple && <input type="checkbox" readOnly checked={selected.includes(o.value)} style={{ marginRight: 6 }} />}
              <div>{o.label}</div>
              {o.sub && <div className="sub">{o.sub}</div>}
            </div>
          ))}
          {!shown.length && !canCreate && <div className="sub" style={{ padding: '8px 12px' }}>No matches{onCreate ? ' – type to create' : ''}</div>}
          {canCreate && <div className={`create ${hi === shown.length ? 'hi' : ''}`} onMouseDown={(e) => { e.preventDefault(); create(); }}>+ {createLabel} “{q.trim()}”</div>}
        </div>,
        document.body
      )}
    </div>
  );
}

/** Dropdown backed by an option list; users can create new values. */
export function CreatableSelect({ list, value, onChange, multiple, extra = [], placeholder, options: fixed }) {
  const lists = useOptions(fixed ? [] : [list]);
  const toast = useToast();
  const options = [...new Set([...(fixed || lists[list] || []), ...extra, ...(multiple ? value || [] : value ? [value] : [])])];
  const create = fixed ? null : async (v) => {
    try { await addOption(list, v); onChange(multiple ? [...(value || []), v] : v); } catch (e) { toast(e.message, 'bad'); }
  };
  return <Combo options={options} value={multiple ? value || [] : value} onChange={onChange} multiple={multiple} placeholder={placeholder} onCreate={create} createLabel="Create new" />;
}

/* ======================================================================
   RefPicker: choose a record (hotel, supplier, visa...) with "+ Create new"
   ====================================================================== */
const REF_LABEL = { hotel: 'hotel', transport_service: 'transport service', activity_service: 'activity', supplier: 'supplier' };

export function RefPicker({ refType, value, onChange, service, onPicked, placeholder, disabled }) {
  const [opts, setOpts] = useState([]);
  const [current, setCurrent] = useState(null);
  const [creating, setCreating] = useState(null);
  const timer = useRef(null);
  const load = (q = '') => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => api(`/lookup/${refType}${qs({ q, service, limit: 50 })}`).then((r) => setOpts(r.data)).catch(() => {}), 200);
  };
  useEffect(() => { load(''); }, [refType, service]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!value) { setCurrent(null); return; }
    if (current?.id === Number(value)) return;
    const found = opts.find((o) => o.id === Number(value));
    if (found) setCurrent(found);
    else api(`/lookup/${refType}/${value}`).then((r) => setCurrent(r.data)).catch(() => setCurrent({ id: Number(value), name: `#${value}` }));
  }, [value, opts]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = current && !opts.some((o) => o.id === current.id) ? [current, ...opts] : opts;
  const choose = (id) => {
    const rec = all.find((o) => o.id === Number(id)) || null;
    setCurrent(rec); onChange(id ? Number(id) : null); onPicked?.(rec);
  };
  const label = REF_LABEL[refType] || MASTER_TYPES[refType]?.label?.toLowerCase() || 'record';
  return (
    <>
      <Combo disabled={disabled} options={all.map((o) => ({ value: o.id, label: o.name, sub: o.sub }))} value={value || null} onChange={choose}
        onQuery={load} placeholder={placeholder || `Search ${label}…`} onCreate={(name) => setCreating(name)} createLabel={`Create new ${label}`} />
      {creating !== null && (
        <QuickCreate refType={refType} name={creating} service={service} onClose={() => setCreating(null)}
          onCreated={(rec) => { setCreating(null); setOpts((o) => [rec, ...o]); setCurrent(rec); onChange(rec.id); onPicked?.(rec); }} />
      )}
    </>
  );
}

/** Minimal "create new" forms opened from any picker. */
const QUICK = {
  supplier: { path: '/suppliers', fields: [
    { key: 'name', label: 'Supplier name', type: 'text', required: true },
    { key: 'services', label: 'Provides', type: 'multiselect', options: SUPPLIER_SERVICES, required: true },
    { key: 'phone', label: 'Phone', type: 'text' }, { key: 'email', label: 'Email', type: 'text' }, { key: 'city', label: 'City', type: 'text' },
  ] },
  hotel: { path: '/hotels', fields: [
    { key: 'name', label: 'Hotel name', type: 'text', required: true },
    { key: 'location', label: 'Location', type: 'text', required: true, hint: 'City, State, Country' },
    { key: 'star', label: 'Category', type: 'select', list: 'stars' },
    { key: 'meal_plans', label: 'Meal plans', type: 'multiselect', list: 'meal_plans' },
    { key: 'rooms', label: 'Room types', type: 'list', hint: 'One per line' },
  ], map: (v) => ({ ...v, meal_plans: v.meal_plans?.length ? v.meal_plans : ['CP'], room_types: (v.rooms || []).map((name) => ({ name, aweb: 1, cweb: 1, cnb: 1 })) }) },
  transport_service: { path: '/transport', fields: [
    { key: 'from_location', label: 'From (A)', type: 'select', list: 'cities', required: true },
    { key: 'to_location', label: 'To (B)', type: 'select', list: 'cities' },
    { key: 'service', label: 'Service', type: 'select', list: 'transport_services', required: true },
    { key: 'distance_km', label: 'Distance (km)', type: 'number' },
  ] },
  activity_service: { path: '/activities', fields: [
    { key: 'name', label: 'Activity name', type: 'text', required: true }, { key: 'city', label: 'City', type: 'text' },
    { key: 'ticket', label: 'Ticket / service', type: 'text', required: true, default: 'Entry ticket' },
  ], map: (v) => ({ name: v.name, city: v.city, services: [{ name: v.ticket || 'Entry ticket' }] }) },
};

function QuickCreate({ refType, name, service, onClose, onCreated }) {
  const q = QUICK[refType];
  const fields = q?.fields || MASTER_TYPES[refType]?.fields || [];
  const first = fields[0]?.key;
  const f = useForm({ ...defaults(fields), [first]: name, ...(refType === 'supplier' && service ? { services: [service] } : {}) });
  const save = () => f.submit(async (v) => {
    const body = q?.map ? q.map(v) : v;
    const r = await api(q ? q.path : `/masters/${refType}`, { method: 'POST', body });
    const id = r.data.id;
    const rec = await api(`/lookup/${refType}/${id}`).then((x) => x.data).catch(() => ({ id, name: v[first] }));
    onCreated(rec);
  });
  return (
    <Modal title={`New ${REF_LABEL[refType] || MASTER_TYPES[refType]?.label || 'record'}`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={f.busy} onClick={save}>Create</button></>}>
      <FormError errors={f.errors} />
      <div className="grid grid-2">
        {fields.map((fd) => (
          <Field key={fd.key} label={fd.label + (fd.required ? ' *' : '')} hint={fd.hint} error={f.errors[fd.key]} className={['textarea', 'list'].includes(fd.type) ? 'span-all' : ''}>
            <FieldInput field={fd} value={f.values[fd.key]} onChange={f.set(fd.key)} />
          </Field>
        ))}
      </div>
      <p className="muted small mt">You can add full details later from Services & Suppliers.</p>
    </Modal>
  );
}

/* ======================================================================
   FieldInput: renders any catalogue field
   ====================================================================== */
export function FieldInput({ field, value, onChange, suggestions = [], service, onPicked, disabled }) {
  switch (field.type) {
    case 'textarea': return <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={4} />;
    case 'number': return <input type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case 'date': return <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case 'time': return <input type="time" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case 'boolean': return <label className="checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> Yes</label>;
    case 'select': return <CreatableSelect list={listKey(field)} options={field.strict ? field.options : undefined} value={value ?? null} onChange={onChange} extra={suggestions} />;
    case 'multiselect': return <CreatableSelect list={listKey(field)} options={field.options} value={value || []} onChange={onChange} multiple extra={suggestions} />;
    case 'list': return <textarea value={(value || []).join('\n')} onChange={(e) => onChange(e.target.value.split('\n'))} rows={4} placeholder="One per line" disabled={disabled} />;
    case 'ref': return <RefPicker refType={field.ref} value={value} onChange={onChange} service={field.service || service} onPicked={onPicked} disabled={disabled} />;
    default: return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={field.placeholder} />;
  }
}

/** Children count + age of each child. */
export function ChildrenAges({ ages = [], onChange, error }) {
  const setCount = (n) => {
    const c = Math.max(0, Math.min(Number(n) || 0, 20));
    onChange(Array.from({ length: c }, (_, i) => ages[i] ?? ''));
  };
  return (
    <Field label="Children (1–12 yrs)" error={error} hint={ages.length ? 'Age of each child (above 12 counts as adult)' : 'Above 12 years counts as adult'}>
      <div className="row wrap">
        <input type="number" min={0} max={20} value={ages.length} onChange={(e) => setCount(e.target.value)} style={{ width: 70 }} />
        {ages.map((a, i) => (
          <select key={i} value={a} style={{ width: 110 }} className={a === '' ? 'is-empty' : ''}
            onChange={(e) => onChange(ages.map((x, k) => (k === i ? (e.target.value === '' ? '' : Number(e.target.value)) : x)))}>
            <option value="">Child {i + 1} age</option>
            {Array.from({ length: 12 }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n} yr{n > 1 ? 's' : ''}</option>)}
          </select>
        ))}
      </div>
    </Field>
  );
}

/* ======================================================================
   Helpers
   ====================================================================== */
export function defaults(fields) {
  const v = {};
  fields.forEach((f) => { v[f.key] = f.default ?? (f.type === 'multiselect' || f.type === 'list' ? [] : f.type === 'boolean' ? false : ''); });
  return v;
}

export function displayValue(field, value, refName) {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'ref') return refName || `#${value}`;
  if (Array.isArray(value)) return value.map((x) => SERVICES[x]?.label || x).join(', ');
  if (field.type === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function toCsv(rows) {
  return rows.map((r) => r.map((c) => { const s = c === null || c === undefined ? '' : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
}

export function downloadFile(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
