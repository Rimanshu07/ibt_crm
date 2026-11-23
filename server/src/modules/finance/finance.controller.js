import { z } from 'zod';
import { query, transaction as tx } from '../../core/db.js';
import { ApiError, validate, notFound, badRequest, r2, j, addDays, todayIso, zText } from '../../core/http.js';
import { hasPerm } from '../../core/auth.js';
import { notify, usersWithPermission } from '../../core/notify.js';
import { getTrip, logTrip } from '../trips/trips.model.js';
import * as M from './finance.model.js';

export async function instalments(req, res) {
  const r = await M.instalments(req, req.query);
  res.json({ data: r.rows, counts: r.counts, tab: r.tab });
}

export async function trip(req, res) {
  const t = await getTrip(req, req.params.id);
  const inst = await M.tripInstalments(t.id);
  res.json({ data: {
    incoming: inst.filter((i) => i.direction === 'in'), outgoing: inst.filter((i) => i.direction === 'out'),
    transactions: (await M.tripTransactions(t.id)).map((x) => ({ ...x, allocations: j(x.allocations, null) })),
    profit: hasPerm(req, 'quotes.view_cost') ? await M.tripProfit(t) : null,
  } });
}

export async function customerSchedule(req, res) {
  const t = await getTrip(req, req.params.id);
  const b = validate(z.object({ instalments: z.array(z.object({ amount: z.coerce.number().positive(), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).min(1) }), req.body);
  const existing = await query("SELECT * FROM instalments WHERE trip_id = ? AND direction = 'in'", [t.id]);
  const kept = existing.filter((i) => Number(i.paid_amount) > 0).reduce((s, i) => s + Number(i.amount), 0);
  const sum = b.instalments.reduce((s, i) => s + i.amount, 0);
  if (Math.abs(kept + sum - Number(t.package_amount)) > 0.5) throw badRequest(`Paid instalments (${r2(kept)}) + new (${r2(sum)}) must equal the package (${t.package_amount})`);
  const name = existing[0]?.party_name || `${t.guest_salutation ? `${t.guest_salutation} ` : ''}${t.guest_name}`;
  await tx(async (c) => {
    await c.execute("DELETE FROM instalments WHERE trip_id = ? AND direction = 'in' AND paid_amount = 0", [t.id]);
    for (const i of b.instalments) {
      await c.execute(`INSERT INTO instalments (org_id, trip_id, direction, party_type, party_name, amount, due_date, created_by) VALUES (?,?, 'in', 'customer', ?,?,?,?)`,
        [req.orgId, t.id, name, i.amount, i.due_date, req.user.id]);
    }
    await logTrip(c, req, t.id, 'updated the customer payment schedule');
  });
  res.json({ message: 'Payment schedule saved' });
}

const paySchema = z.object({
  amount: z.coerce.number().positive('Enter the amount'),
  paid_at: z.string().min(10, 'Enter the date'),
  mode: z.string().trim().min(1).max(30).default('Bank transfer'),
  account_id: z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional().transform((v) => v || null),
  reference: zText(100), narration: zText(255),
  carry_forward: z.boolean().default(true),
});

/**
 * Log money received / paid against an instalment.
 * Short payment (e.g. 5,000 of 7,000): with carry_forward the 2,000 balance moves to the next
 * unpaid instalment (or a new one a week later) and this instalment is closed at 5,000.
 * Over payment: the extra settles the next instalments of the same party.
 */
export async function pay(req, res) {
  const inst = await M.instalment(req.orgId, Number(req.params.id));
  if (!inst) throw notFound('Instalment');
  const trip = await getTrip(req, inst.trip_id);
  const b = validate(paySchema, req.body);
  if (b.account_id && !(await M.account(req.orgId, b.account_id))) throw badRequest('Choose an account from the list', { account_id: 'Unknown account' });
  const account = b.account_id ? { id: b.account_id } : await M.defaultAccount(req.orgId, b.mode === 'Cash' ? 'cash' : b.mode === 'UPI' ? 'upi' : 'bank');

  const result = await tx(async (c) => {
    const remaining = r2(Number(inst.amount) - Number(inst.paid_amount));
    const others = await M.nextOpen(c, inst);
    const totalOpen = r2(remaining + others.reduce((s, o) => s + Number(o.amount) - Number(o.paid_amount), 0));
    if (b.amount > totalOpen + 0.5) throw badRequest(`Only ${totalOpen} is due from ${inst.party_name} on this trip`, { amount: `Max ${totalOpen}` });
    const allocations = []; let carry = null;
    const applied = Math.min(b.amount, remaining);
    await c.execute('UPDATE instalments SET paid_amount = paid_amount + ? WHERE id = ?', [applied, inst.id]);
    allocations.push({ instalment_id: inst.id, amount: r2(applied) });
    let extra = r2(b.amount - applied);
    for (const o of others) {
      if (extra <= 0) break;
      const take = Math.min(extra, r2(Number(o.amount) - Number(o.paid_amount)));
      await c.execute('UPDATE instalments SET paid_amount = paid_amount + ? WHERE id = ?', [take, o.id]);
      allocations.push({ instalment_id: o.id, amount: r2(take) });
      extra = r2(extra - take);
    }
    const short = r2(remaining - applied);
    if (short > 0.009 && b.carry_forward) {
      const target = others.find((o) => Number(o.paid_amount) < Number(o.amount));
      await c.execute('UPDATE instalments SET amount = paid_amount WHERE id = ?', [inst.id]);
      if (target) {
        await c.execute('UPDATE instalments SET amount = amount + ?, carried_from_id = ? WHERE id = ?', [short, inst.id, target.id]);
        carry = { from_id: inst.id, to_id: target.id, amount: short, created: false };
      } else {
        const due = addDays(String(inst.due_date).slice(0, 10) > todayIso() ? String(inst.due_date).slice(0, 10) : todayIso(), 7);
        const [r] = await c.execute(
          `INSERT INTO instalments (org_id, trip_id, booking_id, direction, party_type, party_id, party_name, amount, due_date, carried_from_id, comments, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [req.orgId, inst.trip_id, inst.booking_id, inst.direction, inst.party_type, inst.party_id, inst.party_name, short, due, inst.id, 'Balance carried forward', req.user.id]
        );
        carry = { from_id: inst.id, to_id: r.insertId, amount: short, created: true };
      }
    }
    const [x] = await c.execute(
      `INSERT INTO transactions (org_id, trip_id, instalment_id, account_id, direction, party_type, party_id, party_name, amount, paid_at, mode, reference, narration, allocations, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.orgId, inst.trip_id, inst.id, account?.id || null, inst.direction, inst.party_type, inst.party_id, inst.party_name, b.amount,
        b.paid_at.replace('T', ' ').slice(0, 19), b.mode, b.reference, b.narration, JSON.stringify({ allocations, carry }), req.user.id]
    );
    await logTrip(c, req, inst.trip_id, `logged ${inst.direction === 'in' ? 'receipt' : 'payment'} of ${b.amount} ${inst.direction === 'in' ? 'from' : 'to'} ${inst.party_name}${carry ? ` (balance ${carry.amount} carried forward)` : ''}`);
    return { id: x.insertId, carry };
  });

  if (req.features.includes('payment_verification')) {
    const verifiers = (await usersWithPermission(req.orgId, 'payments.verify')).filter((id) => id !== req.user.id);
    await notify(null, { orgId: req.orgId, userIds: verifiers, type: 'payment.logged', title: `Verify ${inst.direction === 'in' ? 'receipt' : 'payment'} of ${b.amount} – Trip ${trip.trip_no}`, body: `${inst.party_name} · ${b.mode}${b.reference ? ` · ${b.reference}` : ''}`, link: '/app/accounting/transactions?verified=0' });
  }
  res.json({ data: result, message: result.carry ? `Payment logged. Balance of ${result.carry.amount} moved to ${result.carry.created ? 'a new instalment' : 'the next instalment'}.` : 'Payment logged.' });
}

export async function verify(req, res) {
  const x = await M.transaction(req.orgId, Number(req.params.id));
  if (!x) throw notFound('Transaction');
  if (x.verified_at) throw badRequest('Already verified');
  await query('UPDATE transactions SET verified_at = NOW(), verified_by = ? WHERE id = ?', [req.user.id, x.id]);
  if (x.trip_id) await logTrip(null, req, x.trip_id, `verified the ${x.amount} transaction with ${x.party_name}`);
  if (x.created_by && x.created_by !== req.user.id) await notify(null, { orgId: req.orgId, userIds: [x.created_by], type: 'payment.verified', title: `Payment of ${x.amount} verified`, body: `${x.party_name} · verified by ${req.user.name}`, link: x.trip_id ? `/app/trips/${x.trip_id}?tab=accounting` : '/app/accounting/transactions' });
  res.json({ message: 'Payment verified' });
}

/** Undo a logged payment (only before verification), including any carry-forward. */
export async function removeTxn(req, res) {
  const x = await M.transaction(req.orgId, Number(req.params.id));
  if (!x) throw notFound('Transaction');
  if (x.verified_at) throw new ApiError(400, 'LOCKED', 'Verified transactions cannot be deleted');
  const info = j(x.allocations, null) || { allocations: x.instalment_id ? [{ instalment_id: x.instalment_id, amount: x.amount }] : [] };
  await tx(async (c) => {
    for (const a of info.allocations || []) await c.execute('UPDATE instalments SET paid_amount = GREATEST(paid_amount - ?, 0) WHERE id = ?', [a.amount, a.instalment_id]);
    if (info.carry) {
      await c.execute('UPDATE instalments SET amount = amount + ? WHERE id = ?', [info.carry.amount, info.carry.from_id]);
      if (info.carry.created) await c.execute('DELETE FROM instalments WHERE id = ? AND paid_amount = 0', [info.carry.to_id]);
      else await c.execute('UPDATE instalments SET amount = GREATEST(amount - ?, 0) WHERE id = ?', [info.carry.amount, info.carry.to_id]);
    }
    await c.execute('DELETE FROM transactions WHERE id = ?', [x.id]);
    if (x.trip_id) await logTrip(c, req, x.trip_id, `removed the ${x.amount} transaction with ${x.party_name}`);
  });
  res.json({ message: 'Transaction removed' });
}

export async function transactions(req, res) { res.json({ data: (await M.transactions(req.orgId, req.query)).map((x) => ({ ...x, allocations: j(x.allocations, null) })) }); }

export async function accounts(req, res) {
  const rows = await M.accounts(req.orgId);
  res.json({ data: rows.map((a) => ({ ...a, balance: r2(Number(a.opening_balance) + Number(a.money_in) - Number(a.money_out)) })) });
}

export async function parties(req, res) { res.json({ data: await M.parties(req.orgId, req.query.type) }); }

export async function ledger(req, res) {
  const f = validate(z.object({ party_type: z.enum(['customer', 'supplier', 'hotel']), party_id: z.string().optional(), trip_id: z.string().optional() }), req.query);
  if (f.party_type === 'customer' && !f.trip_id) throw badRequest('trip_id is required');
  if (f.party_type !== 'customer' && !f.party_id) throw badRequest('party_id is required');
  res.json({ data: await M.ledger(req.orgId, f) });
}
