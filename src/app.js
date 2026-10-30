'use strict';
const express = require('express');
const { hashPassword, verifyPassword, signToken, authenticate, requireRole } = require('./modules/auth/auth');
const { validateManager, validateParent, validateStaff } = require('./modules/auth/auth.validation');
const { HttpError, bad, notFound, forbidden, unauthorized, conflict } = require('./errors');
const { ageOf, calcBilling } = require('./modules/billing/billing');
const { generateSchedule, viewSchedule, teacherView } = require('./modules/schedule/schedule');
const { calcProfit, optimize } = require('./modules/finance/finance');
const { createParentsRouter } = require('./modules/parents/parents.routes');
const { createChildrenRouter } = require('./modules/children/children.routes');

const PLANS = ['monthly', 'yearly'];
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const publicUser = ({ passwordHash, ...u }) => u;

function createApp(store) {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) throw bad('username and password are required');
    const user = await store.one('users', { username });
    if (!user || !verifyPassword(password, user.passwordHash)) throw unauthorized('Invalid credentials');
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  app.get('/auth/me', authenticate, async (req, res) => {
    res.json(publicUser(await store.get('users', req.user.id)));
  });

  // Підключаємо новий модуль /children
  app.use('/children', createChildrenRouter(store));

  const s = () => store.settings;
  const actor = (req) => `${req.user.role}:${req.user.username}`;
  const staffAdmin = [authenticate, requireRole('admin')];
  const staffMgr = [authenticate, requireRole('admin', 'manager')];

  const getGroup = async (id) => {
    const g = await store.get('groups', id);
    if (!g) throw notFound('Group not found');
    return g;
  };

  const staffOfType = async (id, type, label) => {
    const st = await store.get('staff', id);
    if (!st) throw notFound(`${label} not found`);
    if (st.type !== type) throw bad(`${label} must be staff of type "${type}"`);
    return st;
  };

  app.post('/managers', ...staffAdmin, validateManager, async (req, res) => {
    const { username, password, name } = req.body;
    if (await store.one('users', { username })) throw conflict('Username already exists');
    const u = await store.insert('users', { username, name, role: 'manager', passwordHash: hashPassword(password) }, actor(req));
    res.status(201).json(publicUser(u));
  });

   // ---------- parents ----------
  app.use('/parents', createParentsRouter(store));

  app.post('/staff', ...staffAdmin, validateStaff, async (req, res) => {
    const { name, type, subjects, salary, username, password } = req.body;
    let subs = [];
    if (type === 'subject') {
      if (!Array.isArray(subjects) || !subjects.length
        || !subjects.every((x) => s().subjects.includes(x))) {
        throw bad(`subjects must be a non-empty subset of ${s().subjects.join(', ')}`);
      }
      subs = subjects;
    }
    if (username && await store.one('users', { username })) throw conflict('Username already exists');
    const st = await store.insert('staff', { name, type, subjects: subs, salary: salary === undefined ? undefined : Number(salary) }, actor(req));
    if (username) {
      const u = await store.insert('users', { username, name, role: 'teacher', staffId: st.id, passwordHash: hashPassword(password) }, actor(req));
      return res.status(201).json({ ...st, userId: u.id });
    }
    return res.status(201).json(st);
  });

  app.get('/staff', ...staffMgr, async (req, res) => res.json(await store.list('staff')));

  app.patch('/staff/:id', ...staffAdmin, async (req, res) => {
    const st = await store.get('staff', req.params.id);
    if (!st) throw notFound('Staff not found');
    const { name, subjects, salary } = req.body || {};
    const patch = {};
    if (name !== undefined) { if (!isStr(name)) throw bad('name must be a string'); patch.name = name; }
    if (salary !== undefined) { if (!(Number(salary) >= 0)) throw bad('salary must be a non-negative number'); patch.salary = Number(salary); }
    if (subjects !== undefined) {
      if (st.type !== 'subject' || !Array.isArray(subjects) || !subjects.length
        || !subjects.every((x) => s().subjects.includes(x))) throw bad('invalid subjects');
      patch.subjects = subjects;
    }
    res.json(await store.update('staff', st.id, patch, actor(req)));
  });

  app.delete('/staff/:id', ...staffAdmin, async (req, res) => {
    const st = await store.get('staff', req.params.id);
    if (!st) throw notFound('Staff not found');
    const used = (await store.list('groups')).some((g) => g.educatorId === st.id || g.assistantId === st.id);
    if (used) throw conflict('Staff member is assigned to a group');
    await store.remove('staff', st.id, actor(req));
    res.status(204).end();
  });

  app.get('/staff/:id/schedule', authenticate, async (req, res) => {
    const st = await store.get('staff', req.params.id);
    if (!st) throw notFound('Staff not found');
    const own = req.user.role === 'teacher' && req.user.staffId === st.id;
    if (!own && !['admin', 'manager'].includes(req.user.role)) throw forbidden('Not your schedule');
    res.json(teacherView(await store.getSchedule(), st.id));
  });

  app.post('/groups', ...staffAdmin, async (req, res) => {
    const { name, age, educatorId, assistantId } = req.body || {};
    if (!isStr(name)) throw bad('name is required');
    if (!Number.isInteger(age) || age < s().minAge || age > s().maxAge) {
      throw bad(`age must be an integer between ${s().minAge} and ${s().maxAge}`);
    }
    const edu = await staffOfType(educatorId, 'educator', 'Educator');
    const asst = await staffOfType(assistantId, 'assistant', 'Assistant');
    const busy = (await store.list('groups')).some((g) => g.educatorId === edu.id || g.assistantId === asst.id);
    if (busy) throw conflict('Educator or assistant already assigned to another group');
    res.status(201).json(await store.insert('groups', { name, age, educatorId: edu.id, assistantId: asst.id }, actor(req)));
  });

  app.get('/groups', authenticate, requireRole('admin', 'manager', 'teacher'), async (req, res) => {
    let groups = await store.list('groups');
    if (req.user.role === 'teacher') {
      groups = groups.filter((g) => g.educatorId === req.user.staffId || g.assistantId === req.user.staffId);
    }
    const children = (await store.list('children')) || [];
    res.json(groups.map((g) => ({
      ...g, childrenCount: children.filter((c) => c && c.groupId === g.id).length,
    })));
  });

  app.patch('/groups/:id', ...staffAdmin, async (req, res) => {
    const g = await getGroup(req.params.id);
    const { name, educatorId, assistantId } = req.body || {};
    const patch = {};
    if (name !== undefined) { if (!isStr(name)) throw bad('name must be a string'); patch.name = name; }
    const others = (await store.list('groups')).filter((x) => x.id !== g.id);
    const clash = (id) => others.some((x) => x.educatorId === id || x.assistantId === id);
    if (educatorId !== undefined) {
      const e = await staffOfType(educatorId, 'educator', 'Educator');
      if (clash(e.id)) throw conflict('Educator already assigned to another group');
      patch.educatorId = e.id;
    }
    if (assistantId !== undefined) {
      const a = await staffOfType(assistantId, 'assistant', 'Assistant');
      if (clash(a.id)) throw conflict('Assistant already assigned to another group');
      patch.assistantId = a.id;
    }
    res.json(await store.update('groups', g.id, patch, actor(req)));
  });

  app.delete('/groups/:id', ...staffAdmin, async (req, res) => {
    const g = await getGroup(req.params.id);
    if ((await store.where('children', { groupId: g.id })).length) throw conflict('Group is not empty');
    await store.remove('groups', g.id, actor(req));
    res.status(204).end();
  });

  app.post('/groups/:id/children', ...staffMgr, async (req, res) => {
    const g = await getGroup(req.params.id);
    const child = await store.get('children', (req.body || {}).childId);
    if (!child) throw notFound('Child not found');
    if (ageOf(child.birthDate) !== g.age) throw conflict(`Child age ${ageOf(child.birthDate)} does not match group age ${g.age}`);
    const size = (await store.where('children', { groupId: g.id })).filter((c) => c.id !== child.id).length;
    if (size >= s().maxGroupSize) throw conflict(`Group is full (max ${s().maxGroupSize})`);
    res.json(await store.update('children', child.id, { groupId: g.id }, actor(req)));
  });

  app.delete('/groups/:id/children/:childId', ...staffMgr, async (req, res) => {
    const g = await getGroup(req.params.id);
    const child = await store.get('children', req.params.childId);
    if (!child || child.groupId !== g.id) throw notFound('Child is not in this group');
    res.json(await store.update('children', child.id, { groupId: null }, actor(req)));
  });

  app.post('/schedule/generate', ...staffMgr, async (req, res) => {
    const groups = await store.list('groups');
    if (!groups.length) throw conflict('No groups to schedule');
    const { schedule, conflicts } = generateSchedule(groups, await store.list('staff'), s());
    await store.setSchedule(schedule, actor(req));
    res.status(conflicts.length ? 207 : 201).json({ generatedAt: schedule.generatedAt, groups: groups.length, conflicts });
  });

  app.get('/schedule', authenticate, async (req, res) => {
    const { role, id, staffId } = req.user;
    const schedule = await store.getSchedule();
    if (role === 'teacher') return res.json(teacherView(schedule, staffId));
    let ids = (await store.list('groups')).map((g) => g.id);
    if (role === 'parent') {
      const kids = await store.where('children', { parentId: id });
      ids = [...new Set(kids.filter((c) => c.groupId).map((c) => c.groupId))];
    }
    return res.json(viewSchedule(schedule, ids));
  });

  app.get('/profit', ...staffAdmin, async (req, res) => res.json(await calcProfit(store)));

  app.get('/profit/groups/:id', ...staffAdmin, async (req, res) => {
    const g = await getGroup(req.params.id);
    res.json((await calcProfit(store)).groups.find((x) => x.groupId === g.id));
  });

  app.get('/optimization', ...staffAdmin, async (req, res) => res.json(await optimize(store)));

  app.get('/settings', ...staffMgr, (req, res) => res.json(s()));

  app.patch('/settings', ...staffAdmin, async (req, res) => {
    const body = req.body || {};
    const numeric = ['baseTuition', 'prepayDiscountPercent', 'mealPriceForAge2', 'mealPriceStepPerYear', 'mealCostPercent',
      'workDaysPerMonth', 'teacherSalary', 'managerSalary', 'managersOnPayroll', 'roomRentPerMonth', 'maxGroupSize', 'teacherMaxLessonsPerDay'];
    const patch = {};
    Object.keys(body).forEach((k) => {
      if (numeric.includes(k)) {
        if (typeof body[k] !== 'number' || !(body[k] >= 0)) throw bad(`${k} must be a non-negative number`);
        patch[k] = body[k];
      } else if (k === 'allowedDiscounts') {
        if (!Array.isArray(body[k]) || !body[k].every((d) => typeof d === 'number' && d >= 0 && d <= 100)) throw bad('allowedDiscounts must be an array of percents');
        patch[k] = body[k];
      } else {
        throw bad(`Unknown or read-only setting: ${k}`);
      }
    });
    res.json(await store.updateSettings(patch, actor(req)));
  });

  app.get('/history', ...staffAdmin, async (req, res) => {
    const { collection, id } = req.query;
    res.json(await store.getHistory({ collection, id }));
  });

  app.use((req, res, next) => next(notFound('Route not found')));

  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.code === '23505') return res.status(409).json({ error: 'Record already exists' });
    if (err.code === '23503') return res.status(409).json({ error: 'Related record conflict' });
    if (err.code === '23514' || err.code === '22P02' || err.code === '22003') {
      return res.status(400).json({ error: 'Invalid value' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

async function seedAdmin(store) {
  if (!(await store.one('users', { role: 'admin' }))) {
    await store.insert('users', {
      username: process.env.ADMIN_USER || 'admin',
      name: 'Administrator',
      role: 'admin',
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD || 'admin123'),
    }, 'system');
  }
}

module.exports = { createApp, seedAdmin };