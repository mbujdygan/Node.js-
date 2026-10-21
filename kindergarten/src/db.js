'use strict';
const { Pool, types } = require('pg');

// Підключення до PostgreSQL (локально: kindergarten_local на localhost:5432).
// Усе перевизначається змінними середовища або DATABASE_URL.
function createPool() {
  // int8 (COUNT тощо) -> number
  types.setTypeParser(20, (v) => parseInt(v, 10));
  if (process.env.DATABASE_URL) return new Pool({ connectionString: process.env.DATABASE_URL });
  return new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'kindergarten_local',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  });
}

module.exports = { createPool };
