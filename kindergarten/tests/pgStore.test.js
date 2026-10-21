'use strict';
const request = require('supertest');
const { PgStore } = require('../src/pgStore');
const { createApp, seedAdmin } = require('../src/app');

/** Мінімальна імітація PostgreSQL: розуміє лише SQL, який генерує PgStore. */
function fakePool({ failOn } = {}) {
  const db = { tables: {}, settings: null, schedule: null, counters: {}, history: [], queries: [], ended: false };
  const table = (n) => (db.tables[n] = db.tables[n] || new Map());
  const exec = (sql, params = []) => {
    db.queries.push(sql);
    if (failOn && sql.includes(failOn)) throw new Error('boom');
    let m;
    if ((m = /^INSERT INTO (users|staff|groups|children) \(([^)]+)\)/.exec(sql))) {
      const cols = m[2].split(', ');
      const row = {};
      cols.forEach((c, i) => { row[c] = params[i]; });
      table(m[1]).set(row.id, row);
      return { rows: [] };
    }
    if ((m = /^DELETE FROM (\w+) WHERE id = \$1/.exec(sql))) { table(m[1]).delete(params[0]); return { rows: [] }; }
    if (sql.startsWith('INSERT INTO counters')) { db.counters[params[0]] = params[1]; return { rows: [] }; }
    if (sql.startsWith('INSERT INTO settings')) {
      if (!sql.includes('DO NOTHING') || !db.settings) db.settings = JSON.parse(params[0]);
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO schedule')) { db.schedule = JSON.parse(params[0]); return { rows: [] }; }
    if (sql.startsWith('INSERT INTO history')) {
      db.history.push({
        seq: params[0], at: new Date(params[1]), actor: params[2], action: params[3], collection: params[4],
        record_id: params[5], before: params[6] && JSON.parse(params[6]), after: params[7] && JSON.parse(params[7]),
      });
      return { rows: [] };
    }
    if ((m = /^SELECT .* FROM (users|staff|groups|children) ORDER BY id/.exec(sql))) {
      return { rows: [...table(m[1]).values()].sort((a, b) => a.id - b.id).map((r) => ({
        ...r,
        created_at: r.created_at ? new Date(r.created_at) : r.created_at,
        updated_at: r.updated_at ? new Date(r.updated_at) : r.updated_at,
      })) };
    }
    if (sql.startsWith('SELECT collection, value')) return { rows: Object.entries(db.counters).map(([collection, value]) => ({ collection, value })) };
    if (sql.startsWith('SELECT data FROM settings')) return { rows: db.settings ? [{ data: db.settings }] : [] };
    if (sql.startsWith('SELECT data FROM schedule')) return { rows: db.schedule ? [{ data: db.schedule }] : [] };
    if (sql.startsWith('SELECT seq')) return { rows: db.history };
    return { rows: [] }; // BEGIN / COMMIT / ROLLBACK / schema
  };
  const query = async (sql, params) => exec(sql, params);
  const pool = {
    query,
    connect: async () => ({ query, release: () => {} }),
    end: async () => { db.ended = true; },
  };
  return { pool, db };
}

const yearsAgo = (y) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - y);
  d.setDate(d.getDate() - 10);
  return d.toISOString().slice(0, 10);
};

describe('PgStore', () => {
  test('пише в БД і відновлює стан після перезапуску', async () => {
    const { pool, db } = fakePool();
    const store = await PgStore.connect(pool);
    seedAdmin(store);
    const app = createApp(store);
    const login = await request(app).post('/auth/login').send({ username: 'admin', password: 'admin123' });
    const auth = `Bearer ${login.body.token}`;
    const api = (m, u, b) => request(app)[m](u).set('Authorization', auth).send(b);

    const edu = (await api('post', '/staff', { name: 'E', type: 'educator', salary: 50000, username: 'e', password: 'p' })).body;
    const asst = (await api('post', '/staff', { name: 'A', type: 'assistant' })).body;
    const g = (await api('post', '/groups', { name: 'G', age: 3, educatorId: edu.id, assistantId: asst.id })).body;
    const p = (await api('post', '/parents', { username: 'mom', password: 'p', name: 'Mom', phone: '1' })).body;
    const c = (await api('post', '/children', { name: 'K', birthDate: yearsAgo(3), parentId: p.id, discountPercent: 10 })).body;
    await api('post', `/groups/${g.id}/children`, { childId: c.id });
    await api('patch', '/settings', { baseTuition: 111 });
    expect((await api('post', '/schedule/generate')).status).toBeLessThan(300);
    const tmp = (await api('post', '/children', { name: 'T', birthDate: yearsAgo(4), parentId: p.id })).body;
    expect((await api('delete', `/children/${tmp.id}`)).status).toBe(204);

    const store2 = await PgStore.connect(pool);
    expect(store2.data.users.map((u) => u.username)).toEqual(['admin', 'e', 'mom']);
    expect(store2.get('staff', edu.id)).toMatchObject({ name: 'E', salary: 50000, type: 'educator' });
    expect(store2.get('staff', asst.id).salary).toBeUndefined();
    expect(store2.get('users', p.id).phone).toBe('1');
    expect(store2.find('users', (u) => u.username === 'e').staffId).toBe(edu.id);
    expect(store2.find('users', (u) => u.username === 'admin').staffId).toBeUndefined();
    expect(store2.get('groups', g.id)).toMatchObject({ educatorId: edu.id, assistantId: asst.id });
    expect(store2.list('children')).toHaveLength(1);
    expect(store2.get('children', c.id)).toMatchObject({ birthDate: yearsAgo(3), groupId: g.id, discountPercent: 10 });
    expect(store2.data.settings.baseTuition).toBe(111);
    expect(store2.data.schedule).toEqual(JSON.parse(JSON.stringify(store.data.schedule)));
    expect(store2.data.history).toHaveLength(store.data.history.length);
    expect(store2.data.history[0].before).toBeUndefined();
    expect(store2.data.seq.children).toBe(tmp.id); // лічильник не відкочується після видалення

    const next = store2.insert('children', { name: 'N' }, 'x');
    expect(next.id).toBe(tmp.id + 1);
    await store2.close();
    expect(db.ended).toBe(true);
  });

  test('помилка запису: 500 клієнту, ROLLBACK, сервер живий', async () => {
    const { pool, db } = fakePool({ failOn: 'INSERT INTO groups' });
    const store = await PgStore.connect(pool);
    seedAdmin(store);
    await store.flush();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp(store);
    const login = await request(app).post('/auth/login').send({ username: 'admin', password: 'admin123' });
    const auth = `Bearer ${login.body.token}`;
    const e = (await request(app).post('/staff').set('Authorization', auth).send({ name: 'E', type: 'educator' })).body;
    const a = (await request(app).post('/staff').set('Authorization', auth).send({ name: 'A', type: 'assistant' })).body;
    const r = await request(app).post('/groups').set('Authorization', auth)
      .send({ name: 'G', age: 3, educatorId: e.id, assistantId: a.id });
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('Database write failed');
    expect(db.queries).toContain('ROLLBACK');
    expect((await request(app).get('/health')).status).toBe(200);
    spy.mockRestore();
  });

  test('порожня зміна не відкриває транзакцію', async () => {
    const { pool, db } = fakePool();
    const store = await PgStore.connect(pool);
    const before = db.queries.length;
    store.save();
    expect(db.queries.length).toBe(before);
  });
});
