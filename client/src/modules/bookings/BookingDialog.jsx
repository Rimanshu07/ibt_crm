import { Fragment, useState } from 'react';
import { SERVICES, isDoneStatus } from '@shared/catalog.js';
import { api, money, fmtDate } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Field, FormError, Modal, useForm, useToast } from '../../core/ui.jsx';
import { FieldInput, RefPicker } from '../../core/forms.jsx';
import { hotelBookingEmail, loadDocs, openHotelVoucher, openServiceVoucher } from '../documents/documents.js';

/** Update one booking: status, supplier, booked (buying) price, confirmation details. */
export default function BookingDialog({ booking, cur, onClose, onSaved }) {
  const { can } = useAuth();
  const toast = useToast();
  const def = SERVICES[booking.service];
  const f = useForm({
    status: booking.status, supplier_id: booking.supplier_id, booked_amount: booking.booked_amount ?? '', notes: booking.notes || '',
    service_date: booking.service_date ? String(booking.service_date).slice(0, 10) : '',
    fields: Object.fromEntries(def.bookingFields.map((x) => [x.key, booking.details[x.key] ?? ''])),
  });
  const v = f.values;
  const [mail, setMail] = useState(false);
  const done = isDoneStatus(booking.service, v.status);
  const save = () => f.submit(async (val) => {
    const r = await api(`/bookings/${booking.id}`, { method: 'PUT', body: { ...val, booked_amount: val.booked_amount === '' ? null : val.booked_amount, service_date: val.service_date || undefined } });
    toast(r.message); onSaved();
  });
  const email = async () => {
    setMail(true);
    try {
      const d = await loadDocs(booking.trip_id);
      const m = hotelBookingEmail(d, booking);
      location.href = `mailto:${booking.hotel_email || booking.supplier_email || ''}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
    } catch (e) { toast(e.message, 'bad'); } finally { setMail(false); }
  };
  const voucher = async () => {
    const d = await loadDocs(booking.trip_id);
    if (booking.service === 'hotel') openHotelVoucher(d, booking.id); else openServiceVoucher(d, booking.id);
  };
  return (
    <Modal wide title={`${def.icon} ${booking.title}`} onClose={onClose}
      footer={<>
        {booking.service === 'hotel' && <button className="btn secondary" disabled={mail} onClick={email}>✉ Booking enquiry email</button>}
        <button className="btn secondary" onClick={voucher}>Voucher</button>
        <span className="spacer" />
        <button className="btn secondary" onClick={onClose}>Close</button>
        {can(def.perm, 'trips.view_all') && <button className="btn" disabled={f.busy} onClick={save}>{done && !isDoneStatus(booking.service, booking.status) ? 'Confirm booking' : 'Save'}</button>}
      </>}>
      <FormError errors={f.errors} />
      <div className="alert mb small">Trip #{booking.trip_no} · {booking.guest_name} · {booking.service_date ? fmtDate(booking.service_date) : 'no date'}{booking.end_date && booking.end_date !== booking.service_date ? ` → ${fmtDate(booking.end_date)}` : ''}
        {can('quotes.view_cost') && ` · quoted buying price ${money(booking.quoted_cost, cur)}`}</div>
      <div className="grid grid-3">
        <Field label="Status" error={f.errors.status}>
          <select value={v.status} onChange={(e) => f.set('status')(e.target.value)}>{def.statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </Field>
        <Field label={booking.service === 'hotel' ? 'Booked via supplier (empty = direct)' : 'Supplier'} error={f.errors.supplier_id}>
          <RefPicker refType="supplier" service={booking.service} value={v.supplier_id} onChange={f.set('supplier_id')} />
        </Field>
        <Field label={`Booked (buying) price${done ? ' *' : ''}`} error={f.errors.booked_amount} hint={done ? 'Supplier payment schedule is created from their payment preference' : ''}>
          <input type="number" value={v.booked_amount} onChange={(e) => f.set('booked_amount')(e.target.value)} placeholder={String(booking.quoted_cost)} />
        </Field>
        <Field label="Service date"><input type="date" value={v.service_date} onChange={(e) => f.set('service_date')(e.target.value)} /></Field>
        {def.bookingFields.map((x) => (
          <Field key={x.key} label={x.label} error={f.errors[x.key]} className={x.type === 'textarea' ? 'span-all' : ''}>
            <FieldInput field={x} value={v.fields[x.key]} onChange={(val) => f.setValues((s) => ({ ...s, fields: { ...s.fields, [x.key]: val } }))} />
          </Field>
        ))}
        <Field label="Internal notes" className="span-all"><input value={v.notes} onChange={(e) => f.set('notes')(e.target.value)} /></Field>
      </div>
      <h3 className="mt">Service details</h3>
      <dl className="kv">{SERVICES[booking.service].quoteFields.filter((x) => booking.details[x.key] !== undefined && booking.details[x.key] !== '' && x.type !== 'ref').map((x) => (
        <Fragment key={x.key}><dt>{x.label}</dt><dd>{String(booking.details[x.key])}</dd></Fragment>
      ))}</dl>
    </Modal>
  );
}
