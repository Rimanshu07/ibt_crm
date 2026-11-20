import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate, fmtDateTime, money } from '../../core/api.js';
import { Field, Input, Kpi, Loading, Modal, PageHeader, Select, StatusBadge, Tabs, Toggle, useConfirm, useToast } from '../../core/ui.jsx';

export default function OrganisationDetail() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState(null);
  const [plans, setPlans] = useState([]);
  const [tab, setTab] = useState('overview');
  const [dialog, setDialog] = useState(null);
  const [features, setFeatures] = useState({});
  const [note, setNote] = useState('');
  const load = useCallback(() => api(`/admin/orgs/${id}`).then((r) => { setD(r.data); setFeatures(Object.fromEntries(r.data.features.map((f) => [f.code, Boolean(f.enabled)]))); }), [id]);
  useEffect(() => { load(); api('/admin/plans').then((r) => setPlans(r.data)); }, [load]);
  if (!d) return <Loading />;
  const { org, users, billing, usage } = d;
  const act = async (path, body, msg) => { try { const r = await api(`/admin/orgs/${id}/${path}`, { method: 'POST', body }); toast(msg || r.message); setDialog(null); load(); } catch (e) { toast(e.message, 'bad'); } };
  const saveFeatures = async () => { await api(`/admin/orgs/${id}/features`, { method: 'PUT', body: { features } }); toast('Features updated'); load(); };
  const addNote = async () => { await api(`/admin/orgs/${id}/notes`, { method: 'POST', body: { body: note } }); setNote(''); load(); };
  const modules = [...new Set(d.features.map((f) => f.module))];
  return (
    <>
      <PageHeader crumbs={<><Link to="/admin/orgs">Organisations</Link> › {org.name}</>} title={<span className="row">{org.name} <StatusBadge status={org.status} /></span>}
        subtitle={`${org.email} · ${org.phone || ''} · ${org.city || ''} ${org.country_name || ''} · registered ${fmtDate(org.created_at)}`}
        actions={<>
          {org.status === 'pending' && <><button className="btn good" onClick={() => setDialog('approve')}>Verify & approve</button><button className="btn danger" onClick={() => setDialog('reject')}>Reject</button></>}
          {org.status === 'active' && <button className="btn danger" onClick={() => setDialog('suspend')}>Suspend</button>}
          {['suspended', 'rejected'].includes(org.status) && org.plan_id && <button className="btn" onClick={async () => { if (await confirm({ title: 'Reactivate this organisation?' })) act('reactivate', {}); }}>Reactivate</button>}
          {org.status === 'rejected' && !org.plan_id && <button className="btn" onClick={() => setDialog('approve')}>Approve anyway</button>}
        </>} />
      {org.status_reason && <div className="alert warn">Reason: {org.status_reason}</div>}
      <div className="grid grid-4">
        <Kpi label="Plan" value={org.plan_name || '—'} sub={org.trial_ends_at ? `Trial until ${fmtDate(org.trial_ends_at)}` : ''} />
        <Kpi label="Monthly charge" value={billing?.plan_id ? money(billing.monthly_total, billing.currency) : '—'} sub={billing?.plan_id ? `${money(billing.org_fee, billing.currency)} + ${billing.active_users} × ${money(billing.user_fee, billing.currency)}` : ''} />
        <Kpi label="Users" value={`${billing?.active_users ?? 0}${billing?.max_users ? ` / ${billing.max_users}` : ''}`} />
        <Kpi label="Sales last 30 days" value={money(usage.sales_30d, org.base_currency)} sub={`${usage.trips_30d} new trips`} />
      </div>
      <div className="card flush">
        <div style={{ padding: '0 12px' }}><Tabs value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Overview' }, { key: 'users', label: 'Users', count: users.length }, { key: 'features', label: 'Features' }, { key: 'billing', label: 'Plan & Billing' }, { key: 'notes', label: 'Notes', count: d.notes.length }, { key: 'activity', label: 'Activity' }]} /></div>
        <div style={{ padding: '0 16px 16px' }}>
          {tab === 'overview' && (
            <div className="grid grid-2">
              <dl className="kv">
                <dt>Legal name</dt><dd>{org.legal_name || '—'}</dd><dt>Address</dt><dd>{[org.address, org.city, org.state, org.pincode].filter(Boolean).join(', ') || '—'}</dd>
                <dt>Country</dt><dd>{org.country_name}</dd><dt>Tax ID</dt><dd>{org.tax_id || '—'}</dd><dt>Currency / TZ</dt><dd>{org.base_currency} · {org.timezone}</dd>
                <dt>Website</dt><dd>{org.website || '—'}</dd><dt>Approved</dt><dd>{org.approved_at ? fmtDateTime(org.approved_at) : '—'}</dd>
                <dt>Last activity</dt><dd>{usage.last_activity ? fmtDateTime(usage.last_activity) : '—'}</dd>
              </dl>
              <div className="grid grid-3">
                <Kpi label="Trips" value={usage.trips} /><Kpi label="Conversions" value={usage.conversions} /><Kpi label="Quotes" value={usage.quotes} />
                <Kpi label="Bookings" value={usage.bookings} /><Kpi label="Hotels" value={usage.hotels} /><Kpi label="Prices" value={usage.rates} />
                <Kpi label="Suppliers" value={usage.suppliers} />
              </div>
            </div>
          )}
          {tab === 'users' && (
            <table><thead><tr><th>Name</th><th>Email / phone</th><th>Roles</th><th>Status</th><th>Last login</th></tr></thead>
              <tbody>{users.map((u) => <tr key={u.id}><td>{u.name}{u.is_org_owner ? <span className="badge info" style={{ marginLeft: 6 }}>Owner</span> : null}<div className="muted small">{u.designation}</div></td><td>{u.email}<div className="muted small">{u.phone}</div></td><td className="small">{u.roles}</td><td><StatusBadge status={u.status} /></td><td className="small">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td></tr>)}</tbody></table>
          )}
          {tab === 'features' && (
            <>
              <div className="row-between mb"><p className="muted">Switch features on or off for this organisation. Switched-off features disappear from their menus and the API.</p><button className="btn" onClick={saveFeatures}>Save features</button></div>
              <div className="grid grid-2">{modules.map((m) => (
                <div key={m} className="card"><h3>{m}</h3>{d.features.filter((f) => f.module === m).map((f) => (
                  <div key={f.code} className="feature-row"><div><strong>{f.name}</strong><div className="muted small">{f.description}</div></div><Toggle checked={features[f.code]} onChange={(x) => setFeatures({ ...features, [f.code]: x })} label={f.name} /></div>
                ))}</div>
              ))}</div>
            </>
          )}
          {tab === 'billing' && <BillingTab org={org} plans={plans} billing={billing} invoices={d.invoices} onSaved={load} />}
          {tab === 'notes' && (
            <div className="stack">
              <div className="row"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (call log, KYC check, payment follow-up…)" /><button className="btn" disabled={!note.trim()} onClick={addNote}>Add note</button></div>
              <div className="timeline">{d.notes.map((n) => <div key={n.id}>{n.body}<div className="muted small">{n.user_name} · {fmtDateTime(n.created_at)}</div></div>)}</div>
            </div>
          )}
          {tab === 'activity' && (
            <table><tbody>{d.audit.map((a) => <tr key={a.id}><td className="small nowrap">{fmtDateTime(a.created_at)}</td><td>{a.user_name || 'System'}</td><td><code>{a.action}</code></td><td className="small muted">{a.target_type} {a.target_id}</td></tr>)}</tbody></table>
          )}
        </div>
      </div>
      {dialog === 'approve' && <ApproveDialog plans={plans} onClose={() => setDialog(null)} onApprove={(b) => act('approve', b)} />}
      {['reject', 'suspend'].includes(dialog) && <ReasonDialog action={dialog} onClose={() => setDialog(null)} onDone={(reason) => act(dialog, { reason })} />}
    </>
  );
}

function ApproveDialog({ plans, onClose, onApprove }) {
  const [planId, setPlanId] = useState(plans.find((p) => p.is_active)?.id || '');
  const plan = plans.find((p) => p.id === Number(planId));
  const [trial, setTrial] = useState('');
  return (
    <Modal title="Verify & approve" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn good" disabled={!planId} onClick={() => onApprove({ plan_id: Number(planId), ...(trial !== '' ? { trial_days: Number(trial) } : {}) })}>Approve</button></>}>
      <div className="stack">
        <p>Approving activates the account, switches on the plan's features, creates default roles, taxes, payment preferences, inclusions/exclusions and T&C.</p>
        <Select label="Plan" value={planId} onChange={(e) => setPlanId(e.target.value)} options={plans.filter((p) => p.is_active).map((p) => ({ value: p.id, label: `${p.name} – ${money(p.org_fee_monthly, p.currency)} + ${money(p.user_fee_monthly, p.currency)}/user` }))} />
        <Input label="Trial days" type="number" value={trial} onChange={(e) => setTrial(e.target.value)} placeholder={plan ? String(plan.trial_days) : ''} hint="Leave empty for the plan's default" />
      </div>
    </Modal>
  );
}

function ReasonDialog({ action, onClose, onDone }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={action === 'reject' ? 'Reject registration' : 'Suspend organisation'} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn danger" onClick={() => onDone(reason)}>{action === 'reject' ? 'Reject' : 'Suspend'}</button></>}>
      <Field label="Reason (shown to the organisation when they log in)"><textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

function BillingTab({ org, plans, billing, invoices, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({ plan_id: org.plan_id || '', org_fee_override: org.org_fee_override ?? '', user_fee_override: org.user_fee_override ?? '', trial_ends_at: org.trial_ends_at ? String(org.trial_ends_at).slice(0, 10) : '', apply_plan_features: false });
  const save = async () => {
    const body = { plan_id: v.plan_id ? Number(v.plan_id) : undefined, org_fee_override: v.org_fee_override === '' ? null : Number(v.org_fee_override), user_fee_override: v.user_fee_override === '' ? null : Number(v.user_fee_override), trial_ends_at: v.trial_ends_at || null, apply_plan_features: v.apply_plan_features };
    try { await api(`/admin/orgs/${org.id}`, { method: 'PUT', body }); toast('Saved'); onSaved(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <div className="stack">
      <div className="grid grid-4">
        <Select label="Plan" value={v.plan_id} onChange={(e) => setV({ ...v, plan_id: e.target.value })} options={plans.map((p) => ({ value: p.id, label: p.name }))} placeholder="—" />
        <Input label={`Org fee override (${billing?.currency || ''})`} type="number" value={v.org_fee_override} onChange={(e) => setV({ ...v, org_fee_override: e.target.value })} hint="Empty = plan price" />
        <Input label="User fee override" type="number" value={v.user_fee_override} onChange={(e) => setV({ ...v, user_fee_override: e.target.value })} />
        <Input label="Trial ends" type="date" value={v.trial_ends_at} onChange={(e) => setV({ ...v, trial_ends_at: e.target.value })} />
      </div>
      <label className="checkbox"><input type="checkbox" checked={v.apply_plan_features} onChange={(e) => setV({ ...v, apply_plan_features: e.target.checked })} /> Reset features to the plan's features</label>
      <button className="btn" style={{ width: 'fit-content' }} onClick={save}>Save plan & pricing</button>
      <h3>Invoices</h3>
      {invoices.length === 0 ? <p className="muted small">No invoices yet. Generate them under Billing & Invoices.</p> : (
        <table><thead><tr><th>Invoice</th><th>Month</th><th className="num">Amount</th><th>Status</th></tr></thead>
          <tbody>{invoices.map((i) => <tr key={i.id}><td>{i.invoice_no}</td><td>{i.period}</td><td className="num">{money(i.amount, i.currency)}</td><td><StatusBadge status={i.status} /></td></tr>)}</tbody></table>
      )}
    </div>
  );
}
