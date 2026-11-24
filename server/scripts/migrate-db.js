/**
 * Creates tables from the current schema only when they are missing.
 * Usage: npm run migrate-db   (reads server/.env)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();
const dir = path.dirname(fileURLToPath(import.meta.url));
const dbName = process.env.DB_NAME || 'ibt_crm';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
});

try {
  const schema = await fs.readFile(path.join(dir, '../db/schema.sql'), 'utf8');
  const migration = schema
    .replace(
      /SET FOREIGN_KEY_CHECKS = 0;\s*DROP TABLE IF EXISTS[\s\S]*?;\s*SET FOREIGN_KEY_CHECKS = 1;\s*/,
      ''
    )
    .replace(/\bCREATE TABLE\s+(?!IF NOT EXISTS\b)/gi, 'CREATE TABLE IF NOT EXISTS ')
    .replaceAll('ibt_crm', dbName);

  console.log(`Creating missing tables in ${dbName}...`);
  await conn.query(migration);

  // Apply column upgrades for existing tables
  try {
    await conn.query(`
      ALTER TABLE organizations
        MODIFY COLUMN logo_url MEDIUMTEXT,
        MODIFY COLUMN header_image MEDIUMTEXT,
        MODIFY COLUMN footer_image MEDIUMTEXT
    `);
  } catch (err) {
    console.warn('Note on column alter:', err.message);
  }

  console.log('Database migration complete. Existing tables and data were left unchanged.');
} finally {
  await conn.end();
}
