import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SERVICES, SERVICE_ORDER } from '@shared/catalog.js';
import { api, money, fmtDate, fmtDateTime, todayIso } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Check, Empty, Loading, Modal, Select, useToast } from '../../core/ui.jsx';
import { openQuote, quoteEmail, quoteText, loadDocs } from '../documents/documents.js';
import { ItineraryEditor, cleanItinerary } from './QuoteBuilder.jsx';

export default function QuotesTab({ trip, reload }) {
  const { can, hasFeature } = useAuth();
  const [quotes, setQuotes] = useState(null);
  const [converting, setConverting] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api(`/quotes/trip/${trip.id}`).then((r) => setQuotes(r.data));
  useEffect(() => { load(); }, [trip.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!quotes) return <Loading />;
  if (!quotes.length) return <Empty>No quotes yet. {can('quotes.create') && <Link to={`/app/trips/${trip.id}/quote`}>Build the first quote</Link>}</Empty>;
  const showCost = can('quotes.view_cost');
  const converted = ['converted', 'on_trip', 'past'].includes(trip.stage);
  return (
    <div className="stack" style={{ marginTop: 4 }}>
      {quotes.map((q) => {
        const isConv = trip.converted_quote_id === q.id;
        return (
          <div key={q.id} className="card" style={isConv ? { borderColor: 'var(--good)' } : undefined}>
            <div className="card-head">
              <div>
                <h2>Quote v{q.version} {q.quote_type === 'vendor_package' && <span className="badge info">Vendor land package</span>} {isConv && <span className="badge good">Converted</span>}</h2>
                <div className="muted small">{q.start_date ? `${fmtDate(q.start_date)} · ${q.nights ?? 0}N` : 'No dates'} · {q.adults} adults{q.children_ages.length ? `, ${q.children_ages.length} children` : ''} · {fmtDateTime(q.created_at)}</div>
              </div>
              <div className="right">
                <div className="stat-value">{money(q.total_selling, q.currency)}</div>
                <div className="muted small">{money(q.summary.per_person, q.currency)} per person{showCost && ` · profit ${money(q.summary.profit, q.currency)} (${q.summary.profit_pct}%)`}</div>
              </div>
            </div>
            <table>
              <thead><tr><th>Service</th><th>Details</th>{showCost && <th className="num">Buying</th>}{showCost && <th className="num">Given</th>}<th className="num">Selling</th></tr></thead>
              <tbody>{[...q.items].sort((a, b) => SERVICE_ORDER.indexOf(a.service) - SERVICE_ORDER.indexOf(b.service) || (a.day_no || 0) - (b.day_no || 0)).map((i) => (
                <tr key={i.id}>
                  <td className="nowrap">{SERVICES[i.service]?.icon} {SERVICES[i.service]?.label}{i.day_no ? <div className="muted small">Day {i.day_no}</div> : null}</td>
                  <td>{i.title}</td>
                  {showCost && <td className="num">{money(i.buy_cost ?? i.cost, q.currency)}</td>}
                  {showCost && <td className="num">{money(i.cost, q.currency)}</td>}
                  <td className="num">{money(i.selling, q.currency)}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={showCost ? 4 : 2} className="right">{q.pricing.tax_name} {q.pricing.tax_rate}%</td><td className="num">{money(q.total_tax, q.currency)}</td></tr></tfoot>
            </table>
            <div className="quote-actions mt">
              {can('quotes.create') && (
                <div className="action-group manage">
                  <span className="group-label">Quote</span>
                  {trip.converted_quote_id !== q.id && <Link className="btn edit small" to={`/app/trips/${trip.id}/quote?edit=${q.id}`}>✎ Edit quote</Link>}
                  <Link className="btn duplicate small" to={`/app/trips/${trip.id}/quote?from=${q.id}`} title="Copy this quote into a new version">⧉ Duplicate as new version</Link>
                  <button className="btn secondary small" onClick={() => setEditing(q)}>Edit itinerary</button>
                </div>
              )}
              {hasFeature('share_quotes') && can('quotes.share') && (
                <div className="action-group"><span className="group-label">Share</span><ShareButtons trip={trip} quote={q} /></div>
              )}
              <span className="spacer" />
              {!converted && hasFeature('conversion') && can('trips.convert') && <button className="btn good" onClick={() => setConverting(q)}>Convert with this quote</button>}
            </div>
          </div>
        );
      })}
      {converting && <ConvertDialog trip={trip} quote={converting} onClose={() => setConverting(null)} onDone={() => { setConverting(null); reload(); }} />}
      {editing && <ItineraryDialog quote={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function ShareButtons({ trip, quote }) {
  const toast = useToast();
  const withDocs = async (fn) => { try { fn(await loadDocs(trip.id, quote.id)); } catch (e) { toast(e.message, 'bad'); } };
  const whatsapp = () => withDocs((d) => {
    const phone = String(trip.guest_phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(quoteText(d))}`, '_blank');
  });
  const copy = () => withDocs(async (d) => { await navigator.clipboard.writeText(quoteText(d)); toast('Quote text copied'); });
  const email = () => withDocs((d) => {
    const m = quoteEmail(d);
    location.href = `mailto:${trip.guest_email || ''}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
  });
  return (
    <>
      <button className="btn secondary small" onClick={() => withDocs(openQuote)}>PDF / Print</button>
      <button className="btn secondary small" onClick={whatsapp}>WhatsApp</button>
      <button className="btn secondary small" onClick={email}>Email</button>
      <button className="btn secondary small" onClick={copy}>Copy text</button>
    </>
  );
}

function ItineraryDialog({ quote, onClose, onSaved }) {
  const toast = useToast();
  const [it, setIt] = useState(quote.itinerary || { days: [], inclusions: [], exclusions: [], notes: '', tnc: '' });
  const [remarks, setRemarks] = useState(quote.remarks_customer || '');
  const save = async () => {
    try { await api(`/quotes/${quote.id}/itinerary`, { method: 'PUT', body: { itinerary: cleanItinerary(it), remarks_customer: remarks } }); toast('Itinerary saved'); onSaved(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Modal xwide title={`Itinerary – quote v${quote.version}`} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <ItineraryEditor value={it} onChange={setIt} quote={quote} />
      <label className="field mt"><span className="small">Note for the customer</span><textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
    </Modal>
  );
}

/** Convert: package amount, customer payment schedule (from a customer payment preference), confirmation. */
function ConvertDialog({ trip, quote, onClose, onDone }) {
  const toast = useToast();
  const nav = useNavigate();
  const [prefs, setPrefs] = useState([]);
  const [pref, setPref] = useState('');
  const [rows, setRows] = useState([]);
  const [verified, setVerified] = useState(false);
  const [comments, setComments] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api('/org/payment-prefs?kind=customer').then((r) => { setPrefs(r.data); const d = r.data.find((p) => p.is_default); if (d) setPref(String(d.id)); }); }, []);
  useEffect(() => { api(`/quotes/${quote.id}/schedule${pref ? `?pref_id=${pref}` : ''}`).then((r) => setRows(r.data)); }, [quote.id, pref]);
  const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const diff = Math.round((Number(quote.total_selling) - sum) * 100) / 100;
  const go = async () => {
    try {
      await api(`/quotes/trip/${trip.id}/convert`, { method: 'POST', body: { quote_id: quote.id, instalments: rows, verified, comments } });
      toast('Trip converted. Bookings and payment schedule are ready.');
      onDone(); nav(`/app/trips/${trip.id}?tab=bookings`);
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal wide title={`Convert Trip #${trip.trip_no} with quote v${quote.version}`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn good" disabled={!verified || Math.abs(diff) > 0.5} onClick={go}>Convert trip</button></>}>
      {err && <div className="alert bad mb">{err}</div>}
      <div className="grid grid-3">
        <div className="kpi"><span className="stat-label">Package price</span><span className="stat-value">{money(quote.total_selling, quote.currency)}</span></div>
        <div className="kpi"><span className="stat-label">Travel</span><span>{quote.start_date ? fmtDate(quote.start_date) : 'No dates'} · {quote.nights ?? 0}N</span></div>
        <Select label="Customer payment preference" value={pref} onChange={(e) => setPref(e.target.value)} options={prefs.map((p) => ({ value: p.id, label: p.name }))} placeholder="50% now, 50% 15 days before travel" />
      </div>
      <h3 className="mt">Customer instalments</h3>
      <table>
        <thead><tr><th>#</th><th>Due date</th><th className="num">Amount</th><th /></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td><input type="date" value={r.due_date} min={todayIso()} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, due_date: e.target.value } : x)))} /></td>
            <td><input type="number" value={r.amount} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} style={{ textAlign: 'right' }} /></td>
            <td><button className="icon-btn" onClick={() => setRows(rows.filter((_, k) => k !== i))}>✕</button></td>
          </tr>
        ))}</tbody>
        <tfoot><tr><td /><td><button className="btn link" onClick={() => setRows([...rows, { amount: Math.max(diff, 0), due_date: todayIso() }])}>+ Add instalment</button></td>
          <td className="num" style={{ color: Math.abs(diff) > 0.5 ? 'var(--bad)' : undefined }}>{money(sum, quote.currency)}{Math.abs(diff) > 0.5 && <div className="small">{diff > 0 ? `${money(diff, quote.currency)} short` : `${money(-diff, quote.currency)} extra`}</div>}</td><td /></tr></tfoot>
      </table>
      <label className="field mt"><span className="small">Comments</span><input value={comments} onChange={(e) => setComments(e.target.value)} /></label>
      <div className="alert warn mt"><Check checked={verified} onChange={setVerified}>I have verified the travel dates, guest details, services and price with the client.</Check></div>
      <p className="muted small mt">On conversion, one booking is created for every service in the quote (one per applicant for visa and passport). Supplier payment schedules are created when each booking is confirmed.</p>
    </Modal>
  );
}
