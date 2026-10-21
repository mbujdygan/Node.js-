'use strict';
const { calcBilling, ageOf, mealPricePerDay, round2 } = require('./billing');

function childEconomics(child, s) {
  const b = calcBilling(child, s, { plan: child.paymentPlan || 'monthly', months: 1 });
  const tuition = b.tuitionPerMonth;
  const mealsRevenue = b.mealsPerMonth;
  const mealsCost = mealsRevenue * (s.mealCostPercent / 100);
  return { tuition, mealsRevenue, mealsCost, net: tuition + mealsRevenue - mealsCost };
}

function sharedCosts(staff, s) {
  const subjectStaff = staff.filter((x) => x.type === 'subject');
  const subjectSalaries = subjectStaff.reduce((sum, x) => sum + (x.salary || s.teacherSalary), 0);
  const managers = s.managersOnPayroll * s.managerSalary;
  return { subjectSalaries, managers, total: subjectSalaries + managers };
}

/** Прибуток по кожній групі та загалом (місячний). */
function calcProfit(store) {
  const s = store.data.settings;
  const children = store.filter('children', (c) => c.groupId);
  const staff = store.list('staff');
  const shared = sharedCosts(staff, s);
  const totalChildren = children.length;
  const salaryOf = (id) => {
    const st = staff.find((x) => x.id === id);
    return st ? (st.salary || s.teacherSalary) : 0;
  };

  const groups = store.list('groups').map((g) => {
    const kids = children.filter((c) => c.groupId === g.id);
    const eco = kids.map((c) => childEconomics(c, s));
    const revenue = eco.reduce((a, e) => a + e.tuition + e.mealsRevenue, 0);
    const mealsCost = eco.reduce((a, e) => a + e.mealsCost, 0);
    const direct = salaryOf(g.educatorId) + salaryOf(g.assistantId) + s.roomRentPerMonth;
    const share = totalChildren ? kids.length / totalChildren : 0;
    const allocated = shared.total * share;
    return {
      groupId: g.id,
      name: g.name,
      children: kids.length,
      revenue: round2(revenue),
      mealsCost: round2(mealsCost),
      directCosts: round2(direct),
      allocatedSharedCosts: round2(allocated),
      profit: round2(revenue - mealsCost - direct - allocated),
    };
  });

  const revenue = groups.reduce((a, g) => a + g.revenue, 0);
  const mealsCost = groups.reduce((a, g) => a + g.mealsCost, 0);
  const direct = groups.reduce((a, g) => a + g.directCosts, 0);
  return {
    currency: 'UAH',
    period: 'month',
    groups,
    total: {
      children: totalChildren,
      revenue: round2(revenue),
      mealsCost: round2(mealsCost),
      directCosts: round2(direct),
      sharedCosts: round2(shared.total),
      sharedCostsBreakdown: { subjectTeachers: shared.subjectSalaries, managers: shared.managers },
      // якщо жодної групи немає, спільні витрати все одно існують
      profit: round2(revenue - mealsCost - direct - shared.total),
    },
  };
}

/**
 * Оптимальна конфігурація садочка для поточних дітей:
 * мінімальна кількість груп/кімнат (за віком і ліміту), потрібні викладачі,
 * очікуваний прибуток та окупність.
 */
function optimize(store) {
  const s = store.data.settings;
  const children = store.list('children');
  const byAge = {};
  children.forEach((c) => {
    const a = ageOf(c.birthDate);
    (byAge[a] = byAge[a] || []).push(c);
  });

  let totalGroups = 0;
  let revenue = 0;
  let mealsCost = 0;
  const perAge = Object.keys(byAge).map(Number).sort().map((age) => {
    const kids = byAge[age];
    const groups = Math.ceil(kids.length / s.maxGroupSize);
    totalGroups += groups;
    const eco = kids.map((c) => childEconomics(c, s));
    const rev = eco.reduce((a, e) => a + e.tuition + e.mealsRevenue, 0);
    const mc = eco.reduce((a, e) => a + e.mealsCost, 0);
    revenue += rev;
    mealsCost += mc;
    const marginPerChild = (rev - mc) / kids.length;
    const groupCost = 2 * s.teacherSalary + s.roomRentPerMonth; // вихователь + помічник + кімната
    return {
      age,
      children: kids.length,
      groups,
      averageGroupSize: round2(kids.length / groups),
      mealPricePerDay: mealPricePerDay(age, s),
      breakEvenChildrenPerGroup: Math.ceil(groupCost / marginPerChild),
      groupFillsBreakEven: kids.length / groups >= Math.ceil(groupCost / marginPerChild),
    };
  });

  const teachersPerSubject = Math.max(1, Math.ceil(totalGroups / s.teacherMaxLessonsPerDay));
  const subjectTeachersNeeded = s.subjects.length * teachersPerSubject;
  const existing = store.filter('staff', (x) => x.type === 'subject');
  const existingBySubject = {};
  s.subjects.forEach((sub) => {
    existingBySubject[sub] = existing.filter((x) => (x.subjects || []).includes(sub)).length;
  });
  const hire = {};
  s.subjects.forEach((sub) => {
    hire[sub] = Math.max(0, teachersPerSubject - existingBySubject[sub]);
  });
  const extraTeachers = Object.values(hire).reduce((a, b) => a + b, 0);

  const costs = totalGroups * (2 * s.teacherSalary + s.roomRentPerMonth)
    + subjectTeachersNeeded * s.teacherSalary
    + s.managersOnPayroll * s.managerSalary;
  const profit = revenue - mealsCost - costs;

  return {
    currency: 'UAH',
    period: 'month',
    children: children.length,
    minimumRooms: totalGroups,
    perAge,
    subjectTeachers: { perSubjectNeeded: teachersPerSubject, totalNeeded: subjectTeachersNeeded, existingBySubject, toHire: hire, extraToHire: extraTeachers },
    revenue: round2(revenue),
    mealsCost: round2(mealsCost),
    costs: round2(costs),
    expectedProfit: round2(profit),
    profitable: profit > 0,
  };
}

module.exports = { calcProfit, optimize, childEconomics };
