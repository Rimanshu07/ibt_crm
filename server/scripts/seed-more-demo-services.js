/** Adds five additional, clearly marked service examples per active organisation. */
import { pool, query, transaction } from '../src/core/db.js';

const demoNote = 'DEMO sample data. Replace or delete before using for real bookings.';
const sampleIndices = [2, 3, 4, 5, 6];

async function findOne(conn, sql, params) {
  const [rows] = await conn.execute(sql, params);
  return rows[0] || null;
}

async function addRate(conn, org, uploadId, rate) {
  const existing = await findOne(
    conn,
    `SELECT id FROM rates
     WHERE org_id = ? AND service = ? AND ref_id = ? AND variant = ? AND meal_plan = ?
       AND occupancy <=> ? AND season = 'DEMO - Additional sample rates' AND date_from = CURDATE()
     LIMIT 1`,
    [org.id, rate.service, rate.ref_id, rate.variant, rate.meal_plan, rate.occupancy]
  );
  if (existing) return false;

  await conn.execute(
    `INSERT INTO rates
     (org_id, service, ref_id, variant, meal_plan, occupancy, kind, rate_type, season, date_from, date_to, price, currency, code, upload_id)
     VALUES (?,?,?,?,?,?,'base','both','DEMO - Additional sample rates',CURDATE(),'2030-12-31',?,?,?,?)`,
    [org.id, rate.service, rate.ref_id, rate.variant, rate.meal_plan, rate.occupancy,
      rate.price, org.base_currency, 'DEMO', uploadId]
  );
  return true;
}

async function getUpload(conn, org, service, rateCount) {
  const fileName = 'DEMO - Additional service samples';
  const existing = await findOne(
    conn,
    'SELECT id FROM rate_uploads WHERE org_id = ? AND service = ? AND file_name = ? LIMIT 1',
    [org.id, service, fileName]
  );
  if (existing) return existing.id;

  const [result] = await conn.execute(
    'INSERT INTO rate_uploads (org_id, service, file_name, currency, summary) VALUES (?,?,?,?,?)',
    [org.id, service, fileName, org.base_currency,
      JSON.stringify({ demo: true, created: rateCount, updated: 0, errors: 0, rate_count: rateCount })]
  );
  return result.insertId;
}

async function seedOrganisation(conn, org) {
  const added = { suppliers: 0, hotels: 0, transport: 0, activities: 0, activityServices: 0, rates: 0, closures: 0 };
  const pref = await findOne(
    conn,
    "SELECT id FROM payment_preferences WHERE org_id = ? AND kind = 'supplier' AND is_default = 1 LIMIT 1",
    [org.id]
  );
  const uploads = {
    hotel: await getUpload(conn, org, 'hotel', sampleIndices.length),
    transport: await getUpload(conn, org, 'transport', sampleIndices.length),
    activity: await getUpload(conn, org, 'activity', sampleIndices.length * 2),
  };

  for (const index of sampleIndices) {
    const suffix = String(index).padStart(2, '0');
    let supplier = await findOne(
      conn,
      'SELECT id FROM suppliers WHERE org_id = ? AND name = ? LIMIT 1',
      [org.id, `DEMO - Sample Supplier ${suffix}`]
    );
    if (!supplier) {
      const [result] = await conn.execute(
        `INSERT INTO suppliers (org_id, name, kind, services, city, country, payment_pref_id, notes)
         VALUES (?,?,?,?,?,?,?,?)`,
        [org.id, `DEMO - Sample Supplier ${suffix}`, 'Company',
          JSON.stringify(['hotel', 'transport', 'activity']), `DEMO City ${suffix}`, 'DEMO Country',
          pref?.id || null, demoNote]
      );
      supplier = { id: result.insertId };
      added.suppliers++;
    }

    let hotel = await findOne(
      conn,
      'SELECT id FROM hotels WHERE org_id = ? AND name = ? LIMIT 1',
      [org.id, `DEMO - Sample Hotel ${suffix}`]
    );
    const roomName = `DEMO Deluxe Room ${suffix}`;
    if (!hotel) {
      const [result] = await conn.execute(
        `INSERT INTO hotels
         (org_id, name, group_name, location, city, star, address, meal_plans, room_types, payment_pref_id, supplier_id, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [org.id, `DEMO - Sample Hotel ${suffix}`, `DEMO Sample Group ${suffix}`,
          `DEMO City ${suffix}, DEMO Region, DEMO Country`, `DEMO City ${suffix}`, '3',
          'DEMO address - replace with the real property address', JSON.stringify(['CP', 'MAP']),
          JSON.stringify([{ name: roomName, aweb: 1, cweb: 1, cnb: 1, rooms: null }]),
          pref?.id || null, supplier.id, demoNote]
      );
      hotel = { id: result.insertId };
      added.hotels++;
    }

    let transport = await findOne(
      conn,
      'SELECT id FROM transport_services WHERE org_id = ? AND duty_code = ? LIMIT 1',
      [org.id, `DEMO-${suffix}`]
    );
    if (!transport) {
      const [result] = await conn.execute(
        `INSERT INTO transport_services
         (org_id, duty_code, from_location, from_short, to_location, to_short, service, code, distance_km, start_time, duration_mins, day_schedule)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [org.id, `DEMO-${suffix}`, `DEMO Airport ${suffix}`, 'DEMO',
          `DEMO City ${suffix}`, 'DEMO', `DEMO - Airport Transfer ${suffix}`,
          `DEMO-TRANSFER-${suffix}`, 35 + index, '09:00', 60 + (index * 5), demoNote]
      );
      transport = { id: result.insertId };
      added.transport++;
    }

    let activity = await findOne(
      conn,
      'SELECT id FROM activities WHERE org_id = ? AND name = ? LIMIT 1',
      [org.id, `DEMO - City Activity ${suffix}`]
    );
    if (!activity) {
      const [result] = await conn.execute(
        'INSERT INTO activities (org_id, name, city, description) VALUES (?,?,?,?)',
        [org.id, `DEMO - City Activity ${suffix}`, `DEMO City ${suffix}`, demoNote]
      );
      activity = { id: result.insertId };
      added.activities++;
    }

    let activityService = await findOne(
      conn,
      'SELECT id FROM activity_services WHERE org_id = ? AND activity_id = ? AND name = ? LIMIT 1',
      [org.id, activity.id, `DEMO - Entry Ticket ${suffix}`]
    );
    if (!activityService) {
      const [result] = await conn.execute(
        `INSERT INTO activity_services (activity_id, org_id, name, code, description, open_time, close_time, duration_mins, slots)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [activity.id, org.id, `DEMO - Entry Ticket ${suffix}`, `DEMO-TICKET-${suffix}`,
          demoNote, '09:00', '17:00', 120, '09:00,11:00,14:00']
      );
      activityService = { id: result.insertId };
      added.activityServices++;
    }

    const [[closure]] = await conn.execute(
      `SELECT hotel_id FROM hotel_closures
       WHERE hotel_id = ? AND kind = 'blackout' AND date_from = '2099-01-01' AND date_to = '2099-01-02'
       LIMIT 1`,
      [hotel.id]
    );
    if (!closure) {
      await conn.execute(
        `INSERT INTO hotel_closures (hotel_id, kind, room_types, date_from, date_to)
         VALUES (?, 'blackout', ?, '2099-01-01', '2099-01-02')`,
        [hotel.id, JSON.stringify([roomName])]
      );
      added.closures++;
    }

    const rates = [
      { service: 'hotel', ref_id: hotel.id, variant: roomName, meal_plan: 'CP', occupancy: 2, price: 6500 + (index * 250) },
      { service: 'transport', ref_id: transport.id, variant: `DEMO Sedan ${suffix} (4 pax)`, meal_plan: '', occupancy: null, price: 4200 + (index * 200) },
      { service: 'activity', ref_id: activityService.id, variant: 'Adult', meal_plan: '', occupancy: null, price: 1200 + (index * 50) },
      { service: 'activity', ref_id: activityService.id, variant: 'Child', meal_plan: '', occupancy: null, price: 700 + (index * 25) },
    ];
    for (const rate of rates) {
      if (await addRate(conn, org, uploads[rate.service], rate)) added.rates++;
    }
  }

  return added;
}

try {
  const orgs = await query(
    `SELECT id, base_currency FROM organizations WHERE status = 'active' ORDER BY id`
  );
  const totals = { suppliers: 0, hotels: 0, transport: 0, activities: 0, activityServices: 0, rates: 0, closures: 0 };
  for (const org of orgs) {
    const added = await transaction((conn) => seedOrganisation(conn, org));
    for (const [key, count] of Object.entries(added)) totals[key] += count;
  }
  console.log(`Checked ${orgs.length} active organisation(s): ${JSON.stringify(totals)}`);
} finally {
  await pool.end();
}
