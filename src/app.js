'use strict';

const express = require('express');
const { validateLogin, validateManager, validateParent, validateStaff } = require('./modules/auth/auth.validation');
const { hashPassword, verifyPassword, signToken, authenticate, requireRole } = require('./modules/auth/auth');
const { HttpError, bad, notFound, forbidden, unauthorized, conflict } = require('./errors');
const { ageOf, calcBilling } = require('./modules/billing/billing');
const { generateSchedule, viewSchedule, teacherView } = require('./modules/schedule/schedule');
const { calcProfit, optimize } = require('./modules/finance/finance');

const STAFF_TYPES = ['educator', 'assistant', 'subject'];
const PLANS = ['monthly', 'yearly'];
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const publicUser = ({ passwordHash, ...u }) => u;

function createApp(store) {
  const app = express();
  app.use(express.json());
  const s = () => store.settings;
  const actor = (req) => `${req.user.role}:${req.user.username}`;
  const staffAdmin = [authenticate, requireRole('admin')];
  const staffMgr = [authenticate, requireRole('admin', 'manager')];

  // ---------- helpers ----------
  const canSeeChild = (req, child, group) => {
    const { role, id, staffId } = req.user;
    if (role === 'admin' || role === 'manager') return true;
    if (role === 'parent') return child.parentId === id;
    return Boolean(group && (group.educatorId === staffId || group.assistantId === staffId));
  };
  const getChild = async (req) => {
    const child = await store.get('children', req.params.id);
    if (!child) throw notFound('Child not found');
    const group = child.groupId ? await store.get('groups', child.groupId) : null;
    if (!canSeeChild(req, child, group)) throw forbidden('Not your child');
    return child;
  };
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
  const validateDiscount = (d) => {
    if (!s().allowedDiscounts.includes(d)) {
      throw bad(`discountPercent must be one of ${s().allowedDiscounts.join(', ')}`);
    }
  };
  const validDate = (v) => isStr(v) && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));
  const withAge = (c) => ({ ...c, age: ageOf(c.birthDate) });
  const requireParent = async (parentId) => {
    const p = await store.get('users', parentId);
    if (!p || p.role !== 'parent') throw bad('parentId must reference an existing parent');
    return p;
  };

  // ---------- auth ----------
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/auth/login', validateLogin, async (req, res) => {
    const { username, password } = req.body;
    const user = await store.one('users', { username });
    if (!user || !verifyPassword(password, user.passwordHash)) throw unauthorized('Invalid credentials');
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  app.get('/auth/me', authenticate, async (req, res) => {
    res.json(publicUser(await store.get('users', req.user.id)));
  });

  // ---------- users: managers & parents ----------
  app.post('/managers', ...staffAdmin, validateManager, async (req, res) => {
    const { username, password, name } = req.body;
    if (await store.one('users', { username })) throw conflict('Username already exists');
    const u = await store.insert('users', { username, name, role: 'manager', passwordHash: hashPassword(password) }, actor(req));
    res.status(201).json(publicUser(u));
  });
  
  app.post('/parents', ...staffMgr, validateParent, async (req, res) => {
    const { username, password, name, phone } = req.body;
    if (await store.one('users', { username })) throw conflict('Username already exists');
    const u = await store.insert('users', {
      username, name, phone: phone || null, role: 'parent', passwordHash: hashPassword(password),
    }, actor(req));
    res.status(201).json(publicUser(u));
  });

  app.get('/parents', ...staffMgr, async (req, res) => {
    res.json((await store.where('users', { role: 'parent' })).map(publicUser));
  });

  // ---------- staff (вихователі, помічники, викладачі) ----------
  app.post('/staff', ...staffAdmin, validateStaff, async (req, res) => {
    const { name, type, subjects, salary, username, password } = req.body;
    if (salary !== undefined && !(Number(salary) >= 0)) throw bad('salary must be a non-negative number');
    let subs = [];
    if (type === 'subject') {
      if (!Array.isArray(subjects) || !subjects.length || !subjects.every((x) => s().subjects.includes(x))) {
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

  // ---------- groups ----------
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

  app.get('/groups', authenticate, requireRole('admin', 'manager'), async (req, res) => {
    res.json(await store.list('groups'));
  });

  return app;
}

// Функція для створення дефолтного адміна при запуску (викликається у server.js)
async function seedAdmin(store) {
  const admin = await store.one('users', { username: 'admin' });
  if (!admin) {
    await store.insert('users', {
      username: 'admin',
      name: 'System Administrator',
      role: 'admin',
      passwordHash: hashPassword('admin123'),
    }, 'system');
  }
}

module.exports = { createApp, seedAdmin };
