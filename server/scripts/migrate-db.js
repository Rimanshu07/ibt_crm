/** Applies safe, additive database migrations. */
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
  database: dbName,
});

function splitDefinitions(body) {
  const definitions = [];
  let start = 0;
  let depth = 0;
  let quote = null;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (quote) {
      if (char === quote && body[i - 1] !== '\\') quote = null;
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
    } else if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      definitions.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }

  definitions.push(body.slice(start).trim());
  return definitions;
}

function parseTables(schema) {
  const tables = [];
  const tablePattern = /CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\n\);/gi;

  for (const match of schema.matchAll(tablePattern)) {
    const cleanBody = match[2].replace(/--[^\r\n]*/g, '');
    const definitions = splitDefinitions(cleanBody);
    const columns = definitions
      .map((definition) => {
        const column = /^([A-Za-z_][A-Za-z0-9_]*)\s+/.exec(definition);
        if (!column || /^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|CHECK)$/i.test(column[1])) return null;
        return { name: column[1], definition };
      })
      .filter(Boolean);

    tables.push({
      name: match[1],
      createStatement: match[0].replace(/^CREATE TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS '),
      columns,
    });
  }

  if (tables.length === 0) throw new Error('No CREATE TABLE statements found in server/db/schema.sql');
  return tables;
}

try {
  const tables = parseTables(await fs.readFile(path.join(dir, '../db/schema.sql'), 'utf8'));
  const [existingTables] = await conn.execute(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = ?',
    [dbName]
  );
  const existingTableNames = new Set(existingTables.map((row) => row.TABLE_NAME));

  for (const table of tables) {
    if (!existingTableNames.has(table.name)) {
      await conn.query(table.createStatement);
      console.log(`Created table ${table.name}.`);
    }
  }

  const [existingColumns] = await conn.execute(
    'SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ?',
    [dbName]
  );
  const columnsByTable = new Map();
  for (const row of existingColumns) {
    if (!columnsByTable.has(row.TABLE_NAME)) columnsByTable.set(row.TABLE_NAME, new Set());
    columnsByTable.get(row.TABLE_NAME).add(row.COLUMN_NAME);
  }

  for (const table of tables) {
    const existing = columnsByTable.get(table.name);
    for (const column of table.columns) {
      if (!existing?.has(column.name)) {
        await conn.query(
          `ALTER TABLE \`${table.name}\` ADD COLUMN ${column.definition}`
        );
        console.log(`Added ${table.name}.${column.name}.`);
      }
    }
  }

  console.log('Database migration complete; existing tables and records were preserved.');
} finally {
  await conn.end();
}
