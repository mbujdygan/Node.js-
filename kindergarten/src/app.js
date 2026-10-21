'use strict';
const express = require('express');
const { Store } = require('./store');
const { hashPassword, verifyPassword, signToken, authenticate, requireRole } = require('./auth');
const { HttpError, bad, notFound, forbidden, unauthorized, conflict } = require('./errors');
const { ageOf, calcBilling } = require('./billing');
const { generateSchedule, viewSchedule, teacherView } = require('./schedule');
const { calcProfit, optimize } = require('./finance');

const STAFF_TYPES = ['educator', 'assistant', 'subject'];
const PLANS = ['monthly', 'yearly'];
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const publicUser = ({ passwordHash, ...u }) => u;

function createApp(store = new Store()) {
  const app = express();
  app.use(express.json());
  // Для PostgreSQL: відповідь на зміну йде клієнту лише після коміту транзакції
  if (typeof store.flush === 'function') {
    app.use((req, res, next) => {
      if (req.method === 'GET') return next();
      const end = res.end.bind(res);
      res.end = (...args) => {
        store.flush().then(() => end(...args), (err) => {
          res.statusCode = 500;
          res.removeHeader('Content-Length');
          res.removeHeader('ETag');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          end(JSON.stringify({ error: 'Database write failed', details: err.message }));
        });
        return res;
      };
      return next();
    });
  }
  const s = () => store.data.settings;
  const actor = (req) => `${req.user.role}:${req.user.username}`;
  const staffAdmin = [authenticate, requireRole('admin')];
  const staffMgr = [authenticate, requireRole('admin', 'manager')];

  // ---------- helpers ----------
  const parentOf = (req) => store.get('users', req.user.id);
  const canSeeChild = (req, child) => {
    const { role, id, staffId } = req.user;
    if (role === 'admin' || role === 'manager') return true;
    if (role === 'parent') return child.parentId === id;
    const g = child.groupId && store.get('groups', child.groupId);
    return Boolean(g && (g.educatorId === staffId || g.assistantId === staffId));
  };
  const getChild = (req) => {
    const child = store.get('children', req.params.id);
    if (!child) throw notFound('Child not found');
    if (!canSeeChild(req, child)) throw forbidden('Not your child');
    return child;
  };
  const getGroup = (id) => {
    const g = store.get('groups', id);
    if (!g) throw notFound('Group not found');
    return g;
  };
  const staffOfType = (id, type, label) => {
    const st = store.get('staff', id);
    if (!st) throw notFound(`${label} not found`);
    if (st.type !== type) throw bad(`${label} must be staff of type "${type}"`);
    return st;
  };
  const validateDiscount = (d) => {
    if (!s().allowedDiscounts.includes(d)) {
      throw bad(`discountPercent must be one of ${s().allowedDiscounts.join(', ')}`);
    }
  };
  const validDate = (v) => isStr(v) && !Number.isNaN(Date.parse(v));
  const withAge = (c) => ({ ...c, age: ageOf(c.birthDate) });

  // ---------- auth ----------
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = isStr(username) && isStr(password) && store.find('users', (u) => u.username === username);
    if (!user || !verifyPassword(password, user.passwordHash)) throw unauthorized('Invalid credentials');
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  app.get('/auth/me', authenticate, (req, res) => res.json(publicUser(store.get('users', req.user.id))));

  // ---------- users: managers & parents ----------
  app.post('/managers', ...staffAdmin, (req, res) => {
    const { username, password, name } = req.body || {};
    if (![username, password, name].every(isStr)) throw bad('username, password, name are required');
    if (store.find('users', (u) => u.username === username)) throw conflict('Username already exists');
    const u = store.insert('users', { username, name, role: 'manager', passwordHash: hashPassword(password) }, actor(req));
    res.status(201).json(publicUser(u));
  });

  app.post('/parents', ...staffMgr, (req, res) => {
    const { username, password, name, phone } = req.body || {};
    if (![username, password, name].every(isStr)) throw bad('username, password, name are required');
    if (store.find('users', (u) => u.username === username)) throw conflict('Username already exists');
    const u = store.insert('users', {
      username, name, phone: phone || null, role: 'parent', passwordHash: hashPassword(password),
    }, actor(req));
    res.status(201).json(publicUser(u));
  });

  app.get('/parents', ...staffMgr, (req, res) => {
    res.json(store.filter('users', (u) => u.role === 'parent').map(publicUser));
  });

  // ---------- staff (вихователі, помічники, викладачі) ----------
  app.post('/staff', ...staffAdmin, (req, res) => {
    const { name, type, subjects, salary, username, password } = req.body || {};
    if (!isStr(name)) throw bad('name is required');
    if (!STAFF_TYPES.includes(type)) throw bad(`type must be one of ${STAFF_TYPES.join(', ')}`);
    if (salary !== undefined && !(Number(salary) >= 0)) throw bad('salary must be a non-negative number');
    let subs = [];
    if (type === 'subject') {
      if (!Array.isArray(subjects) || !subjects.length
        || !subjects.every((x) => s().subjects.includes(x))) {
        throw bad(`subjects must be a non-empty subset of ${s().subjects.join(', ')}`);
      }
      subs = subjects;
    }
    if ((username || password) && !(isStr(username) && isStr(password))) throw bad('username and password must be set together');
    if (username && store.find('users', (u) => u.username === username)) throw conflict('Username already exists');
    const st = store.insert('staff', { name, type, subjects: subs, salary: salary === undefined ? undefined : Number(salary) }, actor(req));
    if (username) {
      const u = store.insert('users', { username, name, role: 'teacher', staffId: st.id, passwordHash: hashPassword(password) }, actor(req));
      return res.status(201).json({ ...st, userId: u.id });
    }
    return res.status(201).json(st);
  });

  app.get('/staff', ...staffMgr, (req, res) => res.json(store.list('staff')));

  app.patch('/staff/:id', ...staffAdmin, (req, res) => {
    const st = store.get('staff', req.params.id);
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
    res.json(store.update('staff', st.id, patch, actor(req)));
  });

  app.delete('/staff/:id', ...staffAdmin, (req, res) => {
    const st = store.get('staff', req.params.id);
    if (!st) throw notFound('Staff not found');
    if (store.find('groups', (g) => g.educatorId === st.id || g.assistantId === st.id)) {
      throw conflict('Staff member is assigned to a group');
    }
    store.remove('staff', st.id, actor(req));
    res.status(204).end();
  });

  app.get('/staff/:id/schedule', authenticate, (req, res) => {
    const st = store.get('staff', req.params.id);
    if (!st) throw notFound('Staff not found');
    const own = req.user.role === 'teacher' && req.user.staffId === st.id;
    if (!own && !['admin', 'manager'].includes(req.user.role)) throw forbidden('Not your schedule');
    res.json(teacherView(store.data.schedule, st.id));
  });

  // ---------- groups ----------
  app.post('/groups', ...staffAdmin, (req, res) => {
    const { name, age, educatorId, assistantId } = req.body || {};
    if (!isStr(name)) throw bad('name is required');
    if (!Number.isInteger(age) || age < s().minAge || age > s().maxAge) {
      throw bad(`age must be an integer between ${s().minAge} and ${s().maxAge}`);
    }
    staffOfType(educatorId, 'educator', 'Educator');
    staffOfType(assistantId, 'assistant', 'Assistant');
    if (store.find('groups', (g) => g.educatorId === educatorId || g.assistantId === assistantId)) {
      throw conflict('Educator or assistant already assigned to another group');
    }
    res.status(201).json(store.insert('groups', { name, age, educatorId, assistantId }, actor(req)));
  });

  app.get('/groups', authenticate, requireRole('admin', 'manager', 'teacher'), (req, res) => {
    let groups = store.list('groups');
    if (req.user.role === 'teacher') {
      groups = groups.filter((g) => g.educatorId === req.user.staffId || g.assistantId === req.user.staffId);
    }
    res.json(groups.map((g) => ({
      ...g, childrenCount: store.filter('children', (c) => c.groupId === g.id).length,
    })));
  });

  app.patch('/groups/:id', ...staffAdmin, (req, res) => {
    const g = getGroup(req.params.id);
    const { name, educatorId, assistantId } = req.body || {};
    const patch = {};
    if (name !== undefined) { if (!isStr(name)) throw bad('name must be a string'); patch.name = name; }
    const clash = (id) => store.find('groups', (x) => x.id !== g.id && (x.educatorId === id || x.assistantId === id));
    if (educatorId !== undefined) {
      staffOfType(educatorId, 'educator', 'Educator');
      if (clash(educatorId)) throw conflict('Educator already assigned to another group');
      patch.educatorId = educatorId;
    }
    if (assistantId !== undefined) {
      staffOfType(assistantId, 'assistant', 'Assistant');
      if (clash(assistantId)) throw conflict('Assistant already assigned to another group');
      patch.assistantId = assistantId;
    }
    res.json(store.update('groups', g.id, patch, actor(req)));
  });

  app.delete('/groups/:id', ...staffAdmin, (req, res) => {
    const g = getGroup(req.params.id);
    if (store.find('children', (c) => c.groupId === g.id)) throw conflict('Group is not empty');
    store.remove('groups', g.id, actor(req));
    res.status(204).end();
  });

  app.post('/groups/:id/children', ...staffMgr, (req, res) => {
    const g = getGroup(req.params.id);
    const child = store.get('children', (req.body || {}).childId);
    if (!child) throw notFound('Child not found');
    if (ageOf(child.birthDate) !== g.age) throw conflict(`Child age ${ageOf(child.birthDate)} does not match group age ${g.age}`);
    const size = store.filter('children', (c) => c.groupId === g.id && c.id !== child.id).length;
    if (size >= s().maxGroupSize) throw conflict(`Group is full (max ${s().maxGroupSize})`);
    res.json(store.update('children', child.id, { groupId: g.id }, actor(req)));
  });

  app.delete('/groups/:id/children/:childId', ...staffMgr, (req, res) => {
    const g = getGroup(req.params.id);
    const child = store.get('children', req.params.childId);
    if (!child || child.groupId !== g.id) throw notFound('Child is not in this group');
    res.json(store.update('children', child.id, { groupId: null }, actor(req)));
  });

  // ---------- children ----------
  app.post('/children', ...staffMgr, (req, res) => {
    const { name, birthDate, parentId, discountPercent = 0, paymentPlan = 'monthly' } = req.body || {};
    if (!isStr(name)) throw bad('name is required');
    if (!validDate(birthDate)) throw bad('birthDate must be a valid date (YYYY-MM-DD)');
    const age = ageOf(birthDate);
    if (age < s().minAge || age > s().maxAge) throw bad(`Child age must be between ${s().minAge} and ${s().maxAge}`);
    const parent = store.get('users', parentId);
    if (!parent || parent.role !== 'parent') throw bad('parentId must reference an existing parent');
    if (!PLANS.includes(paymentPlan)) throw bad(`paymentPlan must be one of ${PLANS.join(', ')}`);
    // фінансові параметри (пільги) може змінювати лише адмін
    if (discountPercent !== 0 && req.user.role !== 'admin') throw forbidden('Only admin can set discounts');
    validateDiscount(discountPercent);
    const c = store.insert('children', { name, birthDate, parentId, groupId: null, discountPercent, paymentPlan }, actor(req));
    res.status(201).json(withAge(c));
  });

  app.get('/children', authenticate, (req, res) => {
    res.json(store.filter('children', (c) => canSeeChild(req, c)).map(withAge));
  });

  app.get('/children/:id', authenticate, (req, res) => res.json(withAge(getChild(req))));

  app.patch('/children/:id', ...staffMgr, (req, res) => {
    const c = getChild(req);
    const { name, birthDate, parentId, discountPercent, paymentPlan } = req.body || {};
    const patch = {};
    if (name !== undefined) { if (!isStr(name)) throw bad('name must be a string'); patch.name = name; }
    if (birthDate !== undefined) {
      if (!validDate(birthDate)) throw bad('invalid birthDate');
      const age = ageOf(birthDate);
      if (age < s().minAge || age > s().maxAge) throw bad('Child age is out of range');
      if (c.groupId && age !== getGroup(c.groupId).age) throw conflict('New age does not match the child group');
      patch.birthDate = birthDate;
    }
    if (parentId !== undefined) {
      const p = store.get('users', parentId);
      if (!p || p.role !== 'parent') throw bad('parentId must reference an existing parent');
      patch.parentId = parentId;
    }
    if (discountPercent !== undefined || paymentPlan !== undefined) {
      if (req.user.role !== 'admin') throw forbidden('Only admin can change financial parameters');
      if (discountPercent !== undefined) { validateDiscount(discountPercent); patch.discountPercent = discountPercent; }
      if (paymentPlan !== undefined) {
        if (!PLANS.includes(paymentPlan)) throw bad(`paymentPlan must be one of ${PLANS.join(', ')}`);
        patch.paymentPlan = paymentPlan;
      }
    }
    res.json(withAge(store.update('children', c.id, patch, actor(req))));
  });

  app.delete('/children/:id', ...staffAdmin, (req, res) => {
    const c = store.get('children', req.params.id);
    if (!c) throw notFound('Child not found');
    store.remove('children', c.id, actor(req));
    res.status(204).end();
  });

  app.get('/children/:id/billing', authenticate, requireRole('admin', 'manager', 'parent'), (req, res) => {
    const c = getChild(req);
    const { months, plan, workDays } = req.query;
    if (plan !== undefined && !PLANS.includes(plan)) throw bad(`plan must be one of ${PLANS.join(', ')}`);
    const m = months === undefined ? undefined : Number(months);
    if (m !== undefined && !(Number.isInteger(m) && m >= 1 && m <= 12)) throw bad('months must be an integer 1..12');
    const w = workDays === undefined ? undefined : Number(workDays);
    if (w !== undefined && !(Number.isInteger(w) && w >= 1 && w <= 31)) throw bad('workDays must be an integer 1..31');
    res.json(calcBilling(c, s(), { months: m, plan, workDays: w }));
  });

  app.get('/children/:id/schedule', authenticate, (req, res) => {
    const c = getChild(req);
    res.json(viewSchedule(store.data.schedule, c.groupId ? [c.groupId] : []));
  });

  // ---------- schedule ----------
  app.post('/schedule/generate', ...staffMgr, (req, res) => {
    const groups = store.list('groups');
    if (!groups.length) throw conflict('No groups to schedule');
    const { schedule, conflicts } = generateSchedule(groups, store.list('staff'), s());
    store.setSchedule(schedule, actor(req));
    res.status(conflicts.length ? 207 : 201).json({ generatedAt: schedule.generatedAt, groups: groups.length, conflicts });
  });

  app.get('/schedule', authenticate, (req, res) => {
    const { role, id, staffId } = req.user;
    if (role === 'teacher') return res.json(teacherView(store.data.schedule, staffId));
    let ids = store.list('groups').map((g) => g.id);
    if (role === 'parent') {
      ids = [...new Set(store.filter('children', (c) => c.parentId === id && c.groupId).map((c) => c.groupId))];
    }
    return res.json(viewSchedule(store.data.schedule, ids));
  });

  // ---------- finance ----------
  app.get('/profit', ...staffAdmin, (req, res) => res.json(calcProfit(store)));

  app.get('/profit/groups/:id', ...staffAdmin, (req, res) => {
    const g = getGroup(req.params.id);
    res.json(calcProfit(store).groups.find((x) => x.groupId === g.id));
  });

  app.get('/optimization', ...staffAdmin, (req, res) => res.json(optimize(store)));

  // ---------- settings & history ----------
  app.get('/settings', ...staffMgr, (req, res) => res.json(s()));

  app.patch('/settings', ...staffAdmin, (req, res) => {
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
    res.json(store.updateSettings(patch, actor(req)));
  });

  app.get('/history', ...staffAdmin, (req, res) => {
    const { collection, id } = req.query;
    res.json(store.data.history.filter((h) => (!collection || h.collection === collection)
      && (!id || h.id === Number(id))));
  });

  // ---------- errors ----------
  app.use((req, res, next) => next(notFound('Route not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

function seedAdmin(store) {
  if (!store.find('users', (u) => u.role === 'admin')) {
    store.insert('users', {
      username: process.env.ADMIN_USER || 'admin',
      name: 'Administrator',
      role: 'admin',
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD || 'admin123'),
    }, 'system');
  }
}

module.exports = { createApp, seedAdmin };
