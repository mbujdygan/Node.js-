'use strict';
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// DATE повертаємо рядком 'YYYY-MM-DD' (без зсуву часових поясів), NUMERIC - числом
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => parseFloat(v));

const DEFAULT_URL = 'postgres://postgres:postgres@localhost:5432/kindergarten_local';

function createPool(url) {
  return new Pool({ connectionString: url || process.env.DATABASE_URL || DEFAULT_URL });
}

/** Створює таблиці, якщо їх ще немає. */
async function migrate(pool) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { createPool, migrate, DEFAULT_URL };
