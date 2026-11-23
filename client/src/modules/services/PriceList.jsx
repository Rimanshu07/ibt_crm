import { useEffect, useState } from 'react';
import { api, qs, money, fmtDate } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Field, Loading, Modal, Pagination, useConfirm, useToast } from '../../core/ui.jsx';

const KIND = { base: '', aweb: 'Extra bed (adult)', cweb: 'Extra bed (child)', cnb: 'Child no bed' };
const TYPE = { both: <span className="badge">Sales & booking</span>, sales: <span className="badge info">Sales</span>, ops: <span className="badge warn">Booking (Ops)</span> };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function EditPriceModal({ rate, service, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    price: rate.price ?? '',
    season: rate.season || '',
    date_from: String(rate.date_from || '').slice(0, 10),
    date_to: String(rate.date_to || '').slice(0, 10),
    weekdays: rate.weekdays || '',
    rate_type: rate.rate_type || 'both',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (form.price === '' || Number(form.price) < 0) {
      toast('Please enter a valid price', 'bad');
      return;
    }
    if (!form.date_from || !form.date_to) {
      toast('Valid From and Valid To dates are required', 'bad');
      return;
    }
    if (form.date_to < form.date_from) {
      toast('Valid To date cannot be earlier than Valid From date', 'bad');
      return;
    }
    setBusy(true);
    try {
      const res = await api(`/rates/${service}/${rate.id}`, {
        method: 'PUT',
        body: form,
      });
      toast(res.message);
      onSaved();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const activeDays = form.weekdays ? form.weekdays.split(',').filter(Boolean) : [];
  const isAll = activeDays.length === 0 || activeDays.length === 7;

  return (
    <Modal
      title="Edit Price"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
        <strong>{rate.ref_name}</strong>
        <div className="muted small" style={{ marginTop: 2 }}>
          {rate.variant ? `${rate.variant} ` : ''}
          {rate.kind && rate.kind !== 'base' ? `(${KIND[rate.kind]}) ` : ''}
          {rate.meal_plan ? `· ${rate.meal_plan} ` : ''}
          {rate.occupancy ? `· ${rate.occupancy} Pax` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label={`Price (${rate.currency}) *`}>
            <input
              type="number"
              min={0}
              step="any"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </Field>

          <Field label="Rate Type *">
            <select
              value={form.rate_type}
              onChange={(e) => setForm({ ...form, rate_type: e.target.value })}
            >
              <option value="both">Sales & Booking</option>
              <option value="sales">Sales (Quotation)</option>
              <option value="ops">Booking (Ops)</option>
            </select>
          </Field>
        </div>

        <Field label="Season">
          <input
            value={form.season}
            placeholder="e.g. Peak / Regular"
            onChange={(e) => setForm({ ...form, season: e.target.value })}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Valid From *">
            <input
              type="date"
              value={form.date_from}
              onChange={(e) => setForm({ ...form, date_from: e.target.value })}
            />
          </Field>

          <Field label="Valid To *">
            <input
              type="date"
              value={form.date_to}
              min={form.date_from}
              onChange={(e) => setForm({ ...form, date_to: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Weekdays">
          <div className="manual-weekdays" style={{ marginTop: 2 }}>
            <button
              type="button"
              className={`slot ${isAll ? 'on' : ''}`}
              style={{ minWidth: 32 }}
              onClick={() => setForm({ ...form, weekdays: '' })}
            >
              All
            </button>
            {DAYS.map((d) => {
              const on = isAll || activeDays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  className={`slot ${on ? 'on' : ''}`}
                  onClick={() => {
                    let next;
                    if (isAll) next = [d];
                    else if (activeDays.includes(d)) next = activeDays.filter((x) => x !== d);
                    else next = [...activeDays, d];
                    setForm({ ...form, weekdays: next.length === 0 || next.length === 7 ? '' : next.join(',') });
                  }}
                >
                  {d[0]}
                </button>
              );
            })}
          </div>
          <span className="muted" style={{ fontSize: 11, marginTop: 2 }}>
            {isAll ? 'All days (default)' : activeDays.join(', ')}
          </span>
        </Field>
      </div>
    </Modal>
  );
}

/** Season-wise price rows of one service (optionally one hotel / service). */
export default function PriceList({ service, refId, filters = {} }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api(`/rates/${service}${qs({ ...filters, ref_id: refId, page })}`).then(setData);

  useEffect(() => {
    setData(null);
    setSel([]);
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [service, refId, page, JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${sel.length} price(s)?`, message: 'Quotes already saved keep their prices.', confirmText: 'Delete', tone: 'danger' }))) return;
    const r = await api(`/rates/${service}`, { method: 'DELETE', body: { ids: sel } });
    toast(r.message);
    load();
  };

  if (!data) return <Loading />;
  if (!data.data.length) return <Empty>No prices found.</Empty>;

  const variantLabel = { hotel: 'Room', transport: 'Cab type', activity: 'Ticket' }[service];

  return (
    <>
      {sel.length > 0 && can('masters.manage') && (
        <div className="row mb">
          <button className="btn danger small" onClick={remove}>
            Delete {sel.length} selected
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={sel.length === data.data.length}
                  onChange={(e) => setSel(e.target.checked ? data.data.map((r) => r.id) : [])}
                />
              </th>
              {!refId && <th>{{ hotel: 'Hotel', transport: 'Service', activity: 'Activity' }[service]}</th>}
              <th>{variantLabel}</th>
              {service === 'hotel' && <th>Meal</th>}
              {service === 'hotel' && <th>Pax</th>}
              <th>Season</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Rate type</th>
              <th className="num">Price</th>
              <th style={{ width: 80, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={sel.includes(r.id)}
                    onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))}
                  />
                </td>
                {!refId && <td>{r.ref_name}</td>}
                <td>
                  {r.kind === 'base' ? r.variant : KIND[r.kind]}
                  {r.code && <div className="muted small">[[{r.code}]]</div>}
                </td>
                {service === 'hotel' && <td>{r.meal_plan}</td>}
                {service === 'hotel' && <td>{r.occupancy ? `${r.occupancy}P` : '—'}</td>}
                <td className="small">{r.season}</td>
                <td className="nowrap small">
                  {fmtDate(r.date_from)} – {fmtDate(r.date_to)}
                  {String(r.date_to).slice(0, 10) < new Date().toISOString().slice(0, 10) && (
                    <span className="badge bad" style={{ marginLeft: 4 }}>Expired</span>
                  )}
                </td>
                <td className="small">{r.weekdays || 'All'}</td>
                <td>{TYPE[r.rate_type]}</td>
                <td className="num">
                  <strong>{money(r.price, r.currency, 2)}</strong>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {can('masters.manage') && (
                    <button
                      type="button"
                      className="btn secondary xs"
                      title="Edit this rate"
                      onClick={() => setEditing(r)}
                    >
                      ✎ Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} size={200} total={data.total} onChange={setPage} />

      {editing && (
        <EditPriceModal
          rate={editing}
          service={service}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}
