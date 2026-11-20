import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MASTER_TYPES } from '@shared/catalog.js';
import { api, download, readText } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Field, PageHeader, useToast } from '../../core/ui.jsx';

/** Bulk import / export: suppliers and every generic master. Hotel, transport and activity prices use season sheets. */
export default function ImportExport() {
  const { hasFeature } = useAuth();
  const toast = useToast();
  const types = [['supplier', 'Suppliers & Vendors'], ...Object.entries(MASTER_TYPES).filter(([, d]) => !d.feature || hasFeature(d.feature)).map(([k, d]) => [k, d.plural])];
  const [type, setType] = useState('supplier');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const base = type === 'supplier' ? '/suppliers' : `/masters/${type}`;
  const run = async (dry) => {
    try {
      const r = await api(`${base}/import`, { method: 'POST', body: { text: await readText(file), dry_run: dry } });
      setResult({ ...r.data, message: r.message, dry }); toast(r.message);
    } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <>
      <PageHeader title="Import / Export" subtitle="Feed your data in bulk from Excel (save as CSV)" />
      <div className="grid grid-3">
        {[['hotel', '🏨 Hotel prices', 'Season-wise grid with rooms, meal plans and extras. Creates hotels automatically.'], ['transport', '🚗 Transport prices', 'Duty codes, A → B, cab types and seasons.'], ['activity', '🎟️ Activity prices', 'Activities, ticket types, adult/child prices.']]
          .filter(([s]) => hasFeature(s)).map(([s, t, d]) => (
            <div key={s} className="card"><h2>{t}</h2><p className="muted small">{d}</p><Link className="btn secondary small" to={`/app/services/prices/${s}/upload`}>Upload price sheet</Link></div>
          ))}
      </div>
      <div className="card">
        <h2>Lists & suppliers</h2>
        <div className="grid grid-3 mt">
          <Field label="What to import / export"><select value={type} onChange={(e) => { setType(e.target.value); setResult(null); }}>{types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <div className="row" style={{ alignItems: 'end' }}>
            <button className="btn secondary" onClick={() => download(`${base}/export`, `${type}.csv`)}>Export CSV</button>
            {type !== 'supplier' && <button className="btn secondary" onClick={() => download(`${base}/template`, `${type}-template.csv`)}>Blank template</button>}
          </div>
        </div>
        <div className="grid grid-3 mt">
          <Field label="CSV file to import" hint={type === 'supplier' ? 'Columns: name, services (hotel|transport…), kind, contact_name, contact_phone, email, phone, city, state, country, tax_id, pan' : 'Same columns as the export. Matching names are updated; references (e.g. Train) use the name.'}>
            <input type="file" accept=".csv" onChange={(e) => { setFile(e.target.files[0]); setResult(null); }} /></Field>
          <div className="row" style={{ alignItems: 'end' }}><button className="btn secondary" disabled={!file} onClick={() => run(true)}>Check file</button><button className="btn" disabled={!file} onClick={() => run(false)}>Import</button></div>
        </div>
        {result && (
          <div className={`alert ${result.errors.length ? 'warn' : 'good'} mt`}>
            <strong>{result.message}</strong>
            {result.unknown_columns?.length > 0 && <div className="small">Ignored columns: {result.unknown_columns.join(', ')}</div>}
            {result.errors.map((e) => <div key={e} className="small">• {e}</div>)}
          </div>
        )}
      </div>
    </>
  );
}
