import { useState } from 'react';
import { useAuth } from '../../core/auth.jsx';
import { api } from '../../core/api.js';
import { Field, FormError, Input, PageHeader, useForm, useToast } from '../../core/ui.jsx';
import { getThemePref, setThemePref } from '../../core/theme.js';
import { CreatableSelect } from '../../core/forms.jsx';

export default function MyProfile() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const p = useForm({ name: me.user.name, phone: me.user.phone || '', designation: me.user.designation || '' });
  const pw = useForm({ current: '', next: '', confirm: '' });
  const saveProfile = () => p.submit(async (v) => { const r = await api('/auth/profile', { method: 'PUT', body: v }); toast(r.message); refresh(); });
  const savePw = () => pw.submit(async (v) => {
    if (v.next !== v.confirm) throw Object.assign(new Error('Passwords do not match'), { fields: { confirm: 'Does not match' } });
    const r = await api('/auth/change-password', { method: 'POST', body: { current: v.current, next: v.next } });
    toast(r.message); pw.setValues({ current: '', next: '', confirm: '' });
  });
  return (
    <>
      <PageHeader title="My Profile" subtitle={me.user.email} />
      <div className="grid grid-2">
        <div className="card">
          <h2>Personal details</h2>
          <FormError errors={p.errors} />
          <div className="stack mt">
            <Input label="Name" value={p.values.name} onChange={p.set('name')} error={p.errors.name} />
            <Input label="Phone" value={p.values.phone} onChange={p.set('phone')} hint="Shown on quotes and vouchers you send" />
            <Field label="Designation"><CreatableSelect list="designations" value={p.values.designation} onChange={p.set('designation')} /></Field>
            <Input label="Login email" value={me.user.email} disabled hint="Ask your admin to change the login email" />
            <div><span className="muted small">Roles: </span>{me.roles?.map((r) => r.name).join(', ') || (me.user.is_org_owner ? 'Owner (full access)' : '—')}</div>
          </div>
          <div className="form-actions"><button className="btn" disabled={p.busy} onClick={saveProfile}>Save</button></div>
        </div>
        <div className="card">
          <h2>Change password</h2>
          <FormError errors={pw.errors} />
          <div className="stack mt">
            <Input type="password" label="Current password" value={pw.values.current} onChange={pw.set('current')} error={pw.errors.current} />
            <Input type="password" label="New password" value={pw.values.next} onChange={pw.set('next')} error={pw.errors.next} hint="At least 8 characters with a letter and a number" />
            <Input type="password" label="Confirm new password" value={pw.values.confirm} onChange={pw.set('confirm')} error={pw.errors.confirm} />
          </div>
          <div className="form-actions"><button className="btn" disabled={pw.busy} onClick={savePw}>Change password</button></div>
        </div>
      </div>
      <Appearance />
    </>
  );
}

/** Light / dark theme for this browser. */
function Appearance() {
  const [pref, setPref] = useState(getThemePref());
  const choose = (k) => { setThemePref(k); setPref(k); };
  const opts = [
    { key: 'light', label: 'Light', hint: 'White pages, dark top bar' },
    { key: 'dark', label: 'Dark', hint: 'Easier on the eyes at night' },
    { key: 'system', label: 'Same as my computer', hint: 'Follows your device setting' },
  ];
  return (
    <div className="card mt">
      <h2>Appearance</h2>
      <p className="muted small">Choose how IBT Travels CRM looks on this device. Quotes and vouchers you send always print in light colours.</p>
      <div className="theme-options mt">
        {opts.map((o) => (
          <button key={o.key} type="button" className={`theme-option ${pref === o.key ? 'on' : ''}`} onClick={() => choose(o.key)}>
            <span className={`theme-swatch ${o.key}`}><i /><i /><i /></span>
            <b>{o.label}</b><span className="muted small">{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
