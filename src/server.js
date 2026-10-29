'use strict';
const { createPool, migrate } = require('./db');
const { Store } = require('./modules/store/store');
const { createApp, seedAdmin } = require('./app');

async function main() {
  const pool = createPool();
  await migrate(pool);
  const store = new Store(pool);
  await store.init();
  await seedAdmin(store);
  const port = process.env.PORT || 3000;
  createApp(store).listen(port, () => {
    console.log(`Kindergarten API listening on http://localhost:${port}`);
  });
}

main().catch((e) => {
  console.error('Не вдалося запустити сервер. Перевір, що PostgreSQL запущений і DATABASE_URL правильний.');
  console.error(e.message);
  process.exit(1);
});
