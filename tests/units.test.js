'use strict';
const { ageOf, mealPricePerDay, calcBilling } = require('../src/modules/billing/billing');
const { DEFAULT_SETTINGS } = require('../src/config');
const { spread, lessonSlotIndexes, emptyDay, generateSchedule, viewSchedule, teacherView } = require('../src/schedule');
const { hashPassword, verifyPassword } = require('../src/auth');
const { HttpError, bad, notFound, forbidden, unauthorized, conflict } = require('../src/errors');

const S = DEFAULT_SETTINGS;

describe('billing', () => {
  test('ageOf: до і після дня народження', () => {
    expect(ageOf('2020-06-15', '2024-06-14')).toBe(3);
    expect(ageOf('2020-06-15', '2024-06-15')).toBe(4);
    expect(ageOf('2020-06-15', '2024-05-01')).toBe(3);
    expect(ageOf('2020-06-15', '2024-07-01')).toBe(4);
    expect(ageOf('2020-06-15')).toBeGreaterThanOrEqual(5);
  });

  test('mealPricePerDay: 300 для 2 років, +100 за рік', () => {
    expect(mealPricePerDay(2, S)).toBe(300);
    expect(mealPricePerDay(3, S)).toBe(400);
    expect(mealPricePerDay(5, S)).toBe(600);
    expect(mealPricePerDay(1, S)).toBe(300);
  });

  test('calcBilling: без пільг', () => {
    const b = calcBilling({ id: 1, birthDate: '2022-01-01' }, S, { asOf: '2024-06-01' });
    expect(b.age).toBe(2);
    expect(b.tuitionPerMonth).toBe(15000);
    expect(b.mealsPerMonth).toBe(300 * 22);
    expect(b.total).toBe(15000 + 6600);
  });

  test('calcBilling: пільга 20% на навчання, їжа без знижки', () => {
    const b = calcBilling({ id: 1, birthDate: '2022-01-01', discountPercent: 20 }, S, { asOf: '2024-06-01', months: 3, workDays: 20 });
    expect(b.tuitionPerMonth).toBe(12000);
    expect(b.tuitionTotal).toBe(36000);
    expect(b.mealsTotal).toBe(300 * 20 * 3);
  });

  test('calcBilling: рік наперед -12% після пільги, період завжди 12 міс', () => {
    const b = calcBilling({ id: 1, birthDate: '2022-01-01', discountPercent: 10, paymentPlan: 'yearly' }, S, { asOf: '2024-06-01', months: 2 });
    expect(b.periodMonths).toBe(12);
    expect(b.tuitionPerMonth).toBe(15000 * 0.9 * 0.88);
    expect(b.tuitionTotal).toBe(142560);
  });

  test('calcBilling: явний plan перекриває план дитини', () => {
    const b = calcBilling({ id: 1, birthDate: '2022-01-01', paymentPlan: 'yearly' }, S, { asOf: '2024-06-01', plan: 'monthly' });
    expect(b.periodMonths).toBe(1);
    expect(b.prepayDiscountPercent).toBe(0);
  });
});

describe('schedule', () => {
  test('слоти: 16 всього, 3 їжа, 2 сон, 11 для занять', () => {
    expect(lessonSlotIndexes()).toHaveLength(11);
    const day = emptyDay();
    expect(day).toHaveLength(16);
    expect(day.filter((s) => s.type === 'meal')).toHaveLength(3);
    expect(day.filter((s) => s.type === 'sleep')).toHaveLength(2);
    expect(day[0]).toMatchObject({ start: '08:00', end: '08:30' });
    expect(day[15].end).toBe('16:00');
  });

  test('spread: рівномірний розподіл', () => {
    expect(spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)).toEqual([0, 3, 5, 8, 10]);
    expect(spread([4, 5], 1)).toEqual([4]);
    expect(spread([4, 5], 0)).toEqual([]);
  });

  const mkStaff = () => S.subjects.map((sub, i) => ({ id: 100 + i, type: 'subject', subjects: [sub] }));

  test('без викладача - конфлікт no_teacher', () => {
    const { conflicts } = generateSchedule([{ id: 1 }], [], S);
    expect(conflicts.filter((c) => c.type === 'no_teacher')).toHaveLength(5);
  });

  test('жоден викладач не веде дві групи одночасно + кожна група має всі предмети щодня', () => {
    const groups = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const { schedule, conflicts } = generateSchedule(groups, mkStaff(), S);
    expect(conflicts).toEqual([]);
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach((day) => {
      const seen = new Set();
      groups.forEach((g) => {
        const lessons = schedule.days[g.id][day].filter((x) => x.type === 'lesson');
        expect(new Set(lessons.map((l) => l.subject)).size).toBe(5);
        lessons.forEach((l) => {
          const key = `${l.teacherId}-${l.slot}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        });
      });
    });
  });

  test('no_free_slot, якщо в викладача вичерпано денний ліміт', () => {
    const settings = { ...S, teacherMaxLessonsPerDay: 1 };
    const { conflicts } = generateSchedule([{ id: 1 }, { id: 2 }], mkStaff(), settings);
    expect(conflicts.some((c) => c.type === 'no_free_slot')).toBe(true);
  });

  test('балансування: два викладачі одного предмета ділять навантаження', () => {
    const staff = [...mkStaff(), { id: 200, type: 'subject', subjects: ['music'] }];
    const { schedule } = generateSchedule([{ id: 1 }, { id: 2 }], staff, S);
    const ids = new Set();
    [1, 2].forEach((g) => schedule.days[g].Mon.filter((s) => s.subject === 'music').forEach((s) => ids.add(s.teacherId)));
    expect(ids.size).toBe(2);
  });

  test('viewSchedule / teacherView', () => {
    expect(viewSchedule(null, [1])).toEqual({ generatedAt: null, groups: {} });
    expect(teacherView(null, 1)).toEqual({ generatedAt: null, days: {} });
    const { schedule } = generateSchedule([{ id: 1 }], mkStaff(), S);
    expect(Object.keys(viewSchedule(schedule, [1, 99]).groups)).toEqual(['1']);
    const tv = teacherView(schedule, 100);
    expect(tv.days.Mon).toHaveLength(1);
    expect(tv.days.Mon[0].groupId).toBe(1);
  });
});

describe('auth & errors', () => {
  test('hash/verify', () => {
    const h = hashPassword('secret');
    expect(verifyPassword('secret', h)).toBe(true);
    expect(verifyPassword('nope', h)).toBe(false);
  });
  test('helpers', () => {
    expect([bad('x'), notFound(), forbidden(), unauthorized(), conflict('c', 1)].map((e) => e.status))
      .toEqual([400, 404, 403, 401, 409]);
    expect(bad('x')).toBeInstanceOf(HttpError);
  });
});
