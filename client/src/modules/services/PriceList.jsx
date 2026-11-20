import { useEffect, useState } from 'react';
import { api, qs, money, fmtDate } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Loading, Pagination, useConfirm, useToast } from '../../core/ui.jsx';

const KIND = { base: '', aweb: 'Extra bed (adult)', cweb: 'Extra bed (child)', cnb: 'Child no bed' };
const TYPE = { both: <span className="badge">Sales & booking</span>, sales: <span className="badge info">Sales</span>, ops: <span className="badge warn">Booking (Ops)</span> };

/** Season-wise price rows of one service (optionally one hotel / service). */
export default function PriceList({ service, refId, filters = {} }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState([]);
  const load = () => api(`/rates/${service}${qs({ ...filters, ref_id: refId, page })}`).then(setData);
  useEffect(() => { setData(null); setSel([]); const t = setTimeout(load, 200); return () => clearTimeout(t); }, [service, refId, page, JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${sel.length} price(s)?`, message: 'Quotes already saved keep their prices.', confirmText: 'Delete', tone: 'danger' }))) return;
    const r = await api(`/rates/${service}`, { method: 'DELETE', body: { ids: sel } }); toast(r.message); load();
  };
  if (!data) return <Loading />;
  if (!data.data.length) return <Empty>No prices found.</Empty>;
  const variantLabel = { hotel: 'Room', transport: 'Cab type', activity: 'Ticket' }[service];
  return (
    <>
      {sel.length > 0 && can('masters.manage') && <div className="row mb"><button className="btn danger small" onClick={remove}>Delete {sel.length} selected</button></div>}
      <div className="table-wrap"><table>
        <thead><tr><th><input type="checkbox" checked={sel.length === data.data.length} onChange={(e) => setSel(e.target.checked ? data.data.map((r) => r.id) : [])} /></th>
          {!refId && <th>{{ hotel: 'Hotel', transport: 'Service', activity: 'Activity' }[service]}</th>}<th>{variantLabel}</th>{service === 'hotel' && <th>Meal</th>}{service === 'hotel' && <th>Pax</th>}
          <th>Season</th><th>Dates</th><th>Days</th><th>Rate type</th><th className="num">Price</th></tr></thead>
        <tbody>{data.data.map((r) => (
          <tr key={r.id}>
            <td><input type="checkbox" checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /></td>
            {!refId && <td>{r.ref_name}</td>}
            <td>{r.kind === 'base' ? r.variant : KIND[r.kind]}{r.code && <div className="muted small">[[{r.code}]]</div>}</td>
            {service === 'hotel' && <td>{r.meal_plan}</td>}{service === 'hotel' && <td>{r.occupancy ? `${r.occupancy}P` : '—'}</td>}
            <td className="small">{r.season}</td>
            <td className="nowrap small">{fmtDate(r.date_from)} – {fmtDate(r.date_to)}{String(r.date_to).slice(0, 10) < new Date().toISOString().slice(0, 10) && <span className="badge bad" style={{ marginLeft: 4 }}>Expired</span>}</td>
            <td className="small">{r.weekdays || 'All'}</td><td>{TYPE[r.rate_type]}</td>
            <td className="num"><strong>{money(r.price, r.currency, 2)}</strong></td>
          </tr>
        ))}</tbody>
      </table></div>
      <Pagination page={data.page} size={200} total={data.total} onChange={setPage} />
    </>
  );
}
