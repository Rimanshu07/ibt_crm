import { createContext, useCallback, useContext, useState } from 'react';

/* ---------- Toast ---------- */
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const show = useCallback((message, tone = 'ok') => { setToast({ message, tone }); setTimeout(() => setToast(null), 4000); }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.tone === 'bad' ? 'bad' : ''}`} role="status">{toast.message}</div>}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

/* ---------- Confirmation dialog (promise based) ---------- */
const ConfirmContext = createContext(async () => false);
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title || 'Are you sure?'} onClose={() => close(false)}
          footer={<><button className="btn secondary" onClick={() => close(false)}>{state.cancelText || 'Cancel'}</button>
            <button className={`btn ${state.tone || ''}`} autoFocus onClick={() => close(true)}>{state.confirmText || 'Yes, continue'}</button></>}>
          <div className="stack">{typeof state.message === 'string' ? <p>{state.message}</p> : state.message}</div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
/** const confirm = useConfirm(); if (await confirm({ title, message, confirmText })) ... */
export const useConfirm = () => useContext(ConfirmContext);

/* ---------- Layout bits ---------- */
export function PageHeader({ title, subtitle, crumbs, actions, children }) {
  return (
    <>
      <div className="page-head">
        <div>
          {crumbs && <div className="crumbs">{crumbs}</div>}
          <h1>{title}</h1>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
        {actions && <div className="row wrap actions">{actions}</div>}
      </div>
      {children}
    </>
  );
}
export const Page = ({ children }) => <div className="page">{children}</div>;

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.filter(Boolean).map((t) => (
        <button key={t.key} role="tab" className={`tab ${value === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}{t.count !== undefined && t.count !== null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pills({ options, value, onChange }) {
  return (
    <div className="pills">
      {options.map((o) => <button key={o.key} className={`pill ${value === o.key ? 'active' : ''}`} onClick={() => onChange(o.key)}>{o.label}</button>)}
    </div>
  );
}

export function Pagination({ page, size, total, onChange }) {
  const pages = Math.max(Math.ceil(total / size), 1);
  if (total <= size) return <div className="muted small mt">Showing {total} item{total === 1 ? '' : 's'}</div>;
  return (
    <div className="row-between mt">
      <span className="muted small">Showing {(page - 1) * size + 1} – {Math.min(page * size, total)} of {total}</span>
      <div className="row">
        <button className="btn secondary small" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
        <span className="small">Page {page} / {pages}</span>
        <button className="btn secondary small" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

/* ---------- Form controls ---------- */
export function Field({ label, hint, error, children, className = '' }) {
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {error ? <span className="error">{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}
export function Input({ label, hint, error, className, ...props }) {
  return <Field label={label} hint={hint} error={error} className={className}><input {...props} value={props.value ?? ''} /></Field>;
}
export function Textarea({ label, hint, error, className, ...props }) {
  return <Field label={label} hint={hint} error={error} className={className}><textarea {...props} value={props.value ?? ''} /></Field>;
}
export function Select({ label, hint, error, options, placeholder, className, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <select {...props} value={props.value ?? ''}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </Field>
  );
}
export function Toggle({ checked, onChange, label }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}
export function Check({ checked, onChange, children }) {
  return <label className="checkbox"><input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} /> {children}</label>;
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, footer, wide, xwide }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''} ${xwide ? 'xwide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Badges & states ---------- */
const TONES = { active: 'good', pending: 'warn', suspended: 'bad', rejected: 'bad', inactive: '', paid: 'good', due: 'warn', void: '' };
export function StatusBadge({ status, label }) {
  const text = label || (status ? status[0].toUpperCase() + status.slice(1).replace(/_/g, ' ') : '');
  return <span className={`badge ${TONES[status] ?? ''}`}>{text}</span>;
}
export const Badge = ({ tone = '', children }) => <span className={`badge ${tone}`}>{children}</span>;
export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="empty">Loading…</div>;
export const Kpi = ({ label, value, sub, onClick }) => (
  <div className="kpi" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
    <span className="stat-label">{label}</span><span className="stat-value">{value}</span>{sub && <span className="muted small">{sub}</span>}
  </div>
);

/** Small form hook: values, per-field errors, submit helper. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValues((s) => ({ ...s, [key]: v }));
    setErrors((s) => ({ ...s, [key]: undefined }));
  };
  const submit = async (fn) => {
    setBusy(true); setErrors({});
    try { return await fn(values); } catch (err) { setErrors({ _form: err.message, ...(err.fields || {}) }); return { error: err }; } finally { setBusy(false); }
  };
  return { values, setValues, set, errors, setErrors, busy, submit };
}

/** Shows the form-level error from useForm. */
export const FormError = ({ errors }) => (errors?._form ? <div className="alert bad mb">{errors._form}</div> : null);
