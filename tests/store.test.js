'use strict';
const { Store } = require('../src/store');
const { createPool, migrate, DEFAULT_URL } = require('../src/db');
const { DEFAULT_SETTINGS } = require('../src/config');
const { setup, getPool, closePool } = require('./helpers');

let store;
beforeEach(async () => {
  store = new Store(await getPool());
  await store.reset();
});
afterAll(closePool);

describe('Store (PostgreSQL)', () => {
  test('insert/get/where/one/list', async () => {
    const st = await store.insert('staff', { name: 'A', type: 'educator', subjects: [] }, 'tester');
    expect(st.id).toBe(1);
    expect(st.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await store.get('staff', st.id)).name).toBe('A');
    expect(await store.get('staff', 999)).toBeUndefined();
    expect(await store.get('staff', 'abc')).toBeUndefined();
    expect(await store.get('staff', 0)).toBeUndefined();
    expect((await store.where('staff', { type: 'educator' }))).toHaveLength(1);
    expect(await store.one('staff', { type: 'assistant' })).toBeUndefined();
    expect(await store.list('staff')).toHaveLength(1);
  });

  test('історія: create/update/delete з before/after та актором', async () => {
    const r = await store.insert('staff', { name: 'A', type: 'assistant' }, 'tester');
    await store.update('staff', r.id, { name: 'B' }, 'tester');
    await store.remove('staff', r.id, 'tester');
    await store.insert('staff', { name: 'X', type: 'assistant' });
    const h = await store.getHistory();
    expect(h.map((x) => x.action)).toEqual(['create', 'update', 'delete', 'create']);
    expect(h[1].before.name).toBe('A');
    expect(h[1].after.name).toBe('B');
    expect(h[0].before).toBeUndefined();
    expect(h[2].after).toBeUndefined();
    expect(h[3].actor).toBe('system');
    expect(await store.getHistory({ collection: 'staff', id: r.id })).toHaveLength(3);
    expect(await store.getHistory({ collection: 'users' })).toHaveLength(0);
  });

  test('невідома колекція або колонка - помилка програмування', async () => {
    await expect(store.list('hackers; DROP TABLE users')).rejects.toThrow('Unknown collection');
    await expect(store.insert('staff', { name: 'A', type: 'educator', evil: 1 })).rejects.toThrow('Unknown column');
  });

  test('insert без полів використовує DEFAULT VALUES (і порушує NOT NULL)', async () => {
    await expect(store.insert('staff', {})).rejects.toMatchObject({ code: '23502' });
  });

  test('транзакція відкочується при помилці (історія теж)', async () => {
    await expect(store.insert('staff', { name: 'A', type: 'wrong' })).rejects.toMatchObject({ code: '23514' });
    expect(await store.list('staff')).toHaveLength(0);
    expect(await store.getHistory()).toHaveLength(0);
  });

  test('обмеження БД: унікальний логін, зовнішні ключі', async () => {
    await store.insert('users', { username: 'u', name: 'U', role: 'parent', passwordHash: 'x' });
    await expect(store.insert('users', { username: 'u', name: 'U', role: 'parent', passwordHash: 'x' }))
      .rejects.toMatchObject({ code: '23505' });
    await expect(store.insert('children', { name: 'K', birthDate: '2023-01-01', parentId: 999 }))
      .rejects.toMatchObject({ code: '23503' });
  });

  test('налаштування зберігаються в БД та підхоплюються новим екземпляром', async () => {
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
    await store.updateSettings({ baseTuition: 1 }, 'x');
    const other = new Store(await getPool());
    await other.init();
    expect(other.settings.baseTuition).toBe(1);
    expect((await store.getHistory({ collection: 'settings' }))[0].before.baseTuition).toBe(15000);
  });

  test('розклад зберігається та оновлюється', async () => {
    expect(await store.getSchedule()).toBeNull();
    await store.setSchedule({ generatedAt: new Date().toISOString(), days: { 1: {} } }, 'x');
    await store.setSchedule({ generatedAt: new Date().toISOString(), days: { 2: {} } }, 'x');
    expect(Object.keys((await store.getSchedule()).days)).toEqual(['2']);
  });

  test('ON DELETE: видалення групи не видаляє дітей, а знімає groupId', async () => {
    const e = await store.insert('staff', { name: 'E', type: 'educator' });
    const a = await store.insert('staff', { name: 'A', type: 'assistant' });
    const g = await store.insert('groups', { name: 'G', age: 3, educatorId: e.id, assistantId: a.id });
    const p = await store.insert('users', { username: 'p', name: 'P', role: 'parent', passwordHash: 'x' });
    const c = await store.insert('children', { name: 'K', birthDate: '2023-01-01', parentId: p.id, groupId: g.id });
    expect(c.birthDate).toBe('2023-01-01');
    await store.remove('groups', g.id, 'x');
    expect((await store.get('children', c.id)).groupId).toBeNull();
  });
});

describe('db helpers', () => {
  test('createPool: аргумент, env або значення за замовчуванням', async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const p1 = createPool();
    expect(p1.options.connectionString).toBe(DEFAULT_URL);
    process.env.DATABASE_URL = 'postgres://u:p@h:1/db';
    const p2 = createPool();
    expect(p2.options.connectionString).toBe('postgres://u:p@h:1/db');
    if (saved === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved;
    await Promise.all([p1.end(), p2.end()]);
  });
  test('migrate можна запускати повторно', async () => {
    await migrate(await getPool());
    await migrate(await getPool());
  });
  test('setup() видає чистий садок з адміном', async () => {
    const ctx = await setup();
    expect((await ctx.store.list('users'))).toHaveLength(1);
  });
});
