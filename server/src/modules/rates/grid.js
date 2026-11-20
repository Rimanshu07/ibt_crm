/**
 * Reader for Sembark-style season-grid price sheets (CSV).
 *
 *   Row 1      : fixed column titles, then season names (merged cells → blank after the first):
 *                "Season 1 (Ops)" = buying/booking rates, "Season 1" = selling/quotation rates,
 *                a season without a matching "(Ops)" season is used for both.
 *   Rows 2..n  : date ranges per season  "1 Jul 2026 - 30 Sep 2026", optionally "(Sat,Sun)" for weekday rates.
 *                Several rows = several ranges for the same season.
 *   Next row   : column variants (meal plans CP/MAP for hotels, cab types for transport, Adult/Child for activities)
 *   Data rows  : the fixed columns (blank = same as the row above) and prices.
 */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** RFC 4180 CSV → array of rows (handles quotes, commas and newlines in cells). */
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

/** "1 Jul 2026" → "2026-07-01" (also accepts 2026-07-01 and 01/07/2026). */
export function parseDate(text) {
  const t = String(text || '').trim();
  let m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,4})[a-z]*\s+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  return null;
}
function iso(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

/** Weekday list "(Sat,Sun)" / "Mon,Tue" → "Sat,Sun" or null. */
export function parseWeekdays(text) {
  const parts = String(text || '').split(/[,\s]+/).map((x) => x.trim().slice(0, 3)).filter(Boolean)
    .map((x) => DAYS.find((d) => d.toLowerCase() === x.toLowerCase()));
  return parts.length && parts.every(Boolean) ? [...new Set(parts)].join(',') : null;
}

/** "1 Jul 2026 - 30 Sep 2026 (Sat,Sun)" → { from, to, weekdays } | null */
export function parseRange(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const wd = t.match(/\(([^)]*)\)\s*$/);
  const weekdays = wd ? parseWeekdays(wd[1]) : null;
  const core = wd ? t.slice(0, wd.index).trim() : t;
  const [a, b] = core.split(/\s+-\s+|\s+to\s+/i);
  const from = parseDate(a); const to = parseDate(b || a);
  if (!from || !to || to < from) return null;
  return { from, to, weekdays };
}

/** Closing days/dates written as "(C: Mon,Tue)" "(C: 1 Apr 2026 - 10 Apr 2026, 15 Aug 2026)" or plain "(Mon,Tue)". */
export function parseClosings(cells) {
  const weekdays = new Set(); const dates = [];
  for (const cell of cells) {
    for (const m of String(cell || '').matchAll(/\((?:C:\s*)?([^()]*)\)/g)) {
      const inner = m[1].trim();
      const wd = parseWeekdays(inner);
      if (wd) { wd.split(',').forEach((d) => weekdays.add(d)); continue; }
      for (const part of inner.split(',')) {
        const r = parseRange(part);
        if (r) dates.push({ from: r.from, to: r.to });
      }
    }
  }
  return { weekdays: weekdays.size ? [...weekdays].join(',') : null, dates };
}

/** Removes "(C: ...)" and weekday/date brackets from a text cell. */
export const stripClosings = (s) => String(s || '').replace(/\((?:C:\s*)?[^()]*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{4})[^()]*\)/gi, '').replace(/\s+-\s*$/, '').trim();

/** Takes out "[[code]]" and "{{tag}}" markers. */
export function markers(text) {
  const s = String(text || '');
  const code = (s.match(/\[\[([^\]]+)\]\]/) || [])[1] || null;
  const tags = [...s.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim());
  const rest = s.replace(/\[\[[^\]]+\]\]/g, '').replace(/\{\{[^}]+\}\}/g, '').replace(/\s+/g, ' ').trim();
  return { code, tags, rest };
}

/**
 * Splits a sheet into price columns and data rows.
 * Returns { columns: [{index, season, rate_type, ranges, variant}], rows: [{line, cells}], errors }
 */
export function readGrid(rows, fixedCount) {
  const errors = [];
  if (rows.length < 3) return { columns: [], rows: [], errors: ['The file needs a header row, date rows, a variant row and data rows'] };
  const head = rows[0];
  const width = Math.max(...rows.map((r) => r.length));
  let h = 1;
  while (h < rows.length && rows[h].slice(0, fixedCount).every((c) => !c)) h += 1;
  const headerRows = rows.slice(1, h);
  const isDateRow = (r) => r.slice(fixedCount).some((c) => parseRange(c));
  const dateRows = headerRows.filter(isDateRow);
  const variantRow = headerRows.filter((r) => !isDateRow(r)).pop() || [];

  // season name per column (forward-filled), with boundaries
  const columns = [];
  let season = null; let seasonStart = fixedCount;
  for (let c = fixedCount; c < width; c += 1) {
    if (head[c]) { season = head[c]; seasonStart = c; }
    if (!season) continue;
    const ranges = [];
    for (const dr of dateRows) {
      let v = '';
      for (let k = c; k >= seasonStart; k -= 1) if (dr[k]) { v = dr[k]; break; }
      if (!v) continue;
      const r = parseRange(v);
      if (r) ranges.push(r); else errors.push(`Row ${rows.indexOf(dr) + 1}: cannot read date range "${v}" (use "1 Jul 2026 - 30 Sep 2026")`);
    }
    columns.push({ index: c, season, ranges, variant: variantRow[c] || '' });
  }
  // sales / ops / both
  const base = (s) => s.replace(/\(\s*ops\s*\)/i, '').trim().toLowerCase();
  const opsSeasons = new Set(columns.filter((c) => /\(\s*ops\s*\)/i.test(c.season)).map((c) => base(c.season)));
  for (const col of columns) {
    col.rate_type = /\(\s*ops\s*\)/i.test(col.season) ? 'ops' : opsSeasons.has(base(col.season)) ? 'sales' : 'both';
    col.season = col.season.replace(/\(\s*ops\s*\)/i, '').trim();
    if (!col.ranges.length) errors.push(`Season "${col.season}" has no valid date range`);
  }
  const data = rows.slice(h).map((cells, i) => ({ line: h + i + 1, cells }));
  return { columns: columns.filter((c) => c.ranges.length && c.variant), rows: data, errors: [...new Set(errors)] };
}

/** Price cell → number or null (blank, "-", "NA"). */
export function price(cell) {
  const t = String(cell || '').replace(/[, ₹$]/g, '').trim();
  if (!t || t === '-' || /^n\/?a$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/* ----------------------------- Templates ----------------------------- */
const csv = (rows) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');

export const TEMPLATES = {
  hotel: csv([
    ['Group Name', 'Location', 'Name', 'Star', 'Room', 'Season 1 (Ops)', '', 'Season 1', '', 'Season 2', ''],
    ['', '', '', '', '', '1 Jul 2026 - 30 Sep 2026', '', '1 Jul 2026 - 30 Sep 2026', '', '13 Oct 2026 - 24 Oct 2026 (Sat,Sun)', ''],
    ['', '', '', '', '', '24 Dec 2026 - 4 Jan 2027', '', '24 Dec 2026 - 4 Jan 2027', '', '5 Jan 2027 - 31 Mar 2027', ''],
    ['', '', '', '', '', 'CP', 'MAP', 'CP', 'MAP', 'CP', 'MAP'],
    ['Golden Hotels', 'Gangtok, Sikkim, India', 'Golden Star Continental', '3', 'Deluxe (2P)', '1200', '1800', '1600', '2000', '2200', '2800'],
    ['', '', '', '', 'Super Deluxe (1P, 2P)', '1800', '2400', '2000', '2400', '2500', '2800'],
    ['', '', '', '', 'Family Room - 3 Bedded (3P)', '1200', '1800', '1600', '2000', '2200', '2800'],
    ['', 'Darjeeling, West Bengal, India', 'White Yak', '3', 'Deluxe [[DLX-30Day-CODE]] (2P)', '1600', '1900', '1600', '2000', '2200', '2800'],
    ['', '', 'Extras', '', 'Extra Bed (Adult)', '1800', '2000', '2000', '2400', '2500', '2800'],
    ['', '', '', '', 'Extra Bed (Child) (6-12)', '2000', '2400', '2000', '2400', '2500', '2800'],
    ['', '', '', '', 'Child without Bed (CNB)', '2000', '2400', '2000', '2400', '2500', '2800'],
    ['NA', 'Gangtok, Sikkim, India', 'Mount Himalayan hotel', '3', 'Super Deluxe (2P) (12R) (1AWEB) (1CWEB) (1CNB)', '2000', '2400', '2000', '2400', '2500', '2800'],
  ]),
  transport: csv([
    ['Duty Code', 'A', 'B', 'Service', 'Distance', 'Start Time', 'Duration(mins)', 'Day Schedule', 'Season 1 (Ops)', '', 'Season 1', '', 'Season 2', ''],
    ['', '', '', '', '', '', '', '', '1 Jul 2026 - 30 Sep 2026', '', '1 Jul 2026 - 30 Sep 2026', '', '13 Oct 2026 - 24 Oct 2026 (Sat,Sun)', ''],
    ['', '', '', '', '', '', '', '', '24 Dec 2026 - 4 Jan 2027', '', '24 Dec 2026 - 4 Jan 2027', '', '5 Jan 2027 - 31 Mar 2027', ''],
    ['', '', '', '', '', '', '', '', 'Wagon R {{3 Pax}} {{4y+}}', 'Innova/Xylo', 'Wagon R [[WRC]]{{3 Pax}} {{4y+}}', 'Innova/Xylo', 'Wagon R', 'Toyota'],
    ['101', 'Bagdogra Airport (BDG Arpt)', 'Gangtok (GTK)', 'Pickup', '90', '08:30', '210', 'Upon arrival at Bagdogra airport, drive to Gangtok and check in at your hotel.', '2000', '3000', '2500', '3500', '3000', '4000'],
    ['102', 'Gangtok (GTK)', '', 'Sightseeing', '40', '', '90', 'Half-day local sightseeing of Gangtok.', '4000', '2000', '4300', '2300', '3000', '4000'],
    ['103', 'Gangtok (GTK)', 'Pelling (PLG)', 'Transfer [[TFR-Supplier-Code]] (C: Mon,Tue)', '', '06:00', '', 'Drive to Pelling.', '2500', '2800', '2800', '3200', '3000', '4000'],
  ]),
  activity: csv([
    ['Name', 'Service', 'Description', 'Open Time', 'Close Time', 'Duration(Mins)', 'Slots', 'Season 1 (Ops)', '', 'Season 1', '', 'Season 2', ''],
    ['', '', '', '', '', '', '', '1 Jul 2026 - 30 Sep 2026', '', '1 Jul 2026 - 30 Sep 2026', '', '13 Oct 2026 - 24 Oct 2026', ''],
    ['', '', '', '', '', '', '', '24 Dec 2026 - 4 Jan 2027', '', '24 Dec 2026 - 4 Jan 2027', '', '5 Jan 2027 - 31 Mar 2027 (Sat,Sun)', ''],
    ['', '', '', '', '', '', '', 'Adult', 'Child (6-12)', 'Adult', 'Child (6-12)', 'Adult', 'Child (6-12)'],
    ['Port Blair To Havelock', 'Private Catamaran Ferry : Premium', 'Ferry from Port Blair to Havelock island', '08:00', '16:00', '90', '08:00,10:45', '2200', '3000', '2500', '3500', '3000', '4000'],
    ['', 'Private Catamaran Ferry : Deluxe (C: Mon)', '', '', '', '90', '', '3000', '4000', '3500', '4500', '5000', '6000'],
    ['Havelock To Neil Island', 'Private Catamaran Ferry [[Code-Supplier-Info]]', '', '08:00', '16:00', '120', '', '2100', '3200', '2500', '3500', '3000', '4000'],
  ]),
};
