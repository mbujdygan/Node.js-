'use strict';
const request = require('supertest');
const { setup, seedKindergarten, yearsAgo } = require('./helpers');

let ctx; let ids;
beforeEach(async () => {
  ctx = await setup();
  ids = await seedKindergarten(ctx);
});
const call = (...a) => ctx.api(...a);

describe('auth', () => {
  test('health', async () => {
    expect((await request(ctx.app).get('/health')).body).toEqual({ status: 'ok' });
  });
  test('login ok / fail / validation', async () => {
    const ok = await request(ctx.app).post('/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.passwordHash).toBeUndefined();
    expect((await request(ctx.app).post('/auth/login').send({ username: 'admin', password: 'x' })).status).toBe(401);
    expect((await request(ctx.app).post('/auth/login').send({ username: 'ghost', password: 'x' })).status).toBe(401);
    expect((await request(ctx.app).post('/auth/login').send({})).status).toBe(401);
    expect((await request(ctx.app).post('/auth/login')).status).toBe(401);
  });
  test('токен обов\'язковий і валідний', async () => {
    expect((await call('get', '/children')).status).toBe(401);
    expect((await call('get', '/children', 'Bearer garbage')).status).toBe(401);
  });
  test('me', async () => {
    const r = await call('get', '/auth/me', ctx.admin);
    expect(r.body.role).toBe('admin');
  });
  test('невалідний JSON та 404', async () => {
    const r = await request(ctx.app).post('/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(r.status).toBe(400);
    expect((await call('get', '/nope', ctx.admin)).status).toBe(404);
  });
  test('500 для неочікуваної помилки', async () => {
    ctx.store.data.settings = null;
    expect((await call('get', '/settings', ctx.admin)).status).toBe(200); // JSON null
    const r = await call('post', '/groups', ctx.admin, { name: 'x', age: 3 });
    expect(r.status).toBe(500);
  });
});

describe('managers & parents', () => {
  test('адмін створює менеджера, менеджер створює батька', async () => {
    expect((await call('post', '/managers', ctx.admin, { username: 'm', password: 'p', name: 'M' })).status).toBe(201);
    expect((await call('post', '/managers', ctx.admin, { username: 'm', password: 'p', name: 'M' })).status).toBe(409);
    expect((await call('post', '/managers', ctx.admin, { username: 'm2' })).status).toBe(400);
    const m = await ctx.login('m', 'p');
    expect((await call('post', '/parents', m, { username: 'p9', password: 'p', name: 'P', phone: '1' })).status).toBe(201);
    expect((await call('post', '/parents', m, { username: 'p9', password: 'p', name: 'P' })).status).toBe(409);
    expect((await call('post', '/parents', m, { username: 'x' })).status).toBe(400);
    expect((await call('get', '/parents', m)).body.length).toBe(3);
    expect((await call('post', '/managers', m, { username: 'z', password: 'p', name: 'Z' })).status).toBe(403);
  });
});

describe('staff', () => {
  test('валідація', async () => {
    const a = ctx.admin;
    expect((await call('post', '/staff', a, { type: 'educator' })).status).toBe(400);
    expect((await call('post', '/staff', a, { name: 'x', type: 'bad' })).status).toBe(400);
    expect((await call('post', '/staff', a, { name: 'x', type: 'educator', salary: -1 })).status).toBe(400);
    expect((await call('post', '/staff', a, { name: 'x', type: 'subject' })).status).toBe(400);
    expect((await call('post', '/staff', a, { name: 'x', type: 'subject', subjects: ['yoga'] })).status).toBe(400);
    expect((await call('post', '/staff', a, { name: 'x', type: 'educator', username: 'u' })).status).toBe(400);
    expect((await call('post', '/staff', a, { name: 'x', type: 'educator', username: 'edu', password: 'p' })).status).toBe(409);
    expect((await call('post', '/staff', a, { name: 'x', type: 'assistant', salary: 5 })).status).toBe(201);
  });
  test('список, патч, видалення', async () => {
    const a = ctx.admin;
    expect((await call('get', '/staff', a)).body.length).toBe(7);
    const t = ids.teachers.music;
    expect((await call('patch', `/staff/${t}`, a, { name: 'New', salary: 50000, subjects: ['music', 'chess'] })).body.subjects).toEqual(['music', 'chess']);
    expect((await call('patch', `/staff/${t}`, a, { name: '' })).status).toBe(400);
    expect((await call('patch', `/staff/${t}`, a, { salary: -3 })).status).toBe(400);
    expect((await call('patch', `/staff/${t}`, a, { subjects: [] })).status).toBe(400);
    expect((await call('patch', `/staff/${ids.educator}`, a, { subjects: ['music'] })).status).toBe(400);
    expect((await call('patch', '/staff/999', a, {})).status).toBe(404);
    expect((await call('delete', `/staff/${ids.educator}`, a)).status).toBe(409);
    expect((await call('delete', `/staff/${t}`, a)).status).toBe(204);
    expect((await call('delete', `/staff/${t}`, a)).status).toBe(404);
  });
  test('розклад викладача: свій так, чужий ні', async () => {
    await call('post', '/schedule/generate', ctx.admin);
    const t = await ctx.login('t_music', 'pw');
    const own = await call('get', `/staff/${ids.teachers.music}/schedule`, t);
    expect(own.body.days.Mon).toHaveLength(1);
    expect((await call('get', `/staff/${ids.teachers.chess}/schedule`, t)).status).toBe(403);
    expect((await call('get', `/staff/${ids.teachers.chess}/schedule`, ctx.admin)).status).toBe(200);
    expect((await call('get', '/staff/999/schedule', ctx.admin)).status).toBe(404);
  });
});

describe('groups', () => {
  test('валідація створення', async () => {
    const a = ctx.admin;
    const e2 = (await call('post', '/staff', a, { name: 'E2', type: 'educator' })).body.id;
    const a2 = (await call('post', '/staff', a, { name: 'A2', type: 'assistant' })).body.id;
    expect((await call('post', '/groups', a, { age: 3 })).status).toBe(400);
    expect((await call('post', '/groups', a, { name: 'g', age: 9, educatorId: e2, assistantId: a2 })).status).toBe(400);
    expect((await call('post', '/groups', a, { name: 'g', age: 3, educatorId: 999, assistantId: a2 })).status).toBe(404);
    expect((await call('post', '/groups', a, { name: 'g', age: 3, educatorId: a2, assistantId: a2 })).status).toBe(400);
    expect((await call('post', '/groups', a, { name: 'g', age: 3, educatorId: ids.educator, assistantId: a2 })).status).toBe(409);
    expect((await call('post', '/groups', a, { name: 'g', age: 3, educatorId: e2, assistantId: a2 })).status).toBe(201);
  });
  test('список для ролей', async () => {
    const edu = await ctx.login('edu', 'pw');
    const t = await ctx.login('t_music', 'pw');
    expect((await call('get', '/groups', ctx.admin)).body[0].childrenCount).toBe(2);
    expect((await call('get', '/groups', edu)).body).toHaveLength(1);
    expect((await call('get', '/groups', t)).body).toHaveLength(0);
    const mom = await ctx.login('mom', 'pw');
    expect((await call('get', '/groups', mom)).status).toBe(403);
  });
  test('патч і видалення', async () => {
    const a = ctx.admin;
    const e2 = (await call('post', '/staff', a, { name: 'E2', type: 'educator' })).body.id;
    const a2 = (await call('post', '/staff', a, { name: 'A2', type: 'assistant' })).body.id;
    const g2 = (await call('post', '/groups', a, { name: 'g2', age: 4, educatorId: e2, assistantId: a2 })).body.id;
    expect((await call('patch', `/groups/${g2}`, a, { name: 'renamed' })).body.name).toBe('renamed');
    expect((await call('patch', `/groups/${g2}`, a, { name: '' })).status).toBe(400);
    expect((await call('patch', `/groups/${g2}`, a, { educatorId: ids.educator })).status).toBe(409);
    expect((await call('patch', `/groups/${g2}`, a, { assistantId: ids.assistant })).status).toBe(409);
    expect((await call('patch', `/groups/${g2}`, a, { educatorId: 999 })).status).toBe(404);
    const e3 = (await call('post', '/staff', a, { name: 'E3', type: 'educator' })).body.id;
    const a3 = (await call('post', '/staff', a, { name: 'A3', type: 'assistant' })).body.id;
    const r = await call('patch', `/groups/${g2}`, a, { educatorId: e3, assistantId: a3 });
    expect(r.body).toMatchObject({ educatorId: e3, assistantId: a3 });
    expect((await call('patch', '/groups/999', a, {})).status).toBe(404);
    expect((await call('delete', `/groups/${ids.group}`, a)).status).toBe(409);
    expect((await call('delete', `/groups/${g2}`, a)).status).toBe(204);
  });
  test('призначення дітей: вік, ліміт, прибрати', async () => {
    const a = ctx.admin;
    const e2 = (await call('post', '/staff', a, { name: 'E2', type: 'educator' })).body.id;
    const a2 = (await call('post', '/staff', a, { name: 'A2', type: 'assistant' })).body.id;
    const g4 = (await call('post', '/groups', a, { name: 'g4', age: 4, educatorId: e2, assistantId: a2 })).body.id;
    const wrong = await call('post', `/groups/${g4}/children`, a, { childId: ids.child });
    expect(wrong.status).toBe(409);
    expect((await call('post', `/groups/${g4}/children`, a, { childId: 999 })).status).toBe(404);
    expect((await call('post', '/groups/999/children', a, { childId: 1 })).status).toBe(404);
    // ліміт 30
    await call('patch', '/settings', a, { maxGroupSize: 2 });
    const third = (await call('post', '/children', a, { name: 'K3', birthDate: yearsAgo(3), parentId: ids.parent })).body.id;
    expect((await call('post', `/groups/${ids.group}/children`, a, { childId: third })).status).toBe(409);
    // повторне призначення тієї ж дитини не рахується як переповнення
    expect((await call('post', `/groups/${ids.group}/children`, a, { childId: ids.child })).status).toBe(200);
    expect((await call('delete', `/groups/${ids.group}/children/${ids.child}`, a)).body.groupId).toBeNull();
    expect((await call('delete', `/groups/${ids.group}/children/${ids.child}`, a)).status).toBe(404);
  });
});

describe('children & доступ', () => {
  test('валідація створення', async () => {
    const a = ctx.admin;
    const base = { name: 'N', birthDate: yearsAgo(3), parentId: ids.parent };
    expect((await call('post', '/children', a, { ...base, name: '' })).status).toBe(400);
    expect((await call('post', '/children', a, { ...base, birthDate: 'abc' })).status).toBe(400);
    expect((await call('post', '/children', a, { ...base, birthDate: yearsAgo(1) })).status).toBe(400);
    expect((await call('post', '/children', a, { ...base, birthDate: yearsAgo(7) })).status).toBe(400);
    expect((await call('post', '/children', a, { ...base, parentId: 999 })).status).toBe(400);
    expect((await call('post', '/children', a, { ...base, parentId: 1 })).status).toBe(400); // адмін не батько
    expect((await call('post', '/children', a, { ...base, paymentPlan: 'weekly' })).status).toBe(400);
    expect((await call('post', '/children', a, { ...base, discountPercent: 15 })).status).toBe(400);
    const ok = await call('post', '/children', a, { ...base, discountPercent: 30, paymentPlan: 'yearly' });
    expect(ok.status).toBe(201);
    expect(ok.body.age).toBe(3);
  });
  test('менеджер реєструє дітей, але не ставить пільги', async () => {
    await call('post', '/managers', ctx.admin, { username: 'm', password: 'p', name: 'M' });
    const m = await ctx.login('m', 'p');
    const base = { name: 'N', birthDate: yearsAgo(4), parentId: ids.parent };
    expect((await call('post', '/children', m, base)).status).toBe(201);
    expect((await call('post', '/children', m, { ...base, discountPercent: 10 })).status).toBe(403);
    expect((await call('patch', `/children/${ids.child}`, m, { discountPercent: 0 })).status).toBe(403);
    expect((await call('patch', `/children/${ids.child}`, m, { paymentPlan: 'yearly' })).status).toBe(403);
    expect((await call('patch', `/children/${ids.child}`, m, { name: 'Renamed' })).status).toBe(200);
    expect((await call('delete', `/children/${ids.child}`, m)).status).toBe(403);
  });
  test('батьки бачать лише свою дитину', async () => {
    const mom = await ctx.login('mom', 'pw');
    const list = (await call('get', '/children', mom)).body;
    expect(list.map((c) => c.id)).toEqual([ids.child]);
    expect((await call('get', `/children/${ids.child}`, mom)).status).toBe(200);
    expect((await call('get', `/children/${ids.child2}`, mom)).status).toBe(403);
    expect((await call('get', `/children/${ids.child2}/billing`, mom)).status).toBe(403);
    expect((await call('get', `/children/${ids.child2}/schedule`, mom)).status).toBe(403);
    expect((await call('get', '/children/999', mom)).status).toBe(404);
    expect((await call('post', '/children', mom, {})).status).toBe(403);
    expect((await call('get', '/profit', mom)).status).toBe(403);
    expect((await call('get', '/history', mom)).status).toBe(403);
  });
  test('вихователь бачить дітей своєї групи, викладач-предметник - ні', async () => {
    const edu = await ctx.login('edu', 'pw');
    const t = await ctx.login('t_music', 'pw');
    expect((await call('get', '/children', edu)).body).toHaveLength(2);
    expect((await call('get', '/children', t)).body).toHaveLength(0);
    expect((await call('get', `/children/${ids.child}/billing`, edu)).status).toBe(403);
    const loose = (await call('post', '/children', ctx.admin, { name: 'L', birthDate: yearsAgo(3), parentId: ids.parent })).body.id;
    expect((await call('get', `/children/${loose}`, edu)).status).toBe(403);
  });
  test('patch: усі гілки', async () => {
    const a = ctx.admin;
    const id = ids.child;
    expect((await call('patch', `/children/${id}`, a, { name: '' })).status).toBe(400);
    expect((await call('patch', `/children/${id}`, a, { birthDate: 'x' })).status).toBe(400);
    expect((await call('patch', `/children/${id}`, a, { birthDate: yearsAgo(9) })).status).toBe(400);
    expect((await call('patch', `/children/${id}`, a, { birthDate: yearsAgo(4) })).status).toBe(409);
    expect((await call('patch', `/children/${id}`, a, { birthDate: yearsAgo(3) })).status).toBe(200);
    expect((await call('patch', `/children/${id}`, a, { parentId: 999 })).status).toBe(400);
    expect((await call('patch', `/children/${id}`, a, { parentId: ids.parent2 })).status).toBe(200);
    expect((await call('patch', `/children/${id}`, a, { discountPercent: 77 })).status).toBe(400);
    expect((await call('patch', `/children/${id}`, a, { paymentPlan: 'x' })).status).toBe(400);
    const r = await call('patch', `/children/${id}`, a, { discountPercent: 20, paymentPlan: 'yearly' });
    expect(r.body).toMatchObject({ discountPercent: 20, paymentPlan: 'yearly' });
    const loose = (await call('post', '/children', a, { name: 'L', birthDate: yearsAgo(3), parentId: ids.parent })).body.id;
    expect((await call('patch', `/children/${loose}`, a, { birthDate: yearsAgo(5) })).status).toBe(200);
  });
  test('delete', async () => {
    expect((await call('delete', `/children/${ids.child}`, ctx.admin)).status).toBe(204);
    expect((await call('delete', `/children/${ids.child}`, ctx.admin)).status).toBe(404);
  });
});

describe('billing endpoint', () => {
  test('батько бачить розраховану суму: 10% пільга + харчування 3 роки', async () => {
    const mom = await ctx.login('mom', 'pw');
    const r = await call('get', `/children/${ids.child}/billing`, mom);
    expect(r.status).toBe(200);
    expect(r.body.tuitionPerMonth).toBe(13500);
    expect(r.body.mealPricePerDay).toBe(400);
    expect(r.body.total).toBe(13500 + 400 * 22);
  });
  test('параметри та валідація', async () => {
    const a = ctx.admin;
    const url = `/children/${ids.child2}/billing`;
    const yr = await call('get', `${url}?plan=yearly`, a);
    expect(yr.body.tuitionPerMonth).toBe(13200);
    expect(yr.body.periodMonths).toBe(12);
    expect((await call('get', `${url}?months=3&workDays=20`, a)).body.total).toBe(45000 + 400 * 20 * 3);
    expect((await call('get', `${url}?plan=x`, a)).status).toBe(400);
    expect((await call('get', `${url}?months=13`, a)).status).toBe(400);
    expect((await call('get', `${url}?workDays=0`, a)).status).toBe(400);
    const t = await ctx.login('t_music', 'pw');
    expect((await call('get', url, t)).status).toBe(403);
  });
});

describe('schedule endpoints', () => {
  test('без груп - 409', async () => {
    const fresh = await setup();
    expect((await fresh.api('post', '/schedule/generate', fresh.admin)).status).toBe(409);
  });
  test('генерація, перегляд для ролей', async () => {
    const gen = await call('post', '/schedule/generate', ctx.admin);
    expect(gen.status).toBe(201);
    expect(gen.body.conflicts).toEqual([]);
    const all = await call('get', '/schedule', ctx.admin);
    expect(Object.keys(all.body.groups)).toEqual([String(ids.group)]);
    const mom = await ctx.login('mom', 'pw');
    expect(Object.keys((await call('get', '/schedule', mom)).body.groups)).toHaveLength(1);
    const own = await call('get', `/children/${ids.child}/schedule`, mom);
    expect(own.body.groups[ids.group].Mon.filter((s) => s.type === 'lesson')).toHaveLength(5);
    const t = await ctx.login('t_chess', 'pw');
    expect((await call('get', '/schedule', t)).body.days.Fri).toHaveLength(1);
    const loose = (await call('post', '/children', ctx.admin, { name: 'L', birthDate: yearsAgo(3), parentId: ids.parent })).body.id;
    expect((await call('get', `/children/${loose}/schedule`, ctx.admin)).body.groups).toEqual({});
  });
  test('часткові конфлікти повертають 207', async () => {
    await call('delete', `/staff/${ids.teachers.chess}`, ctx.admin);
    const gen = await call('post', '/schedule/generate', ctx.admin);
    expect(gen.status).toBe(207);
    expect(gen.body.conflicts[0]).toEqual({ type: 'no_teacher', subject: 'chess' });
  });
  test('розклад до генерації порожній', async () => {
    expect((await call('get', '/schedule', ctx.admin)).body.generatedAt).toBeNull();
  });
});

describe('finance', () => {
  test('profit: по групі та загалом', async () => {
    // 2 дитини, 3 роки: (13500 + 8800) + (15000 + 8800) = 46100
    // прямі: 2*40000 = 80000; спільні: 5 предметників * 40000 + 80000 = 280000
    const r = await call('get', '/profit', ctx.admin);
    expect(r.body.groups[0]).toMatchObject({ children: 2, revenue: 46100, directCosts: 80000 });
    expect(r.body.total.sharedCosts).toBe(280000);
    expect(r.body.total.mealsCost).toBe(17600);
    expect(r.body.total.profit).toBe(46100 - 17600 - 80000 - 280000);
    const g = await call('get', `/profit/groups/${ids.group}`, ctx.admin);
    expect(g.body.profit).toBe(r.body.total.profit);
    expect((await call('get', '/profit/groups/999', ctx.admin)).status).toBe(404);
  });
  test('profit для порожнього садочка і персональних зарплат', async () => {
    await call('patch', `/staff/${ids.educator}`, ctx.admin, { salary: 10000 });
    await call('patch', '/settings', ctx.admin, { mealCostPercent: 50, roomRentPerMonth: 1000 });
    const r = await call('get', '/profit', ctx.admin);
    expect(r.body.groups[0].directCosts).toBe(10000 + 40000 + 1000);
    const fresh = await setup();
    const empty = await fresh.api('get', '/profit', fresh.admin);
    expect(empty.body.total.profit).toBe(-80000);
  });
  test('річна оплата дає меншу виручку', async () => {
    const before = (await call('get', '/profit', ctx.admin)).body.total.revenue;
    await call('patch', `/children/${ids.child2}`, ctx.admin, { paymentPlan: 'yearly' });
    expect((await call('get', '/profit', ctx.admin)).body.total.revenue).toBeLessThan(before);
  });
  test('optimization', async () => {
    const a = ctx.admin;
    for (let i = 0; i < 31; i += 1) {
      await call('post', '/children', a, { name: `K${i}`, birthDate: yearsAgo(4), parentId: ids.parent });
    }
    const r = (await call('get', '/optimization', a)).body;
    expect(r.children).toBe(33);
    expect(r.perAge.find((x) => x.age === 4)).toMatchObject({ children: 31, groups: 2 });
    expect(r.perAge.find((x) => x.age === 3).groups).toBe(1);
    expect(r.minimumRooms).toBe(3);
    expect(r.subjectTeachers.perSubjectNeeded).toBe(1);
    expect(r.subjectTeachers.extraToHire).toBe(0);
    expect(typeof r.expectedProfit).toBe('number');
    expect(typeof r.profitable).toBe('boolean');
  });
  test('optimization: потрібні додаткові викладачі', async () => {
    await call('patch', '/settings', ctx.admin, { teacherMaxLessonsPerDay: 1, maxGroupSize: 1 });
    await call('delete', `/staff/${ids.teachers.music}`, ctx.admin);
    const r = (await call('get', '/optimization', ctx.admin)).body;
    expect(r.subjectTeachers.perSubjectNeeded).toBe(2);
    expect(r.subjectTeachers.toHire.music).toBe(2);
    expect(r.subjectTeachers.toHire.chess).toBe(1);
    expect(r.subjectTeachers.extraToHire).toBe(6);
  });
  test('optimization для порожнього садочка', async () => {
    const fresh = await setup();
    const r = (await fresh.api('get', '/optimization', fresh.admin)).body;
    expect(r.minimumRooms).toBe(0);
    expect(r.subjectTeachers.perSubjectNeeded).toBe(1);
    expect(r.profitable).toBe(false);
  });
});

describe('settings & history', () => {
  test('settings: чит/зміна/валідація', async () => {
    const a = ctx.admin;
    expect((await call('get', '/settings', a)).body.baseTuition).toBe(15000);
    expect((await call('patch', '/settings', a, { baseTuition: 20000, allowedDiscounts: [0, 50] })).body.baseTuition).toBe(20000);
    expect((await call('patch', '/settings', a, { baseTuition: 'x' })).status).toBe(400);
    expect((await call('patch', '/settings', a, { baseTuition: -1 })).status).toBe(400);
    expect((await call('patch', '/settings', a, { allowedDiscounts: 'x' })).status).toBe(400);
    expect((await call('patch', '/settings', a, { allowedDiscounts: [200] })).status).toBe(400);
    expect((await call('patch', '/settings', a, { subjects: [] })).status).toBe(400);
    await call('post', '/managers', a, { username: 'm', password: 'p', name: 'M' });
    const m = await ctx.login('m', 'p');
    expect((await call('get', '/settings', m)).status).toBe(200);
    expect((await call('patch', '/settings', m, { baseTuition: 1 })).status).toBe(403);
  });
  test('history: фільтри та before/after', async () => {
    await call('patch', `/children/${ids.child}`, ctx.admin, { discountPercent: 30 });
    const h = (await call('get', `/history?collection=children&id=${ids.child}`, ctx.admin)).body;
    const upd = h.filter((x) => x.action === 'update').pop();
    expect(upd.before.discountPercent).toBe(10);
    expect(upd.after.discountPercent).toBe(30);
    expect(upd.actor).toBe('admin:admin');
    expect((await call('get', '/history', ctx.admin)).body.length).toBeGreaterThan(h.length);
  });
});

describe('server wiring', () => {
  test('seedAdmin не дублює адміна', () => {
    const { seedAdmin } = require('../src/app');
    seedAdmin(ctx.store);
    expect(ctx.store.filter('users', (u) => u.role === 'admin')).toHaveLength(1);
  });
});
