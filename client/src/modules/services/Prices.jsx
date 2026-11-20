import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDateTime } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Field, PageHeader, Pills } from '../../core/ui.jsx';
import PriceList from './PriceList.jsx';

export const PRICE_TITLES = { hotel: 'Hotel Prices', transport: 'Transport Service Prices', activity: 'Travel Activity Prices' };

/** Hotel / Transport / Activity price list with Upload Prices and Calculate Price. */
export default function Prices() {
  const { service } = useParams();
  const { can } = useAuth();
  const [f, setF] = useState({ q: '', date: '', rate_type: '', expiring_before: '' });
  const [uploads, setUploads] = useState([]);
  const [show, setShow] = useState('prices');
  useEffect(() => { api(`/rates/${service}/uploads`).then((r) => setUploads(r.data)).catch(() => {}); }, [service]);
  return (
    <>
      <PageHeader title={PRICE_TITLES[service]} actions={<>
        <input placeholder="Search…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} style={{ width: 220 }} />
        <Link className="btn secondary" to={`/app/services/prices/${service}/calculate`}>Calculate Price</Link>
        {can('masters.import', 'masters.manage') && <Link className="btn" to={`/app/services/prices/${service}/upload`}>Upload Prices</Link>}
      </>} />
      <div className="filters row wrap">
        <Pills value={show} onChange={setShow} options={[{ key: 'prices', label: 'Prices' }, { key: 'uploads', label: `Upload history (${uploads.length})` }]} />
        {show === 'prices' && <>
          <Field label="Valid on"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Expiring before"><input type="date" value={f.expiring_before} onChange={(e) => setF({ ...f, expiring_before: e.target.value })} /></Field>
          <Field label="Rate type"><select value={f.rate_type} onChange={(e) => setF({ ...f, rate_type: e.target.value })}><option value="">All</option><option value="sales">Sales (quotation)</option><option value="ops">Booking (Ops)</option><option value="both">Both</option></select></Field>
        </>}
      </div>
      <div className="card">
        {show === 'prices' ? <PriceList service={service} filters={f} /> : (
          <table><thead><tr><th>When</th><th>Files</th><th>Currency</th><th>By</th><th>Result</th><th>Prices</th></tr></thead>
            <tbody>{uploads.map((u) => { const s = typeof u.summary === 'string' ? JSON.parse(u.summary) : u.summary || {};
              return <tr key={u.id}><td>{fmtDateTime(u.created_at)}</td><td className="small">{u.file_name}</td><td>{u.currency}</td><td>{u.created_by_name}</td><td className="small">{s.created || 0} new · {s.updated || 0} updated{s.errors ? ` · ${s.errors} problem(s)` : ''}</td><td>{u.rate_count}</td></tr>; })}</tbody></table>
        )}
      </div>
    </>
  );
}
