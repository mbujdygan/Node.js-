-- Схема БД Kindergarten API. Виконується автоматично при старті (idempotent).

CREATE TABLE IF NOT EXISTS staff (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('educator', 'assistant', 'subject')),
  subjects    TEXT[] NOT NULL DEFAULT '{}',
  salary      NUMERIC(12, 2) CHECK (salary IS NULL OR salary >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'parent', 'teacher')),
  password_hash  TEXT NOT NULL,
  phone          TEXT,
  staff_id       INTEGER REFERENCES staff (id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS groups (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  age           INTEGER NOT NULL CHECK (age BETWEEN 2 AND 5),
  educator_id   INTEGER NOT NULL UNIQUE REFERENCES staff (id),
  assistant_id  INTEGER NOT NULL UNIQUE REFERENCES staff (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS children (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  birth_date        DATE NOT NULL,
  parent_id         INTEGER NOT NULL REFERENCES users (id),
  group_id          INTEGER REFERENCES groups (id) ON DELETE SET NULL,
  discount_percent  INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  payment_plan      TEXT NOT NULL DEFAULT 'monthly' CHECK (payment_plan IN ('monthly', 'yearly')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS children_group_idx ON children (group_id);
CREATE INDEX IF NOT EXISTS children_parent_idx ON children (parent_id);

-- Єдиний рядок з налаштуваннями (ціни, зарплати, ліміти)
CREATE TABLE IF NOT EXISTS settings (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  data  JSONB NOT NULL
);

-- Єдиний рядок з останнім згенерованим розкладом
CREATE TABLE IF NOT EXISTS schedule (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  generated_at  TIMESTAMPTZ NOT NULL,
  data          JSONB NOT NULL
);

-- Журнал усіх змін: стан до і після
CREATE TABLE IF NOT EXISTS history (
  seq           SERIAL PRIMARY KEY,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL,
  collection    TEXT NOT NULL,
  record_id     INTEGER NOT NULL,
  before_state  JSONB,
  after_state   JSONB
);
CREATE INDEX IF NOT EXISTS history_record_idx ON history (collection, record_id);
