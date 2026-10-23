'use strict';
const { DAY } = require('./config');

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const slotTime = (i) => ({
  start: hhmm(DAY.start + i * DAY.slotMinutes),
  end: hhmm(DAY.start + (i + 1) * DAY.slotMinutes),
});

const lessonSlotIndexes = () => Array.from({ length: DAY.slots }, (_, i) => i)
  .filter((i) => !DAY.mealSlots.includes(i) && !DAY.sleepSlots.includes(i));

/** Рівномірно обирає k індексів з масиву slots. */
function spread(slots, k) {
  if (k <= 1) return slots.slice(0, k);
  return Array.from({ length: k }, (_, i) => slots[Math.round((i * (slots.length - 1)) / (k - 1))]);
}

function emptyDay() {
  return Array.from({ length: DAY.slots }, (_, i) => {
    let type = 'free';
    if (DAY.mealSlots.includes(i)) type = 'meal';
    if (DAY.sleepSlots.includes(i)) type = 'sleep';
    return { slot: i, ...slotTime(i), type };
  });
}

/**
 * Генерація тижневого розкладу для всіх груп.
 * Обмеження: 8 год, 1 год сну, 3 прийоми їжі по 30 хв, один викладач не може вести
 * дві групи одночасно, заняття розподіляються рівномірно, предмети ротуються по днях.
 * Повертає { schedule, conflicts }.
 */
function generateSchedule(groups, staff, settings) {
  const lessonSlots = lessonSlotIndexes();
  const subjects = settings.subjects;
  const conflicts = [];
  const teachersBySubject = {};
  subjects.forEach((sub) => {
    teachersBySubject[sub] = staff.filter((s) => s.type === 'subject' && (s.subjects || []).includes(sub));
    if (!teachersBySubject[sub].length) conflicts.push({ type: 'no_teacher', subject: sub });
  });

  const schedule = { generatedAt: new Date().toISOString(), days: {} };
  groups.forEach((g) => { schedule.days[g.id] = {}; });

  DAY.days.forEach((day, d) => {
    const busy = {}; // teacherId -> Set(slot)
    const load = {}; // teacherId -> кількість уроків за день
    groups.forEach((g, gi) => {
      const slots = emptyDay();
      const order = subjects.map((_, i) => subjects[(i + d + gi) % subjects.length]);
      const targets = spread(lessonSlots, order.length);
      order.forEach((subject, i) => {
        const candidates = [...lessonSlots]
          .filter((sl) => slots[sl].type === 'free')
          .sort((a, b) => Math.abs(a - targets[i]) - Math.abs(b - targets[i]) || a - b);
        for (const sl of candidates) {
          const teacher = teachersBySubject[subject]
            .filter((t) => !(busy[t.id] || new Set()).has(sl) && (load[t.id] || 0) < settings.teacherMaxLessonsPerDay)
            .sort((a, b) => (load[a.id] || 0) - (load[b.id] || 0) || a.id - b.id)[0];
          if (teacher) {
            (busy[teacher.id] = busy[teacher.id] || new Set()).add(sl);
            load[teacher.id] = (load[teacher.id] || 0) + 1;
            slots[sl] = { ...slots[sl], type: 'lesson', subject, teacherId: teacher.id };
            return;
          }
        }
        if (teachersBySubject[subject].length) {
          conflicts.push({ type: 'no_free_slot', day, groupId: g.id, subject });
        }
      });
      schedule.days[g.id][day] = slots;
    });
  });
  return { schedule, conflicts };
}

/** Фільтрує розклад під роль: набір груп + (опційно) лише уроки конкретного викладача. */
function viewSchedule(schedule, groupIds) {
  if (!schedule) return { generatedAt: null, groups: {} };
  const groups = {};
  groupIds.forEach((id) => { if (schedule.days[id]) groups[id] = schedule.days[id]; });
  return { generatedAt: schedule.generatedAt, groups };
}

function teacherView(schedule, staffId) {
  const out = {};
  if (!schedule) return { generatedAt: null, days: out };
  DAY.days.forEach((day) => { out[day] = []; });
  Object.entries(schedule.days).forEach(([groupId, days]) => {
    DAY.days.forEach((day) => {
      (days[day] || []).forEach((s) => {
        if (s.teacherId === staffId) out[day].push({ ...s, groupId: Number(groupId) });
      });
    });
  });
  DAY.days.forEach((day) => out[day].sort((a, b) => a.slot - b.slot));
  return { generatedAt: schedule.generatedAt, days: out };
}

module.exports = { generateSchedule, viewSchedule, teacherView, lessonSlotIndexes, spread, emptyDay };
