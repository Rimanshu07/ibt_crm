/** Adds clearly marked sample service records only to empty service tables. */
import { pool, query, transaction } from '../src/core/db.js';

const demoNote = 'DEMO sample data. Replace or delete before using for real bookings.';

async function hasRows(conn, table, orgId) {
  const [[row]] = await conn.execute(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE org_id = ?`, [orgId]);
  return Number(row.n) > 0;
}

async function existingId(conn, table, name, orgId) {
  const [rows] = await conn.execute(
    `SELECT id FROM \`${table}\` WHERE org_id = ? AND name = ? LIMIT 1`,
    [orgId, name]
  );
  return rows[0]?.id || null;
}

async function seedOrganisation(conn, org) {
  const ids = { supplier: null, hotel: null, transport: null, activity: null, activityService: null };
  const supplierName = 'DEMO - Sample Supplier';
  ids.supplier = await existingId(conn, 'suppliers', supplierName, org.id);
  if (!ids.supplier && !(await hasRows(conn, 'suppliers', org.id))) {
    const [result] = await conn.execute(
      'INSERT INTO suppliers (org_id, name, kind, services, city, country, notes) VALUES (?,?,?,?,?,?,?)',
      [org.id, supplierName, 'Company', JSON.stringify(['hotel', 'transport', 'activity']), 'DEMO City', 'DEMO Country', demoNote]
    );
    ids.supplier = result.insertId;
  }

  const hotelName = 'DEMO - Sample Hotel';
  ids.hotel = await existingId(conn, 'hotels', hotelName, org.id);
  if (!ids.hotel && !(await hasRows(conn, 'hotels', org.id))) {
    const [prefs] = await conn.execute(
      "SELECT id FROM payment_preferences WHERE org_id = ? AND kind = 'supplier' AND is_default = 1 LIMIT 1",
      [org.id]
    );
    const [result] = await conn.execute(
      `INSERT INTO hotels
       (org_id, name, group_name, location, city, star, address, meal_plans, room_types, payment_pref_id, supplier_id, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [org.id, hotelName, 'DEMO Sample Group', 'DEMO City, DEMO Region, DEMO Country', 'DEMO City', '3',
        'DEMO address - replace with the real property address', JSON.stringify(['CP', 'MAP']),
        JSON.stringify([{ name: 'DEMO Deluxe Room', aweb: 1, cweb: 1, cnb: 1, rooms: null }]),
        prefs[0]?.id || null, ids.supplier, demoNote]
    );
    ids.hotel = result.insertId;
  }

  const transportName = 'DEMO - Airport Transfer';
  const [transportRows] = await conn.execute(
    'SELECT id FROM transport_services WHERE org_id = ? AND service = ? AND from_location = ? LIMIT 1',
    [org.id, transportName, 'DEMO Airport']
  );
  ids.transport = transportRows[0]?.id || null;
  if (!ids.transport && !(await hasRows(conn, 'transport_services', org.id))) {
    const [result] = await conn.execute(
      `INSERT INTO transport_services
       (org_id, duty_code, from_location, from_short, to_location, to_short, service, code, distance_km, start_time, duration_mins, day_schedule)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [org.id, 'DEMO-01', 'DEMO Airport', 'DEMO', 'DEMO City', 'DEMO', transportName, 'DEMO-TRANSFER',
        35, '09:00', 60, 'DEMO transfer schedule - replace with real route details']
    );
    ids.transport = result.insertId;
  }

  const activityName = 'DEMO - City Sightseeing';
  ids.activity = await existingId(conn, 'activities', activityName, org.id);
  if (!ids.activity && !(await hasRows(conn, 'activities', org.id))) {
    const [result] = await conn.execute(
      'INSERT INTO activities (org_id, name, city, description) VALUES (?,?,?,?)',
      [org.id, activityName, 'DEMO City', demoNote]
    );
    ids.activity = result.insertId;
  }

  if (ids.activity) {
    const serviceName = 'DEMO - Entry Ticket';
    const [serviceRows] = await conn.execute(
      'SELECT id FROM activity_services WHERE org_id = ? AND activity_id = ? AND name = ? LIMIT 1',
      [org.id, ids.activity, serviceName]
    );
    ids.activityService = serviceRows[0]?.id || null;
    if (!ids.activityService && !(await hasRows(conn, 'activity_services', org.id))) {
      const [result] = await conn.execute(
        `INSERT INTO activity_services (activity_id, org_id, name, code, description, open_time, close_time, duration_mins, slots)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [ids.activity, org.id, serviceName, 'DEMO-TICKET', demoNote, '09:00', '17:00', 120, '09:00,11:00,14:00']
      );
      ids.activityService = result.insertId;
    }
  }

  if (await hasRows(conn, 'rates', org.id)) return;
  const rateRefs = [
    ids.hotel && { service: 'hotel', ref_id: ids.hotel, variant: 'DEMO Deluxe Room', meal_plan: 'CP', occupancy: 2, price: 6500 },
    ids.transport && { service: 'transport', ref_id: ids.transport, variant: 'DEMO Sedan (4 pax)', meal_plan: '', occupancy: null, price: 4200 },
    ids.activityService && { service: 'activity', ref_id: ids.activityService, variant: 'Adult', meal_plan: '', occupancy: null, price: 1200 },
    ids.activityService && { service: 'activity', ref_id: ids.activityService, variant: 'Child', meal_plan: '', occupancy: null, price: 700 },
  ].filter(Boolean);

  if (rateRefs.length === 0) return;

  const uploads = new Map();
  if (!(await hasRows(conn, 'rate_uploads', org.id))) {
    for (const service of ['hotel', 'transport', 'activity']) {
      if (!rateRefs.some((rate) => rate.service === service)) continue;
      const count = rateRefs.filter((rate) => rate.service === service).length;
      const [result] = await conn.execute(
        'INSERT INTO rate_uploads (org_id, service, file_name, currency, summary) VALUES (?,?,?,?,?)',
        [org.id, service, 'DEMO - Seeded sample data', org.base_currency,
          JSON.stringify({ demo: true, created: count, updated: 0, errors: 0, rate_count: count })]
      );
      uploads.set(service, result.insertId);
    }
  }

  for (const rate of rateRefs) {
    await conn.execute(
      `INSERT INTO rates
       (org_id, service, ref_id, variant, meal_plan, occupancy, kind, rate_type, season, date_from, date_to, price, currency, code, upload_id)
       VALUES (?,?,?,?,?,?,'base','both','DEMO - Sample rates',CURDATE(),'2030-12-31',?,?,?,?)`,
      [org.id, rate.service, rate.ref_id, rate.variant, rate.meal_plan, rate.occupancy,
        rate.price, org.base_currency, 'DEMO', uploads.get(rate.service) || null]
    );
  }
}

try {
  const orgs = await query(
    `SELECT id, base_currency FROM organizations WHERE status = 'active' ORDER BY id`
  );
  let processed = 0;
  for (const org of orgs) {
    await transaction((conn) => seedOrganisation(conn, org));
    processed++;
  }
  console.log(`Checked DEMO service data for ${processed} active organisation(s).`);
} finally {
  await pool.end();
}
