/** Fills empty setup and demo tables with safe, clearly identified sample data. */
import { pool, query, transaction } from '../src/core/db.js';
import { DEFAULT_OPTIONS } from '../../shared/catalog.js';
import { TEMPLATES } from '../../shared/templates.js';

const demoNote = 'DEMO - Sample record created for UI testing. Safe to edit or delete.';

try {
  const orgs = await query(
    `SELECT id, base_currency FROM organizations WHERE status = 'active' ORDER BY id`
  );
  const users = await query(
    `SELECT u.id, u.org_id FROM users u
     JOIN organizations o ON o.id = u.org_id
     WHERE u.status = 'active' AND o.status = 'active'`
  );

  for (const org of orgs) {
    await transaction(async (conn) => {
      for (const [listKey, values] of Object.entries(DEFAULT_OPTIONS)) {
        for (const value of values) {
          await conn.execute(
            'INSERT IGNORE INTO options (org_id, list_key, value) VALUES (?,?,?)',
            [org.id, listKey, value]
          );
        }
      }

      for (const template of TEMPLATES) {
        await conn.execute(
          `INSERT IGNORE INTO org_templates (org_id, tkey, subject, body, settings)
           VALUES (?,?,?,?,?)`,
          [org.id, template.key, template.subject, template.body, JSON.stringify(template.settings || {})]
        );
      }

      const [[note]] = await conn.execute(
        'SELECT id FROM admin_notes WHERE org_id = ? AND body = ? LIMIT 1',
        [org.id, demoNote]
      );
      if (!note) await conn.execute(
        'INSERT INTO admin_notes (org_id, user_id, body) VALUES (?,NULL,?)',
        [org.id, demoNote]
      );

      await conn.execute(
        `INSERT IGNORE INTO platform_invoices
         (org_id, invoice_no, period, plan_name, currency, org_fee, user_fee, users, amount, status)
         VALUES (?, CONCAT('DEMO-', DATE_FORMAT(CURDATE(), '%Y%m'), '-', ?),
           DATE_FORMAT(CURDATE(), '%Y-%m'), 'DEMO - Sample invoice', ?, 0, 0, 0, 0, 'void')`,
        [org.id, org.id, org.base_currency]
      );

      const [[hotel]] = await conn.execute(
        `SELECT id FROM hotels WHERE org_id = ? AND name = 'DEMO - Sample Hotel' LIMIT 1`,
        [org.id]
      );
      if (hotel) {
        const [[closure]] = await conn.execute(
          `SELECT hotel_id FROM hotel_closures
           WHERE hotel_id = ? AND kind = 'blackout' AND date_from = '2099-01-01' AND date_to = '2099-01-02'
           LIMIT 1`,
          [hotel.id]
        );
        if (!closure) await conn.execute(
          `INSERT INTO hotel_closures (hotel_id, kind, room_types, date_from, date_to)
           VALUES (?, 'blackout', ?, '2099-01-01', '2099-01-02')`,
          [hotel.id, JSON.stringify(['DEMO Deluxe Room'])]
        );
      }
    });
  }

  for (const user of users) {
    const existing = await query(
      "SELECT id FROM notifications WHERE user_id = ? AND title = 'DEMO - Sample notification' LIMIT 1",
      [user.id]
    );
    if (existing.length === 0) await query(
      `INSERT INTO notifications (org_id, user_id, type, title, body, link, read_at)
       VALUES (?, ?, 'demo', 'DEMO - Sample notification', ?, '/app/organization', NOW())`,
      [user.org_id, user.id, demoNote]
    );
  }

  console.log(`Seeded demo setup records for ${orgs.length} active organisation(s) and ${users.length} active user(s).`);
} finally {
  await pool.end();
}
