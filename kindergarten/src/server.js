'use strict';
const { Store } = require('./store');
const { PgStore } = require('./pgStore');
const { createApp, seedAdmin } = require('./app');

async function main() {
  let store;
  if (process.env.STORAGE === 'memory') {
    // без БД: у пам'яті / JSON-файл (DATA_FILE)
    store = new Store({ file: process.env.DATA_FILE || null });
  } else {
    const { createPool } = require('./db');
    store = await PgStore.connect(createPool());
    console.log(`PostgreSQL connected: ${process.env.PGDATABASE || 'kindergarten_local'}`);
  }
  seedAdmin(store);
  if (store.flush) await store.flush();
  const port = process.env.PORT || 3000;
  createApp(store).listen(port, () => {
    console.log(`Kindergarten API listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
