import { useEffect, useRef, useState } from 'react';
import { nightLabel, dayLabel, r2 } from '@shared/quoteItems.js';
import { money } from '../../../core/api.js';
import { Modal, FieldError } from '../../../core/ui.jsx';

let seq = 0;
export const nextKey = () => (seq += 1);
export const num = (v) => Number(v) || 0;
export const has = (v) => v !== null && v !== undefined && v !== '';

/**
 * Night / day picker like Sembark's "Stay Nights" multi-select:
 * a row of chips "1st N (Mon 30 Nov)" the user can toggle.
 */
export function SlotPicker({ kind = 'night', total, start, value = [], onChange, taken = [] }) {
  const sel = value.map(Number);
  const label = kind === 'night' ? nightLabel : dayLabel;
  return (
    <div className="slot-picker">
      {Array.from({ length: Math.max(total, 0) }, (_, i) => i + 1).map((k) => {
        const on = sel.includes(k);
        return (
          <button type="button" key={k} className={`slot ${on ? 'on' : ''} ${!on && taken.includes(k) ? 'taken' : ''}`}
            title={!on && taken.includes(k) ? 'Already has a booking (you can still add another room)' : ''}
            onClick={() => onChange(on ? sel.filter((x) => x !== k) : [...sel, k].sort((a, b) => a - b))}>
            {label(k, start)}
          </button>
        );
      })}
      {total === 0 && <span className="muted small">Set the number of nights in Basic Details first</span>}
    </div>
  );
}

/** Small number box with − / + used for rooms, beds, cabs, tickets. */
export function Stepper({ value, onChange, min = 0, max = 99, disabled, title }) {
  const v = num(value);
  return (
    <span className="stepper" title={title}>
      <button type="button" disabled={disabled || v <= min} onClick={() => onChange(Math.max(v - 1, min))}>−</button>
      <input type="number" value={value} min={min} max={max} disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? '' : Math.min(Math.max(Number(e.target.value), min), max))} />
      <button type="button" disabled={disabled || v >= max} onClick={() => onChange(Math.min(v + 1, max))}>+</button>
    </span>
  );
}

/**
 * "Given Price – 30 Nov" popup: rows of components (Room (2P), AWEB, CWEB, CNB / a cab / a ticket)
 * each with system rate, editable given price, quantity and total.
 * rows = [{ key, label, rate, given, buy, qty }]; onSave(rowsWithGiven, applyToAll)
 */
export function GivenPriceModal({ title, rows, cur, showCost, onSave, onClose, applyLabel }) {
  const [list, setList] = useState(rows.map((r) => ({ ...r, given: has(r.given) ? r.given : (r.rate ?? '') })));
  const [all, setAll] = useState(false);
  const total = list.reduce((s, r) => s + num(r.given) * num(r.qty), 0);
  const set = (i, patch) => setList(list.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <Modal title={title} onClose={onClose} wide footer={<>
      {applyLabel && <label className="checkbox" style={{ marginRight: 'auto' }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {applyLabel}</label>}
      <button className="btn secondary" onClick={onClose}>Cancel</button>
      <button className="btn" onClick={() => onSave(list.map((r) => ({ ...r, given: has(r.given) ? Number(r.given) : null, buy: has(r.buy) ? Number(r.buy) : null })), all)}>Save</button>
    </>}>
      <table className="given-table">
        <thead><tr><th /><th className="r">System rate</th><th className="r">Given price</th>{showCost && <th className="r">Buying</th>}<th className="r">Quantity</th><th className="r">Total</th></tr></thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={r.key}>
              <td><b>/{r.label}</b></td>
              <td className="r muted">{has(r.rate) ? money(r.rate, cur) : <span className="badge warn">No rate</span>}</td>
              <td className="r"><input type="number" min={0} value={r.given ?? ''} onChange={(e) => set(i, { given: e.target.value })} style={{ width: 110 }} /></td>
              {showCost && <td className="r"><input type="number" min={0} value={r.buy ?? ''} placeholder={String(r.given ?? '')} onChange={(e) => set(i, { buy: e.target.value })} style={{ width: 100 }} /></td>}
              <td className="r">× {num(r.qty)}</td>
              <td className="r"><b>{money(r2(num(r.given) * num(r.qty)), cur)}</b></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={showCost ? 5 : 4} className="r">Total</td><td className="r"><b>{money(r2(total), cur)}</b></td></tr></tfoot>
      </table>
    </Modal>
  );
}

/** Debounced effect for price look-ups. */
export function useDebounced(fn, deps, ms = 400) {
  const t = useRef(null);
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(fn, ms);
    return () => clearTimeout(t.current);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Section card with Sembark-like heading and total. */
export function Section({ icon, title, total, cur, actions, children, id }) {
  return (
    <div className="card q-section mt" id={id}>
      <div className="q-section-head">
        <h2>{icon} {title}</h2>
        <span className="row">{total !== undefined && <span className="muted">{money(total, cur)}</span>}{actions}</span>
      </div>
      {children}
    </div>
  );
}

const STATUS_LABEL = { complete: 'Complete', missing: 'Missing', short: 'Missing Pax', extra: 'Extra Beds' };

/**
 * Accommodation / transport summary like Sembark: a night- or day-wise table and, when something
 * does not add up, one "Misconfiguration" box listing each problem. Advisory only – saving is allowed.
 */
export function SummaryTable({ title, kind, columns, rows, problems }) {
  if (!rows.length) return null;
  return (
    <div className="q-summary">
      <div className="q-summary-title">{title}</div>
      <table className="q-sum-table">
        <thead><tr><th>{kind === 'night' ? 'Night' : 'Day'}</th>{columns.map((c) => <th key={c.key} className="r">{c.label}</th>)}<th>Status</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key} className={r.status === 'complete' ? '' : 'warn-row'}>
            <td><b>{kind === 'night' ? 'Night' : 'Day'} {r.key}</b>{r.date && <div className="muted small">{r.date}</div>}</td>
            {columns.map((c) => <td key={c.key} className="r">{r[c.key]}</td>)}
            <td><span className={`st st-${r.status}`}>{r.statusLabel || STATUS_LABEL[r.status]}</span></td>
          </tr>
        ))}</tbody>
      </table>
      {problems.length > 0 && (
        <div className="q-misconfig">
          <div className="q-misconfig-title">⚠ Misconfiguration in {kind === 'night' ? 'Hotel' : 'Transport'} Services</div>
          <p>{kind === 'night' ? 'There may be a mismatch in hotel services, such as missing guests or insufficient rooms.' : 'Some days have no transport or not enough seats for all travellers.'} Please review these {kind === 'night' ? 'nights' : 'days'}.</p>
          <ul>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <div className="q-misconfig-note">ⓘ These warnings are advisory. You can continue if the configuration is expected.</div>
        </div>
      )}
    </div>
  );
}

/** "Any extra services" rows for one category (hotel / transport / flight / visa / land_package / trip). */
export function ExtrasEditor({ title, lines, category, onAdd, onChange, onRemove, cur, showCost, nightsTotal, daysTotal, start }) {
  const mine = lines.filter((l) => l.details.category === category && !l.details.lump);
  return (
    <div className="q-extras">
      <div className="row-between"><span className="small"><b>{title}</b></span>
        <button className="btn ghost small" onClick={() => onAdd({ category, description: '', qty: 1, price: '', day: category === 'hotel' ? null : 1, night: category === 'hotel' ? 1 : null })}>+ Add</button></div>
      {mine.length > 0 && (
        <table className="q-table">
          <thead><tr><th>Service</th>{category === 'hotel' && <th>Hotel</th>}{(category === 'hotel' || category === 'transport' || category === 'trip') && <th>{category === 'hotel' ? 'Night' : 'Day'}</th>}<th className="r">Qty</th><th className="r">Price ({cur})</th>{showCost && <th className="r">Buying</th>}<th className="r">Total</th><th>Comments</th><th /></tr></thead>
          <tbody>{mine.map((l) => {
            const d = l.details; const set = (patch) => onChange(l.key, { details: { ...d, ...patch } });
            return [
              <tr key={l.key}>
                <td><input value={d.description} placeholder="e.g. Candle-light dinner" onChange={(e) => set({ description: e.target.value })} /></td>
                {category === 'hotel' && <td><input value={d.hotel_ref || ''} placeholder="Hotel" onChange={(e) => set({ hotel_ref: e.target.value })} /></td>}
                {category === 'hotel' && <td><select value={d.night || ''} onChange={(e) => set({ night: Number(e.target.value) || null })}><option value="">—</option>{Array.from({ length: nightsTotal }, (_, i) => <option key={i} value={i + 1}>{nightLabel(i + 1, start)}</option>)}</select></td>}
                {(category === 'transport' || category === 'trip') && <td><select value={d.day || ''} onChange={(e) => set({ day: Number(e.target.value) || null })}><option value="">—</option>{Array.from({ length: daysTotal }, (_, i) => <option key={i} value={i + 1}>{dayLabel(i + 1, start)}</option>)}</select></td>}
                <td className="r"><input type="number" min={0} value={d.qty} style={{ width: 60 }} onChange={(e) => set({ qty: e.target.value })} /></td>
                <td className="r"><input type="number" min={0} value={d.price} style={{ width: 100 }} onChange={(e) => set({ price: e.target.value })} /></td>
                {showCost && <td className="r"><input type="number" min={0} value={d.buy ?? ''} placeholder={String(d.price || '')} style={{ width: 90 }} onChange={(e) => set({ buy: e.target.value })} /></td>}
                <td className="r nowrap">{money(num(d.price) * num(d.qty), cur)}</td>
                <td><input value={d.comments || ''} onChange={(e) => set({ comments: e.target.value })} /></td>
                <td><button className="btn remove xs" onClick={() => onRemove(l.key)}>Remove</button></td>
              </tr>,
              l.meta?.error && <tr key={`e${l.key}`}><td colSpan={9}><LineError line={l} /></td></tr>,
            ];
          })}</tbody>
        </table>
      )}
    </div>
  );
}

/** The server's message for this quote line, in red under the line. */
export function LineError({ line }) {
  return line?.meta?.error ? <FieldError>{line.meta.error}</FieldError> : null;
}
