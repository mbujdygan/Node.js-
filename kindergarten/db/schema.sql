-- Схема бази kindergarten_local (PostgreSQL). Застосовується автоматично при старті (idempotent).

CREATE TABLE IF NOT EXISTS counters (
  collection TEXT PRIMARY KEY,
  value      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('educator', 'assistant', 'subject')),
  subjects   TEXT[] NOT NULL DEFAULT '{}',
  salary     DOUBLE PRECISION,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'parent', 'teacher')),
  phone         TEXT,
  staff_id      INTEGER,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS groups (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  age          INTEGER NOT NULL,
  educator_id  INTEGER NOT NULL REFERENCES staff(id),
  assistant_id INTEGER NOT NULL REFERENCES staff(id),
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS children (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  birth_date       DATE NOT NULL,
  parent_id        INTEGER NOT NULL REFERENCES users(id),
  group_id         INTEGER REFERENCES groups(id),
  discount_percent INTEGER NOT NULL DEFAULT 0,
  payment_plan     TEXT NOT NULL DEFAULT 'monthly',
  created_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ
);

-- Єдиний рядок: налаштування та поточний розклад (jsonb).
CREATE TABLE IF NOT EXISTS settings (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data JSONB
);

-- Повна історія змін (before/after).
CREATE TABLE IF NOT EXISTS history (
  seq        INTEGER PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_id  INTEGER NOT NULL,
  before     JSONB,
  after      JSONB
);

CREATE INDEX IF NOT EXISTS idx_children_parent ON children(parent_id);
CREATE INDEX IF NOT EXISTS idx_children_group  ON children(group_id);
CREATE INDEX IF NOT EXISTS idx_history_coll    ON history(collection, record_id);
