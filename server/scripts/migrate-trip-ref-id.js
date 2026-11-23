/**
 * Adds organisation-scoped uniqueness for normalized trip reference IDs.
 * Reports existing duplicates and stops before changing the schema when any are found.
 * Usage: npm run migrate-trip-ref-id   (reads server/.env)
 */
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();
const dbName = process.env.DB_NAME || 'ibt_crm';
const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: dbName,
});

async function duplicateReferences() {
  const [rows] = await conn.query(
    `SELECT id, org_id, UPPER(TRIM(ref_id)) AS normalized_ref_id
     FROM trips
     WHERE ref_id IS NOT NULL AND TRIM(ref_id) <> ''
     ORDER BY org_id, normalized_ref_id, id`
  );
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.org_id}\u0000${row.normalized_ref_id}`;
    if (!groups.has(key)) groups.set(key, { org_id: row.org_id, ref_id: row.normalized_ref_id, trip_ids: [] });
    groups.get(key).trip_ids.push(row.id);
  }
  return [...groups.values()].filter((group) => group.trip_ids.length > 1);
}

function printDuplicates(groups) {
  console.error('Existing duplicate trip references found; migration stopped without changing the schema.');
  for (const group of groups) {
    console.error(`Organisation ${group.org_id} · ${group.ref_id} · Trip IDs: ${group.trip_ids.join(', ')}`);
  }
  console.error('Resolve these references manually, then run npm run migrate-trip-ref-id again.');
}

try {
  const duplicates = await duplicateReferences();
  if (duplicates.length) {
    printDuplicates(duplicates);
    process.exitCode = 1;
  } else {
    const [columns] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'trips' AND COLUMN_NAME = 'ref_id_normalized'`,
      [dbName]
    );
    if (!columns.length) {
      await conn.query(
        `ALTER TABLE trips
         ADD COLUMN ref_id_normalized VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
           GENERATED ALWAYS AS (NULLIF(UPPER(TRIM(ref_id)), '')) STORED`
      );
    }

    const [indexes] = await conn.execute(
      `SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS column_names
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'trips' AND INDEX_NAME = 'uq_trips_org_ref_normalized'
       GROUP BY INDEX_NAME, NON_UNIQUE`,
      [dbName]
    );
    if (indexes.length) {
      if (Number(indexes[0].NON_UNIQUE) !== 0 || indexes[0].column_names !== 'org_id,ref_id_normalized') {
        throw new Error('Index uq_trips_org_ref_normalized exists with an unexpected definition; inspect it before retrying.');
      }
    } else {
      try {
        await conn.query('ALTER TABLE trips ADD UNIQUE INDEX uq_trips_org_ref_normalized (org_id, ref_id_normalized)');
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          const newlyDuplicated = await duplicateReferences();
          if (newlyDuplicated.length) printDuplicates(newlyDuplicated);
          throw new Error('Could not create the unique index because duplicate references exist. No trip rows were changed.');
        }
        throw error;
      }
    }
    console.log(`Trip reference migration complete for ${dbName}. Existing trip rows were not changed.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
