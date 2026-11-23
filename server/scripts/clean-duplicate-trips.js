import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ibt_crm',
});

try {
  // 1. Find all duplicates grouped by org_id and normalized ref_id
  const [rows] = await conn.query(`
    SELECT id, org_id, trip_no, guest_name, UPPER(TRIM(ref_id)) AS normalized_ref_id
    FROM trips
    WHERE ref_id IS NOT NULL AND TRIM(ref_id) <> ''
    ORDER BY org_id, normalized_ref_id, id ASC
  `);

  const groups = new Map();
  for (const r of rows) {
    const key = `${r.org_id}\0${r.normalized_ref_id}`;
    if (!groups.has(key)) {
      groups.set(key, { org_id: r.org_id, ref_id: r.normalized_ref_id, records: [] });
    }
    groups.get(key).records.push(r);
  }

  const duplicates = [...groups.values()].filter((g) => g.records.length > 1);

  if (!duplicates.length) {
    console.log('No duplicate trips found.');
  } else {
    console.log(`Found ${duplicates.length} reference groups with duplicates:`);
    const idsToDelete = [];
    for (const g of duplicates) {
      const [keep, ...remove] = g.records;
      console.log(`- Org ${g.org_id} · ${g.ref_id}: Keeping Trip #${keep.trip_no} (ID: ${keep.id}), Removing ${remove.length} duplicate(s) (IDs: ${remove.map(x => x.id).join(', ')})`);
      idsToDelete.push(...remove.map((x) => x.id));
    }

    console.log(`\nDeleting ${idsToDelete.length} duplicate trips...`);
    // Delete in chunks of 100
    for (let i = 0; i < idsToDelete.length; i += 100) {
      const chunk = idsToDelete.slice(i, i + 100);
      await conn.query('DELETE FROM trips WHERE id IN (?)', [chunk]);
    }
    console.log(`Successfully deleted ${idsToDelete.length} duplicate trips.`);
  }
} finally {
  await conn.end();
}
