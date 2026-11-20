import { useEffect, useState } from 'react';
import { api, fmtDate, money } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Loading, PageHeader } from '../../core/ui.jsx';

export default function PlanFeatures() {
  const { me } = useAuth();
  const [features, setFeatures] = useState(null);
  useEffect(() => { api('/org/features').then((r) => setFeatures(r.data)); }, []);
  if (!features) return <Loading />;
  const b = me.billing;
  const modules = [...new Set(features.map((f) => f.module))];

  return (
    <>
      <PageHeader title="Plan & Features" subtitle="To change your plan or switch on a feature, contact IBT Travels support" />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid grid-4">
          <div><div className="muted small">Plan</div><strong>{b?.plan_name || '—'}</strong></div>
          <div><div className="muted small">Organisation fee</div><strong>{money(b?.org_fee, b?.currency)}</strong> <span className="muted small">/ month</span></div>
          <div><div className="muted small">Per user</div><strong>{money(b?.user_fee, b?.currency)}</strong> <span className="muted small">× {b?.active_users} users</span></div>
          <div><div className="muted small">Total this month</div><strong>{money(b?.monthly_total, b?.currency)}</strong></div>
        </div>
        {me.org.trial_ends_at && <p className="muted small" style={{ marginTop: 12 }}>Trial ends {fmtDate(me.org.trial_ends_at)}</p>}
      </div>
      <div className="grid grid-2">
        {modules.map((m) => (
          <div key={m} className="card">
            <h2 style={{ marginBottom: 8 }}>{m}</h2>
            {features.filter((f) => f.module === m).map((f) => (
              <div key={f.code} className="feature-row">
                <div><div>{f.name}</div><div className="muted small">{f.description}</div></div>
                {f.enabled ? <span className="badge good">On</span> : <span className="badge">Off</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
