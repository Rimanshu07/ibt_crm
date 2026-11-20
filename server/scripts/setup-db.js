/**
 * Creates the database, tables, seed data and the Super Admin login.
 * Usage: npm run setup-db   (reads server/.env)
 * WARNING: drops and recreates the Milestone 1 tables.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();
const dir = path.dirname(fileURLToPath(import.meta.url));

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
});

const dbName = process.env.DB_NAME || 'ibt_crm';
const fix = (sql) => sql.replaceAll('ibt_crm', dbName);

console.log('Creating tables...');
await conn.query(fix(await fs.readFile(path.join(dir, '../db/schema.sql'), 'utf8')));
console.log('Loading seed data...');
await conn.query(fix(await fs.readFile(path.join(dir, '../db/seed.sql'), 'utf8')));

const email = (process.env.SUPER_ADMIN_EMAIL || 'admin@ibttravels.com').toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe@123';
await conn.query(
  'INSERT INTO users (org_id, is_super_admin, name, email, password_hash) VALUES (NULL, 1, ?, ?, ?)',
  [process.env.SUPER_ADMIN_NAME || 'Super Admin', email, await bcrypt.hash(password, 12)]
);

console.log(`Done. Super Admin login: ${email} / ${password}`);
console.log('Change this password after your first login.');
await conn.end();
