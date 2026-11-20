import { useEffect, useState } from 'react';
import { SERVICES } from '@shared/catalog.js';
import { money, fmtDate } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Loading, useToast } from '../../core/ui.jsx';
import { BookingStatus } from '../trips/common.jsx';
import { activityVoucherEmail, loadDocs, openHotelVoucher, openInvoice, openQuote, openReceipt, openServiceVoucher, openTripVoucher } from './documents.js';

/** All printable documents of a trip. */
export default function DocsTab({ trip }) {
  const { hasFeature } = useAuth();
  const toast = useToast();
  const [d, setD] = useState(null);
  useEffect(() => { loadDocs(trip.id).then(setD).catch((e) => toast(e.message, 'bad')); }, [trip.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Loading />;
  const converted = ['converted', 'on_trip', 'past'].includes(trip.stage);
  const cur = d.quote?.currency || trip.currency;
  const mail = (b) => { const m = activityVoucherEmail(d, b.id); location.href = `mailto:${trip.guest_email || ''}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`; };
  return (
    <div className="stack" style={{ marginTop: 4 }}>
      <div className="grid grid-3">
        <DocCard icon="📄" title="Quotation" text={d.quote ? `Quote v${d.quote.version} · ${money(d.quote.total_selling, cur)}` : 'No quote yet'} disabled={!d.quote} onOpen={() => openQuote(d)} />
        <DocCard icon="🧾" title="Proforma Invoice" text={converted ? 'With tax break-up and bank details' : 'Available after conversion'} disabled={!converted || !hasFeature('proforma_invoice')} onOpen={() => openInvoice(d)} />
        <DocCard icon="🎫" title="Trip Voucher" text="All hotels, services, itinerary and contacts" disabled={!converted} onOpen={() => openTripVoucher(d)} />
      </div>
      {converted && (
        <div className="card flush">
          <div className="card-head"><h2>Service vouchers</h2><span className="muted small">Templates and header/footer are set in Organization settings</span></div>
          {d.bookings.length === 0 ? <Empty>No bookings.</Empty> : (
            <table><tbody>{d.bookings.map((b) => (
              <tr key={b.id}>
                <td className="nowrap">{SERVICES[b.service]?.icon} {SERVICES[b.service]?.label}</td><td>{b.title}<div className="muted small">{b.service_date ? fmtDate(b.service_date) : ''}</div></td>
                <td><BookingStatus service={b.service} status={b.status} /></td>
                <td className="right nowrap">
                  <button className="btn secondary small" onClick={() => (b.service === 'hotel' ? openHotelVoucher(d, b.id) : openServiceVoucher(d, b.id))}>Voucher</button>
                  {b.service === 'activity' && <button className="btn ghost small" onClick={() => mail(b)}>✉ Email</button>}
                </td>
              </tr>
            ))}</tbody></table>
          )}
        </div>
      )}
      {d.receipts.length > 0 && (
        <div className="card flush">
          <div className="card-head"><h2>Payment receipts</h2></div>
          <table><tbody>{d.receipts.map((r) => (
            <tr key={r.id}><td>{fmtDate(r.paid_at)}</td><td>{money(r.amount, cur)} · {r.mode}</td><td>{r.verified_at ? <span className="badge good">Verified</span> : <span className="badge warn">Not verified</span>}</td>
              <td className="right"><button className="btn secondary small" onClick={() => openReceipt(d, r.id)}>Receipt</button></td></tr>
          ))}</tbody></table>
        </div>
      )}
    </div>
  );
}

const DocCard = ({ icon, title, text, onOpen, disabled }) => (
  <div className="card" style={{ opacity: disabled ? 0.55 : 1 }}>
    <div style={{ fontSize: 28 }}>{icon}</div><h2>{title}</h2><p className="muted small">{text}</p>
    <button className="btn secondary small" disabled={disabled} onClick={onOpen}>Open / Print / PDF</button>
  </div>
);
