import { useState } from 'react';
import { api } from '../../core/api.js';
import { Modal, useToast } from '../../core/ui.jsx';
import { downloadFile, toCsv } from '../../core/forms.jsx';
import { readSheet } from '../../core/files.js';

const COLUMNS = ['guest_salutation', 'guest_name', 'guest_phone', 'guest_email', 'guest_city', 'services', 'destinations', 'start_date', 'nights', 'adults', 'children_ages', 'infants', 'ref_id', 'tags', 'notes'];

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const list = (s) => String(s || '').split(/[|;]/).map((x) => x.trim()).filter(Boolean);

/** Upload trips / queries from a CSV or Excel sheet (one row per enquiry). */
export default function TripImport({ onClose, onDone }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const read = async (file) => {
    const [head, ...body] = parseCsv(await readSheet(file));
    const keys = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const dest = (await api('/lookup/destination?limit=1000')).data;
    setRows(body.map((r) => {
      const o = Object.fromEntries(keys.map((k, i) => [k, (r[i] || '').trim()]));
      return {
        guest_salutation: o.guest_salutation || '', guest_name: o.guest_name, guest_phone: o.guest_phone, guest_email: o.guest_email || '', guest_city: o.guest_city || '',
        services: list(o.services || 'package'), destination_ids: list(o.destinations).map((n) => dest.find((d) => d.name.toLowerCase() === n.toLowerCase())?.id).filter(Boolean),
        start_date: o.start_date || null, nights: o.nights === '' ? null : o.nights, adults: o.adults || 2, children_ages: list(o.children_ages).map(Number), infants: o.infants || 0,
        ref_id: o.ref_id || '', tags: list(o.tags), notes: o.notes || '',
      };
    }));
    setResult(null);
  };
  const run = async () => {
    setBusy(true);
    try { const r = await api('/trips/import', { method: 'POST', body: { rows } }); setResult(r.data); toast(r.message); if (r.data.created.length) onDone(); }
    catch (e) { setResult(e.fields?.created ? e.fields : null); toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Upload trips via CSV / Excel" wide onClose={onClose} footer={<>
      <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => downloadFile('trips-template.csv', toCsv([COLUMNS, ['Mr.', 'Rahul Sharma', '+91 9876543210', 'rahul@example.com', 'Delhi', 'package', 'Kerala', '2026-12-20', '4', '2', '8', '0', 'WEB-101', 'Honeymoon', 'Houseboat in Alleppey']]))}>⬇ Template</button>
      <button className="btn secondary" onClick={onClose}>Close</button>
      <button className="btn" disabled={!rows?.length || busy} onClick={run}>{busy ? 'Uploading…' : `Create ${rows?.length || 0} trip(s)`}</button>
    </>}>
      <p className="muted small">Columns: {COLUMNS.join(', ')}. Reference ID (ref_id) is required and unique within your organisation. Use “|” between several services, destinations, child ages or tags. Services: package, hotel, transport, activity, flight, train, visa, passport, insurance, land_package.</p>
      <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files[0] && read(e.target.files[0]).catch((x) => toast(x.message, 'bad'))} />
      {rows && <p className="mt">{rows.length} row(s) read.</p>}
      {result && (
        <div className="mt">
          <div className="row wrap small mb">
            <strong>Created: {result.counts?.created ?? result.created?.length ?? 0}</strong>
            <strong>Skipped: {result.counts?.skipped ?? result.skipped?.length ?? 0}</strong>
            <strong>Conflicts: {result.counts?.conflicts ?? result.conflicts?.length ?? 0}</strong>
            <strong>Invalid: {result.counts?.invalid ?? result.invalid?.length ?? 0}</strong>
          </div>
          {result.created?.length > 0 && <div className="alert good small">Created trips: {result.created.map((t) => `#${t.trip_no}`).join(', ')}</div>}
          <ImportOutcome title="Skipped" rows={result.skipped} tone="warn" />
          <ImportOutcome title="Conflicts" rows={result.conflicts} tone="bad" />
          <ImportOutcome title="Invalid rows" rows={result.invalid} tone="bad" />
        </div>
      )}
    </Modal>
  );
}

function ImportOutcome({ title, rows = [], tone }) {
  if (!rows.length) return null;
  return (
    <div className={`alert ${tone} small mt`}>
      <strong>{title}</strong>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Excel row</th><th>ref_id</th><th>Matching Trip ID</th><th>Reason</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={`${r.row}-${r.ref_id}`}>
              <td>{r.row}</td><td>{r.ref_id || '—'}</td>
              <td>{r.trip_no ? `#${r.trip_no}` : '—'}</td><td>{r.reason}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
