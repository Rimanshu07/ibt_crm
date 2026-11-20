import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SERVICES, DEFAULT_OPTIONS } from '@shared/catalog.js';
import { api, money, fmtDate, todayIso } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Field, FormError, Modal, useConfirm, useForm, useToast } from '../../core/ui.jsx';
import { CreatableSelect } from '../../core/forms.jsx';

const left = (i) => Math.round((Number(i.amount) - Number(i.paid_amount)) * 100) / 100;
export function dueState(i) {
  const rem = left(i);
  if (rem <= 0) return <span className="badge good">Paid</span>;
  const due = String(i.due_date).slice(0, 10);
  if (due < todayIso()) return <span className="badge bad">Overdue</span>;
  if (due === todayIso()) return <span className="badge warn">Due today</span>;
  return Number(i.paid_amount) > 0 ? <span className="badge info">Part paid</span> : <span className="badge">Upcoming</span>;
}

export function InstalmentTable({ rows, cur, onPay, showTrip, showBooking }) {
  const { can } = useAuth();
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Due date</th>{showTrip && <th>Trip</th>}<th>{showBooking ? 'Supplier / service' : 'Party'}</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map((i) => (
          <tr key={i.id}>
            <td className="nowrap">{fmtDate(i.due_date)}{i.carried_from_id && <div className="muted small">incl. carried balance</div>}</td>
            {showTrip && <td className="nowrap"><Link to={`/app/trips/${i.trip_id}?tab=accounting`}>#{i.trip_no}</Link><div className="muted small">{i.guest_name}</div></td>}
            <td>{i.party_name}{showBooking && i.booking_title && <div className="muted small">{SERVICES[i.service]?.icon} {i.booking_title}</div>}{i.comments && <div className="muted small">{i.comments}</div>}</td>
            <td className="num">{money(i.amount, cur)}</td>
            <td className="num">{money(i.paid_amount, cur)}{Number(i.unverified) > 0 && <div><span className="badge warn">{i.unverified} unverified</span></div>}</td>
            <td className="num"><strong>{money(left(i), cur)}</strong></td>
            <td>{dueState(i)}</td>
            <td>{left(i) > 0 && onPay && can('payments.log') && <button className="btn small" onClick={() => onPay(i)}>{i.direction === 'in' ? 'Log receipt' : 'Log payment'}</button>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Log a receipt / payment. Short payments move the balance to the next instalment. */
export function PayDialog({ inst, cur, onClose, onSaved }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const remaining = left(inst);
  const f = useForm({ amount: remaining, paid_at: todayIso(), mode: 'Bank transfer', account_id: '', reference: '', narration: '', carry_forward: true });
  const v = f.values;
  useEffect(() => { api('/finance/accounts').then((r) => setAccounts(r.data.filter((a) => a.is_active))).catch(() => {}); }, []);
  const short = Math.round((remaining - Number(v.amount || 0)) * 100) / 100;
  const extra = -short;
  const save = () => f.submit(async (val) => { const r = await api(`/finance/instalments/${inst.id}/pay`, { method: 'POST', body: { ...val, account_id: val.account_id || null } }); toast(r.message); onSaved(); });
  const isIn = inst.direction === 'in';
  return (
    <Modal title={isIn ? `Log receipt from ${inst.party_name}` : `Log payment to ${inst.party_name}`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={f.busy} onClick={save}>Save</button></>}>
      <FormError errors={f.errors} />
      <div className="alert mb small">Instalment due {fmtDate(inst.due_date)}: {money(inst.amount, cur)} · already paid {money(inst.paid_amount, cur)} · balance <strong>{money(remaining, cur)}</strong></div>
      <div className="grid grid-2">
        <Field label="Amount *" error={f.errors.amount}><input type="number" value={v.amount} onChange={(e) => f.set('amount')(e.target.value)} autoFocus /></Field>
        <Field label="Date *" error={f.errors.paid_at}><input type="date" value={v.paid_at} onChange={(e) => f.set('paid_at')(e.target.value)} /></Field>
        <Field label="Mode"><CreatableSelect list="payment_modes" options={DEFAULT_OPTIONS.payment_modes} value={v.mode} onChange={f.set('mode')} /></Field>
        <Field label={isIn ? 'Received in account' : 'Paid from account'} error={f.errors.account_id}>
          <select value={v.account_id} onChange={(e) => f.set('account_id')(e.target.value)}><option value="">Default for this mode</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
        <Field label="Reference (UTR / cheque no.)"><input value={v.reference} onChange={(e) => f.set('reference')(e.target.value)} /></Field>
        <Field label="Narration"><input value={v.narration} onChange={(e) => f.set('narration')(e.target.value)} /></Field>
      </div>
      {short > 0.009 && (
        <div className="alert warn mt">
          <label className="checkbox"><input type="checkbox" checked={v.carry_forward} onChange={(e) => f.set('carry_forward')(e.target.checked)} />
            Move the balance of <strong>&nbsp;{money(short, cur)}&nbsp;</strong> to the next instalment</label>
          <div className="small muted" style={{ marginTop: 4 }}>{v.carry_forward ? 'This instalment closes at the amount paid. If there is no next instalment, a new one is created 7 days later.' : 'The balance stays on this instalment.'}</div>
        </div>
      )}
      {extra > 0.009 && <div className="alert mt small">The extra {money(extra, cur)} will settle the next instalment(s) of {inst.party_name}.</div>}
    </Modal>
  );
}

/** Verify with a confirmation popup; verified payments are locked. */
export function useVerify(onDone) {
  const confirm = useConfirm();
  const toast = useToast();
  return async (x, cur) => {
    const ok = await confirm({
      title: 'Verify this payment?',
      message: (<>
        <p>{x.direction === 'in' ? 'Received from' : 'Paid to'} <strong>{x.party_name}</strong></p>
        <dl className="kv"><dt>Amount</dt><dd><strong>{money(x.amount, cur)}</strong></dd><dt>Date</dt><dd>{fmtDate(x.paid_at)}</dd><dt>Mode</dt><dd>{x.mode}{x.account_name ? ` · ${x.account_name}` : ''}</dd>
          <dt>Reference</dt><dd>{x.reference || '—'}</dd><dt>Logged by</dt><dd>{x.created_by_name}</dd></dl>
        <div className="alert warn small">Check that the money is actually in the bank statement. Verified payments cannot be edited or deleted.</div>
      </>),
      confirmText: 'Yes, verify', tone: 'good',
    });
    if (!ok) return;
    try { const r = await api(`/finance/transactions/${x.id}/verify`, { method: 'POST' }); toast(r.message); onDone(); } catch (e) { toast(e.message, 'bad'); }
  };
}

export function useRemoveTxn(onDone) {
  const confirm = useConfirm();
  const toast = useToast();
  return async (x, cur) => {
    if (!(await confirm({ title: 'Delete this transaction?', message: `${money(x.amount, cur)} with ${x.party_name} will be removed and the instalment balance restored (including any carried-forward amount).`, confirmText: 'Delete', tone: 'danger' }))) return;
    try { const r = await api(`/finance/transactions/${x.id}`, { method: 'DELETE' }); toast(r.message); onDone(); } catch (e) { toast(e.message, 'bad'); }
  };
}

export function TxnTable({ rows, cur, onChange, showTrip }) {
  const { can, hasFeature } = useAuth();
  const verify = useVerify(onChange);
  const remove = useRemoveTxn(onChange);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Date</th>{showTrip && <th>Trip</th>}<th>Party</th><th>Mode / account</th><th className="num">Amount</th><th>Verification</th><th /></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.id}>
            <td className="nowrap">{fmtDate(x.paid_at)}</td>
            {showTrip && <td>{x.trip_id ? <Link to={`/app/trips/${x.trip_id}?tab=accounting`}>#{x.trip_no}</Link> : '—'}<div className="muted small">{x.guest_name}</div></td>}
            <td>{x.direction === 'in' ? 'From' : 'To'} {x.party_name}<div className="muted small">by {x.created_by_name}{x.allocations?.carry ? ` · ${money(x.allocations.carry.amount, cur)} carried forward` : ''}</div></td>
            <td>{x.mode}{x.account_name && <div className="muted small">{x.account_name}</div>}{x.reference && <div className="muted small">{x.reference}</div>}</td>
            <td className="num" style={{ color: x.direction === 'in' ? 'var(--good)' : 'var(--bad)' }}>{x.direction === 'in' ? '+' : '−'}{money(x.amount, cur)}</td>
            <td>{x.verified_at ? <span className="badge good">✓ {x.verified_by_name}</span>
              : hasFeature('payment_verification') && can('payments.verify') ? <button className="btn small good" onClick={() => verify(x, cur)}>Verify</button> : <span className="badge warn">Not verified</span>}</td>
            <td>{!x.verified_at && can('payments.log') && <button className="icon-btn" title="Delete" onClick={() => remove(x, cur)}>🗑</button>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
