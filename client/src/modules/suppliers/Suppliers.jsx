import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SERVICES } from '@shared/catalog.js';
import { api, qs, money, download } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Loading, PageHeader, Pagination, Tabs } from '../../core/ui.jsx';

const TABS = ['transport', 'activity', 'hotel', 'land_package', 'visa', 'flight', 'train', 'passport', 'insurance', 'other'];

/** Suppliers — Sembark style: tab per service, contacts, payment preference and dues. */
export default function Suppliers() {
  const { me, can, hasFeature } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(params.entries());
  const [data, setData] = useState(null);
  const set = (p) => setParams(Object.fromEntries(Object.entries({ ...f, page: 1, ...p }).filter(([, v]) => v)));
  useEffect(() => { setData(null); const t = setTimeout(() => api(`/suppliers${qs(f)}`).then(setData), 200); return () => clearTimeout(t); }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = me.org.base_currency;
  const label = f.service === 'land_package' ? 'Land Package Vendors (DMC)' : f.service ? `${SERVICES[f.service]?.label} Suppliers` : 'Suppliers';
  return (
    <>
      <PageHeader title={label} subtitle="Vendors, DMCs, transporters, hotels groups and agents you book through"
        actions={<>
          <input placeholder="Search name, contact, city, phone" value={f.q || ''} onChange={(e) => set({ q: e.target.value })} style={{ width: 260 }} />
          <select value={f.status || ''} onChange={(e) => set({ status: e.target.value })} style={{ width: 120 }}><option value="">Active</option><option value="disabled">Disabled</option><option value="all">All</option></select>
          <button className="btn secondary" onClick={() => download(`/suppliers/export${qs({ service: f.service })}`, 'suppliers.csv')}>Export</button>
          {can('suppliers.manage', 'masters.manage') && <Link className="btn" to={`/app/suppliers/new${f.service ? `?service=${f.service}` : ''}`}>Add New</Link>}
        </>} />
      <div className="card flush">
        <div style={{ padding: '0 12px' }}>
          <Tabs value={f.service || ''} onChange={(k) => set({ service: k })} tabs={[{ key: '', label: 'All' }, ...TABS.filter((s) => !SERVICES[s].feature || hasFeature(SERVICES[s].feature)).map((s) => ({ key: s, label: SERVICES[s].plural, count: data?.counts?.[s] || 0 }))]} />
        </div>
        {!data ? <Loading /> : data.data.length === 0 ? <Empty>No suppliers here.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Services</th><th>Contacts</th><th>Payment Preference</th><th className="num">Balance</th><th className="num">Upcoming</th></tr></thead>
            <tbody>{data.data.map((s) => (
              <tr key={s.id} className={`clickable ${s.is_active ? '' : 'muted-row'}`} onClick={() => nav(`/app/suppliers/${s.id}`)}>
                <td><strong>{s.name}</strong><div className="muted small">{s.kind}{s.city ? ` · ${s.city}` : ''}{s.tax_id ? ` · ${s.tax_id}` : ''}</div></td>
                <td className="small">{s.services.map((x) => SERVICES[x]?.label).join(', ')}</td>
                <td className="small">{s.contacts[0] ? <>{s.contacts[0].name}{s.contacts[0].designation && ` (${s.contacts[0].designation})`}<div className="muted">{s.contacts[0].phone} {s.contacts[0].email}</div></> : <>{s.phone}<div className="muted">{s.email}</div></>}
                  {s.contacts.length > 1 && <div className="muted">+{s.contacts.length - 1} more</div>}</td>
                <td className="small">{s.payment_pref || 'Default'}</td>
                <td className="num">{Number(s.balance) ? money(s.balance, cur) : '—'}{Number(s.overdue) > 0 && <div className="small" style={{ color: 'var(--bad)' }}>{money(s.overdue, cur)} overdue</div>}</td>
                <td className="num">{s.upcoming || '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} size={data.size} total={data.total} onChange={(p) => setParams({ ...f, page: p })} /></div>}
      </div>
    </>
  );
}
