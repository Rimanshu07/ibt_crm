import { useEffect, useState } from 'react';
import { SERVICES } from '@shared/catalog.js';
import { api, money, todayIso } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Empty, Kpi, Loading, Modal, useToast } from '../../core/ui.jsx';
import { InstalmentTable, PayDialog, TxnTable } from './shared.jsx';

/** Money for one trip: customer schedule, supplier payables, transactions, profit. */
export default function AccountingTab({ trip, reload }) {
  const { me, can } = useAuth();
  const [d, setD] = useState(null);
  const [paying, setPaying] = useState(null);
  const [editSchedule, setEditSchedule] = useState(false);
  const load = () => api(`/finance/trip/${trip.id}`).then((r) => setD(r.data));
  useEffect(() => { load(); }, [trip.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Loading />;
  const cur = trip.currency || me.org.base_currency;
  const sum = (rows, k) => rows.reduce((s, r) => s + Number(r[k]), 0);
  const after = () => { load(); reload?.(); };
  return (
    <div className="stack" style={{ marginTop: 4 }}>
      <div className="grid grid-4">
        <Kpi label="Package" value={money(trip.package_amount, cur)} />
        <Kpi label="Received from customer" value={money(sum(d.incoming, 'paid_amount'), cur)} sub={`${money(sum(d.incoming, 'amount') - sum(d.incoming, 'paid_amount'), cur)} due`} />
        <Kpi label="Paid to suppliers" value={money(sum(d.outgoing, 'paid_amount'), cur)} sub={`${money(sum(d.outgoing, 'amount') - sum(d.outgoing, 'paid_amount'), cur)} to pay`} />
        {d.profit && <Kpi label="Profit" value={money(d.profit.profit, cur)} sub={`${d.profit.profit_pct}% · ${d.profit.pending_bookings ? `${d.profit.pending_bookings} booking(s) still estimated` : 'all booked'}`} />}
      </div>
      <div className="card flush">
        <div className="card-head"><h2>Customer payments</h2>{can('payments.log') && <button className="btn secondary small" onClick={() => setEditSchedule(true)}>Change schedule</button>}</div>
        {d.incoming.length ? <InstalmentTable rows={d.incoming} cur={cur} onPay={setPaying} /> : <Empty>No customer instalments.</Empty>}
      </div>
      <div className="card flush">
        <div className="card-head"><h2>Supplier payments</h2><span className="muted small">Created when a booking is confirmed</span></div>
        {d.outgoing.length ? <InstalmentTable rows={d.outgoing} cur={cur} onPay={setPaying} showBooking /> : <Empty>No supplier payments yet.</Empty>}
      </div>
      <div className="card flush">
        <div className="card-head"><h2>Transactions</h2></div>
        {d.transactions.length ? <TxnTable rows={d.transactions} cur={cur} onChange={after} /> : <Empty>No payments logged yet.</Empty>}
      </div>
      {d.profit && (
        <div className="card">
          <h3>Profit breakdown</h3>
          <table><tbody>
            <tr><td>Package</td><td className="num">{money(d.profit.package_amount, cur)}</td></tr>
            <tr><td>Tax</td><td className="num">− {money(d.profit.tax, cur)}</td></tr>
            {Object.entries(d.profit.by_service).map(([s, v]) => <tr key={s}><td>{SERVICES[s]?.label}</td><td className="num">− {money(v, cur)}</td></tr>)}
            <tr><td><strong>Profit</strong></td><td className="num"><strong>{money(d.profit.profit, cur)}</strong></td></tr>
          </tbody></table>
        </div>
      )}
      {paying && <PayDialog inst={paying} cur={cur} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); after(); }} />}
      {editSchedule && <ScheduleDialog trip={trip} rows={d.incoming} cur={cur} onClose={() => setEditSchedule(false)} onSaved={() => { setEditSchedule(false); after(); }} />}
    </div>
  );
}

function ScheduleDialog({ trip, rows, cur, onClose, onSaved }) {
  const toast = useToast();
  const paid = rows.filter((r) => Number(r.paid_amount) > 0);
  const kept = paid.reduce((s, r) => s + Number(r.amount), 0);
  const [list, setList] = useState(rows.filter((r) => Number(r.paid_amount) === 0).map((r) => ({ amount: r.amount, due_date: String(r.due_date).slice(0, 10) })));
  const total = kept + list.reduce((s, r) => s + Number(r.amount || 0), 0);
  const save = async () => { try { const r = await api(`/finance/trip/${trip.id}/customer-instalments`, { method: 'PUT', body: { instalments: list } }); toast(r.message); onSaved(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <Modal title="Customer payment schedule" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      {paid.length > 0 && <p className="muted small">{paid.length} instalment(s) with payments ({money(kept, cur)}) stay as they are.</p>}
      {list.map((r, i) => (
        <div key={i} className="row mb">
          <input type="date" value={r.due_date} min={todayIso()} onChange={(e) => setList(list.map((x, k) => (k === i ? { ...x, due_date: e.target.value } : x)))} />
          <input type="number" value={r.amount} onChange={(e) => setList(list.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} />
          <button className="icon-btn" onClick={() => setList(list.filter((_, k) => k !== i))}>✕</button>
        </div>
      ))}
      <button className="btn link" onClick={() => setList([...list, { amount: Math.max(Number(trip.package_amount) - total, 0), due_date: todayIso() }])}>+ Add instalment</button>
      <p className={`mt small ${Math.abs(total - Number(trip.package_amount)) > 0.5 ? '' : 'muted'}`} style={{ color: Math.abs(total - Number(trip.package_amount)) > 0.5 ? 'var(--bad)' : undefined }}>Total {money(total, cur)} of package {money(trip.package_amount, cur)}</p>
    </Modal>
  );
}
