import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { currentTz, tzOffset } from './context.js';

dotenv.config();

const raw = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ibt_crm',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  dateStrings: true,
});

/** Every DB session runs in the organisation's timezone: NOW(), CURDATE() and TIMESTAMP columns follow its clock. */
async function prepare(conn) {
  const off = tzOffset(currentTz());
  const core = conn.connection || conn; // remember per physical connection
  if (core.__ibtTz !== off) {
    await conn.query('SET time_zone = ?', [off]);
    core.__ibtTz = off;
  }
  return conn;
}
async function withConn(fn) {
  const conn = await prepare(await raw.getConnection());
  try { return await fn(conn); } finally { conn.release(); }
}
export const pool = {
  query: (sql, params) => withConn((c) => c.query(sql, params)),
  execute: (sql, params) => withConn((c) => c.execute(sql, params)),
  getConnection: async () => prepare(await raw.getConnection()),
  end: () => raw.end(),
};

/** Run a query and return rows. */
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Run a query and return the first row or null. */
export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/** Run work inside a transaction. `fn` receives a connection with .execute(). */
export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
