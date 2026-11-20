import { useEffect, useState } from 'react';
import { api, money } from '../../core/api.js';
import { Input, Loading, Modal, PageHeader, Select, useForm, useToast } from '../../core/ui.jsx';

export default function Plans() {
  const [plans, setPlans] = useState(null);
  const [features, setFeatures] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [editing, setEditing] = useState(null); // plan object or {} for new

  const load = () => api('/admin/plans').then((r) => setPlans(r.data));
  useEffect(() => {
    load();
    api('/admin/features').then((r) => setFeatures(r.data));
    api('/meta/currencies').then((r) => setCurrencies(r.data));
  }, []);

  if (!plans) return <Loading />;
  return (
    <>
      <PageHeader title="Plans & Pricing" subtitle="Each plan charges a fee per organisation plus a fee per active user"
        actions={<button className="btn" onClick={() => setEditing({})}>New plan</button>} />
      <div className="grid grid-3">
        {plans.map((p) => (
          <div key={p.id} className="card stack">
            <div className="row-between">
              <h2>{p.name}</h2>
              {p.is_active ? <span className="badge good">Active</span> : <span className="badge">Hidden</span>}
            </div>
            <p className="muted small">{p.description}</p>
            <div>
              <div className="stat-value" style={{ fontSize: 22 }}>{money(p.org_fee_monthly, p.currency)}</div>
              <div className="muted small">per organisation / month</div>
              <div style={{ marginTop: 6 }}><strong>+ {money(p.user_fee_monthly, p.currency)}</strong> <span className="muted small">per user / month</span></div>
            </div>
            <p className="small">{p.features.length} features · {p.max_users ? `up to ${p.max_users} users` : 'unlimited users'} · {p.trial_days}-day trial</p>
            <p className="muted small">{p.org_count} organisations on this plan</p>
            <button className="btn secondary" onClick={() => setEditing(p)}>Edit</button>
          </div>
        ))}
      </div>
      {editing && <PlanDialog plan={editing} features={features} currencies={currencies}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function PlanDialog({ plan, features, currencies, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !plan.id;
  const { values, set, setValues, errors, busy, submit } = useForm({
    name: plan.name || '', description: plan.description || '', currency: plan.currency || 'INR',
    org_fee_monthly: plan.org_fee_monthly ?? 0, user_fee_monthly: plan.user_fee_monthly ?? 0,
    max_users: plan.max_users ?? '', trial_days: plan.trial_days ?? 14, is_active: plan.is_active ?? 1,
    features: plan.features || features.map((f) => f.code),
  });
  const toggle = (code) => setValues((s) => ({
    ...s, features: s.features.includes(code) ? s.features.filter((c) => c !== code) : [...s.features, code],
  }));
  const modules = [...new Set(features.map((f) => f.module))];

  const save = () => submit(async (v) => {
    const body = { ...v, max_users: v.max_users === '' ? null : Number(v.max_users), is_active: Boolean(Number(v.is_active)) };
    await api(isNew ? '/admin/plans' : `/admin/plans/${plan.id}`, { method: isNew ? 'POST' : 'PUT', body });
    toast(isNew ? 'Plan created' : 'Plan saved');
    onSaved();
  });

  return (
    <Modal wide title={isNew ? 'New plan' : `Edit ${plan.name}`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save plan'}</button></>}>
      <div className="stack">
        {errors._form && <div className="alert bad">{errors._form}</div>}
        <div className="grid grid-2">
          <Input label="Plan name" value={values.name} onChange={set('name')} error={errors.name} />
          <Select label="Currency" value={values.currency} onChange={set('currency')}
            options={currencies.map((c) => ({ value: c.code, label: c.code }))} />
        </div>
        <Input label="Short description" value={values.description} onChange={set('description')} />
        <div className="grid grid-4">
          <Input label="Fee per organisation" type="number" min="0" value={values.org_fee_monthly} onChange={set('org_fee_monthly')} hint="per month" />
          <Input label="Fee per user" type="number" min="0" value={values.user_fee_monthly} onChange={set('user_fee_monthly')} hint="per month" />
          <Input label="Max users" type="number" min="1" value={values.max_users} onChange={set('max_users')} hint="Empty = unlimited" />
          <Input label="Trial days" type="number" min="0" value={values.trial_days} onChange={set('trial_days')} />
        </div>
        <Select label="Shown on sign-up page" value={String(Number(values.is_active))} onChange={set('is_active')}
          options={[{ value: '1', label: 'Yes' }, { value: '0', label: 'No (hidden)' }]} />
        <h3 style={{ marginTop: 8 }}>Features included</h3>
        <div className="grid grid-2">
          {modules.map((m) => (
            <div key={m}>
              <div className="nav-section" style={{ padding: '4px 0' }}>{m}</div>
              {features.filter((f) => f.module === m).map((f) => (
                <label key={f.code} className="checkbox" style={{ padding: '4px 0' }}>
                  <input type="checkbox" checked={values.features.includes(f.code)} onChange={() => toggle(f.code)} />
                  {f.name}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
