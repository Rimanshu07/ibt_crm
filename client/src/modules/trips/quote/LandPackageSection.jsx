import { useState } from 'react';
import { parseVendorPackage } from '@shared/vendorPackage.js';
import { landPackageCost, nightLabel } from '@shared/quoteItems.js';
import { api, money } from '../../../core/api.js';
import { RefPicker, useOptions } from '../../../core/forms.jsx';
import { Modal, Pills, useToast } from '../../../core/ui.jsx';
import { readPdfText, fileToBase64 } from '../../../core/files.js';
import { Section, ExtrasEditor, LineError, num } from './common.jsx';

export const emptyLand = (head) => ({
  supplier_id: null, attachment_id: null, source: 'manual', land_package_id: null, title: '', day: 1, nights: num(head.nights),
  currency: head.currency || 'INR', fx_rate: 1, price_basis: 'per_person', rate_adult: '', rate_child: '', rate_infant: '',
  adults: num(head.adults), children: (head.children_ages || []).length, infants: num(head.infants), total_amount: '',
  option_name: '', vendor_ref: '', description: '',
  package: { destination: '', vehicle: '', hotels: [], transport: [], itinerary: [], inclusions: [], exclusions: [], paid_activities: [], terms: '' },
});

/**
 * Vendor (DMC) land package: read the vendor's PDF or pasted email, pick the option,
 * check hotels / itinerary / price, add our markup. The original is kept for records.
 */
export default function LandPackageSection({ lines, extras, head, cur, showCost, trip, onAdd, onChange, onRemove, onAddExtra, onUseItinerary }) {
  const [reader, setReader] = useState(null); // { key } of the line being filled, or 'new'
  const total = lines.reduce((s, l) => s + landPackageCost(l.details).cost, 0);
  return (
    <Section id="q-land" title="Land Package (from vendor / DMC)" total={total} cur={cur}
      actions={<>
        <button className="btn small" onClick={() => setReader({ key: 'new' })}>Upload vendor PDF / paste email</button>
        <button className="btn secondary small" onClick={() => onAdd(emptyLand(head))}>+ Enter manually</button>
      </>}>
      {lines.length === 0 && <div className="empty">Got a package from your vendor? Upload their PDF or paste the email – hotels, itinerary, inclusions and price are read for you. Then add your flights, visa and other services below.</div>}
      {lines.map((l) => <LandLine key={l.key} line={l} head={head} cur={cur} showCost={showCost}
        onChange={(p) => onChange(l.key, p)} onRemove={() => onRemove(l.key)} onRead={() => setReader({ key: l.key })} onUseItinerary={() => onUseItinerary(l.details)} />)}
      <ExtrasEditor title="Any extra services on the land package" category="land_package" lines={extras} cur={cur} showCost={showCost} onAdd={onAddExtra} onChange={onChange} onRemove={onRemove} />
      {reader && <VendorReader head={head} cur={cur} trip={trip}
        initial={reader.key === 'new' ? null : lines.find((x) => x.key === reader.key)?.details}
        onClose={() => setReader(null)}
        onDone={(details, opt) => {
          if (reader.key === 'new') onAdd(details); else onChange(reader.key, { details });
          if (opt.itinerary) onUseItinerary(details, opt);
          setReader(null);
        }} />}
    </Section>
  );
}

function LandLine({ line, head, cur, showCost, onChange, onRemove, onRead, onUseItinerary }) {
  const d = line.details; const p = d.package || {};
  const opts = useOptions(['currencies']);
  const set = (patch) => onChange((l) => ({ details: { ...l.details, ...patch } }));
  const c = landPackageCost(d);
  return (
    <div className="q-row">
      <div className="q-row-head">
        <span className="badge">{d.source === 'pdf' ? 'From vendor PDF' : d.source === 'email' ? 'From vendor email' : 'Manual'}</span>
        {d.attachment_id && <a className="small" href="#" onClick={(e) => { e.preventDefault(); api(`/attachments/${d.attachment_id}/text`).then((r) => alertText(r.data)); }}>Original kept for records</a>}
        <span className="spacer" /><b>{money(c.cost, cur)}</b>
      </div>
      <div className="q-grid">
        <div className="q-field w4"><label>Vendor / DMC *</label><RefPicker refType="supplier" service="land_package" value={d.supplier_id} onChange={(v) => set({ supplier_id: v })} placeholder="Land package vendor" /></div>
        <div className="q-field w5"><label>Package title *</label><input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Kerala 4N/5D – Munnar, Thekkady, Alleppey" /></div>
        <div className="q-field w3"><label>Option / category</label><input value={d.option_name} onChange={(e) => set({ option_name: e.target.value })} placeholder="e.g. 4★ option" /></div>
      </div>
      <div className="q-grid">
        <div className="q-field w2"><label>Starts on</label><select value={d.day} onChange={(e) => set({ day: Number(e.target.value) })}>{Array.from({ length: num(head.nights) + 1 }, (_, i) => <option key={i} value={i + 1}>{nightLabel(i + 1, head.start_date).replace(' N', ' Day')}</option>)}</select></div>
        <div className="q-field w1"><label>Nights</label><input type="number" min={0} value={d.nights} onChange={(e) => set({ nights: e.target.value })} /></div>
        <div className="q-field w2"><label>Vendor ref.</label><input value={d.vendor_ref} onChange={(e) => set({ vendor_ref: e.target.value })} /></div>
        <div className="q-field w2"><label>Vendor currency</label><select value={d.currency} onChange={(e) => set({ currency: e.target.value, fx_rate: e.target.value === cur ? 1 : d.fx_rate })}>{[...new Set([cur, d.currency, ...(opts.currencies || [])])].map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="q-field w2"><label>Exchange rate</label><input type="number" step="0.0001" min={0} value={d.fx_rate} disabled={d.currency === cur} title={`1 ${d.currency} = ? ${cur}`} onChange={(e) => set({ fx_rate: e.target.value })} /></div>
        <div className="q-field w3"><label>Vendor price is</label><Pills value={d.price_basis} onChange={(v) => set({ price_basis: v })} options={[{ key: 'per_person', label: 'Per person' }, { key: 'total', label: 'Total' }]} /></div>
      </div>
      {d.price_basis === 'per_person' ? (
        <table className="q-table">
          <thead><tr><th /><th>Count</th><th className="r">Vendor rate ({d.currency})</th><th className="r">Total ({d.currency})</th></tr></thead>
          <tbody>{[['adults', 'rate_adult', 'Adult'], ['children', 'rate_child', 'Child'], ['infants', 'rate_infant', 'Infant']].map(([k, r, label]) => (
            <tr key={k}><td>{label}</td><td><input type="number" min={0} value={d[k]} style={{ width: 70 }} onChange={(e) => set({ [k]: e.target.value })} /></td>
              <td className="r"><input type="number" min={0} value={d[r]} style={{ width: 120 }} onChange={(e) => set({ [r]: e.target.value })} /></td>
              <td className="r">{money(num(d[k]) * num(d[r]), d.currency)}</td></tr>
          ))}</tbody>
        </table>
      ) : (
        <div className="q-grid"><div className="q-field w3"><label>Total vendor price ({d.currency})</label><input type="number" min={0} value={d.total_amount} onChange={(e) => set({ total_amount: e.target.value })} /></div></div>
      )}
      <div className="muted small">{d.currency !== cur ? `= ${money(c.cost, cur)} at ${d.fx_rate} · ` : ''}Your markup and tax are added in the summary.{showCost ? ' This is the buying price.' : ''}</div>

      {(p.hotels?.length > 0 || p.itinerary?.length > 0) && (
        <details className="q-details mt" open>
          <summary>Vendor package: {p.hotels?.length || 0} hotel(s), {p.itinerary?.length || 0} itinerary day(s), {p.inclusions?.length || 0} inclusion(s)</summary>
          {p.hotels?.length > 0 && <table className="q-table"><thead><tr><th>Nights</th><th>City</th><th>Hotel</th><th>Room</th><th>Meals</th></tr></thead>
            <tbody>{p.hotels.map((h, i) => <tr key={i}><td>{(h.nights || []).join(', ')}</td><td>{h.city}</td><td>{h.hotel}</td><td>{h.room}</td><td>{h.meal_plan}</td></tr>)}</tbody></table>}
          {p.vehicle && <div className="small mt"><b>Transport:</b> {p.vehicle}</div>}
          <div className="row mt"><button className="btn secondary small" onClick={onRead}>✎ Review / edit package</button><button className="btn secondary small" onClick={onUseItinerary}>Use vendor itinerary & inclusions in this quote</button></div>
        </details>
      )}
      {!(p.hotels?.length > 0 || p.itinerary?.length > 0) && <div className="row mt"><button className="btn secondary small" onClick={onRead}>Read from vendor PDF / email</button></div>}
      <LineError line={line} />
      <div className="q-row-actions"><span className="spacer" /><button className="btn remove small" onClick={onRemove}>Remove</button></div>
    </div>
  );
}
const alertText = (a) => { const w = window.open('', '_blank'); if (w) { w.document.title = a.title; w.document.body.innerHTML = `<pre style="white-space:pre-wrap;font:13px/1.5 system-ui">${String(a.text || '(file only – download it from the trip Docs tab)').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`; } };

/* ----------------------------- the reader dialog ----------------------------- */
function VendorReader({ head, cur, trip, initial, onClose, onDone }) {
  const toast = useToast();
  const [mode, setMode] = useState('pdf');
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [optIdx, setOptIdx] = useState(0);
  const [draft, setDraft] = useState(initial ? { ...initial, package: { ...initial.package } } : null);
  const [use, setUse] = useState({ itinerary: true, inclusions: true });
  const [busy, setBusy] = useState(false);

  const read = async () => {
    setBusy(true);
    try {
      const raw = mode === 'pdf' ? await readPdfText(file) : text;
      if (!raw.trim()) throw new Error('No text found. If the PDF is a scanned image, paste the text instead.');
      const p = parseVendorPackage(raw);
      setParsed({ ...p, raw });
      setOptIdx(0);
      setDraft(build(p, 0, mode));
      if (p.warnings?.length) toast(p.warnings[0], 'warn');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const build = (p, idx, src) => {
    const o = p.options[idx] || { name: '', hotels: [], price: {} };
    const pr = o.price || {};
    const base = draft || initial || emptyLand(head);
    const cur2 = pr.currency || p.currency || base.currency;
    return {
      ...base, source: src, title: p.title || base.title, option_name: o.name || '', vendor_ref: p.reference || base.vendor_ref,
      nights: p.nights ?? base.nights, currency: cur2, fx_rate: cur2 === cur ? 1 : base.fx_rate,
      price_basis: pr.basis === 'total' ? 'total' : 'per_person',
      rate_adult: pr.basis === 'per_person' ? pr.amount : base.rate_adult, total_amount: pr.basis === 'total' ? pr.amount : base.total_amount,
      adults: p.adults || base.adults,
      package: { destination: p.destination || '', vehicle: p.vehicle || '', hotels: o.hotels || [], transport: p.transport || [], itinerary: p.itinerary || [],
        inclusions: p.inclusions || [], exclusions: p.exclusions || [], paid_activities: p.paid_activities || [], terms: p.terms || '' },
    };
  };
  const setP = (patch) => setDraft({ ...draft, package: { ...draft.package, ...patch } });
  const save = async () => {
    if (!draft.supplier_id) { toast('Choose the vendor (add them as a Land Package vendor if new)', 'bad'); return; }
    setBusy(true);
    try {
      let attachment_id = draft.attachment_id;
      if (parsed) {
        const body = { trip_id: trip.id, supplier_id: draft.supplier_id, kind: 'vendor_package', title: `${draft.title || 'Vendor package'}${draft.vendor_ref ? ` (${draft.vendor_ref})` : ''}`,
          text: parsed.raw, amount: draft.price_basis === 'total' ? num(draft.total_amount) : num(draft.rate_adult), currency: draft.currency };
        if (mode === 'pdf' && file) Object.assign(body, { file_name: file.name, mime: file.type || 'application/pdf', data_base64: await fileToBase64(file) });
        attachment_id = (await api('/attachments', { method: 'POST', body })).data.id;
      }
      onDone({ ...draft, attachment_id }, use);
      toast(parsed ? 'Package added · original saved in the trip documents' : 'Package updated');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const lines = (a) => (a || []).join('\n');
  return (
    <Modal title="Vendor land package" xwide onClose={onClose} footer={<>
      <button className="btn secondary" onClick={onClose}>Cancel</button>
      <button className="btn" disabled={!draft || busy} onClick={save}>{busy ? 'Saving…' : 'Use this package'}</button>
    </>}>
      {!initial && (
        <div className="card flat">
          <Pills value={mode} onChange={setMode} options={[{ key: 'pdf', label: 'Upload PDF' }, { key: 'email', label: 'Paste email text' }]} />
          <div className="mt">
            {mode === 'pdf'
              ? <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
              : <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the vendor's email here – hotel table, itinerary, inclusions, price…" />}
          </div>
          <button className="btn small mt" disabled={busy || (mode === 'pdf' ? !file : !text.trim())} onClick={read}>{busy ? 'Reading…' : 'Read package'}</button>
          <span className="muted small"> The original file / text is saved with the trip and the vendor for your records and tally.</span>
        </div>
      )}
      {parsed && parsed.options.length > 1 && (
        <div className="mt"><b className="small">The vendor sent {parsed.options.length} options – choose one:</b>
          <div className="row wrap mt">{parsed.options.map((o, i) => (
            <button key={i} className={`btn small ${i === optIdx ? '' : 'secondary'}`} onClick={() => { setOptIdx(i); setDraft(build(parsed, i, mode)); }}>
              {o.name || `Option ${i + 1}`}{o.price?.amount ? ` · ${money(o.price.amount, o.price.currency || parsed.currency || 'INR')}${o.price.basis === 'per_person' ? ' pp' : ''}` : ''}
            </button>))}</div>
        </div>
      )}
      {draft && (
        <div className="stack mt">
          <div className="q-grid">
            <div className="q-field w4"><label>Vendor / DMC *</label><RefPicker refType="supplier" service="land_package" value={draft.supplier_id} onChange={(v) => setDraft({ ...draft, supplier_id: v })} /></div>
            <div className="q-field w5"><label>Title</label><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
            <div className="q-field w1"><label>Nights</label><input type="number" value={draft.nights} onChange={(e) => setDraft({ ...draft, nights: e.target.value })} /></div>
            <div className="q-field w2"><label>Destination</label><input value={draft.package.destination} onChange={(e) => setP({ destination: e.target.value })} /></div>
          </div>
          <div className="q-grid">
            <div className="q-field w3"><label>Price basis</label><Pills value={draft.price_basis} onChange={(v) => setDraft({ ...draft, price_basis: v })} options={[{ key: 'per_person', label: 'Per person' }, { key: 'total', label: 'Total' }]} /></div>
            <div className="q-field w2"><label>Currency</label><input value={draft.currency} maxLength={3} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></div>
            {draft.price_basis === 'per_person'
              ? <><div className="q-field w2"><label>Per adult</label><input type="number" value={draft.rate_adult} onChange={(e) => setDraft({ ...draft, rate_adult: e.target.value })} /></div>
                <div className="q-field w2"><label>Per child</label><input type="number" value={draft.rate_child} onChange={(e) => setDraft({ ...draft, rate_child: e.target.value })} /></div></>
              : <div className="q-field w3"><label>Total</label><input type="number" value={draft.total_amount} onChange={(e) => setDraft({ ...draft, total_amount: e.target.value })} /></div>}
            <div className="q-field w3"><label>Vehicle</label><input value={draft.package.vehicle} onChange={(e) => setP({ vehicle: e.target.value })} /></div>
          </div>
          <div>
            <div className="row-between"><b className="small">Hotels</b><button className="btn ghost small" onClick={() => setP({ hotels: [...draft.package.hotels, { nights: [], city: '', hotel: '', meal_plan: '', room: '' }] })}>+ Add</button></div>
            <table className="q-table"><thead><tr><th>Nights (1,2)</th><th>City</th><th>Hotel</th><th>Room</th><th>Meals</th><th /></tr></thead>
              <tbody>{draft.package.hotels.map((h, i) => {
                const setH = (patch) => setP({ hotels: draft.package.hotels.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
                return (<tr key={i}>
                  <td><input value={(h.nights || []).join(',')} style={{ width: 70 }} onChange={(e) => setH({ nights: e.target.value.split(/[,\s]+/).map(Number).filter((x) => x > 0) })} /></td>
                  <td><input value={h.city} onChange={(e) => setH({ city: e.target.value })} /></td>
                  <td><input value={h.hotel} onChange={(e) => setH({ hotel: e.target.value })} /></td>
                  <td><input value={h.room} onChange={(e) => setH({ room: e.target.value })} /></td>
                  <td><input value={h.meal_plan} style={{ width: 70 }} onChange={(e) => setH({ meal_plan: e.target.value })} /></td>
                  <td><button className="btn remove xs" onClick={() => setP({ hotels: draft.package.hotels.filter((_, k) => k !== i) })}>Remove</button></td></tr>);
              })}</tbody></table>
          </div>
          <div>
            <b className="small">Day-wise itinerary</b>
            {draft.package.itinerary.map((x, i) => {
              const setI = (patch) => setP({ itinerary: draft.package.itinerary.map((y, k) => (k === i ? { ...y, ...patch } : y)) });
              return (<div key={i} className="grid" style={{ gridTemplateColumns: '60px 1fr 32px', gap: 8, marginTop: 6 }}>
                <input type="number" value={x.day} onChange={(e) => setI({ day: Number(e.target.value) })} title="Day" />
                <div className="stack"><input value={x.title} onChange={(e) => setI({ title: e.target.value })} /><textarea rows={2} value={x.description} onChange={(e) => setI({ description: e.target.value })} /></div>
                <button className="icon-btn" onClick={() => setP({ itinerary: draft.package.itinerary.filter((_, k) => k !== i) })}>✕</button></div>);
            })}
            <button className="btn ghost small" onClick={() => setP({ itinerary: [...draft.package.itinerary, { day: draft.package.itinerary.length + 1, title: '', description: '' }] })}>+ Add day</button>
          </div>
          <div className="grid grid-2">
            <label className="q-field"><span>Inclusions (one per line)</span><textarea rows={6} value={lines(draft.package.inclusions)} onChange={(e) => setP({ inclusions: e.target.value.split('\n') })} /></label>
            <label className="q-field"><span>Exclusions (one per line)</span><textarea rows={6} value={lines(draft.package.exclusions)} onChange={(e) => setP({ exclusions: e.target.value.split('\n') })} /></label>
          </div>
          {draft.package.paid_activities?.length > 0 && <div className="small"><b>Optional paid activities from vendor:</b> {draft.package.paid_activities.map((a) => `${a.name}${a.price ? ` (${a.currency || draft.currency} ${a.price})` : ''}`).join(' · ')}</div>}
          <div className="row wrap">
            <label className="checkbox"><input type="checkbox" checked={use.itinerary} onChange={(e) => setUse({ ...use, itinerary: e.target.checked })} /> Use the vendor itinerary in our quotation</label>
            <label className="checkbox"><input type="checkbox" checked={use.inclusions} onChange={(e) => setUse({ ...use, inclusions: e.target.checked })} /> Use vendor inclusions / exclusions</label>
          </div>
          <div className="muted small">The customer receives the quotation in your own format (your header and footer). Vendor name and price are never shown to the customer.</div>
        </div>
      )}
    </Modal>
  );
}
