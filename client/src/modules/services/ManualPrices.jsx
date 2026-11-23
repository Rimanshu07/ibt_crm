import { useState } from 'react';
import { api, todayIso } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Modal, useToast } from '../../core/ui.jsx';
import { RefPicker, useOptions } from '../../core/forms.jsx';

const REF = { hotel: 'hotel', transport: 'transport_service', activity: 'activity_service' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const blank = (service, prev = {}) => ({
  ref_id: prev.ref_id || null,
  variant: prev.variant || '',
  meal_plan: prev.meal_plan || '',
  occupancy: service === 'hotel' ? (prev.occupancy || 2) : '',
  kind: prev.kind || 'base',
  season: prev.season || '',
  date_from: prev.date_from || todayIso(),
  date_to: prev.date_to || '',
  weekdays: '',
  sales: prev.sales || '',
  ops: prev.ops || '',
  meta_variants: prev.meta_variants || null,
});

const curSymbol = (cur) => {
  if (cur === 'INR') return '₹';
  if (cur === 'USD') return '$';
  if (cur === 'EUR') return '€';
  if (cur === 'GBP') return '£';
  return cur || '₹';
};

/**
 * Option 3: Expandable Bulk Rate Table
 * Compact primary row with Hotel, Room & Meal, Validity, Selling, Buying, and Actions.
 * Expandable subrow for Weekdays, Season, Price for, and Guests.
 */
export default function ManualPrices({ service, onClose, onSaved }) {
  const { me } = useAuth();
  const toast = useToast();
  const opts = useOptions(['meal_plans', 'room_types', 'cab_types', 'currencies']);
  const [currency, setCurrency] = useState(me?.org?.base_currency || 'INR');
  const [rows, setRows] = useState([blank(service)]);
  const [expanded, setExpanded] = useState({ 0: false });
  const [busy, setBusy] = useState(false);

  const set = (i, patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const toggleExpand = (i) => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }));

  const addRow = () => {
    const prevRow = rows[rows.length - 1];
    const newRow = blank(service, prevRow);
    const nextIdx = rows.length;
    setRows([...rows, newRow]);
    setExpanded((prev) => ({ ...prev, [nextIdx]: true }));
  };

  const duplicateRow = (i) => {
    const source = rows[i];
    const cloned = { ...source };
    const nextRows = [...rows.slice(0, i + 1), cloned, ...rows.slice(i + 1)];
    setRows(nextRows);

    setExpanded((prev) => {
      const nextExp = {};
      Object.keys(prev).forEach((k) => {
        const idx = Number(k);
        if (idx <= i) nextExp[idx] = prev[idx];
        else nextExp[idx + 1] = prev[idx];
      });
      nextExp[i + 1] = true;
      return nextExp;
    });
    toast('Rate row duplicated');
  };

  const removeRow = (i) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, k) => k !== i));
    setExpanded((prev) => {
      const nextExp = {};
      Object.keys(prev).forEach((k) => {
        const idx = Number(k);
        if (idx < i) nextExp[idx] = prev[idx];
        else if (idx > i) nextExp[idx - 1] = prev[idx];
      });
      return nextExp;
    });
  };

  const handleToggleDay = (i, day) => {
    const r = rows[i];
    const selected = r.weekdays ? r.weekdays.split(',').filter(Boolean) : [];
    let next;
    if (selected.length === 0) {
      next = [day];
    } else if (selected.includes(day)) {
      next = selected.filter((d) => d !== day);
      if (next.length === 0) {
        set(i, { weekdays: '' });
        return;
      }
    } else {
      next = [...selected, day];
      if (next.length === 7) {
        set(i, { weekdays: '' });
        return;
      }
    }
    set(i, { weekdays: next.join(',') });
  };

  const save = async () => {
    const entityLabel = service === 'hotel' ? 'hotel' : service === 'transport' ? 'transport service' : 'activity';

    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      if (!r.ref_id) {
        toast(`Row #${i + 1}: Please select a ${entityLabel}`, 'bad');
        return;
      }
      if (!r.date_from) {
        toast(`Row #${i + 1}: Valid From date is required`, 'bad');
        return;
      }
      if (!r.date_to) {
        toast(`Row #${i + 1}: Valid To date is required`, 'bad');
        return;
      }
      if (r.date_to < r.date_from) {
        toast(`Row #${i + 1}: Valid To date cannot be earlier than Valid From date`, 'bad');
        return;
      }
      const hasS = r.sales !== '' && r.sales !== null && r.sales !== undefined;
      const hasO = r.ops !== '' && r.ops !== null && r.ops !== undefined;
      if (!hasS && !hasO) {
        toast(`Row #${i + 1}: Please enter a selling or buying rate`, 'bad');
        return;
      }
    }

    setBusy(true);
    try {
      const cleanRows = rows.map((r) => ({
        ref_id: r.ref_id,
        variant: r.kind === 'base' || service !== 'hotel' ? (r.variant || '') : '',
        meal_plan: r.meal_plan || '',
        occupancy: service === 'hotel' ? (r.kind === 'base' ? r.occupancy || null : null) : null,
        kind: r.kind || 'base',
        season: r.season || 'Manual',
        date_from: r.date_from,
        date_to: r.date_to,
        weekdays: r.weekdays || '',
        sales: r.sales,
        ops: r.ops,
      }));

      const res = await api(`/rates/${service}/manual`, {
        method: 'POST',
        body: { currency, rows: cleanRows },
      });
      toast(res.message);
      onSaved();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const modalTitle = service === 'hotel' ? 'Bulk rate table | Hotel Rate Editor' : service === 'transport' ? 'Bulk rate table | Transport Rate Editor' : 'Bulk rate table | Activity Rate Editor';
  const variantColTitle = service === 'hotel' ? 'Room & meal' : service === 'transport' ? 'Cab type' : 'Ticket type';

  return (
    <Modal
      title={modalTitle}
      xwide
      onClose={onClose}
      footer={
        <>
          <div className="row" style={{ marginRight: 'auto', gap: 10, alignItems: 'center' }}>
            <span className="small muted">Currency:</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ width: 'auto', minWidth: 85, padding: '4px 8px' }}
            >
              {(opts.currencies || ['INR']).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn secondary small"
              onClick={addRow}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <span style={{ fontSize: 14, fontWeight: 'bold' }}>+</span> Add rate
            </button>
          </div>
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : `Save ${rows.length} rate${rows.length > 1 ? 's' : ''}`}
          </button>
        </>
      }
    >
      <div className="rate-table-wrap">
        <table className="rate-table">
          <thead>
            <tr>
              <th style={{ width: 34 }} />
              <th style={{ minWidth: 230 }}>{service === 'hotel' ? 'Hotel' : service === 'transport' ? 'Service' : 'Activity'}</th>
              <th style={{ minWidth: 200 }}>{variantColTitle}</th>
              <th style={{ minWidth: 220 }}>Validity</th>
              <th style={{ minWidth: 110 }}>Selling</th>
              <th style={{ minWidth: 110 }}>Buying</th>
              <th style={{ width: 70, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isExp = Boolean(expanded[i]);
              const activeDays = r.weekdays ? r.weekdays.split(',').filter(Boolean) : [];
              const isAllDays = activeDays.length === 0 || activeDays.length === 7;

              return (
                <>
                  <tr key={`row-${i}`} className={`rate-row ${isExp ? 'is-expanded' : ''}`}>
                    <td>
                      <button
                        type="button"
                        className="expand-btn"
                        onClick={() => toggleExpand(i)}
                        title={isExp ? 'Collapse extra details' : 'Expand extra details (weekdays, season, guests)'}
                      >
                        {isExp ? '▼' : '▶'}
                      </button>
                    </td>

                    <td>
                      <RefPicker
                        refType={REF[service]}
                        value={r.ref_id}
                        onChange={(v) => set(i, { ref_id: v })}
                        onPicked={(rec) => {
                          const rooms = Array.isArray(rec?.data?.room_types)
                            ? rec.data.room_types.map((x) => (typeof x === 'object' ? x.name : x)).filter(Boolean)
                            : [];
                          const meals = Array.isArray(rec?.data?.meal_plans) ? rec.data.meal_plans : [];
                          const patch = { ref_id: rec ? rec.id : null };
                          if (rooms.length > 0) patch.meta_variants = rooms;
                          if (!r.meal_plan && meals.length > 0) patch.meal_plan = meals[0];
                          set(i, patch);
                        }}
                        placeholder={service === 'hotel' ? 'Select hotel...' : service === 'transport' ? 'Select transport...' : 'Select activity...'}
                      />
                    </td>

                    <td>
                      {service === 'hotel' ? (
                        <div className="room-meal-cell">
                          <input
                            list={`mv-${service}-${i}`}
                            value={r.kind === 'base' ? r.variant : `[${r.kind.toUpperCase()}]`}
                            disabled={r.kind !== 'base'}
                            placeholder="Room type"
                            onChange={(e) => set(i, { variant: e.target.value })}
                            className="compact-input"
                            title={r.kind !== 'base' ? 'Applies to all rooms for this extra bed type' : undefined}
                          />
                          <select
                            value={r.meal_plan}
                            onChange={(e) => set(i, { meal_plan: e.target.value })}
                            className="compact-select"
                            title="Meal Plan"
                          >
                            <option value="">Meal</option>
                            {(opts.meal_plans || []).map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <input
                          list={`mv-${service}-${i}`}
                          value={r.variant}
                          placeholder={service === 'transport' ? 'Cab type (e.g. Sedan)' : 'Ticket (Adult / Child)'}
                          onChange={(e) => set(i, { variant: e.target.value })}
                          className="compact-input"
                          style={{ width: '100%' }}
                        />
                      )}
                    </td>

                    <td>
                      <div className="validity-cell">
                        <input
                          type="date"
                          value={r.date_from}
                          onChange={(e) => set(i, { date_from: e.target.value })}
                          className="compact-date"
                          title="Valid From"
                        />
                        <span className="date-sep">–</span>
                        <input
                          type="date"
                          value={r.date_to}
                          min={r.date_from}
                          onChange={(e) => set(i, { date_to: e.target.value })}
                          className="compact-date"
                          title="Valid To"
                        />
                      </div>
                    </td>

                    <td>
                      <div className="price-input-cell">
                        <span className="cur-symbol">{curSymbol(currency)}</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={r.sales}
                          placeholder="0.00"
                          onChange={(e) => set(i, { sales: e.target.value })}
                          className="compact-price"
                        />
                      </div>
                    </td>

                    <td>
                      <div className="price-input-cell">
                        <span className="cur-symbol">{curSymbol(currency)}</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={r.ops}
                          placeholder={r.sales || '0.00'}
                          onChange={(e) => set(i, { ops: e.target.value })}
                          className="compact-price"
                        />
                      </div>
                    </td>

                    <td>
                      <div className="row-actions-cell">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Duplicate rate (copies hotel, room, meal & dates)"
                          onClick={() => duplicateRow(i)}
                        >
                          ⧉
                        </button>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            className="icon-btn remove-btn"
                            title="Delete rate row"
                            onClick={() => removeRow(i)}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isExp && (
                    <tr key={`exp-${i}`} className="expanded-subrow">
                      <td colSpan={7}>
                        <div className="subrow-content">
                          {/* Weekdays */}
                          <div className="subrow-item weekdays-item">
                            <span className="subrow-label">Weekdays</span>
                            <div className="manual-weekdays">
                              <button
                                type="button"
                                className={`slot ${isAllDays ? 'on' : ''}`}
                                style={{ minWidth: 28, height: 24, padding: '0 4px', fontSize: 11 }}
                                onClick={() => set(i, { weekdays: '' })}
                              >
                                All
                              </button>
                              {DAYS.map((d) => {
                                const on = isAllDays || activeDays.includes(d);
                                return (
                                  <button
                                    key={d}
                                    type="button"
                                    className={`slot ${on ? 'on' : ''}`}
                                    style={{ minWidth: 22, height: 24, padding: '0 3px', fontSize: 11 }}
                                    title={d}
                                    onClick={() => handleToggleDay(i, d)}
                                  >
                                    {d[0]}
                                  </button>
                                );
                              })}
                            </div>
                            <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
                              {isAllDays ? 'All days' : activeDays.join(', ')}
                            </span>
                          </div>

                          <div className="subrow-divider" />

                          {/* Season */}
                          <div className="subrow-item">
                            <span className="subrow-label">Season</span>
                            <input
                              value={r.season}
                              placeholder="Peak / Lean"
                              onChange={(e) => set(i, { season: e.target.value })}
                              className="subrow-input"
                            />
                          </div>

                          {service === 'hotel' && (
                            <>
                              <div className="subrow-divider" />

                              {/* Price for */}
                              <div className="subrow-item">
                                <span className="subrow-label">Price for</span>
                                <select
                                  value={r.kind}
                                  onChange={(e) => set(i, { kind: e.target.value })}
                                  className="subrow-select"
                                >
                                  <option value="base">Room (Base)</option>
                                  <option value="aweb">Extra Adult (AWEB)</option>
                                  <option value="cweb">Child w/ Bed (CWEB)</option>
                                  <option value="cnb">Child No Bed (CNB)</option>
                                </select>
                              </div>

                              <div className="subrow-divider" />

                              {/* Guests / Occupancy */}
                              <div className="subrow-item">
                                <span className="subrow-label">Guests</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={r.kind === 'base' ? r.occupancy : ''}
                                  disabled={r.kind !== 'base'}
                                  placeholder="2"
                                  onChange={(e) => set(i, { occupancy: e.target.value })}
                                  className="subrow-input-num"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  <datalist id={`mv-${service}-${i}`}>
                    {(r.meta_variants && r.meta_variants.length ? r.meta_variants : (opts.room_types || [])).map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
