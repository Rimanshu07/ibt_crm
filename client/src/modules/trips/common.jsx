import { useEffect, useState } from 'react';
import { ENQUIRY_SERVICES, SERVICES, TRIP_STAGES, datesNeeded } from '@shared/catalog.js';
import { api, addDaysIso, fmtDate, paxText, qs, todayIso } from '../../core/api.js';
import { durationLabel } from '@shared/quoteItems.js';
import { useAuth } from '../../core/auth.jsx';
import { Field, FormError, Input, Modal, Select, useForm, useToast } from '../../core/ui.jsx';
import { ChildrenAges, Combo, CreatableSelect, RefPicker } from '../../core/forms.jsx';

export const DIAL_CODES = ['+91', '+1', '+44', '+971', '+966', '+974', '+965', '+968', '+973', '+65', '+60', '+66', '+62', '+94', '+977', '+975', '+880', '+61', '+64', '+49', '+33', '+39', '+34', '+41', '+31', '+81', '+86', '+27', '+994'];
const splitPhone = (p = '') => { const m = String(p || '').trim().match(/^(\+\d{1,4})\s*(.*)$/); return m && DIAL_CODES.includes(m[1]) ? [m[1], m[2]] : ['+91', String(p || '').replace(/^\+?91\s*/, '')]; };

const STAGE_TONE = { new: 'info', in_progress: 'warn', quote_given: 'info', on_hold: '', converted: 'good', on_trip: 'good', past: '', cancelled: 'bad', dropped: 'bad' };
export const stageLabel = (k) => TRIP_STAGES.find((s) => s.key === k)?.label || k;
export const StageBadge = ({ stage }) => <span className={`badge ${STAGE_TONE[stage] || ''}`}>{stageLabel(stage)}</span>;

export function BookingStatus({ service, status }) {
  const s = SERVICES[service]?.statuses.find((x) => x.key === status);
  return <span className={`badge ${s?.done ? 'good' : s?.closed ? 'bad' : 'warn'}`}>{s?.label || status}</span>;
}

export const ServiceChips = ({ services = [] }) => (
  <span className="row wrap" style={{ gap: 4 }}>
    {services.map((s) => { const d = ENQUIRY_SERVICES.find((x) => x.key === s); return <span key={s} className="badge" title={d?.label}>{d?.icon} {d?.label}</span>; })}
  </span>
);

export const tripDates = (t) => (t.start_date
  ? `${fmtDate(t.start_date)}${t.nights ? ` · ${t.nights}N/${t.nights + 1}D` : ''}`
  : 'No travel dates');
export const tripPax = (t) => paxText(t.adults, t.children_ages, t.infants);

/** Staff list (cached). */
let staffCache = null;
export function useStaff() {
  const [staff, setStaff] = useState(staffCache || []);
  useEffect(() => { if (!staffCache) api('/org/staff').then((r) => { staffCache = r.data; setStaff(r.data); }).catch(() => {}); }, []);
  return staff;
}

/**
 * New enquiry / edit trip. The services chosen decide which dates are needed:
 * holiday package / hotel = start date + nights, flight / train / insurance = travel date, visa / passport = no dates.
 */
export function TripForm({ trip, onClose, onSaved }) {
  const { me, hasFeature } = useAuth();
  const toast = useToast();
  const staff = useStaff();
  const f = useForm(trip ? {
    ...trip, start_date: trip.start_date ? String(trip.start_date).slice(0, 10) : '', nights: trip.nights ?? '',
    children_ages: trip.children_ages || [], services: trip.services?.length ? trip.services : ['package'],
  } : {
    services: ['package'], guest_salutation: 'Mr.', guest_name: '', guest_phone: '', guest_email: '', guest_city: '', source_id: null, ref_id: '',
    destination_ids: [], start_date: '', nights: 3, adults: 2, children_ages: [], infants: 0, foc: 0, tags: [], notes: '', sales_user_id: me.user.id,
  });
  const v = f.values;
  const need = datesNeeded(v.services);
  const toggle = (k) => f.setValues((s) => ({ ...s, services: s.services.includes(k) ? s.services.filter((x) => x !== k) : [...s.services, k] }));
  const [dest, setDest] = useState([]);
  const [code, setCode] = useState(splitPhone(v.guest_phone)[0]);
  const [found, setFound] = useState([]);
  useEffect(() => { api('/lookup/destination?limit=500').then((r) => setDest(r.data)); }, []);
  useEffect(() => {
    if (!trip && !v.sales_user_id && me?.user?.id) {
      f.set('sales_user_id')(me.user.id);
    }
  }, [trip, v.sales_user_id, me?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // existing guest check (by phone / email) on a new query
  useEffect(() => {
    if (trip) return undefined;
    const t = setTimeout(() => {
      const phone = splitPhone(v.guest_phone)[1].replace(/\D/g, '');
      if (phone.length < 6 && !String(v.guest_email).includes('@')) { setFound([]); return; }
      api(`/trips/guest-check${qs({ phone, email: v.guest_email })}`).then((r) => setFound(r.data)).catch(() => setFound([]));
    }, 500);
    return () => clearTimeout(t);
  }, [v.guest_phone, v.guest_email]); // eslint-disable-line react-hooks/exhaustive-deps
  const setPhone = (c, num) => f.set('guest_phone')(num ? `${c} ${num}`.trim() : '');
  const save = () => f.submit(async (val) => {
    const body = { ...val, children_ages: val.children_ages.map(Number), nights: need === 'stay' ? val.nights : need === 'date' ? 0 : val.nights || null, start_date: need === 'none' ? val.start_date || null : val.start_date };
    const r = await api(trip ? `/trips/${trip.id}` : '/trips', { method: trip ? 'PUT' : 'POST', body });
    toast(r.message);
    onSaved(trip ? trip.id : r.data.id);
  });
  return (
    <Modal wide title={trip ? `Edit Trip #${trip.trip_no}` : 'New Enquiry'} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={f.busy} onClick={save}>{trip ? 'Save' : 'Create enquiry'}</button></>}>
      <FormError errors={f.errors} />
      <div className="section-title" style={{ marginTop: 0 }}>What does the client need?</div>
      <div className="chips">
        {ENQUIRY_SERVICES.filter((s) => !s.feature || hasFeature(s.feature)).map((s) => (
          <span key={s.key} className={`chip ${v.services.includes(s.key) ? 'on' : ''}`} onClick={() => toggle(s.key)}>{s.icon} {s.label}</span>
        ))}
      </div>
      {f.errors.services && <div className="field-error">{f.errors.services}</div>}

      <div className="section-title">Guest</div>
      <div className="grid grid-4">
        <Field label="Title"><CreatableSelect list="salutations" value={v.guest_salutation} onChange={f.set('guest_salutation')} /></Field>
        <Input className="span-3" label="Guest name *" value={v.guest_name} onChange={f.set('guest_name')} error={f.errors.guest_name} autoFocus />
        <Field label="Phone" error={f.errors.guest_phone}>
          <div className="row" style={{ gap: 4 }}>
            <select value={code} style={{ width: 84 }} onChange={(e) => { setCode(e.target.value); setPhone(e.target.value, splitPhone(v.guest_phone)[1]); }}>{DIAL_CODES.map((c) => <option key={c}>{c}</option>)}</select>
            <input value={splitPhone(v.guest_phone)[1]} inputMode="tel" placeholder="98xxxxxxxx" onChange={(e) => setPhone(code, e.target.value)} />
          </div>
        </Field>
        <Input label="Email (optional)" type="email" value={v.guest_email} onChange={f.set('guest_email')} error={f.errors.guest_email} />
        <Field label="City (optional)"><CreatableSelect list="cities" value={v.guest_city} onChange={f.set('guest_city')} placeholder="Guest's city" /></Field>
        <Field label="Trip source / agent"><RefPicker refType="trip_source" value={v.source_id} onChange={f.set('source_id')} /></Field>
      </div>
      {found.length > 0 && (
        <div className="alert mt small">
          <b>Existing guest found:</b> {found.slice(0, 3).map((g) => <span key={g.id}> Trip #{g.trip_no} – {g.guest_name} ({g.stage}){' '}
            <button className="btn ghost small" onClick={() => f.setValues((x) => ({ ...x, guest_salutation: g.guest_salutation || x.guest_salutation, guest_name: g.guest_name, guest_email: g.guest_email || x.guest_email, guest_city: g.guest_city || x.guest_city }))}>Use details</button></span>)}
        </div>
      )}

      <div className="section-title">Travel</div>
      <div className="grid grid-4">
        <Field label="Destinations" className="span-2" error={f.errors.destination_ids}>
          <Combo multiple options={dest.map((d) => ({ value: d.id, label: d.name }))} value={v.destination_ids} onChange={(x) => f.set('destination_ids')(x.map(Number))} placeholder="Search destinations" />
          <span className="hint">Add new ones under Services → Destinations.</span>
        </Field>
        {need !== 'none' ? (
          <Input label={need === 'stay' ? 'Start date *' : 'Travel date *'} type="date" min={trip ? undefined : todayIso()} value={v.start_date} onChange={f.set('start_date')} error={f.errors.start_date} />
        ) : (
          <Input label="Travel date (optional)" type="date" value={v.start_date} onChange={f.set('start_date')} hint="Not needed for visa / passport" />
        )}
        {need === 'stay' && (
          <Input label="Nights *" type="number" min={0} value={v.nights} onChange={f.set('nights')} error={f.errors.nights}
            hint={v.nights !== '' ? `${durationLabel(Number(v.nights))}${v.start_date ? ` · ends ${fmtDate(addDaysIso(v.start_date, v.nights))}` : ''}` : ''} />
        )}
      </div>

      <div className="section-title">Travellers</div>
      <div className="grid grid-4">
        <Input label="Adults *" type="number" min={1} value={v.adults} onChange={f.set('adults')} error={f.errors.adults} />
        <div className="span-2"><ChildrenAges ages={v.children_ages} onChange={f.set('children_ages')} error={Object.entries(f.errors).find(([k]) => k.startsWith('children_ages'))?.[1]} /></div>
        <Input label="Infants (under 2)" type="number" min={0} value={v.infants} onChange={f.set('infants')} />
        <Input label="Total FOC" type="number" min={0} value={v.foc ?? 0} onChange={f.set('foc')} hint="Free-of-cost travellers (tour leader, driver…)" />
      </div>

      <div className="section-title">Team & notes</div>
      <div className="grid grid-4">
        <Select label="Assigned to" value={v.sales_user_id || ''} onChange={(e) => f.set('sales_user_id')(Number(e.target.value) || null)} options={staff.map((s) => ({ value: s.id, label: s.name }))} placeholder="Select assignee…" />
        <Input label="Reference ID" value={v.ref_id} onChange={f.set('ref_id')} hint="Agent's / website reference" />
        <Field label="Tags" className="span-2"><CreatableSelect list="trip_tags" multiple value={v.tags} onChange={f.set('tags')} /></Field>
        {!trip && <Field label="Notes / requirements" className="span-all"><textarea value={v.notes} onChange={(e) => f.set('notes')(e.target.value)} rows={3} placeholder="Hotel category, budget, special requests…" /></Field>}
      </div>
    </Modal>
  );
}
