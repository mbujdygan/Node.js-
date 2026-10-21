'use strict';
const fs = require('fs');
const { DEFAULT_SETTINGS } = require('./config');

const COLLECTIONS = ['users', 'children', 'groups', 'staff'];
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

/**
 * Просте сховище в пам'яті з опційним збереженням у JSON-файл.
 * Кожна зміна пишеться в history (before/after) - зберігаємо всі стани.
 */
class Store {
  constructor({ file } = {}) {
    this.file = file || null;
    this.reset();
    if (this.file && fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    }
  }

  reset() {
    this.data = {
      seq: {},
      settings: clone(DEFAULT_SETTINGS),
      schedule: null,
      history: [],
    };
    COLLECTIONS.forEach((c) => { this.data[c] = []; });
  }

  save() {
    if (this.file) fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  log(actor, action, collection, id, before, after) {
    this.data.history.push({
      seq: this.data.history.length + 1,
      at: new Date().toISOString(),
      actor: actor || 'system',
      action, collection, id,
      before: clone(before),
      after: clone(after),
    });
  }

  list(c) { return this.data[c]; }
  get(c, id) { return this.data[c].find((x) => x.id === Number(id)); }
  find(c, fn) { return this.data[c].find(fn); }
  filter(c, fn) { return this.data[c].filter(fn); }

  insert(c, obj, actor) {
    this.data.seq[c] = (this.data.seq[c] || 0) + 1;
    const rec = { id: this.data.seq[c], ...obj, createdAt: new Date().toISOString() };
    this.data[c].push(rec);
    this.log(actor, 'create', c, rec.id, undefined, rec);
    this.save();
    return rec;
  }

  update(c, id, patch, actor) {
    const rec = this.get(c, id);
    const before = clone(rec);
    Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
    this.log(actor, 'update', c, rec.id, before, rec);
    this.save();
    return rec;
  }

  remove(c, id, actor) {
    const idx = this.data[c].findIndex((x) => x.id === Number(id));
    const [rec] = this.data[c].splice(idx, 1);
    this.log(actor, 'delete', c, rec.id, rec, undefined);
    this.save();
    return rec;
  }

  updateSettings(patch, actor) {
    const before = clone(this.data.settings);
    Object.assign(this.data.settings, patch);
    this.log(actor, 'update', 'settings', 0, before, this.data.settings);
    this.save();
    return this.data.settings;
  }

  setSchedule(schedule, actor) {
    this.data.schedule = schedule;
    this.log(actor, 'generate', 'schedule', 0, undefined, { generatedAt: schedule.generatedAt });
    this.save();
  }
}

module.exports = { Store };
