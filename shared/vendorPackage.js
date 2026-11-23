/**
 * Reads a land package sent by a vendor / DMC (PDF text or a pasted email) into a structured draft:
 * overview, hotel options with prices, transport plan, day-wise itinerary, inclusions / exclusions,
 * paid activities and terms. It is a best-effort reader: the user reviews and edits every field
 * in the quote builder before using it. Table cells arrive separated by "  |  " (see pdfText.js).
 */

const ORD = '(\\d{1,2})(?:st|nd|rd|th)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MEALS = [
  [/\bAP\b|all meals|breakfast\s*\+?\s*lunch\s*\+?\s*dinner|dinner\s*\+\s*breakfast\s*\+\s*lunch/i, 'AP'],
  [/\bMAP\b|\bHB\b|half board|breakfast\s*(and|&|\+)\s*dinner|\[B\/D\]/i, 'MAP'],
  [/\bCP\b|breakfast|\bBB\b|\[B\]/i, 'CP'],
  [/\bEP\b|room only/i, 'EP'],
];
const STOP = /^(inclusions?|exclusions?|terms\s*(and|&)\s*conditions|important information|special notes|payment note|cancellation|child policy|thanks\s*&?\s*regards|notes?$|cost for paid activities|investment overview|pricing$|ready to book)/i;

const RIGHT = /^>>\s*/;
const isRight = (line) => RIGHT.test(line);
const strip = (line) => String(line || '').replace(RIGHT, '');
const cells = (line) => strip(line).split(/\t+|\s{2,}\|\s{2,}|\s\|\s|\s{3,}/).map((c) => c.trim()).filter(Boolean)
  .filter((c) => !/^[A-Z][a-z]{2}\)$/.test(c)); // "Dec)" left over from "1st (01 Dec)"
const clean = (s) => strip(s).replace(/[❖•✓✔]/g, '').replace(/\s+/g, ' ').trim();
const BOUNDARY = /^(>>\s*)?(Transportation|Day\s*Wise|INVESTMENT|Pricing$|Inclusions?|Cost for Paid|Meal Key|Terms|IMPORTANT|Option\s*\d|Accommodation\s*Summ)/i;
const num = (s) => Number(String(s).replace(/[,\s]/g, '')) || 0;

export function parseDateText(s) {
  const m = String(s || '').match(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s*)?([A-Za-z]{3,9})[,\s]*(\d{4})/);
  if (!m) return null;
  const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
  if (mo < 0) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

export function mealCode(s) {
  for (const [re, code] of MEALS) if (re.test(s)) return code;
  return '';
}

function currencyOf(s) {
  const m = String(s).match(/\b(INR|USD|EUR|GBP|AED|SGD|THB|MYR|IDR|LKR|NPR|AZN)\b|₹|\$/);
  if (!m) return null;
  return m[1] || (m[0] === '₹' ? 'INR' : 'USD');
}

/* ------------------------------------------------------------------ */
export function parseVendorPackage(text) {
  const raw = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => strip(l).trim());
  const lines = raw.map(strip);
  const all = lines.join('\n');
  const out = {
    title: '', destination: '', cities: [], reference: '', start_date: null, nights: null, days: null, adults: null,
    currency: currencyOf((all.match(/Prices?\s*\((\w{3})\)/i) || [])[1] || '') || currencyOf(all) || 'INR',
    vehicle: '', options: [], transport: [], itinerary: [], inclusions: [], exclusions: [], paid_activities: [], terms: '', warnings: [],
  };

  // ---------- overview ----------
  const dur = all.match(/(\d{1,2})\s*Nights?\s*[/|,&-]*\s*(?:\|\s*)?(\d{1,2})\s*Days?/i);
  if (dur) { out.nights = Number(dur[1]); out.days = Number(dur[2]); }
  const kv = (re) => { const l = lines.find((x) => re.test(x)); if (!l) return ''; const c = cells(l); return c.length > 1 ? c.slice(1).join(' ') : l.replace(re, '').replace(/^[\s:–-]+/, ''); };
  out.reference = kv(/^(Reference|Trip ID|Ref\.?\s*No|Booking ID)\b/i).slice(0, 60);
  out.start_date = parseDateText(kv(/^(Start Date|Arrival|Travel Date|Date of Travel)\b/i));
  const pax = all.match(/(\d{1,2})\s*(Adults?|Pax)\b/i);
  if (pax) out.adults = Number(pax[1]);
  const destIdx = lines.findIndex((l) => /^Destination\b/i.test(l));
  if (destIdx >= 0) {
    out.destination = cells(lines[destIdx]).slice(1).join(' ');
    const next = lines[destIdx + 1] || '';
    if (/\d+\s*Nights?/i.test(next)) out.cities = [...next.matchAll(/([A-Za-z][A-Za-z .]+?)\s+\d+\s*Nights?/gi)].map((m) => m[1].replace(/^\W+/, '').trim());
  }
  if (!out.destination) out.destination = clean(lines.slice(0, 3).find((l) => /^[A-Z][A-Z ]{3,}$/.test(l.trim())) || '');
  out.title = clean([out.destination, out.nights !== null ? `${out.nights}N/${out.days ?? out.nights + 1}D` : ''].filter(Boolean).join(' '));
  const veh = lines.find((l) => /Transportation Used|Vehicle\s*:/i.test(l));
  if (veh) out.vehicle = clean(veh.split(':').slice(1).join(':'));
  else { const v = all.match(/(air-?conditioned[^\n|]*?(SUV|car|sedan|van|coach)[^\n|]*)/i); if (v) out.vehicle = clean(v[1]); }

  // ---------- hotel options ----------
  const optStarts = [];
  lines.forEach((l, i) => {
    const m = l.match(/^Option\s*(\d+)\s*[:–-]?\s*(.*)$/i) || l.match(/^Accommodation\s*Summ[ae]ry\s*[–-]\s*(.*)$/i);
    if (m) optStarts.push({ i, name: clean(m[2] !== undefined ? `Option ${m[1]}${m[2] ? `: ${m[2]}` : ''}` : m[1]) });
  });
  if (!optStarts.length) {
    const h = lines.findIndex((l) => /Hotel/i.test(l) && /(Night|Day)/i.test(l) && cells(l).length >= 3);
    if (h >= 0) optStarts.push({ i: h - 1, name: 'Package' });
  }
  const blocks = [];
  optStarts.forEach((o, k) => {
    let end = k + 1 < optStarts.length ? optStarts[k + 1].i : Math.min(lines.length, o.i + 80);
    for (let j = o.i + 2; j < end; j += 1) if (BOUNDARY.test(lines[j]) && !/^Accommodation$/i.test(lines[j].trim())) { end = j; break; }
    // keep the option's own price ("Prices (INR) / Total: ...") right after the table
    const priceAt = lines.slice(end, end + 4).findIndex((l) => /Total\s*:?\s*[\d,]+/i.test(l));
    const block = lines.slice(o.i + 1, priceAt >= 0 ? end + priceAt + 1 : end);
    blocks.push([o.i, o.i + 1 + block.length]);
    const hotels = parseHotelRows(block, out.cities);
    const totalLine = block.find((l) => /Total\s*:?\s*[\d,]+/i.test(l)) || lines.slice(o.i + 1 + block.length, o.i + 6 + block.length).find((l) => /^Total\s*:?\s*[\d,]+/i.test(l));
    const price = totalLine ? { amount: num(totalLine.match(/([\d,]{3,})/)[1]), basis: 'total', currency: currencyOf(totalLine) || out.currency } : null;
    out.options.push({ name: o.name, hotels, price });
  });
  // "PRICE PER PAX" style pricing tables
  const ppIdx = lines.findIndex((l) => /PRICE PER (PAX|PERSON)|per person/i.test(l) && /price/i.test(l));
  if (ppIdx >= 0) {
    for (const l of lines.slice(ppIdx + 1, ppIdx + 20)) {
      if (/Cost for Paid|Paid Activities|^Inclusions?\b|^Activity\s*\|/i.test(l)) break;
      const m = l.match(/(USD|INR|EUR|GBP|AED|SGD|THB|MYR|₹|\$)\s*([\d,]+(?:\.\d+)?)/);
      if (!m) continue;
      const label = cells(l)[0] || l;
      const amount = num(m[2]); const cur = currencyOf(m[0]) || out.currency;
      const star = (label.match(/(\d{1,2})\s*Star/i) || [])[1];
      const opt = out.options.find((op) => !op.price && star && new RegExp(`0?${Number(star)}\\s*Star`, 'i').test(op.name)) || out.options.find((op) => !op.price);
      if (opt) opt.price = { amount, basis: 'per_person', currency: cur, label: clean(label) };
      else out.options.push({ name: clean(label), hotels: [], price: { amount, basis: 'per_person', currency: cur } });
    }
  }
  if (out.options.length && out.options.every((o) => o.price)) out.currency = out.options[0].price.currency;
  if (!out.options.length) out.warnings.push('No hotel table found – add the hotels manually.');

  // ---------- transport plan ----------
  const tIdx = lines.findIndex((l) => /^Transportation\b/i.test(l));
  const itIdx = lines.findIndex((l) => /Day\s*Wise\s*Itinerary|Detailed Itinerary|^DAY\s*0?1\b/i.test(l));
  if (tIdx >= 0) {
    for (const l of lines.slice(tIdx + 1, itIdx > tIdx ? itIdx : tIdx + 30)) {
      const m = l.match(new RegExp(`^${ORD}\\s*Day\\s*(\\([^)]*\\))?\\s*\\|?\\s*(.*)$`, 'i'));
      if (m) out.transport.push({ day: Number(m[1]), service: clean(m[3]) });
    }
  }

  // ---------- day-wise itinerary ----------
  const heads = [];
  const inBlock = (i) => blocks.some(([a, b]) => i >= a && i <= b + 1) || (i > 0 && /^(DAY|Day)\s*\|/.test(lines.slice(Math.max(0, i - 8), i).join('\n')) && /\bStar\b|HB|\[B/.test(lines[i]));
  lines.forEach((l, i) => {
    if (inBlock(i)) return;
    let m = l.match(new RegExp(`^${ORD}\\s*Day\\s*(?:\\(([^)]*)\\))?\\s*[:|–-]\\s*(.+)$`, 'i'));
    if (m && i > (itIdx >= 0 ? itIdx - 1 : 0) && i > tIdx + out.transport.length) { heads.push({ i, day: Number(m[1]), title: clean(m[3]) }); return; }
    m = l.match(/^DAY\s*0?(\d{1,2})\s*(?:\|\s*(.*))?$/);
    if (m) heads.push({ i, day: Number(m[1]), title: clean(m[2] || '') });
  });
  heads.forEach((h, k) => {
    const stop = k + 1 < heads.length ? heads[k + 1].i : lines.length;
    const body = [];
    let title = h.title;
    for (let j = h.i + 1; j < stop; j += 1) {
      const l = lines[j];
      if (STOP.test(l.trim()) && !/^Notes?$/i.test(l.trim())) break;
      if (/^[\w.]+@[\w.]+\s*\|/.test(l)) continue; // page footer with email
      if (!title && j === h.i + 1) { title = clean(l); continue; }
      body.push(l.replace(/^❖\s*/, '• ').trim());
    }
    out.itinerary.push({ day: h.day, title, description: body.join('\n').replace(/([a-z,])\n(?=[a-z(])/g, '$1 ').trim() });
  });
  if (!out.itinerary.length) out.warnings.push('No day-wise itinerary found – paste or type it.');

  // ---------- inclusions / exclusions ----------
  const ieStart = lines.findIndex((l) => /^Inclusions?\s*(&|and|\|)?\s*Exclusions?$/i.test(l.trim().replace(/\s+\|\s+/, ' | '))) >= 0
    ? lines.findIndex((l) => /^Inclusions?\s*(&|and|\|)?\s*Exclusions?$/i.test(l.trim().replace(/\s+\|\s+/, ' | ')))
    : lines.findIndex((l) => /^Inclusions?\b/i.test(l.trim()));
  if (ieStart >= 0) {
    const cols = [[], []];
    const done = (t) => /[.)!]$/.test(t || '.');
    const add = (col, t, forceNew) => {
      t = clean(t); if (!t) return;
      const arr = cols[col];
      if (!forceNew && arr.length && !done(arr[arr.length - 1])) arr[arr.length - 1] += ` ${t}`; else arr.push(t);
    };
    for (const r of raw.slice(ieStart + 1, ieStart + 90)) {
      const t = strip(r).trim();
      if (/^(terms|payment note|important|special notes|cancellation|day\s*0?1\b|NOTE:|THINGS TO KNOW)/i.test(t)) break;
      if (/^Inclusions?\s*(\|\s*Exclusions?)?$/i.test(t)) continue;
      const parts = cells(r);
      if (parts.length > 1) { parts.slice(0, 2).forEach((p, n) => add(/^[X✗✘×]\s/.test(p) ? 1 : /^[✓✔]/.test(p) ? 0 : n, p.replace(/^[X✗✘×]\s*/, ''), /^[✓✔X✗✘×]\s/.test(p))); continue; }
      const p = parts[0] || '';
      if (/^[✓✔]/.test(p)) add(0, p, true);
      else if (/^[X✗✘×]\s/.test(p)) add(1, p.replace(/^[X✗✘×]\s*/, ''), true);
      else add(isRight(r) ? 1 : 0, p, false);
    }
    out.inclusions = cols[0].filter((x) => x.length > 2);
    out.exclusions = cols[1].filter((x) => x.length > 2);
  }
  if (!out.vehicle) { const v = out.inclusions.find((x) => /\b(SUV|sedan|car|van|coach|tempo|innova|bus)\b/i.test(x)); if (v) out.vehicle = v; }

  // ---------- paid activities ----------
  const paIdx = lines.findIndex((l) => /Cost for Paid Activities|Optional Activities/i.test(l));
  if (paIdx >= 0) {
    for (const l of lines.slice(paIdx + 1, paIdx + 25)) {
      if (/^Inclusions?/i.test(l.trim())) break;
      const c = cells(l);
      const m = l.match(/(USD|INR|EUR|LKR|AED|THB|₹|\$)\s*([\d,.]+)/);
      if (c.length >= 2 && m && !/^Activity$/i.test(c[0])) out.paid_activities.push({ name: clean(c[0]), price: num(m[2]), currency: currencyOf(m[0]) });
    }
  }

  // ---------- terms ----------
  const tcIdx = lines.findIndex((l) => /^(Terms\s*(and|&)\s*Conditions|IMPORTANT INFORMATION|Cancellation)/i.test(l.trim()));
  if (tcIdx >= 0) out.terms = lines.slice(tcIdx, tcIdx + 120).filter((l) => !/^(Thanks|Regards|Mob|Email|Dir:|\[Quoted)/i.test(l.trim())).join('\n').slice(0, 8000);
  return out;
}

/** Hotel rows: "1st (01 | City | Hotel | Meal | Room" (email style) or "Day 1 | Route | Hotel | Meals | Star". */
function parseHotelRows(block, cities = []) {
  const rows = [];
  for (let i = 0; i < block.length; i += 1) {
    const l = block[i];
    const c = cells(l);
    let m = c[0]?.match(new RegExp(`^${ORD}\\s*\\(?\\s*(\\d{1,2})?`, 'i'));
    const isDay = /^Day\s*0?\d+/i.test(c[0] || '');
    if (isDay) m = c[0].match(/^Day\s*0?(\d+)/i);
    if (!m || (!isDay && !/(st|nd|rd|th)\b/i.test(c[0]))) continue;
    const night = Number(m[1]);
    const follow = []; // continuation lines until the next row
    for (let j = i + 1; j < block.length && !/^(\d{1,2}(st|nd|rd|th)|Day\s*0?\d+\b)/i.test(block[j].trim()) && !/^(Prices?|Total|Option|Accommodation|Meal Key|Transportation)/i.test(block[j].trim()); j += 1) follow.push(block[j]);
    if (c.length === 1) { // night that continues the previous hotel ("2nd (02 Dec)")
      if (rows.length) rows[rows.length - 1].nights.push(night);
      continue;
    }
    let city = ''; let hotel = ''; let meal = ''; let room = '';
    if (isDay) {
      if (c.length >= 5) [, city, hotel, meal] = c;
      else {
        const ctx = clean([block[i - 1], follow[0]].filter((x) => x && cells(x).length === 1 && !/^(DAY|Day)\b/.test(x)).join(' '));
        const hotelish = /hotel|resort|similar|inn\b|villa|lodge|spa|house|boat|camp|stay/i;
        if (hotelish.test(ctx) && !hotelish.test(c[1])) { city = c[1]; hotel = ctx; } else { hotel = c[1]; city = ctx; }
        meal = c[2];
      }
      room = c[c.length - 1] && /star/i.test(c[c.length - 1]) ? c[c.length - 1] : '';
    } else {
      const rest = c.slice(1);
      if (rest.length >= 4) [city, hotel, meal, room] = rest;
      else {
        const known = cities.find((x) => rest[0]?.toLowerCase().startsWith(x.toLowerCase()));
        if (known) { city = known; hotel = rest[0].slice(known.length).trim(); meal = rest[1]; room = rest[2] || ''; }
        else [hotel, meal, room] = rest;
      }
      const extra = follow.map(cells);
      const hotelMore = extra.filter((x) => x.length && !/^\(?(CP|MAP|AP|EP)\)?$|Pax$|^\+$|^Breakfast|^Lunch|^Dinner|^\+\s*Lunch/i.test(x[0]) && x[0].length > 1);
      if (hotelMore.length && hotelMore[0].length > 1) hotel = `${hotel} ${hotelMore[0][0]}`.trim();
      const mealText = [meal, ...follow].join(' ');
      meal = mealCode(mealText) || meal;
      const roomMore = extra.find((x) => x.length >= 2 && !/Pax/i.test(x[x.length - 1]));
      if (roomMore && /houseboat|room|suite|villa|cottage/i.test(roomMore[roomMore.length - 1])) room = `${room} ${roomMore[roomMore.length - 1]}`;
      const paxLine = follow.find((x) => /\d+\s*Pax/i.test(x));
      if (paxLine) room = `${room} (${paxLine.match(/(\d+)\s*Pax/i)[1]} Pax)`;
    }
    if (/^NA$/i.test(hotel) || !hotel) continue;
    rows.push({ nights: [night], city: clean(city), hotel: clean(hotel.replace(/[{}]/g, ' ')), meal_plan: mealCode(meal) || clean(meal), room: clean(room.replace(/^1\s*-?\s*/, '')) });
  }
  return rows.map((r) => ({ ...r, nights: [...new Set(r.nights)].sort((a, b) => a - b) }));
}
