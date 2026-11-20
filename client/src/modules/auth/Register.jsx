import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../../core/api.js';
import { Input, Select, useForm } from '../../core/ui.jsx';

/** Two simple steps: company details, then the owner's login. */
export default function Register() {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(null);
  const [meta, setMeta] = useState({ countries: [], currencies: [], timezones: [], plans: [] });
  const { values, set, setValues, errors, setErrors, busy, submit } = useForm({
    name: '', email: '', phone: '', country_code: 'IN', city: '', address: '', tax_id: '',
    base_currency: 'INR', timezone: 'Asia/Kolkata', plan_id: '',
    owner_name: '', owner_email: '', owner_phone: '', password: '', confirm: '',
  });

  useEffect(() => {
    Promise.all(['countries', 'currencies', 'timezones', 'plans'].map((k) => api(`/meta/${k}`)))
      .then(([c, cu, t, p]) => setMeta({ countries: c.data, currencies: cu.data, timezones: t.data, plans: p.data }));
  }, []);

  // Picking a country suggests its currency
  const onCountry = (e) => {
    const code = e.target.value;
    const country = meta.countries.find((c) => c.code === code);
    setValues((s) => ({ ...s, country_code: code, base_currency: country?.currency_code || s.base_currency }));
  };

  const next = (e) => {
    e.preventDefault();
    const err = {};
    if (values.name.trim().length < 2) err['org.name'] = 'Company name is required';
    if (!/^\S+@\S+\.\S+$/.test(values.email)) err['org.email'] = 'Enter a valid email';
    if (values.phone.trim().length < 6) err['org.phone'] = 'Enter a phone number';
    setErrors(err);
    if (!Object.keys(err).length) setStep(2);
  };

  const finish = async (e) => {
    e.preventDefault();
    if (values.password !== values.confirm) { setErrors({ confirm: 'Passwords do not match' }); return; }
    const result = await submit(async (v) => {
      const res = await api('/auth/register', {
        method: 'POST',
        body: {
          org: {
            name: v.name, email: v.email, phone: v.phone, country_code: v.country_code, city: v.city,
            address: v.address, tax_id: v.tax_id, base_currency: v.base_currency, timezone: v.timezone,
            plan_id: v.plan_id ? Number(v.plan_id) : undefined,
          },
          owner: { name: v.owner_name, email: v.owner_email || v.email, phone: v.owner_phone, password: v.password },
        },
      });
      setDone(res.message);
      return true;
    });
    // Company-field errors from the server take the user back to step 1
    if (result?.error && Object.keys(result.error.fields || {}).some((k) => k.startsWith('org.'))) setStep(1);
  };

  if (done) {
    return (
      <div className="auth-page"><div className="auth-card">
        <div className="card stack" style={{ textAlign: 'center' }}>
          <h1>Registration received</h1>
          <p className="muted">{done}</p>
          <p className="muted small">You will be able to log in as soon as your organisation is approved.</p>
          <Link className="btn" to="/login" style={{ justifyContent: 'center' }}>Go to login</Link>
        </div>
      </div></div>
    );
  }

  const isIndia = values.country_code === 'IN';

  return (
    <div className="auth-page">
      <div className="auth-card wide">
        <div className="auth-logo"><div className="brand-mark">IBT</div>IBT Travels CRM</div>
        <div className="card">
          <div className="steps"><div className="step done" /><div className={`step ${step === 2 ? 'done' : ''}`} /></div>
          {errors._form && <div className="alert bad" style={{ marginBottom: 16 }}>{errors._form}</div>}

          {step === 1 && (
            <form onSubmit={next} className="stack">
              <div><h1>Register your organisation</h1><p className="muted">Step 1 of 2 · Company details</p></div>
              <Input label="Company name" value={values.name} onChange={set('name')} error={errors['org.name']} placeholder="e.g. Sunrise Holidays" />
              <div className="grid grid-2">
                <Input label="Company email" type="email" value={values.email} onChange={set('email')} error={errors['org.email']} hint="We send account updates here" />
                <Input label="Phone" value={values.phone} onChange={set('phone')} error={errors['org.phone']} />
              </div>
              <div className="grid grid-2">
                <Select label="Country" value={values.country_code} onChange={onCountry}
                  options={meta.countries.map((c) => ({ value: c.code, label: c.name }))} />
                <Input label="City" value={values.city} onChange={set('city')} />
              </div>
              <Input label="Address" value={values.address} onChange={set('address')} />
              <div className="grid grid-2">
                <Select label="Currency" value={values.base_currency} onChange={set('base_currency')}
                  options={meta.currencies.map((c) => ({ value: c.code, label: `${c.code} – ${c.name}` }))} />
                <Select label="Time zone" value={values.timezone} onChange={set('timezone')}
                  options={meta.timezones.map((t) => ({ value: t, label: t }))} />
              </div>
              <Input label={isIndia ? 'GSTIN (optional)' : 'Tax / VAT number (optional)'} value={values.tax_id} onChange={set('tax_id')} />
              <Select label="Plan you are interested in" value={values.plan_id} onChange={set('plan_id')} placeholder="Not sure yet"
                hint="Our team confirms the final plan when approving your account"
                options={meta.plans.map((p) => ({
                  value: p.id,
                  label: `${p.name} – ${money(p.org_fee_monthly, p.currency)}/month + ${money(p.user_fee_monthly, p.currency)} per user`,
                }))} />
              <div className="form-actions"><button className="btn">Next</button></div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={finish} className="stack">
              <div><h1>Your login</h1><p className="muted">Step 2 of 2 · You will be the account owner</p></div>
              <Input label="Your name" value={values.owner_name} onChange={set('owner_name')} error={errors['owner.name']} />
              <div className="grid grid-2">
                <Input label="Login email" type="email" value={values.owner_email} onChange={set('owner_email')}
                  error={errors['owner.email']} placeholder={values.email} hint="Leave empty to use the company email" />
                <Input label="Mobile" value={values.owner_phone} onChange={set('owner_phone')} />
              </div>
              <div className="grid grid-2">
                <Input label="Password" type="password" value={values.password} onChange={set('password')}
                  error={errors['owner.password']} hint="8+ characters with a letter and a number" />
                <Input label="Confirm password" type="password" value={values.confirm} onChange={set('confirm')} error={errors.confirm} />
              </div>
              <div className="form-actions">
                <button type="button" className="btn secondary" onClick={() => setStep(1)}>Back</button>
                <button className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit registration'}</button>
              </div>
            </form>
          )}
          <p className="muted small" style={{ textAlign: 'center', marginTop: 16 }}>
            Already registered? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
