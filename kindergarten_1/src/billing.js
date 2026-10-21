'use strict';

const round2 = (n) => Math.round(n * 100) / 100;

/** Повних років на дату asOf. */
function ageOf(birthDate, asOf = new Date()) {
  const b = new Date(birthDate);
  const a = new Date(asOf);
  let age = a.getFullYear() - b.getFullYear();
  const m = a.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < b.getDate())) age -= 1;
  return age;
}

/** Ціна харчування за день залежить від віку: 300 грн для 2 років, +100 за кожен наступний рік. */
function mealPricePerDay(age, s) {
  return s.mealPriceForAge2 + Math.max(0, age - s.minAge) * s.mealPriceStepPerYear;
}

/**
 * Розрахунок оплати для дитини.
 * - пільга (0/10/20/30%) діє на навчання;
 * - оплата за рік наперед дає додаткову знижку (12%) на навчання (після пільги);
 * - харчування рахується окремо, знижки на нього не діють.
 */
function calcBilling(child, s, { months, plan, workDays, asOf } = {}) {
  const paymentPlan = plan || child.paymentPlan || 'monthly';
  const periodMonths = paymentPlan === 'yearly' ? 12 : (months || 1);
  const days = workDays || s.workDaysPerMonth;
  const age = ageOf(child.birthDate, asOf);

  const discountPercent = child.discountPercent || 0;
  const prepayPercent = paymentPlan === 'yearly' ? s.prepayDiscountPercent : 0;

  const tuitionBase = s.baseTuition;
  const afterBenefit = tuitionBase * (1 - discountPercent / 100);
  const tuitionPerMonth = afterBenefit * (1 - prepayPercent / 100);
  const mealPerDay = mealPricePerDay(age, s);
  const mealsPerMonth = mealPerDay * days;

  const tuitionTotal = tuitionPerMonth * periodMonths;
  const mealsTotal = mealsPerMonth * periodMonths;

  return {
    childId: child.id,
    age,
    paymentPlan,
    periodMonths,
    workDaysPerMonth: days,
    tuitionBasePerMonth: round2(tuitionBase),
    discountPercent,
    prepayDiscountPercent: prepayPercent,
    tuitionPerMonth: round2(tuitionPerMonth),
    mealPricePerDay: round2(mealPerDay),
    mealsPerMonth: round2(mealsPerMonth),
    tuitionTotal: round2(tuitionTotal),
    mealsTotal: round2(mealsTotal),
    total: round2(tuitionTotal + mealsTotal),
  };
}

module.exports = { ageOf, mealPricePerDay, calcBilling, round2 };
