/** Backfills standard setup data for active organisations without overwriting existing rows. */
import { pool, query, transaction } from '../src/core/db.js';
import { seedOrganisation } from '../src/modules/admin/admin.model.js';

try {
  const orgs = await query(
    `SELECT id, country_code, base_currency, default_tax_rate, address, city, phone, email, tax_id, status
     FROM organizations WHERE status = 'active'`
  );

  for (const org of orgs) {
    await transaction((conn) => seedOrganisation(conn, org));
  }

  console.log(`Checked standard defaults for ${orgs.length} active organisation(s).`);
} finally {
  await pool.end();
}
