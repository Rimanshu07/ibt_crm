/**
 * Flight search helpers for the quote form:
 *  - build MakeMyTrip / Goibibo / Skyscanner search links from the quote's flight legs
 *  - read flight details from text copied off those sites (airline, flight no., times, fare)
 */
const IN_AIRPORTS = new Set(('DEL BOM BLR MAA CCU HYD AMD PNQ GOI GOX COK TRV CCJ IXE BHO IDR JAI LKO VNS PAT GAU IXB BBI RPR NAG ATQ IXC SXR IXJ IXL DED '
  + 'UDR JDH IXZ VTZ RJA TIR VGA IXM TRZ CJB IXR IXA DIB JRH IMF AJL IXS SHL GWL JLR KNU AGR HBX IXG BDQ STV RAJ BHJ PBD DIU KLH TCR NDC ISK').split(' '));

/** "Bhopal (BHO)" / "bho" / "BHO - Raja Bhoj" → "BHO"; null when no code can be found. */
export function airportCode(text) {
  const s = String(text || '').trim();
  const m = s.match(/\(([A-Za-z]{3})\)/) || s.match(/^([A-Za-z]{3})$/) || s.match(/\b([A-Z]{3})\b/);
  return m ? m[1].toUpperCase() : null;
}

const ddmmyyyy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const CABIN = { Economy: 'E', 'Premium Economy': 'PE', Business: 'B', First: 'F' };
const SKY_CABIN = { Economy: 'economy', 'Premium Economy': 'premiumeconomy', Business: 'business', First: 'first' };

/**
 * Search links for a flight line. Returns { links: [{key,label,url}], problems: [] }.
 * d = { trip_way, legs:[{from_city,to_city,depart_date}], adults, children, infants, travel_class }, childAges = [8, 5]
 */
export function searchLinks(d, childAges = []) {
  const problems = [];
  const legs = (d.legs || []).map((l) => ({ from: airportCode(l.from_city), to: airportCode(l.to_city), date: l.depart_date }));
  legs.forEach((l, i) => {
    if (!l.from || !l.to) problems.push(`Leg ${i + 1}: enter airport codes (e.g. BHO, BOM)`);
    if (!l.date) problems.push(`Leg ${i + 1}: choose the date`);
  });
  if (problems.length || !legs.length) return { links: [], problems: problems.length ? problems : ['Add a flight leg'] };
  const a = Math.max(Number(d.adults) || 0, 1); const c = Number(d.children) || 0; const inf = Number(d.infants) || 0;
  const way = d.trip_way === 'Return' && legs.length > 1 ? 'R' : d.trip_way === 'Multi-city' && legs.length > 1 ? 'M' : 'O';
  const used = way === 'O' ? legs.slice(0, 1) : legs;
  const intl = !used.every((l) => IN_AIRPORTS.has(l.from) && IN_AIRPORTS.has(l.to));
  const itinerary = used.map((l) => `${l.from}-${l.to}-${ddmmyyyy(l.date)}`).join('_');
  const q = `itinerary=${itinerary}&tripType=${way}&paxType=A-${a}_C-${c}_I-${inf}&intl=${intl}&cabinClass=${CABIN[d.travel_class] || 'E'}&lang=eng`;
  const links = [
    { key: 'mmt', label: 'MakeMyTrip', url: `https://www.makemytrip.com/flight/search?${q}` },
    { key: 'goibibo', label: 'Goibibo', url: `https://www.goibibo.com/flight/search?${q}` },
  ];
  // Skyscanner: one-way and return (multi-city is not supported by its link format)
  const ages = (childAges.length ? childAges : Array.from({ length: c }, () => 8)).slice(0, c).join('%7C');
  const sky = `adultsv2=${a}&cabinclass=${SKY_CABIN[d.travel_class] || 'economy'}&childrenv2=${ages}${inf ? `${ages ? '%7C' : ''}${Array.from({ length: inf }, () => 1).join('%7C')}` : ''}&ref=home`;
  const f = used[0];
  if (way === 'O') links.push({ key: 'sky', label: 'Skyscanner', url: `https://www.skyscanner.co.in/transport/flights/${f.from.toLowerCase()}/${f.to.toLowerCase()}/${f.date.slice(2).replace(/-/g, '')}/?${sky}` });
  else if (way === 'R') {
    const r = used[1];
    links.push({ key: 'sky', label: 'Skyscanner', url: `https://www.skyscanner.co.in/transport/d/${f.from.toLowerCase()}/${f.date}/${f.to.toLowerCase()}/${r.from.toLowerCase()}/${r.date}/${r.to.toLowerCase()}?${sky}` });
  }
  return { links, problems: [] };
}

const AIRLINES = ['IndiGo', 'Air India Express', 'Air India', 'Vistara', 'SpiceJet', 'Akasa Air', 'Alliance Air', 'Star Air', 'Fly91', 'Go First', 'AirAsia',
  'Emirates', 'Etihad', 'Qatar Airways', 'flydubai', 'Air Arabia', 'Singapore Airlines', 'Scoot', 'Thai Airways', 'Thai AirAsia', 'Malaysia Airlines', 'SriLankan',
  'Lufthansa', 'British Airways', 'Turkish Airlines', 'Saudia', 'Oman Air', 'Gulf Air', 'Kuwait Airways', 'Cathay Pacific', 'Vietnam Airlines', 'VietJet', 'Batik Air', 'Nepal Airlines', 'Druk Air'];
const CODE_AIRLINE = { '6E': 'IndiGo', AI: 'Air India', IX: 'Air India Express', UK: 'Vistara', SG: 'SpiceJet', QP: 'Akasa Air', '9I': 'Alliance Air', S5: 'Star Air', IC: 'Fly91',
  EK: 'Emirates', EY: 'Etihad', QR: 'Qatar Airways', FZ: 'flydubai', G9: 'Air Arabia', SQ: 'Singapore Airlines', TR: 'Scoot', TG: 'Thai Airways', FD: 'Thai AirAsia',
  MH: 'Malaysia Airlines', UL: 'SriLankan', LH: 'Lufthansa', BA: 'British Airways', TK: 'Turkish Airlines', SV: 'Saudia', WY: 'Oman Air', GF: 'Gulf Air', CX: 'Cathay Pacific', OD: 'Batik Air' };

/**
 * Read flight details from text copied from a search result. Returns the fields it is sure about:
 * { airline, flight_no, depart_time, arrive_time, duration, stops, fare }
 */
export function parseFlightText(text) {
  const t = String(text || '').replace(/ /g, ' ');
  const out = {};
  const airline = AIRLINES.find((a) => new RegExp(`\\b${a.replace(/ /g, '\\s+')}\\b`, 'i').test(t));
  const fn = t.match(/\b(6E|[A-Z][A-Z0-9]|[0-9][A-Z])[ -]?(\d{2,4})(?![\d:.,])(?!\s*(?:h|hrs?|m|mins?|kg|%)\b)/);
  if (fn && (CODE_AIRLINE[fn[1]] || airline)) {
    out.flight_no = `${fn[1]} ${fn[2]}`;
    out.airline = airline || CODE_AIRLINE[fn[1]];
  } else if (airline) out.airline = airline;
  const times = [...t.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?!\s*(?:h|hr|hrs)\b)/g)].map((m) => `${m[1].padStart(2, '0')}:${m[2]}`);
  if (times[0]) out.depart_time = times[0];
  if (times[1]) out.arrive_time = times[1];
  const dur = t.match(/\b(\d{1,2})\s*h(?:r|rs)?\s*(\d{1,2})?\s*m?/i);
  if (dur) out.duration = `${dur[1]}h ${dur[2] ? `${dur[2]}m` : ''}`.trim();
  const stops = t.match(/\b(non[\s-]?stop|direct|\d+\s*stops?)\b/i);
  if (stops) out.stops = /non|direct/i.test(stops[1]) ? 'Non-stop' : stops[1].replace(/\s+/, ' ');
  const fares = [...t.matchAll(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/gi)].map((m) => Number(m[1].replace(/,/g, ''))).filter((x) => x >= 300);
  if (fares.length) out.fare = Math.min(...fares);
  return out;
}
