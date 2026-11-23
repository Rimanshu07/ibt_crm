import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, download } from '../../core/api.js';
import { readSheet } from '../../core/files.js';
import { useAuth } from '../../core/auth.jsx';
import { Check, Field, PageHeader, useToast } from '../../core/ui.jsx';
import { CreatableSelect } from '../../core/forms.jsx';
import { PRICE_TITLES } from './Prices.jsx';

/** What every column / marker means (shown under the sample). */
const HELP = {
  common: [
    ['Season 1 (Ops)', 'Buying / booking rates. Optional.'],
    ['Season 1', 'Selling rates for the same season, used in quotes.'],
    ['Season 2', 'A season with no matching "(Ops)" season is used for both quotes and bookings.'],
    ['1 Jul 2026 - 30 Sep 2026', 'Date ranges must be written as D MMM YYYY - D MMM YYYY. Add more rows under a season for more ranges.'],
    ['(Sat,Sun)', 'Write weekday names after a range for weekday-only rates (e.g. weekend prices).'],
    ['[[CODE]]', 'Internal short code. Never shown to customers.'],
  ],
  hotel: [
    ['Group Name', 'Hotel group. Use NA if a hotel has no group.'],
    ['Location', 'City, State, Country – used for search and quotes.'],
    ['Name', 'Hotel name (no need to prefix "Hotel"). Write "Extras" here for extra-bed rows.'],
    ['Star', 'Star rating / category.'],
    ['Room', 'Room category. (2P) = base persons the price is for; (1P, 2P) = same price for 1 or 2 persons.'],
    ['(0EB) (12R) (1AWEB) (1CWEB) (1CNB)', 'Optional: extra beds allowed, number of rooms, adults / children with extra bed, children without bed.'],
    ['CP / MAP / AP', 'Meal plans; the price is for ONE room per night with that meal plan.'],
    ['Extra Bed (Adult) / Extra Bed (Child) (6-12) / Child without Bed (CNB)', 'Per person per night prices in the Extras rows. (6-12) sets the child age range.'],
  ],
  transport: [
    ['Duty Code', 'Short code to find a service quickly (e.g. 101).'],
    ['A / B', 'Start and end point. Short name in brackets: "Bagdogra Airport (BDG Arpt)". Leave B blank if not applicable; leave A blank to repeat the row above.'],
    ['Service', 'Pickup, Transfer, Sightseeing… Closing days: (C: Mon,Tue). Closing dates: (C: 1 Apr 2026 - 10 Apr 2026, 15 Aug 2026).'],
    ['Distance / Duration(mins)', 'Used to auto-write travel time in the itinerary.'],
    ['Day Schedule', 'Day-wise description added to the itinerary when this cab is in a quote.'],
    ['Wagon R {{3 Pax}} {{4y+}}', 'Cab type, seats and the age from which children count. Prices are per cab.'],
  ],
  activity: [
    ['Name', 'Activity name. Leave blank to repeat the one above.'],
    ['Service', 'Ticket type / package. Closing days and dates as (Mon,Tue)(1 Apr 2026 - 10 Apr 2026).'],
    ['Description', 'Shown in the day-wise itinerary.'],
    ['Open / Close Time, Duration, Slots', 'Timings; slots like 08:00,10:45.'],
    ['Adult / Child (6-12)', 'Price per person; (6-12) sets the child age range.'],
  ],
};

function parseCsv(text) {
  return text.split('\n').map((line) => { const out = []; let cell = ''; let q = false;
    for (let i = 0; i < line.length; i += 1) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cell); cell = ''; } else cell += c; }
    out.push(cell); return out; });
}

export default function UploadPrices() {
  const { service } = useParams();
  const { me } = useAuth();
  const toast = useToast();
  const [currency, setCurrency] = useState(me.org.base_currency);
  const [files, setFiles] = useState([]);
  const [append, setAppend] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState('');
  useEffect(() => { fetch(`/api/v1/rates/${service}/template`, { headers: { Authorization: `Bearer ${localStorage.getItem('ibt_token')}` } }).then((r) => r.text()).then(setSample).catch(() => {}); }, [service]);
  const run = async (dry) => {
    setBusy(true);
    try {
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, text: await readSheet(f) })));
      const r = await api(`/rates/${service}/upload`, { method: 'POST', body: { currency, files: payload, dry_run: dry, append } });
      setResult({ ...r.data, dry, message: r.message });
      toast(r.message, r.data.errors.length && !dry ? 'bad' : 'ok');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const rows = sample ? parseCsv(sample) : [];
  return (
    <>
      <PageHeader crumbs={<><Link to={`/app/services/prices/${service}`}>{PRICE_TITLES[service]}</Link> › Upload CSV</>} title={`Upload ${PRICE_TITLES[service]}`} />
      <div className="card">
        <div className="grid grid-4">
          <Field label="Currency" hint={`All prices will be saved in "${currency}"`}><CreatableSelect list="currencies" value={currency} onChange={(v) => setCurrency(v || me.org.base_currency)} /></Field>
          <Field label="Select CSV file(s)" className="span-2" hint="Save your Excel sheet as CSV (File → Save As → CSV). You can upload several files at once.">
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" multiple onChange={(e) => { setFiles([...e.target.files]); setResult(null); }} />
          </Field>
          <div className="stack"><Check checked={append} onChange={setAppend}>Keep existing prices for these dates (add instead of replace)</Check></div>
        </div>
        <div className="row mt">
          <button className="btn secondary" disabled={!files.length || busy} onClick={() => run(true)}>Check file</button>
          <button className="btn" disabled={!files.length || busy} onClick={() => run(false)}>{busy ? 'Working…' : `Upload ${PRICE_TITLES[service]} CSV`}</button>
          <Link className="btn ghost" to={`/app/services/prices/${service}`}>Cancel</Link>
        </div>
        {result && (
          <div className={`alert ${result.errors.length ? 'warn' : 'good'} mt`}>
            <strong>{result.dry ? 'Check result: ' : ''}{result.message}</strong>
            {result.summary.records.length > 0 && <div className="small mt">{result.summary.records.slice(0, 30).map((r) => <div key={`${r.id}-${r.name}`}>✓ {r.name} – {r.rates} price(s){r.rooms ? ` · rooms: ${r.rooms.join(', ')}` : ''}</div>)}{result.summary.records.length > 30 && <div>+ {result.summary.records.length - 30} more</div>}</div>}
            {result.errors.length > 0 && <div className="small mt" style={{ color: 'var(--bad)' }}>{result.errors.map((e) => <div key={e}>• {e}</div>)}</div>}
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-head"><h2>CSV File Format</h2><div className="row">
          <button className="btn secondary small" onClick={() => { navigator.clipboard.writeText(sample.replace(/,/g, '\t')); toast('Template copied – paste it into Excel or Google Sheets'); }}>Copy Template Format</button>
          <button className="btn secondary small" onClick={() => download(`/rates/${service}/template`, `${service}-prices-template.csv`)}>Download template</button></div></div>
        <p className="muted">Follow this format. Keep all prices in one file or one file per group. Blank cells in the first columns mean "same as the row above".</p>
        <div className="table-wrap"><table style={{ fontSize: 12 }}>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k} style={{ background: i === 0 ? '#f3f4f6' : undefined, fontWeight: i === 0 ? 600 : 400, whiteSpace: 'nowrap' }}>{c}</td>)}</tr>)}</tbody>
        </table></div>
        <h3 className="mt">What each part means</h3>
        <table><tbody>{[...HELP[service], ...HELP.common].map(([k, v]) => <tr key={k}><td style={{ width: 300 }}><code>{k}</code></td><td>{v}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
