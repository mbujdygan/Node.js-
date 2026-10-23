'use strict';
const { DEFAULT_SETTINGS } = require('../../config');

// Колекції -> дозволені поля (camelCase у коді, snake_case у БД)
const TABLES = {
  users: ['username', 'name', 'role', 'passwordHash', 'phone', 'staffId'],
  staff: ['name', 'type', 'subjects', 'salary'],
  groups: ['name', 'age', 'educatorId', 'assistantId'],
  children: ['name', 'birthDate', 'parentId', 'groupId', 'discountPercent', 'paymentPlan'],
};

const snake = (k) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const fromRow = (row) => Object.fromEntries(
  Object.entries(row).map(([k, v]) => [camel(k), v instanceof Date ? v.toISOString() : v]),
);
const MAX_INT = 2147483647;

/**
 * Шар доступу до PostgreSQL. Кожна зміна виконується в транзакції разом із записом у history.
 * Налаштування кешуються в пам'яті процесу (store.settings) і оновлюються при зміні.
 */
class Store {
  constructor(pool) {
    this.pool = pool;
    this._settings = { ...DEFAULT_SETTINGS };
  }

  get settings() { return this._settings; }

  async init() {
    await this.pool.query(
      'INSERT INTO settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
      [JSON.stringify(DEFAULT_SETTINGS)],
    );
    const { rows } = await this.pool.query('SELECT data FROM settings WHERE id = 1');
    this._settings = { ...DEFAULT_SETTINGS, ...rows[0].data };
  }

  /** Повне очищення всіх таблиць. Використовується лише в тестах. */
  async reset() {
    await this.pool.query('TRUNCATE history, schedule, children, groups, users, staff, settings RESTART IDENTITY CASCADE');
    await this.init();
  }

  async tx(fn) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const result = await fn(db);
      await db.query('COMMIT');
      return result;
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  }

  static table(c) {
    if (!TABLES[c]) throw new Error(`Unknown collection: ${c}`);
    return c;
  }

  static columns(c, keys) {
    keys.forEach((k) => {
      if (!TABLES[c].includes(k)) throw new Error(`Unknown column ${c}.${k}`);
    });
    return keys.map(snake);
  }

  async log(db, actor, action, collection, id, before, after) {
    await db.query(
      `INSERT INTO history (actor, action, collection, record_id, before_state, after_state)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actor || 'system', action, collection, id,
        before === undefined ? null : JSON.stringify(before),
        after === undefined ? null : JSON.stringify(after)],
    );
  }

  // ---------- читання ----------
  async list(c) {
    const { rows } = await this.pool.query(`SELECT * FROM ${Store.table(c)} ORDER BY id`);
    return rows.map(fromRow);
  }

  async get(c, id) {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1 || n > MAX_INT) return undefined;
    const { rows } = await this.pool.query(`SELECT * FROM ${Store.table(c)} WHERE id = $1`, [n]);
    return rows[0] && fromRow(rows[0]);
  }

  /** where('children', { groupId: 1, parentId: 2 }) - фільтр за рівністю. */
  async where(c, conds) {
    const keys = Object.keys(conds);
    const cols = Store.columns(c, keys);
    const sql = `SELECT * FROM ${Store.table(c)} WHERE ${cols.map((col, i) => `${col} = $${i + 1}`).join(' AND ')} ORDER BY id`;
    const { rows } = await this.pool.query(sql, keys.map((k) => conds[k]));
    return rows.map(fromRow);
  }

  async one(c, conds) {
    return (await this.where(c, conds))[0];
  }

  // ---------- запис ----------
  async insert(c, obj, actor) {
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    const cols = Store.columns(c, keys);
    const sql = keys.length
      ? `INSERT INTO ${c} (${cols.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`
      : `INSERT INTO ${c} DEFAULT VALUES RETURNING *`;
    return this.tx(async (db) => {
      const rec = fromRow((await db.query(sql, keys.map((k) => obj[k]))).rows[0]);
      await this.log(db, actor, 'create', c, rec.id, undefined, rec);
      return rec;
    });
  }

  async update(c, id, patch, actor) {
    const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
    const cols = Store.columns(c, keys);
    const sets = [...cols.map((col, i) => `${col} = $${i + 1}`), 'updated_at = now()'];
    return this.tx(async (db) => {
      const cur = await db.query(`SELECT * FROM ${Store.table(c)} WHERE id = $1 FOR UPDATE`, [id]);
      const before = fromRow(cur.rows[0]);
      const res = await db.query(
        `UPDATE ${c} SET ${sets.join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
        [...keys.map((k) => patch[k]), id],
      );
      const rec = fromRow(res.rows[0]);
      await this.log(db, actor, 'update', c, rec.id, before, rec);
      return rec;
    });
  }

  async remove(c, id, actor) {
    return this.tx(async (db) => {
      const res = await db.query(`DELETE FROM ${Store.table(c)} WHERE id = $1 RETURNING *`, [id]);
      const rec = fromRow(res.rows[0]);
      await this.log(db, actor, 'delete', c, rec.id, rec, undefined);
      return rec;
    });
  }

  // ---------- налаштування, розклад, історія ----------
  async updateSettings(patch, actor) {
    return this.tx(async (db) => {
      const cur = await db.query('SELECT data FROM settings WHERE id = 1 FOR UPDATE');
      const before = { ...DEFAULT_SETTINGS, ...cur.rows[0].data };
      const next = { ...before, ...patch };
      await db.query('UPDATE settings SET data = $1 WHERE id = 1', [JSON.stringify(next)]);
      await this.log(db, actor, 'update', 'settings', 0, before, next);
      this._settings = next;
      return next;
    });
  }

  async getSchedule() {
    const { rows } = await this.pool.query('SELECT data FROM schedule WHERE id = 1');
    return rows[0] ? rows[0].data : null;
  }

  async setSchedule(schedule, actor) {
    return this.tx(async (db) => {
      await db.query(
        `INSERT INTO schedule (id, generated_at, data) VALUES (1, $1, $2)
         ON CONFLICT (id) DO UPDATE SET generated_at = EXCLUDED.generated_at, data = EXCLUDED.data`,
        [schedule.generatedAt, JSON.stringify(schedule)],
      );
      await this.log(db, actor, 'generate', 'schedule', 0, undefined, { generatedAt: schedule.generatedAt });
    });
  }

  async getHistory({ collection, id } = {}) {
    const where = [];
    const params = [];
    if (collection) { params.push(collection); where.push(`collection = $${params.length}`); }
    if (id !== undefined) {
      const n = Number(id);
      if (!Number.isInteger(n) || n > MAX_INT) return [];
      params.push(n);
      where.push(`record_id = $${params.length}`);
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM history ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq`,
      params,
    );
    return rows.map((r) => ({
      seq: r.seq,
      at: r.at.toISOString(),
      actor: r.actor,
      action: r.action,
      collection: r.collection,
      id: r.record_id,
      before: r.before_state === null ? undefined : r.before_state,
      after: r.after_state === null ? undefined : r.after_state,
    }));
  }
}

module.exports = { Store };
