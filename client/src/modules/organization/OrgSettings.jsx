import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PAYMENT_EVENTS, SERVICES, SUPPLIER_SERVICES } from '@shared/catalog.js';
import { PLACEHOLDERS } from '@shared/templates.js';
import { describePref } from '@shared/pricing.js';
import { api, readDataUrl, fmtDateTime } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import OptionListDialog from '../services/OptionListDialog.jsx';
import { useOptions } from '../../core/forms.jsx';
import { Check, Empty, Field, FormError, Input, Loading, Modal, PageHeader, Select, Tabs, useConfirm, useForm, useToast } from '../../core/ui.jsx';

const TABS = [
  { key: 'profile', label: 'Company' }, { key: 'offices', label: 'Offices' }, { key: 'bank-accounts', label: 'Bank Accounts' },
  { key: 'branding', label: 'Header & Footer' }, { key: 'templates', label: 'Templates' },
  { key: 'supplier-prefs', label: 'Supplier Payment Prefs' }, { key: 'customer-prefs', label: 'Customer Payment Prefs' },
  { key: 'lists', label: 'Dropdown Lists' }, { key: 'content', label: 'Inc/Exclusions' }, { key: 'tnc', label: 'T&C' }, { key: 'taxes', label: 'Taxes' },
];

export default function OrgSettings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'profile';
  return (
    <>
      <PageHeader title="Organization" subtitle="Company details, offices, bank accounts, documents and defaults"
        actions={<><Link className="btn secondary" to="/app/users">Users</Link><Link className="btn secondary" to="/app/roles">Roles</Link><Link className="btn secondary" to="/app/plan">Plan & Features</Link></>} />
      <div className="card flush">
        <div style={{ padding: '0 12px' }}><Tabs value={tab} onChange={(k) => setParams({ tab: k })} tabs={TABS} /></div>
        <div style={{ padding: '4px 16px 16px' }}>
          {tab === 'profile' && <Profile />}
          {tab === 'offices' && <Offices />}
          {tab === 'bank-accounts' && <Banks />}
          {tab === 'branding' && <Branding />}
          {tab === 'templates' && <Templates />}
          {tab === 'supplier-prefs' && <Prefs kind="supplier" />}
          {tab === 'customer-prefs' && <Prefs kind="customer" />}
          {tab === 'lists' && <Lists />}
          {tab === 'content' && <Content kind="inc_exc" />}
          {tab === 'tnc' && <Content kind="tnc" />}
          {tab === 'taxes' && <Taxes />}
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Company ------------------------------ */
function Profile() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [meta, setMeta] = useState(null);
  const f = useForm(null);
  useEffect(() => {
    Promise.all([api('/org/profile'), api('/meta/countries'), api('/meta/currencies'), api('/meta/timezones')]).then(([p, c, cu, tz]) => {
      f.setValues(Object.fromEntries(Object.entries(p.data).map(([k, v]) => [k, v ?? ''])));
      setMeta({ countries: c.data, currencies: cu.data, timezones: tz.data });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f.values || !meta) return <Loading />;
  const v = f.values;
  const save = () => f.submit(async (val) => {
    const keys = ['name', 'legal_name', 'phone', 'country_code', 'city', 'state', 'pincode', 'address', 'tax_id', 'pan', 'website', 'base_currency', 'timezone', 'default_tax_rate', 'brand_prefix'];
    const r = await api('/org/profile', { method: 'PUT', body: Object.fromEntries(keys.map((k) => [k, val[k]])) }); toast(r.message); refresh();
  });
  return (
    <div className="stack">
      <FormError errors={f.errors} />
      <div className="grid grid-3">
        <Input label="Company name *" value={v.name} onChange={f.set('name')} error={f.errors.name} />
        <Input label="Legal name (on invoices)" value={v.legal_name} onChange={f.set('legal_name')} />
        <Input label="Login / billing email" value={v.email} disabled />
        <Input label="Phone" value={v.phone} onChange={f.set('phone')} />
        <Input label="Website" value={v.website} onChange={f.set('website')} />
        <Input label="Trip number prefix" value={v.brand_prefix} onChange={f.set('brand_prefix')} hint="e.g. IBT → IBT-1001 on documents" />
        <Input className="span-2" label="Address" value={v.address} onChange={f.set('address')} />
        <Input label="City" value={v.city} onChange={f.set('city')} />
        <Input label="State" value={v.state} onChange={f.set('state')} hint="Used for CGST/SGST vs IGST" />
        <Input label="PIN / ZIP" value={v.pincode} onChange={f.set('pincode')} />
        <Select label="Country" value={v.country_code} onChange={f.set('country_code')} options={meta.countries.map((c) => ({ value: c.code, label: c.name }))} />
        <Input label="GSTIN / VAT / Tax no." value={v.tax_id} onChange={f.set('tax_id')} />
        <Input label="PAN" value={v.pan} onChange={f.set('pan')} />
        <Input label="Default tax %" type="number" value={v.default_tax_rate} onChange={f.set('default_tax_rate')} />
        <Select label="Base currency" value={v.base_currency} onChange={f.set('base_currency')} options={meta.currencies.map((c) => ({ value: c.code, label: `${c.code} – ${c.name}` }))} />
        <Select label="Time zone" value={v.timezone} onChange={f.set('timezone')} options={meta.timezones} />
      </div>
      <div className="form-actions"><button className="btn" disabled={f.busy} onClick={save}>Save company details</button></div>
    </div>
  );
}

/* --------------------------- Generic CRUD list --------------------------- */
function useRows(table, query = '') {
  const [rows, setRows] = useState(null);
  const load = () => api(`/org/${table}${query}`).then((r) => setRows(r.data));
  useEffect(() => { setRows(null); load(); }, [table, query]); // eslint-disable-line react-hooks/exhaustive-deps
  return [rows, load];
}

function useRemove(table, load) {
  const confirm = useConfirm();
  const toast = useToast();
  return async (row, what) => {
    if (!(await confirm({ title: `Delete ${what}?`, message: 'This cannot be undone.', confirmText: 'Delete', tone: 'danger' }))) return;
    try { await api(`/org/${table}/${row.id}`, { method: 'DELETE' }); toast('Deleted'); load(); } catch (e) { toast(e.message, 'bad'); }
  };
}

/* ------------------------------ Offices ------------------------------ */
function Offices() {
  const [rows, load] = useRows('offices');
  const [editing, setEditing] = useState(null);
  const remove = useRemove('offices', load);
  if (!rows) return <Loading />;
  return (
    <>
      <div className="row-between mb"><p className="muted">Branches and offices. The head office appears on documents.</p><button className="btn" onClick={() => setEditing({})}>+ Add office</button></div>
      {rows.length === 0 ? <Empty>No offices yet.</Empty> : (
        <div className="grid grid-3">{rows.map((o) => (
          <div key={o.id} className="card">
            <div className="row-between"><h3>{o.name} {o.is_head ? <span className="badge info">Head office</span> : null}</h3>
              <span><button className="btn secondary xs" onClick={() => setEditing(o)}>Edit</button> <button className="btn remove xs" onClick={() => remove(o, o.name)}>Delete</button></span></div>
            <p className="small">{[o.address, o.city, o.state, o.pincode, o.country].filter(Boolean).join(', ')}</p>
            <p className="muted small">{o.phone} {o.email}{o.tax_id && <><br />GSTIN {o.tax_id}</>}</p>
          </div>
        ))}</div>
      )}
      {editing && <RowDialog table="offices" row={editing} title="Office" onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}
        fields={[['name', 'Office name *'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address', 'span-all'], ['city', 'City'], ['state', 'State'], ['country', 'Country'], ['pincode', 'PIN / ZIP'], ['tax_id', 'GSTIN / Tax no.'], ['is_head', 'Head office', 'check']]} />}
    </>
  );
}

/* ---------------------------- Bank accounts ---------------------------- */
const KINDS = [{ value: 'bank', label: 'Bank account' }, { value: 'upi', label: 'UPI' }, { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card / POS' }, { value: 'gateway', label: 'Payment gateway' }];
function Banks() {
  const [rows, load] = useRows('bank-accounts');
  const [editing, setEditing] = useState(null);
  const remove = useRemove('bank-accounts', load);
  if (!rows) return <Loading />;
  return (
    <>
      <div className="row-between mb"><p className="muted">Accounts you receive and pay money through. Ticked accounts are printed on quotes and invoices. Balances are under <Link to="/app/accounting/accounts">Accounting → Accounts</Link>.</p>
        <button className="btn" onClick={() => setEditing({ kind: 'bank', currency: 'INR', show_on_docs: true, is_active: true })}>+ Add account</button></div>
      {rows.length === 0 ? <Empty>No accounts yet.</Empty> : (
        <table><thead><tr><th>Name</th><th>Type</th><th>Bank details</th><th>Currency</th><th>On documents</th><th /></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id} className={a.is_active ? '' : 'muted-row'}>
              <td><strong>{a.name}</strong>{a.is_default ? <span className="badge info" style={{ marginLeft: 6 }}>Default</span> : null}</td><td>{KINDS.find((k) => k.value === a.kind)?.label}</td>
              <td className="small">{a.bank_name} {a.account_name && `· ${a.account_name}`} {a.account_no && `· ${a.account_no}`} {a.ifsc && `· ${a.ifsc}`} {a.upi_id && `· ${a.upi_id}`}</td>
              <td>{a.currency}</td><td>{a.show_on_docs ? '✓' : '—'}</td>
              <td className="right"><button className="btn secondary xs" onClick={() => setEditing({ ...a, show_on_docs: Boolean(a.show_on_docs), is_default: Boolean(a.is_default), is_active: Boolean(a.is_active) })}>Edit</button> <button className="btn remove xs" onClick={() => remove(a, a.name)}>Delete</button></td>
            </tr>
          ))}</tbody></table>
      )}
      {editing && <RowDialog table="bank-accounts" row={editing} title="Account" onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}
        fields={[['kind', 'Type', 'select', KINDS], ['name', 'Display name *'], ['currency', 'Currency'], ['bank_name', 'Bank name'], ['account_name', 'Account holder name'], ['account_no', 'Account number'],
          ['ifsc', 'IFSC'], ['swift', 'SWIFT'], ['branch', 'Branch'], ['upi_id', 'UPI ID'], ['opening_balance', 'Opening balance', 'number'],
          ['show_on_docs', 'Show on quotes & invoices', 'check'], ['is_default', 'Default account', 'check'], ['is_active', 'Active', 'check']]} />}
    </>
  );
}

function RowDialog({ table, row, title, fields, onClose, onSaved }) {
  const toast = useToast();
  const f = useForm(Object.fromEntries(fields.map(([k, , t]) => [k, row[k] ?? (t === 'check' ? false : '')])));
  const save = () => f.submit(async (v) => {
    const body = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fields.find((y) => y[0] === k)[2] === 'check' ? Boolean(x) : x]));
    await api(row.id ? `/org/${table}/${row.id}` : `/org/${table}`, { method: row.id ? 'PUT' : 'POST', body }); toast(`${title} saved`); onSaved();
  });
  return (
    <Modal wide title={row.id ? `Edit ${title.toLowerCase()}` : `New ${title.toLowerCase()}`} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={f.busy} onClick={save}>Save</button></>}>
      <FormError errors={f.errors} />
      <div className="grid grid-3">{fields.map(([k, label, type, opts]) => (
        type === 'check' ? <div key={k} className="row"><Check checked={f.values[k]} onChange={f.set(k)}>{label}</Check></div>
          : type === 'select' ? <Select key={k} label={label} value={f.values[k]} onChange={f.set(k)} options={opts} />
            : <Input key={k} className={type === 'span-all' ? 'span-all' : ''} type={type === 'number' ? 'number' : 'text'} label={label} value={f.values[k]} onChange={f.set(k)} error={f.errors[k]} />
      ))}</div>
    </Modal>
  );
}

/* --------------------------- Header & footer --------------------------- */
function ImagePick({ label, value, onChange, hint }) {
  const toast = useToast();
  const pick = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2_000_000) { toast('Image must be under 2 MB', 'bad'); return; }
    onChange(await readDataUrl(file));
  };
  return (
    <Field label={label} hint={hint}>
      <div className="row">{value && <img src={value} alt="" style={{ maxHeight: 48, maxWidth: 200, border: '1px solid var(--line)', borderRadius: 4 }} />}
        <input type="file" accept="image/*" onChange={pick} style={{ maxWidth: 230 }} />{value && <button className="btn ghost small" onClick={() => onChange('')}>Remove</button>}</div>
    </Field>
  );
}

function Branding() {
  const toast = useToast();
  const [v, setV] = useState(null);
  useEffect(() => { api('/org/profile').then((r) => setV({ ...r.data, branding: { primary_color: '#2563eb', header: { mode: 'text', align: 'left', show_logo: true, show_contact: true, title: '', subtitle: '' }, footer: { mode: 'text', text: '', show_page_no: true }, ...(r.data.branding || {}) } })); }, []);
  if (!v) return <Loading />;
  const b = v.branding;
  const setB = (patch) => setV({ ...v, branding: { ...b, ...patch } });
  const setH = (patch) => setB({ header: { ...b.header, ...patch } });
  const setF = (patch) => setB({ footer: { ...b.footer, ...patch } });
  const save = async () => {
    try { const r = await api('/org/branding', { method: 'PUT', body: { logo_url: v.logo_url || '', header_image: v.header_image || '', footer_image: v.footer_image || '', branding: b } }); toast(r.message); } catch (e) { toast(e.message, 'bad'); }
  };
  const contact = [v.address, v.city, v.phone, v.email].filter(Boolean).join(' · ');
  return (
    <div className="layout-side" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="stack">
        <ImagePick label="Logo" value={v.logo_url} onChange={(x) => setV({ ...v, logo_url: x })} hint="PNG/JPG, under 2 MB" />
        <Field label="Accent colour"><input type="color" value={b.primary_color} onChange={(e) => setB({ primary_color: e.target.value })} style={{ width: 80, height: 34 }} /></Field>
        <h3>Header</h3>
        <div className="row"><label className="checkbox"><input type="radio" checked={b.header.mode === 'text'} onChange={() => setH({ mode: 'text' })} /> Logo & text</label><label className="checkbox"><input type="radio" checked={b.header.mode === 'image'} onChange={() => setH({ mode: 'image' })} /> Letter-head image</label></div>
        {b.header.mode === 'image' ? <ImagePick label="Header image" value={v.header_image} onChange={(x) => setV({ ...v, header_image: x })} hint="Full-width banner, about 1600 × 250 px" /> : <>
          <Input label="Title (defaults to company name)" value={b.header.title} onChange={(e) => setH({ title: e.target.value })} />
          <Input label="Tagline" value={b.header.subtitle} onChange={(e) => setH({ subtitle: e.target.value })} placeholder="e.g. Your trusted travel partner since 2005" />
          <div className="row wrap"><Select label="Align" value={b.header.align} onChange={(e) => setH({ align: e.target.value })} options={['left', 'center', 'right']} />
            <Check checked={b.header.show_logo} onChange={(x) => setH({ show_logo: x })}>Show logo</Check><Check checked={b.header.show_contact} onChange={(x) => setH({ show_contact: x })}>Show address & contact</Check></div>
        </>}
        <h3>Footer</h3>
        <div className="row"><label className="checkbox"><input type="radio" checked={b.footer.mode === 'text'} onChange={() => setF({ mode: 'text' })} /> Text</label><label className="checkbox"><input type="radio" checked={b.footer.mode === 'image'} onChange={() => setF({ mode: 'image' })} /> Image</label></div>
        {b.footer.mode === 'image' ? <ImagePick label="Footer image" value={v.footer_image} onChange={(x) => setV({ ...v, footer_image: x })} />
          : <Field label="Footer text"><textarea rows={3} value={b.footer.text} onChange={(e) => setF({ text: e.target.value })} placeholder="Registered office, licence numbers, social links…" /></Field>}
        <button className="btn" style={{ width: 'fit-content' }} onClick={save}>Save header & footer</button>
      </div>
      <div>
        <h3>Preview (quotes, vouchers, invoices)</h3>
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 20, background: '#fff', minHeight: 360, display: 'flex', flexDirection: 'column' }}>
          {b.header.mode === 'image' && v.header_image ? <img src={v.header_image} alt="" style={{ width: '100%' }} /> : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: b.header.align === 'center' ? 'center' : 'flex-start', flexDirection: b.header.align === 'right' ? 'row-reverse' : 'row', borderBottom: `3px solid ${b.primary_color}`, paddingBottom: 10, textAlign: b.header.align }}>
              {b.header.show_logo && v.logo_url && <img src={v.logo_url} alt="" style={{ maxHeight: 50 }} />}
              <div><div style={{ fontWeight: 700, fontSize: 18 }}>{b.header.title || v.legal_name || v.name}</div>{b.header.subtitle && <div className="muted small">{b.header.subtitle}</div>}{b.header.show_contact && <div className="muted small">{contact}</div>}</div>
            </div>
          )}
          <h2 style={{ color: b.primary_color, margin: '14px 0' }}>Holiday Quotation</h2>
          <div className="muted small" style={{ flex: 1 }}>Itinerary, hotels, prices…</div>
          <div style={{ borderTop: `2px solid ${b.primary_color}`, paddingTop: 8, textAlign: 'center' }} className="muted small">
            {b.footer.mode === 'image' && v.footer_image ? <img src={v.footer_image} alt="" style={{ maxWidth: '100%' }} /> : (b.footer.text || `${v.name} · ${v.phone || ''} · ${v.email || ''}`)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Templates ------------------------------ */
const SETTING_LABELS = {
  attach_pdf: 'Attach the quote PDF', show_cover: 'Cover banner', show_itinerary: 'Day-wise itinerary', show_hotels: 'Hotels table', show_service_prices: 'Price per service',
  show_per_person: 'Per-person price', show_inclusions: 'Inclusions & exclusions', show_tnc: 'Terms & conditions', show_bank: 'Bank details', show_schedule: 'Payment schedule',
  show_emergency: 'Contacts during the trip', show_driver: 'Driver details', show_price: 'Show booked price',
};
function Templates() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api('/org/templates').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  if (!rows) return <Loading />;
  return (
    <>
      <p className="muted mb">Text and options used when you share quotes, send booking emails and print documents. Use placeholders like <code>{'{{guest_name}}'}</code>.</p>
      <div className="grid grid-3">{rows.map((t) => (
        <div key={t.key} className="card">
          <div className="row-between"><h3>{t.kind === 'email' ? '✉' : '📄'} {t.label}</h3>{t.customised ? <span className="badge info">Customised</span> : <span className="badge">Default</span>}</div>
          <p className="muted small" style={{ minHeight: 36 }}>{t.subject}</p>
          <div className="row-between"><span className="muted small">{t.updated_at ? `Updated ${fmtDateTime(t.updated_at)}` : ''}</span><button className="btn secondary small" onClick={() => setEditing(t)}>Edit</button></div>
        </div>
      ))}</div>
      {editing && <TemplateDialog t={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function TemplateDialog({ t, onClose, onSaved }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [v, setV] = useState({ subject: t.subject || '', body: t.body || '', settings: t.settings || {} });
  const vars = t.vars.flatMap((g) => PLACEHOLDERS[g]);
  const save = async () => { try { await api(`/org/templates/${t.key}`, { method: 'PUT', body: v }); toast('Template saved'); onSaved(); } catch (e) { toast(e.message, 'bad'); } };
  const reset = async () => { if (await confirm({ title: 'Reset to default?', message: 'Your changes to this template will be lost.', confirmText: 'Reset' })) { await api(`/org/templates/${t.key}`, { method: 'DELETE' }); toast('Reset'); onSaved(); } };
  return (
    <Modal wide title={t.label} onClose={onClose} footer={<><button className="btn ghost" onClick={reset}>Reset to default</button><span className="spacer" /><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save template</button></>}>
      <div className="stack">
        <Input label={t.kind === 'email' ? 'Email subject' : 'Document title'} value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />
        <Field label={t.kind === 'email' ? 'Email body' : 'Text printed on the document'}><textarea rows={t.kind === 'email' ? 12 : 5} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
        <div><span className="muted small">Insert: </span><span className="chips">{vars.map((x) => <span key={x} className="chip" onClick={() => setV({ ...v, body: `${v.body}{{${x}}}` })}>{`{{${x}}}`}</span>)}</span></div>
        {Object.keys(v.settings).length > 0 && <>
          <h3>Options</h3>
          <div className="grid grid-3">{Object.entries(v.settings).map(([k, val]) => (typeof val === 'boolean'
            ? <Check key={k} checked={val} onChange={(x) => setV({ ...v, settings: { ...v.settings, [k]: x } })}>{SETTING_LABELS[k] || k}</Check>
            : <Input key={k} label={k.replace(/_/g, ' ')} value={val} onChange={(e) => setV({ ...v, settings: { ...v.settings, [k]: e.target.value } })} />))}</div>
        </>}
      </div>
    </Modal>
  );
}

/* -------------------------- Payment preferences -------------------------- */
function Prefs({ kind }) {
  const [rows, load] = useRows('payment-prefs', `?kind=${kind}`);
  const [editing, setEditing] = useState(null);
  const remove = useRemove('payment-prefs', load);
  if (!rows) return <Loading />;
  return (
    <>
      <div className="row-between mb">
        <p className="muted">{kind === 'supplier'
          ? 'How hotels and suppliers want to be paid, e.g. "50% on Booking Date, 50% 15 days before Checkin". Set one on each supplier or hotel; the default is used otherwise. The schedule is created when a booking is confirmed.'
          : 'How customers pay you. The default fills the instalments when you convert a trip.'}</p>
        <button className="btn" onClick={() => setEditing({ kind, service: 'all', parts: [{ event: 'booking_date', offset_days: 0, pct: 100 }], is_default: false })}>+ Add New</button>
      </div>
      <table><thead><tr><th>Description</th><th>Applies to</th><th /></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id}><td>{p.name} {p.is_default ? <span className="badge info">Default</span> : null}</td><td>{p.service === 'all' ? 'All services' : SERVICES[p.service]?.label}</td>
            <td className="right"><button className="btn secondary xs" onClick={() => setEditing({ ...p, is_default: Boolean(p.is_default) })}>Edit</button> <button className="btn remove xs" onClick={() => remove(p, 'this preference')}>Delete</button></td></tr>
        ))}</tbody></table>
      {editing && <PrefDialog pref={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function PrefDialog({ pref, onClose, onSaved }) {
  const toast = useToast();
  const [p, setP] = useState({ ...pref, parts: pref.parts.map((x) => ({ ...x, dir: x.offset_days < 0 ? 'before' : 'after', days: Math.abs(x.offset_days) })) });
  const parts = p.parts.map((x) => ({ event: x.event, offset_days: (x.dir === 'before' ? -1 : 1) * Number(x.days || 0), pct: Number(x.pct || 0) }));
  const total = parts.reduce((s, x) => s + x.pct, 0);
  const setPart = (i, patch) => setP({ ...p, parts: p.parts.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const save = async () => {
    try { await api(pref.id ? `/org/payment-prefs/${pref.id}` : '/org/payment-prefs', { method: pref.id ? 'PUT' : 'POST', body: { kind: p.kind, service: p.service, is_default: p.is_default, parts } }); toast('Saved'); onSaved(); } catch (e) { toast(e.message, 'bad'); }
  };
  const events = p.kind === 'customer' ? PAYMENT_EVENTS.filter((e) => ['booking_date', 'trip_start', 'trip_end'].includes(e.key)) : PAYMENT_EVENTS;
  return (
    <Modal wide title={`${p.kind === 'supplier' ? 'Supplier' : 'Customer'} payment preference`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={Math.abs(total - 100) > 0.01} onClick={save}>Save Preference</button></>}>
      <p className="muted">Example: <b>100% 2 days before Checkin</b> – Checkin is the reference, 2 days is the offset and 100% is the amount share.</p>
      <table><thead><tr><th>Reference event</th><th>Days</th><th>Before / after</th><th>Amount share %</th><th /></tr></thead>
        <tbody>{p.parts.map((x, i) => (
          <tr key={i}>
            <td><select value={x.event} onChange={(e) => setPart(i, { event: e.target.value })}>{events.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</select></td>
            <td><input type="number" min={0} value={x.days} onChange={(e) => setPart(i, { days: e.target.value })} style={{ width: 80 }} /></td>
            <td><select value={x.dir} onChange={(e) => setPart(i, { dir: e.target.value })}><option value="before">before</option><option value="after">after / on</option></select></td>
            <td><input type="number" min={1} max={100} value={x.pct} onChange={(e) => setPart(i, { pct: e.target.value })} style={{ width: 90 }} /></td>
            <td><button className="icon-btn" onClick={() => setP({ ...p, parts: p.parts.filter((_, k) => k !== i) })}>✕</button></td>
          </tr>
        ))}</tbody></table>
      <button className="btn secondary small" onClick={() => setP({ ...p, parts: [...p.parts, { event: p.kind === 'customer' ? 'trip_start' : 'checkin_date', dir: 'before', days: 7, pct: Math.max(100 - total, 0) }] })}>+ Add More</button>
      <div className={`alert mt ${Math.abs(total - 100) > 0.01 ? 'bad' : 'good'}`}><b>{describePref(parts) || '—'}</b> · total {total}%{Math.abs(total - 100) > 0.01 && ' (must be 100%)'}</div>
      <div className="grid grid-2 mt">
        {p.kind === 'supplier' && <Select label="Applies to" value={p.service} onChange={(e) => setP({ ...p, service: e.target.value })} options={[{ value: 'all', label: 'All services' }, ...SUPPLIER_SERVICES.map((s) => ({ value: s, label: SERVICES[s].label }))]} />}
        <div className="row" style={{ alignItems: 'end' }}><Check checked={p.is_default} onChange={(x) => setP({ ...p, is_default: x })}>Use as the default</Check></div>
      </div>
    </Modal>
  );
}

/* ------------------- Inclusions / exclusions and T&C ------------------- */
function Content({ kind }) {
  const [rows, load] = useRows('content', `?kind=${kind}`);
  const [editing, setEditing] = useState(null);
  const remove = useRemove('content', load);
  if (!rows) return <Loading />;
  const services = ['general', ...SUPPLIER_SERVICES];
  return (
    <>
      <div className="row-between mb">
        <p className="muted">{kind === 'inc_exc' ? 'Inclusions and exclusions per service. In the quote builder, "Load inclusions…" adds the ones for the services in the quote (plus General).' : 'Terms & conditions per service, added to quotes with the inclusions.'}</p>
        <button className="btn" onClick={() => setEditing({ kind, service: 'general', title: '', inclusions: [], exclusions: [], body: '', is_default: true })}>+ Add New</button>
      </div>
      {services.filter((s) => rows.some((r) => r.service === s)).map((s) => (
        <div key={s} className="mb">
          <div className="section-title">{s === 'general' ? 'General' : `${SERVICES[s].icon} ${SERVICES[s].label}`}</div>
          <div className="grid grid-2">{rows.filter((r) => r.service === s).map((r) => (
            <div key={r.id} className="card">
              <div className="row-between"><h3>{r.title} {!r.is_default && <span className="badge">Not auto-added</span>}</h3><span><button className="btn secondary xs" onClick={() => setEditing({ ...r, is_default: Boolean(r.is_default) })}>Edit</button> <button className="btn remove xs" onClick={() => remove(r, r.title)}>Delete</button></span></div>
              {kind === 'inc_exc' ? <div className="grid grid-2 small">
                <ul style={{ margin: 0, paddingLeft: 16 }}>{r.inclusions.map((x) => <li key={x}>✔ {x}</li>)}</ul>
                <ul style={{ margin: 0, paddingLeft: 16 }}>{r.exclusions.map((x) => <li key={x}>✘ {x}</li>)}</ul></div> : <p className="small pre">{r.body}</p>}
            </div>
          ))}</div>
        </div>
      ))}
      {rows.length === 0 && <Empty>Nothing yet.</Empty>}
      {editing && <ContentDialog row={editing} services={services} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function ContentDialog({ row, services, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({ ...row, inc: row.inclusions.join('\n'), exc: row.exclusions.join('\n'), body: row.body || '' });
  const save = async () => {
    try {
      const body = { kind: v.kind, service: v.service, title: v.title, is_default: v.is_default, body: v.body, inclusions: v.inc.split('\n').map((x) => x.trim()).filter(Boolean), exclusions: v.exc.split('\n').map((x) => x.trim()).filter(Boolean) };
      await api(row.id ? `/org/content/${row.id}` : '/org/content', { method: row.id ? 'PUT' : 'POST', body }); toast('Saved'); onSaved();
    } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Modal wide title={v.kind === 'inc_exc' ? 'Inclusions & exclusions' : 'Terms & conditions'} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <div className="grid grid-3">
        <Select label="Service" value={v.service} onChange={(e) => setV({ ...v, service: e.target.value })} options={services.map((s) => ({ value: s, label: s === 'general' ? 'General (every quote)' : SERVICES[s].label }))} />
        <Input label="Title *" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <div className="row" style={{ alignItems: 'end' }}><Check checked={v.is_default} onChange={(x) => setV({ ...v, is_default: x })}>Add automatically to quotes</Check></div>
        {v.kind === 'inc_exc' ? <>
          <Field label="Inclusions (one per line)" className="span-2" ><textarea rows={8} value={v.inc} onChange={(e) => setV({ ...v, inc: e.target.value })} /></Field>
          <Field label="Exclusions (one per line)"><textarea rows={8} value={v.exc} onChange={(e) => setV({ ...v, exc: e.target.value })} /></Field>
        </> : <Field label="Terms" className="span-all"><textarea rows={10} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>}
      </div>
    </Modal>
  );
}

/* -------------------------------- Taxes -------------------------------- */
function Taxes() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState(null);
  const [nw, setNw] = useState({ name: '', rate: '', is_default: false });
  const load = () => api('/org/tax-types').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const save = async (t, body) => { try { await api(t ? `/org/tax-types/${t.id}` : '/org/tax-types', { method: t ? 'PUT' : 'POST', body }); toast('Tax saved'); setNw({ name: '', rate: '', is_default: false }); load(); } catch (e) { toast(e.message, 'bad'); } };
  const del = async (t) => { if (await confirm({ title: `Remove ${t.name}?`, confirmText: 'Remove', tone: 'danger' })) { await api(`/org/tax-types/${t.id}`, { method: 'DELETE' }); load(); } };
  if (!rows) return <Loading />;
  return (
    <>
      <p className="muted mb">Taxes offered in the quote builder. For India use GST (e.g. 5% on package, or 18% on margin only).</p>
      <table><thead><tr><th>Name</th><th>Rate %</th><th>Default</th><th /></tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.id}><td>{t.name}</td><td>{t.rate}</td><td>{t.is_default ? '✓' : <button className="btn link small" onClick={() => save(t, { name: t.name, rate: t.rate, is_default: true })}>Make default</button>}</td>
            <td className="right"><button className="btn remove xs" onClick={() => del(t)}>Remove</button></td></tr>
        ))}
          <tr><td><input placeholder="e.g. GST" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} /></td><td><input type="number" value={nw.rate} onChange={(e) => setNw({ ...nw, rate: e.target.value })} /></td>
            <td><Check checked={nw.is_default} onChange={(x) => setNw({ ...nw, is_default: x })}>Default</Check></td><td><button className="btn small" disabled={!nw.name} onClick={() => save(null, nw)}>Add</button></td></tr>
        </tbody></table>
    </>
  );
}

/* ------------------------------ dropdown lists ------------------------------ */
const LISTS = [
  ['meal_plans', 'Meal plans', 'Hotels & quotes'], ['room_types', 'Room types', 'Hotels & quotes'], ['stars', 'Hotel categories', 'Hotels'], ['hotel_groups', 'Hotel groups', 'Hotels'], ['hotel_tags', 'Hotel booking tags', 'Bookings'],
  ['cab_types', 'Cab types', 'Transport'], ['transport_services', 'Transport service types', 'Transport'], ['cities', 'Cities / locations', 'All services'],
  ['airlines', 'Airlines', 'Flights'], ['airports', 'Airports', 'Flights'], ['flight_classes', 'Travel classes', 'Flights'],
  ['visa_countries', 'Visa countries', 'Visa'], ['visa_types', 'Visa types', 'Visa'], ['visa_purposes', 'Visa purposes', 'Visa'],
  ['stations', 'Railway stations', 'Train'], ['train_classes', 'Train classes', 'Train'], ['insurers', 'Insurance companies', 'Insurance'],
  ['currencies', 'Currencies', 'Pricing'], ['payment_modes', 'Payment modes', 'Accounting'], ['supplier_kinds', 'Supplier kinds', 'Suppliers'], ['source_kinds', 'Query source kinds', 'Trips'], ['salutations', 'Salutations', 'Guests'],
];
function Lists() {
  const [open, setOpen] = useState(null);
  const opts = useOptions(LISTS.map((l) => l[0]));
  return (
    <div className="stack mt">
      <p className="muted small">Values offered in dropdowns across the app. Add your own (e.g. a new meal plan "MAPAI" or room type) – they appear in hotel forms, price sheets and the quote form.</p>
      <table><thead><tr><th>List</th><th>Used in</th><th>Values</th><th /></tr></thead>
        <tbody>{LISTS.map(([k, label, where]) => (
          <tr key={k}><td><b>{label}</b></td><td className="muted small">{where}</td><td className="small">{(opts[k] || []).slice(0, 8).join(', ')}{(opts[k] || []).length > 8 ? ` +${opts[k].length - 8}` : ''}</td>
            <td className="right"><button className="btn secondary small" onClick={() => setOpen([k, label])}>Manage</button></td></tr>
        ))}</tbody></table>
      {open && <OptionListDialog list={open[0]} title={open[1]} onClose={() => setOpen(null)} />}
    </div>
  );
}
