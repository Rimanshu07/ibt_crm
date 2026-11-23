import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, money, fmtDate, fmtDateTime, ago } from '../../core/api.js';
import { useAuth } from '../../core/auth.jsx';
import { Field, Input, Loading, Modal, PageHeader, Select, Tabs, useConfirm, useToast } from '../../core/ui.jsx';
import { StageBadge, ServiceChips, TripForm, stageLabel, tripDates, tripPax, useStaff } from './common.jsx';
import QuotesTab from './QuotesTab.jsx';
import BookingsTab from '../bookings/BookingsTab.jsx';
import AccountingTab from '../accounting/AccountingTab.jsx';
import DocsTab from '../documents/DocsTab.jsx';

export default function TripDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { me, can, hasFeature } = useAuth();
  const toast = useToast();
  const [t, setT] = useState(null);
  const [editing, setEditing] = useState(false);
  const [stageDlg, setStageDlg] = useState(null);
  const hasQuotes = hasFeature('quotes');
  const defaultTab = hasQuotes ? 'quotes' : 'overview';
  const tab = params.get('tab') || defaultTab;
  const load = useCallback(() => api(`/trips/${id}`).then((r) => setT(r.data)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!t) return <Loading />;
  const converted = ['converted', 'on_trip', 'past'].includes(t.stage);
  const cur = t.currency || me.org.base_currency;
  const moves = converted ? (t.stage !== 'past' ? ['cancelled'] : []) : ['new', 'in_progress', 'on_hold', 'dropped'].filter((s) => s !== t.stage);

  return (
    <>
      <PageHeader crumbs={<><Link to="/app/trips">Trips</Link> › #{t.trip_no}</>}
        title={<span className="row">Trip #{t.trip_no} · {t.guest_salutation} {t.guest_name} <StageBadge stage={t.stage} /></span>}
        subtitle={<span className="row wrap">{t.destinations.map((d) => d.name).join(', ') || 'No destination'} · {tripDates(t)} · {tripPax(t)} <ServiceChips services={t.services} /></span>}
        actions={<>
          {can('trips.edit') && t.stage === 'cancelled' && (
            <button className="btn secondary" onClick={() => setStageDlg('in_progress')}>Reopen Query</button>
          )}
          {can('trips.edit') && t.stage !== 'cancelled' && t.stage !== 'past' && (
            <button className="btn danger outline" onClick={() => setStageDlg('cancelled')}>✕ Cancel {converted ? 'Trip' : 'Query'}</button>
          )}
          {can('trips.edit') && moves.length > 0 && (
            <select value="" onChange={(e) => e.target.value && setStageDlg(e.target.value)} style={{ width: 170 }}>
              <option value="">Change stage…</option>{moves.map((s) => <option key={s} value={s}>{s === 'dropped' ? 'Drop enquiry' : s === 'cancelled' ? 'Cancel trip' : stageLabel(s)}</option>)}
            </select>
          )}
          {can('trips.edit') && <button className="btn secondary" onClick={() => setEditing(true)}>Edit</button>}
          {hasFeature('quotes') && can('quotes.create') && !['cancelled', 'past'].includes(t.stage) && <Link className="btn" to={`/app/trips/${t.id}/quote`}>+ New Quote</Link>}
        </>} />
      <div className="card flush">
        <div style={{ padding: '0 12px' }}>
          <Tabs value={tab} onChange={(k) => setParams({ tab: k })} tabs={[
            hasQuotes && { key: 'quotes', label: 'Quotes', count: t.quotes?.length ?? 0 },
            { key: 'overview', label: 'Overview' },
            converted && { key: 'bookings', label: 'Bookings' },
            converted && hasFeature('accounting') && { key: 'accounting', label: 'Accounting' },
            hasFeature('vouchers') && { key: 'docs', label: 'Docs & Vouchers' },
            { key: 'activity', label: 'Activity' },
          ]} />
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          {tab === 'quotes' && <QuotesTab trip={t} reload={load} />}
          {tab === 'overview' && <Overview t={t} cur={cur} reload={load} />}
          {tab === 'bookings' && <BookingsTab trip={t} />}
          {tab === 'accounting' && <AccountingTab trip={t} reload={load} />}
          {tab === 'docs' && <DocsTab trip={t} />}
          {tab === 'activity' && <Activity tripId={t.id} />}
        </div>
      </div>
      {editing && <TripForm trip={t} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {stageDlg && <StageDialog stage={stageDlg} trip={t} onClose={() => setStageDlg(null)} onDone={(m) => { setStageDlg(null); toast(m); load(); }} />}
    </>
  );
}

function StageDialog({ stage, trip, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [err, setErr] = useState('');
  const isCancelled = stage === 'cancelled';
  const needReason = ['dropped', 'cancelled'].includes(stage);

  const CANCELLATION_REASONS = [
    'Price too high',
    'Booked elsewhere',
    'Plan postponed',
    'Plan cancelled',
    'Not reachable',
    'Duplicate enquiry',
    'Visa rejected',
    'Customer not interested',
    'Dates / destination not feasible',
    'Other',
  ];

  const go = async () => {
    try {
      const r = await api(`/trips/${trip.id}/stage`, {
        method: 'POST',
        body: {
          stage,
          reason,
          comments: comments.trim() || undefined,
          remind_at: remindAt || undefined,
        },
      });
      onDone(r.message);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <Modal
      title={isCancelled ? `Cancel ${['converted', 'on_trip'].includes(trip.stage) ? 'Trip' : 'Query'}` : `Move to ${stageLabel(stage)}`}
      onClose={onClose}
      footer={<>
        <button className="btn secondary" onClick={onClose}>{isCancelled ? 'Keep Query' : 'Cancel'}</button>
        <button className={`btn ${needReason ? 'danger' : ''}`} disabled={needReason && !reason} onClick={go}>
          {isCancelled ? 'Mark as Canceled' : 'Confirm'}
        </button>
      </>}>
      {err && <div className="alert bad mb">{err}</div>}
      {isCancelled ? (
        <div className="stack">
          <Field label="Cancellation reason *">
            <select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
              <option value="">Select cancellation reason…</option>
              {CANCELLATION_REASONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Reminder date (optional for postponed queries / follow-up)">
            <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
          </Field>
          <Field label="Comments / Notes (optional)">
            <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Provide any additional details or context…" />
          </Field>
        </div>
      ) : (
        <Field label={needReason ? 'Reason *' : 'Note (optional)'}>
          {needReason ? (
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose…</option>
              {['Price too high', 'Booked elsewhere', 'Plan postponed', 'Plan cancelled', 'Not reachable', 'Duplicate enquiry', 'Visa rejected', 'Other'].map((x) => <option key={x}>{x}</option>)}
            </select>
          ) : (
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
      )}
    </Modal>
  );
}

function Overview({ t, cur, reload }) {
  const { me, can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const staff = useStaff();
  const defaultAssignee = t.sales_user_id || me?.user?.id || '';
  const [team, setTeam] = useState({ sales_user_id: t.sales_user_id, resv_user_id: t.resv_user_id, ops_user_id: t.ops_user_id });
  const [travel, setTravel] = useState({ arrival_details: t.arrival_details || '', departure_details: t.departure_details || '' });
  const [task, setTask] = useState({ body: '', due_at: '', assignee_id: defaultAssignee, is_actionable: true });
  const staffOpts = staff.map((s) => ({ value: s.id, label: s.name }));

  useEffect(() => {
    setTeam({ sales_user_id: t.sales_user_id, resv_user_id: t.resv_user_id, ops_user_id: t.ops_user_id });
  }, [t.sales_user_id, t.resv_user_id, t.ops_user_id]);

  useEffect(() => {
    setTask((prev) => ({
      ...prev,
      assignee_id: prev.assignee_id || t.sales_user_id || me?.user?.id || '',
    }));
  }, [t.sales_user_id, me?.user?.id]);

  const saveTeam = async () => { const r = await api(`/trips/${t.id}/team`, { method: 'PUT', body: team }); toast(r.message); reload(); };
  const saveTravel = async () => { const r = await api(`/trips/${t.id}/travel-details`, { method: 'PUT', body: travel }); toast(r.message); };
  const addTask = async () => {
    try {
      const r = await api('/tasks', {
        method: 'POST',
        body: {
          ...task,
          trip_id: t.id,
          assignee_id: task.assignee_id || t.sales_user_id || me?.user?.id || null,
          due_at: task.is_actionable ? task.due_at || null : null,
        },
      });
      toast(r.message);
      setTask({ body: '', due_at: '', assignee_id: t.sales_user_id || me?.user?.id || '', is_actionable: true });
      reload();
    } catch (e) { toast(e.message, 'bad'); }
  };
  const toggleTask = async (k) => { await api(`/tasks/${k.id}/done`, { method: 'POST' }); reload(); };
  const delTask = async (k) => { if (await confirm({ title: 'Delete this note?', message: k.body, confirmText: 'Delete', tone: 'danger' })) { await api(`/tasks/${k.id}`, { method: 'DELETE' }); reload(); } };
  return (
    <div className="layout-side" style={{ marginTop: 4 }}>
      <div className="stack">
        <div className="card">
          <div className="card-head"><h2>Follow-ups & comments</h2></div>
          <div className="grid grid-4">
            <Field label="Write a follow-up or comment" className="span-all"><textarea rows={2} value={task.body} onChange={(e) => setTask({ ...task, body: e.target.value })} placeholder="e.g. Call the client to confirm hotel category" /></Field>
            <label className="checkbox"><input type="checkbox" checked={task.is_actionable} onChange={(e) => setTask({ ...task, is_actionable: e.target.checked })} /> It's a follow-up (reminder)</label>
            {task.is_actionable && <Input type="datetime-local" label="Remind on" value={task.due_at} onChange={(e) => setTask({ ...task, due_at: e.target.value })} />}
            {task.is_actionable && <Select label="Assign to" value={task.assignee_id} onChange={(e) => setTask({ ...task, assignee_id: e.target.value })} options={staffOpts} placeholder="Me" />}
            <div className="row" style={{ alignItems: 'end' }}><button className="btn" disabled={!task.body.trim()} onClick={addTask}>Add</button></div>
          </div>
          <div className="timeline mt">
            {t.tasks.length === 0 && <p className="muted small">No follow-ups yet.</p>}
            {t.tasks.map((k) => (
              <div key={k.id}>
                <div className="row-between">
                  <label className="checkbox" style={{ textDecoration: k.done_at ? 'line-through' : 'none' }}>
                    {k.is_actionable ? <input type="checkbox" checked={Boolean(k.done_at)} onChange={() => toggleTask(k)} /> : '💬'} {k.body}
                  </label>
                  <button className="btn remove xs" onClick={() => delTask(k)}>Remove</button>
                </div>
                <div className="muted small">{k.created_by_name} · {ago(k.created_at)}{k.due_at && ` · due ${fmtDateTime(k.due_at)}`}{k.assignee_name && ` · for ${k.assignee_name}`}</div>
              </div>
            ))}
          </div>
        </div>
        {['converted', 'on_trip', 'past'].includes(t.stage) && (
          <div className="card">
            <div className="card-head"><h2>Arrival & departure</h2>{can('trips.edit') && <button className="btn secondary small" onClick={saveTravel}>Save</button>}</div>
            <div className="grid grid-2">
              <Input label="Arrival (flight / train / time)" value={travel.arrival_details} onChange={(e) => setTravel({ ...travel, arrival_details: e.target.value })} />
              <Input label="Departure" value={travel.departure_details} onChange={(e) => setTravel({ ...travel, departure_details: e.target.value })} />
            </div>
          </div>
        )}
      </div>
      <div className="stack">
        <div className="card">
          <h3>Trip details</h3>
          <dl className="kv">
            <dt>Guest</dt><dd>{t.guest_salutation} {t.guest_name}</dd>
            <dt>Phone</dt><dd>{t.guest_phone ? <a href={`tel:${t.guest_phone}`}>{t.guest_phone}</a> : '—'}</dd>
            <dt>Email</dt><dd>{t.guest_email || '—'}</dd>
            <dt>City</dt><dd>{t.guest_city || '—'}</dd>
            <dt>Trip type</dt><dd>{t.trip_type === 'package' ? 'Holiday package' : 'Individual services'}</dd>
            <dt>Travel</dt><dd>{tripDates(t)}{t.end_date && <div className="muted small">till {fmtDate(t.end_date)}</div>}</dd>
            <dt>Travellers</dt><dd>{tripPax(t)}</dd>
            <dt>Assigned to</dt><dd>{t.sales_name || '—'}</dd>
            <dt>Source</dt><dd>{t.source_name || 'Direct'}{t.ref_id && ` · Ref ${t.ref_id}`}</dd>
            <dt>Tags</dt><dd>{t.tags.join(', ') || '—'}</dd>
            <dt>Created</dt><dd>{fmtDateTime(t.created_at)} by {t.created_by_name}</dd>
          </dl>
        </div>
        {t.package_amount && (
          <div className="card">
            <h3>Money</h3>
            <dl className="kv">
              <dt>Package</dt><dd><strong>{money(t.package_amount, cur)}</strong></dd>
              <dt>Received</dt><dd>{money(t.money.received, cur)} of {money(t.money.receivable, cur)}</dd>
              <dt>Paid to suppliers</dt><dd>{money(t.money.paid, cur)} of {money(t.money.payable, cur)}</dd>
            </dl>
          </div>
        )}
        <div className="card">
          <div className="card-head"><h3>Team</h3>{can('trips.assign') && <button className="btn secondary small" onClick={saveTeam}>Save</button>}</div>
          <div className="stack">
            <Select label="Sales" value={team.sales_user_id || ''} onChange={(e) => setTeam({ ...team, sales_user_id: Number(e.target.value) || null })} options={staffOpts} placeholder="—" disabled={!can('trips.assign')} />
            <Select label="Reservations" value={team.resv_user_id || ''} onChange={(e) => setTeam({ ...team, resv_user_id: Number(e.target.value) || null })} options={staffOpts} placeholder="—" disabled={!can('trips.assign')} />
            <Select label="Operations" value={team.ops_user_id || ''} onChange={(e) => setTeam({ ...team, ops_user_id: Number(e.target.value) || null })} options={staffOpts} placeholder="—" disabled={!can('trips.assign')} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Activity({ tripId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api(`/trips/${tripId}/logs`).then((r) => setRows(r.data)); }, [tripId]);
  if (!rows) return <Loading />;
  return (
    <div className="timeline" style={{ marginTop: 8 }}>
      {rows.map((l) => <div key={l.id}><strong>{l.user_name || 'System'}</strong> {l.message}<div className="muted small">{fmtDateTime(l.created_at)}</div></div>)}
    </div>
  );
}
