'use strict';
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');
const { DEFAULT_SETTINGS } = require('./config');

const SCHEMA_FILE = path.join(__dirname, '..', 'db', 'schema.sql');

// ключ запису -> колонка (+ SQL-вираз для читання, якщо потрібне перетворення типу)
const TABLES = {
  users: {
    table: 'users',
    cols: [
      ['id', 'id'], ['username', 'username'], ['name', 'name'], ['role', 'role'], ['phone', 'phone'],
      ['staffId', 'staff_id'], ['passwordHash', 'password_hash'], ['createdAt', 'created_at'], ['updatedAt', 'updated_at'],
    ],
  },
  staff: {
    table: 'staff',
    cols: [
      ['id', 'id'], ['name', 'name'], ['type', 'type'], ['subjects', 'subjects'], ['salary', 'salary'],
      ['createdAt', 'created_at'], ['updatedAt', 'updated_at'],
    ],
  },
  groups: {
    table: 'groups',
    cols: [
      ['id', 'id'], ['name', 'name'], ['age', 'age'], ['educatorId', 'educator_id'], ['assistantId', 'assistant_id'],
      ['createdAt', 'created_at'], ['updatedAt', 'updated_at'],
    ],
  },
  children: {
    table: 'children',
    cols: [
      ['id', 'id'], ['name', 'name'], ['birthDate', 'birth_date', 'birth_date::text'], ['parentId', 'parent_id'],
      ['groupId', 'group_id'], ['discountPercent', 'discount_percent'], ['paymentPlan', 'payment_plan'],
      ['createdAt', 'created_at'], ['updatedAt', 'updated_at'],
    ],
  },
};

// необов'язкові поля: NULL у БД = поле відсутнє в записі (як у in-memory версії)
const OPTIONAL = new Set(['updatedAt', 'staffId', 'salary']);

const toRecord = (def, row) => {
  const rec = {};
  def.cols.forEach(([key, col]) => {
    let v = row[col];
    if (v instanceof Date) v = v.toISOString();
    if (v === null && OPTIONAL.has(key)) return;
    rec[key] = v;
  });
  return rec;
};

const upsertSql = (def) => {
  const cols = def.cols.map((c) => c[1]);
  const params = cols.map((_, i) => `$${i + 1}`);
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`);
  return `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${params.join(', ')}) `
    + `ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`;
};

const toParams = (def, rec) => def.cols.map(([key]) => (rec[key] === undefined ? null : rec[key]));

/**
 * Store з тим самим інтерфейсом, але з постійним зберіганням у PostgreSQL.
 * Читання - з кешу в пам'яті (завантажується при старті), кожна зміна
 * однією транзакцією пишеться в таблиці + history. flush() чекає завершення записів.
 */
class PgStore extends Store {
  constructor({ pool }) {
    super();
    this.pool = pool;
    this.ops = [];
    this.chain = Promise.resolve();
    this.last = Promise.resolve();
  }

  static async connect(pool) {
    const store = new PgStore({ pool });
    await store.init();
    return store;
  }

  async init() {
    await this.pool.query(fs.readFileSync(SCHEMA_FILE, 'utf8'));
    await this.load();
    return this;
  }

  async load() {
    const q = (sql) => this.pool.query(sql).then((r) => r.rows);
    for (const [name, def] of Object.entries(TABLES)) {
      const select = def.cols.map(([, col, expr]) => (expr ? `${expr} AS ${col}` : col)).join(', ');
      // eslint-disable-next-line no-await-in-loop
      const rows = await q(`SELECT ${select} FROM ${def.table} ORDER BY id`);
      this.data[name] = rows.map((r) => toRecord(def, r));
    }
    const counters = await q('SELECT collection, value FROM counters');
    counters.forEach((c) => { this.data.seq[c.collection] = c.value; });
    Object.keys(TABLES).forEach((name) => {
      const maxId = this.data[name].reduce((m, r) => Math.max(m, r.id), 0);
      this.data.seq[name] = Math.max(this.data.seq[name] || 0, maxId);
    });

    const settings = await q('SELECT data FROM settings WHERE id = 1');
    this.data.settings = { ...DEFAULT_SETTINGS, ...(settings[0] ? settings[0].data : {}) };
    if (!settings[0]) {
      this.ops.push(['INSERT INTO settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [JSON.stringify(this.data.settings)]]);
    }
    const schedule = await q('SELECT data FROM schedule WHERE id = 1');
    this.data.schedule = schedule[0] ? schedule[0].data : null;

    const history = await q('SELECT seq, at, actor, action, collection, record_id, before, after FROM history ORDER BY seq');
    this.data.history = history.map((h) => ({
      seq: h.seq,
      at: h.at instanceof Date ? h.at.toISOString() : h.at,
      actor: h.actor,
      action: h.action,
      collection: h.collection,
      id: h.record_id,
      before: h.before === null ? undefined : h.before,
      after: h.after === null ? undefined : h.after,
    }));
    this.save();
    await this.flush();
  }

  /** Кожна зміна проходить через log(): тут збираємо SQL-операції для транзакції. */
  log(actor, action, collection, id, before, after) {
    super.log(actor, action, collection, id, before, after);
    const h = this.data.history[this.data.history.length - 1];
    this.ops.push([
      'INSERT INTO history (seq, at, actor, action, collection, record_id, before, after) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [h.seq, h.at, h.actor, h.action, h.collection, h.id,
        h.before === undefined ? null : JSON.stringify(h.before),
        h.after === undefined ? null : JSON.stringify(h.after)],
    ]);

    const def = TABLES[collection];
    if (def && action === 'delete') {
      this.ops.push([`DELETE FROM ${def.table} WHERE id = $1`, [id]]);
    } else if (def) {
      if (action === 'create') {
        this.ops.push(['INSERT INTO counters (collection, value) VALUES ($1, $2) ON CONFLICT (collection) DO UPDATE SET value = EXCLUDED.value',
          [collection, this.data.seq[collection]]]);
      }
      this.ops.push([upsertSql(def), toParams(def, after)]);
    } else if (collection === 'settings') {
      this.ops.push(['INSERT INTO settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
        [JSON.stringify(this.data.settings)]]);
    } else if (collection === 'schedule') {
      this.ops.push(['INSERT INTO schedule (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
        [JSON.stringify(this.data.schedule)]]);
    }
  }

  /** Викликається наприкінці кожної зміни: ставить накопичені операції в чергу як одну транзакцію. */
  save() {
    const ops = this.ops;
    this.ops = [];
    if (!ops.length) return;
    const run = this.chain.then(() => this.transaction(ops));
    this.chain = run.catch((err) => {
      // eslint-disable-next-line no-console
      console.error('PostgreSQL write failed:', err.message);
    });
    this.last = run;
  }

  async transaction(ops) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [sql, params] of ops) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(sql, params);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Чекає, поки останній запис буде збережено (кидає помилку, якщо транзакція не вдалась). */
  flush() {
    return this.last;
  }

  close() {
    return this.flush().catch(() => {}).then(() => this.pool.end());
  }
}

module.exports = { PgStore };
