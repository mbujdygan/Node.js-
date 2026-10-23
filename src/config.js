'use strict';

// Усі бізнес-параметри з ТЗ. Адмін може змінювати їх через PATCH /settings.
const DEFAULT_SETTINGS = {
  baseTuition: 15000,            // грн/міс без харчування
  allowedDiscounts: [0, 10, 20, 30], // пільги, %
  prepayDiscountPercent: 12,     // знижка при оплаті за рік наперед
  mealPriceForAge2: 300,         // грн/день для дворічної дитини
  mealPriceStepPerYear: 100,     // +грн/день за кожен наступний рік
  mealCostPercent: 100,          // собівартість харчування, % від ціни (100 = без маржі)
  workDaysPerMonth: 22,          // робочих днів на місяць (припущення)
  teacherSalary: 40000,          // зарплата викладача / вихователя / помічника
  managerSalary: 80000,
  managersOnPayroll: 1,
  roomRentPerMonth: 0,           // оренда однієї кімнати (невідомо з ТЗ)
  maxGroupSize: 30,
  minAge: 2,
  maxAge: 5,
  teacherMaxLessonsPerDay: 8,
  subjects: ['music', 'english', 'pe', 'wrestling', 'chess'],
};

// День: 8 годин = 16 слотів по 30 хв, початок 08:00.
const DAY = {
  start: 8 * 60,
  slotMinutes: 30,
  slots: 16,
  mealSlots: [0, 8, 13],   // сніданок 08:00, обід 12:00, полуденок 14:30
  sleepSlots: [9, 10],     // сон 12:30–13:30 (1 година)
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
};

module.exports = { DEFAULT_SETTINGS, DAY };
