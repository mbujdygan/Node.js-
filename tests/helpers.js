'use strict';
const request = require('supertest');
const { createPool, migrate } = require('../src/db');
const { Store } = require('../src/store');
const { createApp, seedAdmin } = require('../src/app');

const TEST_URL = process.env.TEST_DATABASE_URL
  || 'postgres://postgres:postgres@localhost:5432/kindergarten_test';
// Захист: тести роблять TRUNCATE, тому працюють ТІЛЬКИ з базою, в назві якої є "test"
if (!/test/i.test(new URL(TEST_URL).pathname)) {
  throw new Error(`Refusing to run tests against non-test database: ${TEST_URL}`);
}

let pool;
const getPool = async () => {
  if (!pool) {
    pool = createPool(TEST_URL);
    await migrate(pool);
  }
  return pool;
};
const closePool = async () => {
  if (pool) { await pool.end(); pool = undefined; }
};

const yearsAgo = (y) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - y);
  d.setDate(d.getDate() - 10); // гарантовано вже мав день народження цього року
  return d.toISOString().slice(0, 10);
};

async function setup() {
  const store = new Store(await getPool());
  await store.reset();
  await seedAdmin(store);
  const app = createApp(store);
  const login = async (username, password) => {
    const r = await request(app).post('/auth/login').send({ username, password });
    return `Bearer ${r.body.token}`;
  };
  const admin = await login('admin', 'admin123');
  const api = (method, url, token, body) => {
    let r = request(app)[method](url);
    if (token) r = r.set('Authorization', token);
    return body ? r.send(body) : r;
  };
  return { app, store, admin, login, api, yearsAgo };
}

// Повний набір: вихователь+помічник+група 2 роки, по викладачу на кожен предмет
async function seedKindergarten(ctx) {
  const { api, admin } = ctx;
  const ids = {};
  const mk = async (body) => (await api('post', '/staff', admin, body)).body;
  ids.educator = (await mk({ name: 'Edu', type: 'educator', username: 'edu', password: 'pw' })).id;
  ids.assistant = (await mk({ name: 'Asst', type: 'assistant' })).id;
  ids.teachers = {};
  for (const sub of ['music', 'english', 'pe', 'wrestling', 'chess']) {
    ids.teachers[sub] = (await mk({ name: `T-${sub}`, type: 'subject', subjects: [sub], username: `t_${sub}`, password: 'pw' })).id;
  }
  ids.group = (await api('post', '/groups', admin, { name: 'Sunflowers', age: 3, educatorId: ids.educator, assistantId: ids.assistant })).body.id;
  ids.parent = (await api('post', '/parents', admin, { username: 'mom', password: 'pw', name: 'Mom' })).body.id;
  ids.parent2 = (await api('post', '/parents', admin, { username: 'dad', password: 'pw', name: 'Dad' })).body.id;
  ids.child = (await api('post', '/children', admin, { name: 'Kid', birthDate: yearsAgo(3), parentId: ids.parent, discountPercent: 10 })).body.id;
  ids.child2 = (await api('post', '/children', admin, { name: 'Kid2', birthDate: yearsAgo(3), parentId: ids.parent2 })).body.id;
  await api('post', `/groups/${ids.group}/children`, admin, { childId: ids.child });
  await api('post', `/groups/${ids.group}/children`, admin, { childId: ids.child2 });
  return ids;
}

module.exports = { setup, seedKindergarten, yearsAgo, getPool, closePool };
