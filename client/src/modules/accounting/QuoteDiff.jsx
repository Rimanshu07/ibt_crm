import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SERVICES } from '@shared/catalog.js';
import { api, money, fmtDate } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Loading, PageHeader } from '../../core/ui.jsx';

export default function QuoteDiff() {
  const { me } = useAuth();
  const cur = me.org.base_currency;
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/reports/quote-diff').then((r) => setRows(r.data)); }, []);
  return (
    <>
      <PageHeader title="Quote vs Booking" subtitle="Bookings where the booked (buying) price differs from the quoted buying price. Red = costs more than quoted (less profit)." />
      <div className="card flush">
        {!rows ? <Loading /> : !rows.length ? <Empty>All booked prices match their quotes.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Trip</th><th>Service</th><th className="num">Quoted</th><th className="num">Booked</th><th className="num">Difference</th></tr></thead>
            <tbody>{rows.map((r) => {
              const diff = Number(r.booked_amount) - Number(r.quoted_cost);
              return (
                <tr key={r.id}><td>{fmtDate(r.service_date)}</td><td><Link to={`/app/trips/${r.trip_id}?tab=bookings`}>#{r.trip_no}</Link> · {r.guest_name}</td>
                  <td>{SERVICES[r.service]?.icon} {r.title}</td><td className="num">{money(r.quoted_cost, cur)}</td><td className="num">{money(r.booked_amount, cur)}</td>
                  <td className="num" style={{ color: diff > 0 ? 'var(--bad)' : 'var(--good)' }}>{diff > 0 ? '+' : ''}{money(diff, cur)}</td></tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
