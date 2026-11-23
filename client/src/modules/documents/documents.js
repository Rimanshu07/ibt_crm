/**
 * Printable documents (open in a new tab → Print / Save as PDF, or download as Word).
 * Every document uses the organisation's header, footer, logo, accent colour and templates
 * (Organization → Header & Footer, Templates).
 */
import { SERVICES } from '@shared/catalog.js';
import { fill } from '@shared/templates.js';
import { api, money, fmtDate, fmtDay, addDaysIso, paxText } from '../../core/api.js';
import { ranges } from '@shared/quoteItems.js';

export const loadDocs = async (tripId, quoteId) => (await api(`/reports/documents/${tripId}${quoteId ? `?quote_id=${quoteId}` : ''}`)).data;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nl = (s) => esc(s).replace(/\n/g, '<br>');
const cur = (d) => d.quote?.currency || d.trip.currency || d.org.base_currency;
const m = (d, v) => money(v, cur(d), 2);

/** Placeholder values for templates. */
export function vars(d, extra = {}) {
  const t = d.trip; const q = d.quote;
  const pax = paxText(t.adults, t.children_ages, t.infants);
  const people = Number(q?.adults || t.adults) + (q?.children_ages || t.children_ages || []).length;
  return {
    org_name: d.org.name, org_phone: d.org.phone || '', org_email: d.org.email || '', guest_name: `${t.guest_salutation || ''} ${t.guest_name}`.trim(),
    trip_no: `${d.org.brand_prefix ? `${d.org.brand_prefix}-` : ''}${t.trip_no}`, destinations: t.destinations || 'your holiday',
    start_date: t.start_date ? fmtDate(t.start_date) : '', end_date: t.end_date ? fmtDate(t.end_date) : '', nights: t.nights ?? '', pax,
    sales_name: t.sales?.name || '', sales_phone: t.sales?.phone || '',
    quote_version: q ? `v${q.version}` : '', total_price: q ? m(d, q.total_selling) : '', per_person: q ? m(d, Number(q.total_selling) / Math.max(people, 1)) : '',
    quote_link: '', ...extra,
  };
}

/* ------------------------------ Layout ------------------------------ */
function header(d, title) {
  const b = d.org.branding || {}; const h = b.header || {};
  const accent = b.primary_color || '#2563eb';
  if (h.mode === 'image' && d.org.header_image) return `<div class="hdr-img"><img src="${d.org.header_image}" alt=""></div><h1 class="doc-title" style="color:${accent}">${esc(title)}</h1>`;
  const office = d.offices?.find((o) => o.is_head) || d.offices?.[0];
  const contact = [office?.address || d.org.address, [d.org.city, d.org.state, d.org.pincode].filter(Boolean).join(', '), d.org.phone, d.org.email, d.org.website].filter(Boolean).map(esc).join(' · ');
  return `<div class="hdr" style="text-align:${h.align || 'left'};border-bottom:3px solid ${accent}">
    <div class="hdr-row ${h.align === 'center' ? 'center' : h.align === 'right' ? 'right' : ''}">
      ${h.show_logo !== false && d.org.logo_url ? `<img class="logo" src="${d.org.logo_url}" alt="">` : ''}
      <div><div class="org">${esc(h.title || d.org.legal_name || d.org.name)}</div>${h.subtitle ? `<div class="tag">${esc(h.subtitle)}</div>` : ''}
      ${h.show_contact !== false ? `<div class="contact">${contact}</div>` : ''}${d.org.tax_id ? `<div class="contact">GSTIN/Tax no: ${esc(d.org.tax_id)}</div>` : ''}</div>
    </div></div><h1 class="doc-title" style="color:${accent}">${esc(title)}</h1>`;
}

function footer(d) {
  const f = d.org.branding?.footer || {};
  if (f.mode === 'image' && d.org.footer_image) return `<div class="ftr"><img src="${d.org.footer_image}" alt="" style="max-width:100%"></div>`;
  return `<div class="ftr">${f.text ? nl(f.text) : `${esc(d.org.name)} · ${esc(d.org.phone || '')} · ${esc(d.org.email || '')}`}</div>`;
}

function page(d, title, body) {
  const accent = d.org.branding?.primary_color || '#2563eb';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} – ${esc(d.trip.guest_name)}</title><style>
  *{box-sizing:border-box} body{font-family:Inter,'Segoe UI',Arial,sans-serif;color:#1f2937;margin:0;background:#eef0f4;font-size:13px;line-height:1.5}
  .sheet{max-width:860px;margin:24px auto;background:#fff;padding:36px 44px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .bar{position:sticky;top:0;background:#111;color:#fff;padding:10px;text-align:center;z-index:5} .bar button{margin:0 6px;padding:7px 16px;border:0;border-radius:6px;cursor:pointer;font-weight:600}
  .bar .p{background:${accent};color:#fff}
  .hdr{padding-bottom:14px;margin-bottom:18px} .hdr-row{display:flex;gap:16px;align-items:center} .hdr-row.center{justify-content:center;text-align:center} .hdr-row.right{flex-direction:row-reverse;text-align:right}
  .hdr .logo{max-height:64px;max-width:180px} .org{font-size:20px;font-weight:700} .tag{color:#6b7280} .contact{color:#6b7280;font-size:11px}
  .hdr-img img{width:100%;display:block;margin-bottom:12px}
  .doc-title{font-size:22px;margin:4px 0 16px;letter-spacing:.02em}
  h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;color:${accent}} h3{font-size:13px;margin:10px 0 4px}
  table{width:100%;border-collapse:collapse;margin:6px 0} th{background:#f3f4f6;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#4b5563}
  th,td{padding:7px 9px;border-bottom:1px solid #e5e7eb;vertical-align:top} td.r,th.r{text-align:right} tfoot td{font-weight:700;background:#f9fafb}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px} .box{border:1px solid #e5e7eb;border-radius:8px;padding:12px}
  .cover{background:linear-gradient(135deg,${accent},#111827);color:#fff;border-radius:10px;padding:26px;margin-bottom:18px}
  .cover .big{font-size:26px;font-weight:700} .cover .facts{display:flex;gap:24px;flex-wrap:wrap;margin-top:12px} .cover .facts div{font-size:12px;opacity:.9} .cover .facts b{display:block;font-size:15px;opacity:1}
  .price{display:flex;justify-content:space-between;align-items:center;background:#f8faff;border:1px solid #dbe4ff;border-radius:8px;padding:14px 18px;margin:14px 0}
  .price .amt{font-size:24px;font-weight:800;color:${accent}}
  .day{display:grid;grid-template-columns:72px 1fr;gap:12px;padding:10px 0;border-bottom:1px dashed #e5e7eb} .day .n{background:${accent};color:#fff;border-radius:8px;text-align:center;padding:6px 0;font-weight:700;font-size:12px;height:fit-content}
  .day .n small{display:block;font-weight:400;opacity:.9}
  ul{margin:4px 0;padding-left:18px} .muted{color:#6b7280} .small{font-size:11px} .badge{display:inline-block;padding:2px 8px;border-radius:10px;background:#e6f6ee;color:#0f9d58;font-weight:700;font-size:11px}
  .kv{display:grid;grid-template-columns:150px 1fr;gap:3px 10px} .kv div:nth-child(odd){color:#6b7280}
  .ftr{margin-top:28px;padding-top:10px;border-top:2px solid ${accent};font-size:11px;color:#6b7280;text-align:center}
  .sign{margin-top:36px;text-align:right} .note{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;margin:10px 0}
  @media print{body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none;padding:0 6mm}.bar{display:none} h2{break-after:avoid} .day,tr{break-inside:avoid}}
  </style></head><body><div class="bar"><button class="p" onclick="print()">Print / Save as PDF</button><button onclick="downloadWord()">Download Word</button><button onclick="window.close()">Close</button></div>
  <div class="sheet">${header(d, title)}${body}${footer(d)}</div>
  <script>function downloadWord(){var h='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body>'+document.querySelector('.sheet').innerHTML+'</body></html>';var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([h],{type:'application/msword'}));a.download=${JSON.stringify(`${title}-${d.trip.trip_no}.doc`)};a.click();}</script></body></html>`;
}

function open(html) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to open documents'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

const banks = (d) => (d.banks?.length ? `<h2>Bank details</h2><div class="grid">${d.banks.map((b) => `<div class="box"><b>${esc(b.bank_name || b.name)}</b><div class="kv small">
  ${b.account_name ? `<div>Account name</div><div>${esc(b.account_name)}</div>` : ''}${b.account_no ? `<div>Account no.</div><div>${esc(b.account_no)}</div>` : ''}
  ${b.ifsc ? `<div>IFSC</div><div>${esc(b.ifsc)}</div>` : ''}${b.swift ? `<div>SWIFT</div><div>${esc(b.swift)}</div>` : ''}${b.branch ? `<div>Branch</div><div>${esc(b.branch)}</div>` : ''}
  ${b.upi_id ? `<div>UPI</div><div>${esc(b.upi_id)}</div>` : ''}</div></div>`).join('')}</div>` : '');

const guestBox = (d) => {
  const t = d.trip;
  return `<div class="box"><div class="kv"><div>Guest</div><div><b>${esc(t.guest_salutation)} ${esc(t.guest_name)}</b></div><div>Trip ID</div><div>${esc(vars(d).trip_no)}</div>
  <div>Travel</div><div>${t.start_date ? `${fmtDate(t.start_date)}${t.end_date ? ` – ${fmtDate(t.end_date)}` : ''}${t.nights ? ` (${t.nights}N)` : ''}` : '—'}</div>
  <div>Travellers</div><div>${esc(paxText(t.adults, t.children_ages, t.infants))}</div>${t.guest_phone ? `<div>Phone</div><div>${esc(t.guest_phone)}</div>` : ''}</div></div>`;
};

const hotelOf = (d, id) => d.hotels.find((h) => h.id === Number(id)) || {};

/* ------------------------------ Quote ------------------------------ */
/** What the customer may see for a line: vendor (DMC) names never appear on quotes or vouchers. */
export function customerTitle(x) {
  const dt = x.details || {};
  if (x.service === 'land_package') return [dt.title || 'Land package', dt.option_name && `(${dt.option_name})`, dt.nights ? `· ${dt.nights}N` : ''].filter(Boolean).join(' ');
  return x.title;
}
const nightsOf = (dt) => (Array.isArray(dt.nights) ? dt.nights.map(Number) : Array.from({ length: Number(dt.nights) || 1 }, (_, k) => (Number(dt.day) || 1) + k));
/** Hotels for the document: our own hotel lines (one row per continuous stay) + hotels from a vendor land package. */
export function quoteHotelRows(d) {
  const q = d.quote || {}; const rows = [];
  for (const i of d.items.filter((x) => x.service === 'hotel')) {
    const h = hotelOf(d, i.details.hotel_id); const dt = i.details;
    for (const [a, b] of ranges(nightsOf(dt))) {
      rows.push({ first: a, hotel: h.name || i.title, city: [h.city, h.star ? `${h.star}${/^\d$/.test(h.star) ? '★' : ''}` : ''].filter(Boolean).join(' · '),
        checkin: q.start_date ? addDaysIso(q.start_date, a - 1) : null, nights: b - a + 1, room: dt.room_type, meal: dt.meal_plan,
        rooms: `${dt.rooms} room(s) × ${dt.pax_per_room} pax${Number(dt.aweb) ? ` · ${dt.aweb} adult extra bed` : ''}${Number(dt.cweb) ? ` · ${dt.cweb} child extra bed` : ''}${Number(dt.cnb) ? ` · ${dt.cnb} child no bed` : ''}` });
    }
  }
  for (const i of d.items.filter((x) => x.service === 'land_package')) {
    const base = Number(i.details.day) || 1;
    for (const h of i.details.package?.hotels || []) {
      for (const [a, b] of ranges((h.nights || []).map(Number))) {
        const first = base + a - 1;
        rows.push({ first, hotel: h.hotel, city: h.city, checkin: q.start_date ? addDaysIso(q.start_date, first - 1) : null, nights: b - a + 1, room: h.room || '', meal: h.meal_plan || '', rooms: '' });
      }
    }
  }
  return rows.sort((x, y) => x.first - y.first);
}
function serviceWhen(q, i) {
  const dt = i.details; const day = (k) => (q.start_date ? fmtDay(addDaysIso(q.start_date, k - 1)) : `Day ${k}`);
  if (Array.isArray(dt.days) && dt.days.length) return dt.days.map(Number).sort((a, b) => a - b).map(day).join(', ');
  if (i.service === 'flight' && dt.legs?.[0]?.depart_date) return fmtDate(dt.legs[0].depart_date);
  if (i.service === 'land_package') return `${day(Number(dt.day) || 1)} · ${dt.nights}N`;
  return dt.day ? day(Number(dt.day)) : '';
}
function serviceDetail(i) {
  const dt = i.details;
  if (i.service === 'flight') {
    return (dt.legs || []).map((l) => `<div><b>${esc(l.from_city)} → ${esc(l.to_city)}</b> ${esc([l.airline, l.flight_no].filter(Boolean).join(' '))}${l.depart_time ? ` · ${esc(l.depart_time)}${l.arrive_time ? `–${esc(l.arrive_time)}` : ''}` : ''}</div>`).join('')
      + `<div class="muted small">${esc([dt.travel_class, dt.baggage].filter(Boolean).join(' · '))}</div>`;
  }
  if (i.service === 'land_package') {
    const p = dt.package || {};
    return `<b>${esc(dt.title)}</b>${dt.option_name ? ` <span class="muted">(${esc(dt.option_name)})</span>` : ''}${p.vehicle ? `<div class="muted small">Transport: ${esc(p.vehicle)}</div>` : ''}`
      + (p.transport?.length ? `<div class="muted small">${p.transport.map((x) => `Day ${x.day}: ${esc(x.service)}`).join('<br>')}</div>` : '')
      + (dt.description ? `<div class="muted small">${nl(dt.description)}</div>` : '');
  }
  if (i.service === 'other' && dt.comments) return `${esc(i.title)}<div class="muted small">${esc(dt.comments)}</div>`;
  return esc(customerTitle(i));
}

export function quoteHtml(d) {
  const q = d.quote; const t = d.trip; const tpl = d.templates.quote_pdf; const s = tpl.settings;
  if (!q) return page(d, 'Quotation', '<p>No quote yet.</p>');
  const people = Number(q.adults) + q.children_ages.length;
  const it = q.itinerary || {};
  const hotels = quoteHotelRows(d).map((r) => `<tr><td><b>${esc(r.hotel)}</b><div class="muted small">${esc(r.city)}</div></td>
      <td>${r.checkin ? fmtDate(r.checkin) : ''}<div class="muted small">${r.nights} night(s)</div></td><td>${esc(r.room)}<div class="muted small">${esc(r.rooms)}</div></td><td>${esc(r.meal)}</td></tr>`).join('');
  const others = d.items.filter((i) => !['hotel'].includes(i.service)).map((i) => `<tr><td class="nowrap">${SERVICES[i.service]?.icon || ''} ${esc(SERVICES[i.service]?.label)}</td><td>${esc(serviceWhen(q, i))}</td><td>${serviceDetail(i)}</td></tr>`).join('');
  const lines = d.items.map((i) => ({ i, sell: i.selling_override ?? null }));
  const servicePrices = s.show_service_prices ? `<table><thead><tr><th>Service</th><th class="r">Price</th></tr></thead><tbody>${Object.entries(lines.reduce((a, { i }) => ({ ...a, [i.service]: (a[i.service] || 0) + Number(i.cost) }), {}))
    .map(([k, v]) => `<tr><td>${esc(SERVICES[k]?.plural)}</td><td class="r">${m(d, v * (Number(q.total_selling) / Math.max(Number(q.total_cost), 1)))}</td></tr>`).join('')}</tbody></table>` : '';
  const body = `
  ${s.show_cover ? `<div class="cover"><div class="small">Holiday proposal for</div><div class="big">${esc(t.guest_salutation)} ${esc(t.guest_name)}</div><div style="font-size:16px">${esc(t.destinations || '')}</div>
    <div class="facts"><div><b>${q.start_date ? fmtDate(q.start_date) : 'Flexible'}</b>Travel date</div><div><b>${q.nights ?? 0}N / ${(q.nights ?? 0) + 1}D</b>Duration</div>
    <div><b>${esc(paxText(q.adults, q.children_ages, q.infants))}</b>Travellers</div><div><b>${esc(vars(d).trip_no)} · v${q.version}</b>Quote</div></div></div>` : guestBox(d)}
  <p>${nl(fill(tpl.body, vars(d)))}</p>
  <div class="price"><div><div class="muted small">Total package price</div><div class="amt">${m(d, q.total_selling)}</div>
    ${s.show_per_person ? `<div class="muted small">${m(d, Number(q.total_selling) / Math.max(people, 1))} per person · inclusive of ${esc(q.pricing.tax_name)}</div>` : ''}</div>
    <div class="small muted">Valid subject to availability<br>at the time of booking</div></div>
  ${servicePrices}
  ${s.show_itinerary && it.days?.length ? `<h2>Day-wise itinerary</h2>${it.days.map((day, k) => `<div class="day"><div class="n">DAY ${k + 1}${q.start_date ? `<small>${fmtDay(addDaysIso(q.start_date, k))}</small>` : ''}</div><div><b>${esc(day.title)}</b><div>${nl(day.description)}</div></div></div>`).join('')}` : ''}
  ${s.show_hotels && hotels ? `<h2>Accommodation</h2><table><thead><tr><th>Hotel</th><th>Check-in</th><th>Room</th><th>Meals</th></tr></thead><tbody>${hotels}</tbody></table>` : ''}
  ${others ? `<h2>Services included</h2><table><thead><tr><th>Service</th><th>Day</th><th>Details</th></tr></thead><tbody>${others}</tbody></table>` : ''}
  ${s.show_inclusions && (it.inclusions?.length || it.exclusions?.length) ? `<div class="grid"><div><h2>Inclusions</h2><ul>${(it.inclusions || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div><h2>Exclusions</h2><ul>${(it.exclusions || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
  ${q.remarks_customer ? `<div class="note">${nl(q.remarks_customer)}</div>` : ''}${it.notes ? `<h2>Notes</h2><p>${nl(it.notes)}</p>` : ''}
  ${s.show_tnc && it.tnc ? `<h2>Terms & conditions</h2><div class="small">${nl(it.tnc)}</div>` : ''}
  ${s.show_bank ? banks(d) : ''}
  <div class="sign">${t.sales ? `<b>${esc(t.sales.name)}</b><br>${esc(t.sales.phone || '')} ${esc(t.sales.email || '')}<br>` : ''}${esc(d.org.name)}</div>`;
  return page(d, tpl.subject || 'Holiday Quotation', body);
}
export const openQuote = (d) => open(quoteHtml(d));

/** WhatsApp / copy text. */
export function quoteText(d) {
  const q = d.quote; const t = d.trip; const v = vars(d);
  if (!q) return '';
  const it = q.itinerary || {};
  const hotels = quoteHotelRows(d).map((r) => `🏨 ${r.hotel}${r.city ? `, ${r.city}` : ''} – ${r.nights}N${r.checkin ? ` from ${fmtDate(r.checkin)}` : ''}, ${r.room}, ${r.meal}`);
  const other = d.items.filter((i) => i.service !== 'hotel').map((i) => `${SERVICES[i.service]?.icon || '•'} ${customerTitle(i)}`);
  return [
    `*${d.org.name}*`, `Hello ${v.guest_name},`, '',
    `Here is your quote for *${t.destinations || 'your trip'}*`, q.start_date ? `📅 ${fmtDate(q.start_date)} · ${q.nights ?? 0}N/${(q.nights ?? 0) + 1}D` : '', `👥 ${paxText(q.adults, q.children_ages, q.infants)}`, '',
    ...(hotels.length ? ['*Hotels*', ...hotels, ''] : []), ...(other.length ? ['*Services*', ...other, ''] : []),
    ...(it.days?.length ? ['*Itinerary*', ...it.days.map((day, k) => `Day ${k + 1}: ${day.title}`), ''] : []),
    `💰 *Total: ${v.total_price}* (${v.per_person} per person)`, '',
    ...(it.inclusions?.length ? ['*Inclusions*', ...it.inclusions.map((x) => `✔ ${x}`), ''] : []),
    ...(it.exclusions?.length ? ['*Exclusions*', ...it.exclusions.map((x) => `✘ ${x}`), ''] : []),
    `${v.sales_name}${v.sales_phone ? ` · ${v.sales_phone}` : ''}`, d.org.name,
  ].filter((x) => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

export function quoteEmail(d) {
  const tpl = d.templates.quote_email; const v = vars(d);
  return { subject: fill(tpl.subject, v), body: `${fill(tpl.body, v)}\n\n${'-'.repeat(30)}\n${quoteText(d).replace(/\*/g, '')}` };
}

/* ---------------------------- Vouchers ---------------------------- */
const live = (d) => d.bookings.filter((b) => !SERVICES[b.service]?.statuses.find((s) => s.key === b.status)?.closed);
const statusLabel = (b) => SERVICES[b.service]?.statuses.find((s) => s.key === b.status)?.label || b.status;

export function tripVoucherHtml(d) {
  const tpl = d.templates.trip_voucher; const s = tpl.settings; const t = d.trip;
  const it = d.quote?.itinerary || {};
  const hotels = live(d).filter((b) => b.service === 'hotel').map((b) => { const h = hotelOf(d, b.details.hotel_id);
    return `<tr><td><b>${esc(h.name || b.title)}</b><div class="muted small">${esc(h.address || h.location || '')}${h.phone ? ` · ☎ ${esc(h.phone)}` : ''}</div></td><td>${fmtDate(b.service_date)} → ${fmtDate(b.end_date)}</td>
      <td>${esc(b.details.room_type)} · ${esc(b.details.meal_plan)}<div class="muted small">${b.details.rooms} room(s) × ${b.details.pax_per_room} pax</div></td><td>${b.details.confirmation_no ? `<b>${esc(b.details.confirmation_no)}</b>` : `<span class="muted">${statusLabel(b)}</span>`}</td></tr>`; }).join('');
  const pkgHotels = live(d).filter((b) => b.service === 'land_package').flatMap((b) => landHotelRows(b)).map((r) => `<tr><td><b>${esc(r.hotel)}</b><div class="muted small">${esc(r.city)}</div></td>
      <td>${r.checkin ? `${fmtDate(r.checkin)} → ${fmtDate(r.checkout)}` : `${r.nights} night(s)`}</td><td>${esc([r.room, r.meal].filter(Boolean).join(' · '))}</td><td>${r.confirmation ? `<b>${esc(r.confirmation)}</b>` : `<span class="muted">${esc(r.status)}</span>`}</td></tr>`).join('');
  const services = live(d).filter((b) => b.service !== 'hotel').map((b) => `<tr><td>${b.service_date ? fmtDay(b.service_date) : ''}${b.details.start_time ? `<div class="muted small">${esc(b.details.start_time)}</div>` : ''}</td>
    <td>${SERVICES[b.service]?.icon || ''} ${esc(customerTitle(b))}${b.service === 'land_package' && b.details.package?.vehicle ? `<div class="muted small">Transport: ${esc(b.details.package.vehicle)}</div>` : ''}${b.details.pickup_point ? `<div class="muted small">Pickup: ${esc(b.details.pickup_point)}</div>` : ''}</td>
    <td>${s.show_driver && b.details.driver_name ? `${esc(b.details.driver_name)} ${esc(b.details.driver_phone || '')}<div class="muted small">${esc(b.details.vehicle_no || '')}</div>` : esc(b.details.pnr || b.details.ticket_ref || b.details.confirmation_no || b.details.policy_no || '')}</td></tr>`).join('');
  const body = `${guestBox(d)}
    ${t.arrival_details || t.departure_details ? `<div class="grid" style="margin-top:10px"><div class="box"><b>Arrival</b><br>${esc(t.arrival_details || '—')}</div><div class="box"><b>Departure</b><br>${esc(t.departure_details || '—')}</div></div>` : ''}
    ${hotels || pkgHotels ? `<h2>Hotels</h2><table><thead><tr><th>Hotel</th><th>Stay</th><th>Room</th><th>Confirmation</th></tr></thead><tbody>${hotels}${pkgHotels}</tbody></table>` : ''}
    ${services ? `<h2>Services</h2><table><thead><tr><th>Date</th><th>Service</th><th>Details</th></tr></thead><tbody>${services}</tbody></table>` : ''}
    ${s.show_itinerary && it.days?.length ? `<h2>Itinerary</h2>${it.days.map((day, k) => `<div class="day"><div class="n">DAY ${k + 1}${t.start_date ? `<small>${fmtDay(addDaysIso(String(t.start_date).slice(0, 10), k))}</small>` : ''}</div><div><b>${esc(day.title)}</b><div>${nl(day.description)}</div></div></div>`).join('')}` : ''}
    <div class="note">${nl(fill(tpl.body, vars(d)))}</div>
    ${s.show_emergency ? `<h2>Contacts during the trip</h2><div class="kv">${t.ops ? `<div>Operations</div><div>${esc(t.ops.name)} · ${esc(t.ops.phone || '')}</div>` : ''}${t.sales ? `<div>Your travel expert</div><div>${esc(t.sales.name)} · ${esc(t.sales.phone || '')}</div>` : ''}<div>Office</div><div>${esc(d.org.phone || '')} · ${esc(d.org.email || '')}</div></div>` : ''}`;
  return page(d, tpl.subject || 'Travel Voucher', body);
}
export const openTripVoucher = (d) => open(tripVoucherHtml(d));

export function hotelVoucherHtml(d, bookingId) {
  const b = d.bookings.find((x) => x.id === Number(bookingId));
  const tpl = d.templates.hotel_voucher; const h = hotelOf(d, b?.details.hotel_id);
  if (!b) return page(d, 'Hotel Voucher', '<p>Booking not found</p>');
  const body = `<div class="grid"><div class="box"><h3>${esc(h.name || b.title)}</h3><div class="small">${esc(h.address || h.location || '')}</div><div class="small">${h.phone ? `☎ ${esc(h.phone)}` : ''} ${h.email ? `✉ ${esc(h.email)}` : ''}</div></div>
    <div class="box"><div class="kv"><div>Confirmation</div><div><b>${esc(b.details.confirmation_no || 'Pending')}</b></div><div>Status</div><div><span class="badge">${esc(statusLabel(b))}</span></div><div>Booked via</div><div>${esc(b.supplier_name || 'Direct')}</div></div></div></div>
    <h2>Guest & stay</h2><div class="kv"><div>Guest</div><div><b>${esc(d.trip.guest_salutation)} ${esc(d.trip.guest_name)}</b></div><div>Trip ID</div><div>${esc(vars(d).trip_no)}</div>
    <div>Check-in</div><div>${fmtDay(b.service_date)}${h.checkin_time ? ` · ${esc(h.checkin_time)} hrs` : ''}</div><div>Check-out</div><div>${fmtDay(b.end_date)}${h.checkout_time ? ` · ${esc(h.checkout_time)} hrs` : ''}</div>
    <div>Nights</div><div>${b.details.nights}</div><div>Room</div><div>${b.details.rooms} × ${esc(b.details.room_type)} (${b.details.pax_per_room} pax/room)</div><div>Meal plan</div><div>${esc(b.details.meal_plan)}</div>
    <div>Extra beds</div><div>${[Number(b.details.aweb) && `${b.details.aweb} adult`, Number(b.details.cweb) && `${b.details.cweb} child`, Number(b.details.cnb) && `${b.details.cnb} child no bed`].filter(Boolean).join(', ') || 'None'}</div>
    <div>Travellers</div><div>${esc(paxText(d.trip.adults, d.trip.children_ages, d.trip.infants))}</div>${b.details.special_request ? `<div>Requests</div><div>${nl(b.details.special_request)}</div>` : ''}</div>
    ${tpl.settings.show_price && d.can_see_cost && b.booked_amount ? `<p class="mt">Booked price: <b>${m(d, b.booked_amount)}</b></p>` : ''}
    <div class="note">${nl(fill(tpl.body, vars(d, { hotel_name: h.name })))}</div><div class="sign">For ${esc(d.org.name)}</div>`;
  return page(d, tpl.subject || 'Hotel Voucher', body);
}
export const openHotelVoucher = (d, id) => open(hotelVoucherHtml(d, id));

export function serviceVoucherHtml(d, bookingId) {
  const b = d.bookings.find((x) => x.id === Number(bookingId));
  if (!b) return page(d, 'Voucher', '<p>Booking not found</p>');
  const def = SERVICES[b.service];
  if (b.service === 'land_package') return landPackageVoucherHtml(d, b);
  const rows = [...def.quoteFields, ...def.bookingFields].filter((f) => f.type !== 'ref' && b.details[f.key] !== undefined && b.details[f.key] !== '' && b.details[f.key] !== null && !/^rate_|fx_rate|fare_/.test(f.key))
    .map((f) => `<div>${esc(f.label)}</div><div>${esc(Array.isArray(b.details[f.key]) ? b.details[f.key].join(', ') : b.details[f.key])}</div>`).join('');
  const body = `${guestBox(d)}<h2>${def.icon} ${esc(b.title)}</h2><div class="kv"><div>Date</div><div>${b.service_date ? fmtDay(b.service_date) : '—'}</div><div>Status</div><div><span class="badge">${esc(statusLabel(b))}</span></div>
    ${b.supplier_name ? `<div>Supplier</div><div>${esc(b.supplier_name)} ${esc(b.supplier_phone || '')}</div>` : ''}${rows}</div>
    <div class="note">${nl(fill(d.templates.trip_voucher.body, vars(d)))}</div><div class="sign">For ${esc(d.org.name)}</div>`;
  return page(d, `${def.label} Voucher`, body);
}
export const openServiceVoucher = (d, id) => open(serviceVoucherHtml(d, id));

/** Hotels of a vendor land package with their stay dates (vendor details are never printed). */
function landHotelRows(b) {
  const p = b.details.package || {}; const start = b.service_date ? String(b.service_date).slice(0, 10) : null;
  const conf = b.details.hotel_confirmations || {};
  return (p.hotels || []).flatMap((h) => ranges((h.nights || []).map(Number)).map(([a, z]) => ({
    hotel: h.hotel, city: h.city, room: h.room, meal: h.meal_plan, nights: z - a + 1,
    checkin: start ? addDaysIso(start, a - 1) : null, checkout: start ? addDaysIso(start, z) : null,
    confirmation: conf[h.hotel] || b.details.confirmation_no || '', status: statusLabel(b),
  })));
}
function landPackageVoucherHtml(d, b) {
  const p = b.details.package || {};
  const hotels = landHotelRows(b).map((r) => `<tr><td><b>${esc(r.hotel)}</b><div class="muted small">${esc(r.city)}</div></td><td>${r.checkin ? `${fmtDay(r.checkin)} → ${fmtDay(r.checkout)}` : ''}<div class="muted small">${r.nights} night(s)</div></td>
    <td>${esc([r.room, r.meal].filter(Boolean).join(' · '))}</td><td>${r.confirmation ? `<b>${esc(r.confirmation)}</b>` : `<span class="muted">${esc(r.status)}</span>`}</td></tr>`).join('');
  const body = `${guestBox(d)}<h2>${esc(customerTitle(b))}</h2>
    <div class="kv"><div>Starts</div><div>${b.service_date ? fmtDay(b.service_date) : '—'}</div><div>Ends</div><div>${b.end_date ? fmtDay(b.end_date) : '—'}</div><div>Status</div><div><span class="badge">${esc(statusLabel(b))}</span></div>
    ${p.vehicle ? `<div>Transport</div><div>${esc(p.vehicle)}</div>` : ''}${b.details.confirmation_no ? `<div>Confirmation</div><div><b>${esc(b.details.confirmation_no)}</b></div>` : ''}</div>
    ${hotels ? `<h2>Hotels</h2><table><thead><tr><th>Hotel</th><th>Stay</th><th>Room / meals</th><th>Confirmation</th></tr></thead><tbody>${hotels}</tbody></table>` : ''}
    ${p.transport?.length ? `<h2>Transfers & sightseeing</h2><table><tbody>${p.transport.map((x) => `<tr><td>Day ${x.day}</td><td>${esc(x.service)}</td></tr>`).join('')}</tbody></table>` : ''}
    <div class="note">${nl(fill(d.templates.trip_voucher.body, vars(d)))}</div><div class="sign">For ${esc(d.org.name)}</div>`;
  return page(d, 'Package Voucher', body);
}

/* --------------------------- Invoice & receipt --------------------------- */
export function invoiceHtml(d) {
  const q = d.quote; const tpl = d.templates.proforma_invoice; const s = tpl.settings;
  if (!q) return page(d, 'Proforma Invoice', '<p>No quote yet.</p>');
  const taxable = Number(q.total_selling) - Number(q.total_tax);
  const gst = /gst/i.test(q.pricing.tax_name) && d.org.country_code === 'IN';
  const half = Math.round(Number(q.total_tax) * 50) / 100;
  const no = `${s.invoice_prefix || 'PI'}-${d.trip.trip_no}`;
  const taxRows = gst
    ? `<tr><td colspan="2" class="r">CGST @ ${q.pricing.tax_rate / 2}%</td><td class="r">${m(d, half)}</td></tr><tr><td colspan="2" class="r">SGST @ ${q.pricing.tax_rate / 2}%</td><td class="r">${m(d, Number(q.total_tax) - half)}</td></tr>`
    : `<tr><td colspan="2" class="r">${esc(q.pricing.tax_name)} @ ${q.pricing.tax_rate}%</td><td class="r">${m(d, q.total_tax)}</td></tr>`;
  const body = `<div class="grid"><div class="box"><b>Bill to</b><br>${esc(d.trip.guest_salutation)} ${esc(d.trip.guest_name)}<br>${esc(d.trip.guest_city || '')}<br>${esc(d.trip.guest_phone || '')} ${esc(d.trip.guest_email || '')}</div>
    <div class="box"><div class="kv"><div>Invoice no.</div><div><b>${esc(no)}</b></div><div>Date</div><div>${fmtDate(new Date().toISOString())}</div><div>Trip</div><div>${esc(vars(d).trip_no)} · ${esc(d.trip.destinations || '')}</div>
    <div>Travel</div><div>${d.trip.start_date ? fmtDate(d.trip.start_date) : '—'}</div>${s.sac_code ? `<div>SAC</div><div>${esc(s.sac_code)}</div>` : ''}</div></div></div>
    <table style="margin-top:14px"><thead><tr><th>Description</th><th>Travellers</th><th class="r">Amount</th></tr></thead><tbody>
      <tr><td><b>Tour package – ${esc(d.trip.destinations || 'Holiday')}</b><div class="muted small">${d.items.map((i) => esc(SERVICES[i.service]?.label)).filter((x, k, a) => a.indexOf(x) === k).join(', ')}</div></td><td>${esc(paxText(q.adults, q.children_ages, q.infants))}</td><td class="r">${m(d, taxable)}</td></tr>
      ${taxRows}</tbody><tfoot><tr><td colspan="2" class="r">Total</td><td class="r">${m(d, q.total_selling)}</td></tr></tfoot></table>
    ${s.show_schedule && d.instalments.length ? `<h2>Payment schedule</h2><table><thead><tr><th>Due date</th><th class="r">Amount</th><th class="r">Received</th></tr></thead><tbody>${d.instalments.map((i) => `<tr><td>${fmtDate(i.due_date)}</td><td class="r">${m(d, i.amount)}</td><td class="r">${m(d, i.paid_amount)}</td></tr>`).join('')}</tbody></table>` : ''}
    <p class="small muted">${nl(fill(tpl.body, vars(d)))}</p>${s.show_bank ? banks(d) : ''}<div class="sign">Authorised signatory<br><b>${esc(d.org.legal_name || d.org.name)}</b></div>`;
  return page(d, tpl.subject || 'Proforma Invoice', body);
}
export const openInvoice = (d) => open(invoiceHtml(d));

export function receiptHtml(d, receiptId) {
  const r = d.receipts.find((x) => x.id === Number(receiptId));
  const tpl = d.templates.payment_receipt;
  if (!r) return page(d, 'Receipt', '<p>Receipt not found</p>');
  const body = `<div class="grid"><div class="box"><b>Received from</b><br>${esc(d.trip.guest_salutation)} ${esc(d.trip.guest_name)}<br>${esc(d.trip.guest_phone || '')}</div>
    <div class="box"><div class="kv"><div>Receipt no.</div><div><b>RC-${d.trip.trip_no}-${r.id}</b></div><div>Date</div><div>${fmtDate(r.paid_at)}</div><div>Trip</div><div>${esc(vars(d).trip_no)}</div></div></div></div>
    <div class="price"><div><div class="muted small">Amount received</div><div class="amt">${m(d, r.amount)}</div></div><div class="small">${esc(r.mode)}${r.reference ? `<br>Ref: ${esc(r.reference)}` : ''}</div></div>
    <p class="small">Package ${m(d, d.trip.package_amount)} · received so far ${m(d, d.receipts.filter((x) => x.paid_at <= r.paid_at).reduce((s, x) => s + Number(x.amount), 0))}</p>
    <p class="small muted">${nl(fill(tpl.body, vars(d)))}</p><div class="sign">For ${esc(d.org.name)}</div>`;
  return page(d, tpl.subject || 'Payment Receipt', body);
}
export const openReceipt = (d, id) => open(receiptHtml(d, id));

/* ------------------------------ Emails ------------------------------ */
export function hotelBookingEmail(d, booking) {
  const b = d.bookings.find((x) => x.id === booking.id) || booking;
  const h = hotelOf(d, b.details.hotel_id);
  const tpl = d.templates.hotel_booking_email;
  const v = vars(d, {
    hotel_name: h.name || booking.hotel_name || '', checkin: fmtDate(b.service_date), checkout: fmtDate(b.end_date), meal_plan: b.details.meal_plan,
    rooms_detail: `${b.details.rooms} × ${b.details.room_type} (${b.details.pax_per_room} pax/room)${Number(b.details.aweb) ? `, ${b.details.aweb} adult extra bed` : ''}${Number(b.details.cweb) ? `, ${b.details.cweb} child extra bed` : ''}${Number(b.details.cnb) ? `, ${b.details.cnb} child no bed` : ''}`,
    confirmation_no: b.details.confirmation_no || '',
  });
  return { subject: fill(tpl.subject, v), body: fill(tpl.body, v) };
}

export function activityVoucherEmail(d, bookingId) {
  const b = d.bookings.find((x) => x.id === Number(bookingId));
  const tpl = d.templates.activity_voucher_email;
  const v = vars(d, { activity_name: b?.title || '', activity_date: b?.service_date ? fmtDate(b.service_date) : '', tickets: `${b?.details.adults || 0} adult(s), ${b?.details.children || 0} child(ren)` });
  return { subject: fill(tpl.subject, v), body: fill(tpl.body, v) };
}
