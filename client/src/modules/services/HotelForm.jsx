import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../core/api.js';
import { Field, FormError, Input, Loading, PageHeader, useForm, useToast } from '../../core/ui.jsx';
import { CreatableSelect, RefPicker } from '../../core/forms.jsx';

const Section = ({ title, help, children }) => (
  <div className="grid" style={{ gridTemplateColumns: '260px 1fr', padding: '18px 0', borderBottom: '1px solid var(--line)' }}>
    <div><h2>{title}</h2><p className="muted small">{help}</p></div><div>{children}</div>
  </div>
);

function Closures({ kind, rows, setRows, rooms, help }) {
  const list = rows.filter((r) => r.kind === kind);
  const others = rows.filter((r) => r.kind !== kind);
  const update = (i, patch) => setRows([...others, ...list.map((r, k) => (k === i ? { ...r, ...patch } : r))]);
  return (
    <div className="stack">
      <ul className="muted small" style={{ margin: 0 }}>{help.map((h) => <li key={h}>{h}</li>)}</ul>
      {list.map((r, i) => (
        <div key={i} className="row wrap">
          <input type="date" value={r.date_from} onChange={(e) => update(i, { date_from: e.target.value })} style={{ width: 150 }} />
          <span>to</span><input type="date" value={r.date_to} onChange={(e) => update(i, { date_to: e.target.value })} style={{ width: 150 }} />
          <div style={{ minWidth: 260, flex: 1 }}><CreatableSelect list="room_types" options={rooms} multiple value={r.room_types} onChange={(v) => update(i, { room_types: v })} placeholder="All rooms" /></div>
          <button className="icon-btn" onClick={() => setRows([...others, ...list.filter((_, k) => k !== i)])}>✕</button>
        </div>
      ))}
      <button className="btn secondary small" style={{ width: 'fit-content' }} onClick={() => setRows([...rows, { kind, date_from: '', date_to: '', room_types: [] }])}>+ Add Date Intervals</button>
    </div>
  );
}

export default function HotelForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [closures, setClosures] = useState([]);
  const [prefs, setPrefs] = useState([]);
  const [loaded, setLoaded] = useState(!id);
  const f = useForm({
    name: '', group_name: '', star: '', location: '', address: '', meal_plans: ['CP', 'MAP', 'AP'], room_types: [{ name: '', eb: 1, aweb: 1, cweb: 1, cnb: 1, rooms: '' }],
    checkin_time: '12:00', checkout_time: '11:00', child_age_from: 6, child_age_to: 12, payment_pref_id: '', supplier_id: null, phone: '', email: '', link: '', contacts: [], notes: '',
  });
  const v = f.values;
  useEffect(() => { api('/org/payment-prefs?kind=supplier').then((r) => setPrefs(r.data)); }, []);
  useEffect(() => {
    if (!id) return;
    api(`/hotels/${id}`).then(({ data: h }) => {
      f.setValues({ ...h, group_name: h.group_name || '', star: h.star || '', address: h.address || '', payment_pref_id: h.payment_pref_id || '', phone: h.phone || '', email: h.email || '', link: h.link || '', notes: h.notes || '',
        room_types: h.room_types.length ? h.room_types.map((r) => ({ eb: 1, aweb: 1, cweb: 1, cnb: 1, rooms: '', ...r })) : [{ name: '', eb: 1, aweb: 1, cweb: 1, cnb: 1, rooms: '' }] });
      setClosures(h.closures.map((c) => ({ kind: c.kind, date_from: String(c.date_from).slice(0, 10), date_to: String(c.date_to).slice(0, 10), room_types: c.room_types || [] })));
      setLoaded(true);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!loaded) return <Loading />;
  const setRoom = (i, patch) => f.set('room_types')(v.room_types.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const save = () => f.submit(async (val) => {
    const body = { ...val, payment_pref_id: val.payment_pref_id || null, room_types: val.room_types.filter((r) => r.name.trim()).map((r) => ({ ...r, rooms: r.rooms === '' ? null : Number(r.rooms) })) };
    const r = await api(id ? `/hotels/${id}` : '/hotels', { method: id ? 'PUT' : 'POST', body });
    const hid = id || r.data.id;
    await api(`/hotels/${hid}/closures`, { method: 'PUT', body: { closures: closures.filter((c) => c.date_from && c.date_to) } });
    toast('Hotel saved'); nav(`/app/services/hotels/${hid}`);
  });
  const roomNames = v.room_types.map((r) => r.name).filter(Boolean);
  return (
    <>
      <PageHeader crumbs={<><Link to="/app/services/hotels">Hotels</Link> › {id ? 'Edit' : 'New'}</>} title={id ? `Edit ${v.name}` : 'Add Hotel'}
        actions={<><Link className="btn secondary" to={id ? `/app/services/hotels/${id}` : '/app/services/hotels'}>Cancel</Link><button className="btn" disabled={f.busy} onClick={save}>Save Hotel Details</button></>} />
      <div className="card">
        <FormError errors={f.errors} />
        <Section title="Basic Details" help="Provide basic details e.g. name, star rating and address.">
          <div className="grid grid-3">
            <Input label="Name *" value={v.name} onChange={f.set('name')} error={f.errors.name} />
            <Field label="Group Name (optional)"><CreatableSelect list="hotel_groups" value={v.group_name || null} onChange={(x) => f.set('group_name')(x || '')} /></Field>
            <Field label="Stars"><CreatableSelect list="stars" value={v.star || null} onChange={(x) => f.set('star')(x || '')} /></Field>
            <Input className="span-2" label="Location *" value={v.location} onChange={f.set('location')} error={f.errors.location} hint="City, State, Country. Must match the location in uploaded price sheets. Used in filters and quotes." />
            <Input label="Phone" value={v.phone} onChange={f.set('phone')} />
            <Field label="Full Address" className="span-2" hint="Used when generating vouchers"><textarea rows={2} value={v.address} onChange={(e) => f.set('address')(e.target.value)} /></Field>
            <Input label="Reservations email" value={v.email} onChange={f.set('email')} hint="Booking enquiry emails go here" />
          </div>
        </Section>
        <Section title="Services" help="Meal plans and rooms available in this hotel, with the extra beds allowed. Group room types that allow the same extra beds.">
          <Field label="Meal Plans *" error={f.errors.meal_plans}><CreatableSelect list="meal_plans" multiple value={v.meal_plans} onChange={f.set('meal_plans')} /></Field>
          <h3 className="mt">Room Types with Allowed Extra Bed(s) / Mattress(es)</h3>
          <table><thead><tr><th>Room type</th><th title="Extra beds a room can take (shared by adult and child)">Allowed extra bed(s)</th><th>AWEB(s)</th><th>CWEB(s)</th><th>CNB(s)</th><th>No. of rooms</th><th /></tr></thead>
            <tbody>{v.room_types.map((r, i) => (
              <tr key={i}>
                <td style={{ minWidth: 220 }}><CreatableSelect list="room_types" value={r.name || null} onChange={(x) => setRoom(i, { name: x || '' })} /></td>
                <td><input type="number" min={0} max={4} value={r.eb ?? 1} onChange={(e) => setRoom(i, { eb: e.target.value })} style={{ width: 70 }} /></td>
                {['aweb', 'cweb', 'cnb'].map((k) => <td key={k}><input type="number" min={0} value={r[k]} onChange={(e) => setRoom(i, { [k]: e.target.value })} style={{ width: 70 }} /></td>)}
                <td><input type="number" min={0} value={r.rooms ?? ''} onChange={(e) => setRoom(i, { rooms: e.target.value })} style={{ width: 80 }} /></td>
                <td><button className="icon-btn" onClick={() => f.set('room_types')(v.room_types.filter((_, k) => k !== i))}>✕</button></td>
              </tr>
            ))}</tbody></table>
          {f.errors.room_types && <div className="error small">{f.errors.room_types}</div>}
          <button className="btn secondary small" onClick={() => f.set('room_types')([...v.room_types, { name: '', eb: 1, aweb: 1, cweb: 1, cnb: 1, rooms: '' }])}>+ Add Rooms with Different Extra Beds</button>
          <p className="muted small mt">Allowed extra beds = beds a room can take in total (AWEB + CWEB share them) · AWEB = adult with extra bed · CWEB = child with extra bed · CNB = child without bed</p>
        </Section>
        <Section title="Soldout Dates" help="Rooms cannot be sold on these dates.">
          <Closures kind="soldout" rows={closures} setRows={setClosures} rooms={roomNames} help={['Block room sales when rooms are fully booked', 'Use for fully booked dates or temporarily unavailable rooms', 'Apply to specific room types or all rooms']} />
        </Section>
        <Section title="Blackout Dates" help="Quotes show a warning and the rate must be entered manually.">
          <Closures kind="blackout" rows={closures} setRows={setClosures} rooms={roomNames} help={['Get a warning for blackout dates and enter the applicable manual rate before confirming the quote or booking', 'Use for maintenance, private events, renovations']} />
        </Section>
        <Section title="Configuration" help="Check-in / check-out time and children's age range for extra beds.">
          <div className="grid grid-4">
            <Input type="time" label="Checkin Time" value={v.checkin_time} onChange={f.set('checkin_time')} />
            <Input type="time" label="Checkout Time" value={v.checkout_time} onChange={f.set('checkout_time')} />
            <Input type="number" label="Child age from" value={v.child_age_from} onChange={f.set('child_age_from')} />
            <Input type="number" label="Child age to" value={v.child_age_to} onChange={f.set('child_age_to')} error={f.errors.child_age_to} />
          </div>
          <ul className="muted small"><li>Below this range, children are counted as complimentary kids.</li><li>Above this range, children are counted as adults.</li><li>Within this range, child no-bed / child extra-bed charges apply.</li></ul>
        </Section>
        <Section title="Payment Preferences" help="How this hotel wants to be paid. Supplier payment schedules use this when a booking is confirmed.">
          <div className="grid grid-2">
            <Field label="Payment Preference (optional)"><select value={v.payment_pref_id} onChange={(e) => f.set('payment_pref_id')(e.target.value)}><option value="">Default supplier preference</option>{prefs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Book through supplier (optional)" hint="Leave empty if you book and pay the hotel directly"><RefPicker refType="supplier" service="hotel" value={v.supplier_id} onChange={f.set('supplier_id')} /></Field>
          </div>
          <Link className="small" to="/app/organization?tab=supplier-prefs">Manage payment preferences</Link>
        </Section>
        <Section title="Contacts & more" help="Spokesperson contacts and a link to hotel images or details.">
          <Input label="Hotel Images / Details Link (optional)" value={v.link} onChange={f.set('link')} />
          {v.contacts.map((c, i) => (
            <div key={i} className="grid grid-4 mt">
              {['name', 'designation', 'phone', 'email'].map((k) => <Input key={k} label={k[0].toUpperCase() + k.slice(1)} value={c[k]} onChange={(e) => f.set('contacts')(v.contacts.map((x, n) => (n === i ? { ...x, [k]: e.target.value } : x)))} />)}
            </div>
          ))}
          <button className="btn secondary small mt" onClick={() => f.set('contacts')([...v.contacts, { name: '', designation: '', phone: '', email: '' }])}>+ Add Contact</button>
          <Field label="Hotel notes (internal)" className="mt"><textarea value={v.notes} onChange={(e) => f.set('notes')(e.target.value)} /></Field>
        </Section>
        <div className="form-actions"><button className="btn" disabled={f.busy} onClick={save}>Save Hotel Details</button></div>
      </div>
    </>
  );
}
