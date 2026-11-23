import test from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../src/core/db.js';
import { importTrips } from '../src/modules/trips/trips.controller.js';

const mockReqRes = (orgId, userId, rows) => {
  let responseData = null;
  let responseStatus = 200;
  const req = {
    orgId,
    user: { id: userId, is_org_owner: true },
    permissions: ['trips.create', 'trips.view_all'],
    body: { rows },
  };
  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };
  return { req, res, get: () => ({ status: responseStatus, body: responseData }) };
};

test('Trips Import Verification Suite', async (t) => {
  // 1. Create a fresh temporary organization for testing
  const [orgResult] = await pool.execute(
    "INSERT INTO organizations (name, email, country_code, base_currency, timezone) VALUES ('Test Verification Org', 'test_org@example.com', 'IN', 'INR', 'Asia/Kolkata')"
  );
  const testOrgId = orgResult.insertId;

  // Create a test user for this organization
  const [userResult] = await pool.execute(
    "INSERT INTO users (org_id, name, email, password_hash) VALUES (?, 'Test User', ?, 'hash')",
    [testOrgId, `testuser_${Date.now()}@example.com`]
  );
  const testUserId = userResult.insertId;

  const baseRows = Array.from({ length: 10 }, (_, i) => ({
    ref_id: `WEB-${101 + i}`,
    guest_salutation: 'Mr.',
    guest_name: `Guest ${i + 1}`,
    guest_phone: '+91 9876543210',
    guest_email: `guest${i + 1}@example.com`,
    guest_city: 'Delhi',
    services: ['package'],
    destination_ids: [],
    start_date: '2026-12-20',
    nights: 4,
    adults: 2,
    children_ages: [],
    infants: 0,
    tags: ['Test'],
    notes: 'Test import notes',
  }));

  try {
    // Scenario 1: Fresh organization mein 10 unique rows import → 10 created.
    await t.test('Scenario 1: Fresh organization mein 10 unique rows import → 10 created', async () => {
      const { req, res, get } = mockReqRes(testOrgId, testUserId, baseRows);
      await importTrips(req, res);
      const out = get().body;

      assert.equal(out.data.counts.created, 10, 'Expected 10 created trips');
      assert.equal(out.data.counts.skipped, 0, 'Expected 0 skipped');
      assert.equal(out.data.counts.conflicts, 0, 'Expected 0 conflicts');
      assert.equal(out.data.counts.invalid, 0, 'Expected 0 invalid');

      const countInDb = await query('SELECT COUNT(*) AS total FROM trips WHERE org_id = ?', [testOrgId]);
      assert.equal(countInDb[0].total, 10, 'Total trips in DB should be 10');
    });

    // Scenario 2: Wahi file dobara import → 0 created, 10 skipped; total 10 trips.
    await t.test('Scenario 2: Wahi file dobara import → 0 created, 10 skipped; total 10 trips', async () => {
      // Also test with spaces and lowercase e.g. " web-101 "
      const repeatedRows = baseRows.map((r, i) => (i === 0 ? { ...r, ref_id: ' web-101 ' } : { ...r }));
      const { req, res, get } = mockReqRes(testOrgId, testUserId, repeatedRows);
      await importTrips(req, res);
      const out = get().body;

      assert.equal(out.data.counts.created, 0, 'Expected 0 created');
      assert.equal(out.data.counts.skipped, 10, 'Expected 10 skipped');
      assert.equal(out.data.counts.conflicts, 0, 'Expected 0 conflicts');
      assert.equal(out.data.counts.invalid, 0, 'Expected 0 invalid');

      // Verify each skipped row has matching trip_no and reason
      for (const skippedItem of out.data.skipped) {
        assert.ok(skippedItem.trip_no, 'Skipped item must include existing trip_no');
        assert.ok(skippedItem.ref_id, 'Skipped item must include ref_id');
      }

      const countInDb = await query('SELECT COUNT(*) AS total FROM trips WHERE org_id = ?', [testOrgId]);
      assert.equal(countInDb[0].total, 10, 'Total trips in DB should remain 10');
    });

    // Scenario 3: Existing WEB-101 ki travel date badal kar import → conflict; original trip safe.
    await t.test('Scenario 3: Existing WEB-101 ki travel date badal kar import → conflict; original trip safe', async () => {
      const originalTrip = await query('SELECT start_date, nights, end_date FROM trips WHERE org_id = ? AND ref_id = ?', [testOrgId, 'WEB-101']);
      const originalStartDate = String(originalTrip[0].start_date).slice(0, 10);

      const modifiedRows = [
        { ...baseRows[0], ref_id: 'WEB-101', start_date: '2026-12-25', nights: 5 },
      ];
      const { req, res, get } = mockReqRes(testOrgId, testUserId, modifiedRows);
      await importTrips(req, res);
      const out = get().body;

      assert.equal(out.data.counts.created, 0, 'Expected 0 created');
      assert.equal(out.data.counts.skipped, 0, 'Expected 0 skipped');
      assert.equal(out.data.counts.conflicts, 1, 'Expected 1 conflict');
      assert.equal(out.data.conflicts[0].ref_id, 'WEB-101');
      assert.ok(out.data.conflicts[0].trip_no, 'Conflict must show existing Trip ID');

      // Check original trip is safe and not modified
      const tripAfter = await query('SELECT start_date, nights FROM trips WHERE org_id = ? AND ref_id = ?', [testOrgId, 'WEB-101']);
      assert.equal(String(tripAfter[0].start_date).slice(0, 10), originalStartDate, 'Original start date must remain intact');
      assert.equal(tripAfter[0].nights, 4, 'Original nights must remain intact');
    });

    // Scenario 4: Do simultaneous imports → har reference ki sirf ek trip.
    await t.test('Scenario 4: Do simultaneous imports → har reference ki sirf ek trip', async () => {
      const concurrentRows = [
        { ...baseRows[0], ref_id: 'SIMUL-201', guest_name: 'Concurrent User 1' },
        { ...baseRows[0], ref_id: 'SIMUL-202', guest_name: 'Concurrent User 2' },
      ];

      const op1 = mockReqRes(testOrgId, testUserId, concurrentRows);
      const op2 = mockReqRes(testOrgId, testUserId, concurrentRows);

      // Run simultaneously
      await Promise.all([
        importTrips(op1.req, op1.res),
        importTrips(op2.req, op2.res),
      ]);

      const res1 = op1.get().body;
      const res2 = op2.get().body;

      const totalCreated = res1.data.counts.created + res2.data.counts.created;
      const totalSkipped = res1.data.counts.skipped + res2.data.counts.skipped;

      assert.equal(totalCreated, 2, 'Exactly 2 trips should be created in total across both calls');
      assert.equal(totalSkipped, 2, 'Exactly 2 trips should be skipped across both calls');

      const count201 = await query("SELECT COUNT(*) AS total FROM trips WHERE org_id = ? AND ref_id = 'SIMUL-201'", [testOrgId]);
      const count202 = await query("SELECT COUNT(*) AS total FROM trips WHERE org_id = ? AND ref_id = 'SIMUL-202'", [testOrgId]);

      assert.equal(count201[0].total, 1, 'SIMUL-201 must have exactly 1 trip row in DB');
      assert.equal(count202[0].total, 1, 'SIMUL-202 must have exactly 1 trip row in DB');
    });

    // Scenario 5: Same guest aur phone, lekin naya ref_id → nayi trip create ho.
    await t.test('Scenario 5: Same guest aur phone, lekin naya ref_id → nayi trip create ho', async () => {
      const repeatCustomerRow = [
        {
          ...baseRows[0],
          ref_id: 'WEB-301',
          guest_name: 'Rahul Sharma',
          guest_phone: '+91 9876543210',
          guest_email: 'rahul@example.com',
          start_date: '2027-01-15',
        },
      ];

      const { req, res, get } = mockReqRes(testOrgId, testUserId, repeatCustomerRow);
      await importTrips(req, res);
      const out = get().body;

      assert.equal(out.data.counts.created, 1, 'Expected 1 created trip for repeat guest with new ref_id');
      assert.equal(out.data.counts.skipped, 0);
      assert.equal(out.data.counts.conflicts, 0);

      const tripsForRahul = await query("SELECT id, ref_id FROM trips WHERE org_id = ? AND guest_phone LIKE '%9876543210%'", [testOrgId]);
      assert.ok(tripsForRahul.length >= 2, 'Rahul should have multiple trips with different ref_ids');
    });

    // Scenario 6: Blank ref_id gives validation error with row number
    await t.test('Scenario 6: Blank ref_id validation error with row number', async () => {
      const invalidRows = [
        { ...baseRows[0], ref_id: '   ' },
      ];
      const { req, res, get } = mockReqRes(testOrgId, testUserId, invalidRows);
      await importTrips(req, res);
      const out = get().body;

      assert.equal(out.data.counts.invalid, 1, 'Expected 1 invalid row');
      assert.equal(out.data.invalid[0].row, 2, 'Row number should be 2 (first row after header)');
      assert.ok(out.data.invalid[0].reason.includes('Reference ID'), 'Reason should mention Reference ID');
    });
  } finally {
    // Clean up test organization and its cascades
    await query('DELETE FROM organizations WHERE id = ?', [testOrgId]);
    await pool.end();
  }
});
