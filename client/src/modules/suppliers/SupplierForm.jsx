import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SERVICES, SUPPLIER_SERVICES } from '@shared/catalog.js';
import { api } from '../../core/api.js';
import { Field, FormError, Input, Loading, PageHeader, useForm, useToast } from '../../core/ui.jsx';
import { CreatableSelect } from '../../core/forms.jsx';

const blankContact = () => ({ name: '', designation: '', phone: '', email: '' });
const blankBank = () => ({ bank_name: '', account_name: '', account_no: '', ifsc: '', branch: '', upi_id: '' });

export default function SupplierForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [prefs, setPrefs] = useState([]);
  const [loaded, setLoaded] = useState(!id);
  const f = useForm({ name: '', kind: 'Company', services: params.get('service') ? [params.get('service')] : [], email: '', phone: '', address: '', city: '', state: '', country: '',
    tax_id: '', pan: '', payment_pref_id: '', contacts: [blankContact()], bank_accounts: [], cab_types: [], notes: '' });
  const v = f.values;
  useEffect(() => { api('/org/payment-prefs?kind=supplier').then((r) => setPrefs(r.data)); }, []);
  useEffect(() => {
    if (!id) return;
    api(`/suppliers/${id}`).then(({ data: s }) => {
      f.setValues({ ...Object.fromEntries(Object.entries(s).map(([k, x]) => [k, x ?? ''])), contacts: s.contacts.length ? s.contacts : [blankContact()], bank_accounts: s.bank_accounts, cab_types: s.cab_types, services: s.services });
      setLoaded(true);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!loaded) return <Loading />;
  const toggle = (s) => f.set('services')(v.services.includes(s) ? v.services.filter((x) => x !== s) : [...v.services, s]);
  const setRow = (k, i, patch) => f.set(k)(v[k].map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const save = () => f.submit(async (val) => {
    const body = { ...val, payment_pref_id: val.payment_pref_id || null };
    ['id', 'org_id', 'is_active', 'created_at', 'updated_at', 'created_by', 'payment_pref', 'payment_parts', 'bookings', 'dues', 'payments'].forEach((k) => delete body[k]);
    const r = await api(id ? `/suppliers/${id}` : '/suppliers', { method: id ? 'PUT' : 'POST', body });
    toast(r.message); nav(`/app/suppliers/${id || r.data.id}`);
  });
  return (
    <>
      <PageHeader crumbs={<><Link to="/app/suppliers">Suppliers</Link> › {id ? 'Edit' : 'New'}</>} title={id ? `Edit ${v.name}` : 'Add Supplier'}
        actions={<><Link className="btn secondary" to={id ? `/app/suppliers/${id}` : '/app/suppliers'}>Cancel</Link><button className="btn" disabled={f.busy} onClick={save}>Save Supplier</button></>} />
      <div className="card">
        <FormError errors={f.errors} />
        <div className="grid grid-3">
          <Input className="span-2" label="Supplier name *" value={v.name} onChange={f.set('name')} error={f.errors.name} />
          <Field label="Type"><CreatableSelect list="supplier_kinds" value={v.kind} onChange={(x) => f.set('kind')(x || 'Company')} /></Field>
        </div>
        <div className="section-title">Provides *</div>
        <div className="chips">{SUPPLIER_SERVICES.map((s) => <span key={s} className={`chip ${v.services.includes(s) ? 'on' : ''}`} onClick={() => toggle(s)}>{SERVICES[s]?.icon} {SERVICES[s]?.label}</span>)}</div>
        {f.errors.services && <div className="error small">{f.errors.services}</div>}
        {v.services.includes('transport') && <Field label="Cab types they run" className="mt"><CreatableSelect list="cab_types" multiple value={v.cab_types} onChange={f.set('cab_types')} /></Field>}

        <div className="section-title">Contacts</div>
        {v.contacts.map((c, i) => (
          <div key={i} className="grid grid-4 mb">
            <Input label="Name" value={c.name} onChange={(e) => setRow('contacts', i, { name: e.target.value })} />
            <Field label="Designation"><CreatableSelect list="designations" value={c.designation || null} onChange={(x) => setRow('contacts', i, { designation: x || '' })} /></Field>
            <Input label="Phone" value={c.phone} onChange={(e) => setRow('contacts', i, { phone: e.target.value })} />
            <div className="row" style={{ alignItems: 'end' }}><Input label="Email" value={c.email} onChange={(e) => setRow('contacts', i, { email: e.target.value })} /><button className="icon-btn" onClick={() => f.set('contacts')(v.contacts.filter((_, n) => n !== i))}>✕</button></div>
          </div>
        ))}
        <button className="btn secondary small" onClick={() => f.set('contacts')([...v.contacts, blankContact()])}>+ Add contact</button>

        <div className="section-title">Company details</div>
        <div className="grid grid-4">
          <Input label="Office phone" value={v.phone} onChange={f.set('phone')} /><Input label="Email" value={v.email} onChange={f.set('email')} />
          <Input label="GSTIN / Tax no." value={v.tax_id} onChange={f.set('tax_id')} /><Input label="PAN" value={v.pan} onChange={f.set('pan')} />
          <Input className="span-2" label="Address" value={v.address} onChange={f.set('address')} />
          <Field label="City"><CreatableSelect list="cities" value={v.city || null} onChange={(x) => f.set('city')(x || '')} /></Field>
          <Input label="State" value={v.state} onChange={f.set('state')} /><Input label="Country" value={v.country} onChange={f.set('country')} />
        </div>

        <div className="section-title">Payment</div>
        <div className="grid grid-2">
          <Field label="Payment preference" hint="Supplier payment schedules are created from this when a booking is confirmed">
            <select value={v.payment_pref_id} onChange={(e) => f.set('payment_pref_id')(e.target.value)}><option value="">Organisation default</option>{prefs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <div className="row" style={{ alignItems: 'end' }}><Link className="small" to="/app/organization?tab=supplier-prefs">Manage payment preferences</Link></div>
        </div>
        {v.bank_accounts.map((b, i) => (
          <div key={i} className="grid grid-6 mt">
            {['bank_name', 'account_name', 'account_no', 'ifsc', 'branch', 'upi_id'].map((k) => <Input key={k} label={k.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())} value={b[k]} onChange={(e) => setRow('bank_accounts', i, { [k]: e.target.value })} />)}
            <button className="btn ghost small" onClick={() => f.set('bank_accounts')(v.bank_accounts.filter((_, n) => n !== i))}>Remove bank</button>
          </div>
        ))}
        <button className="btn secondary small mt" onClick={() => f.set('bank_accounts')([...v.bank_accounts, blankBank()])}>+ Add bank account</button>
        <Field label="Notes" className="mt"><textarea value={v.notes} onChange={(e) => f.set('notes')(e.target.value)} /></Field>
        <div className="form-actions"><button className="btn" disabled={f.busy} onClick={save}>Save Supplier</button></div>
      </div>
    </>
  );
}
