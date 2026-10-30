'use strict';

const { ageOf, calcBilling } = require('../billing/billing');
const { viewSchedule } = require('../schedule/schedule');
const { bad, notFound, forbidden, conflict } = require('../../errors');
const { isStr, validDate } = require('./children.validation');

const PLANS = ['monthly', 'yearly'];

function createChildrenService(store) {
  const s = () => store.settings;

  const actor = (req) => `${req.user.role}:${req.user.username}`;

  const canSeeChild = (req, child, group) => {
    const { role, id, staffId } = req.user;

    if (role === 'admin' || role === 'manager') return true;
    if (role === 'parent') return child.parentId === id;

    return Boolean(
      group
      && (group.educatorId === staffId || group.assistantId === staffId),
    );
  };

  const getGroup = async (id) => {
    const group = await store.get('groups', id);
    if (!group) throw notFound('Group not found');
    return group;
  };

  const requireParent = async (parentId) => {
    const parent = await store.get('users', parentId);
    if (!parent || parent.role !== 'parent') {
      throw bad('parentId must reference an existing parent');
    }
    return parent;
  };

  const validateDiscount = (discount) => {
    if (!s().allowedDiscounts.includes(discount)) {
      throw bad(
        `discountPercent must be one of ${s().allowedDiscounts.join(', ')}`,
      );
    }
  };

  const withAge = (child) => ({
    ...child,
    age: ageOf(child.birthDate),
  });

  const getById = async (req, id) => {
    const child = await store.get('children', id);
    if (!child) throw notFound('Child not found');

    const group = child.groupId
      ? await store.get('groups', child.groupId)
      : null;

    if (!canSeeChild(req, child, group)) {
      throw forbidden('Not your child');
    }

    return withAge(child);
  };

  const list = async (req) => {
    const groups = new Map(
      (await store.list('groups')).map((group) => [group.id, group]),
    );
    const children = await store.list('children');

    return children
      .filter((child) => canSeeChild(req, child, groups.get(child.groupId)))
      .map(withAge);
  };

  const create = async (req) => {
    const {
      name,
      birthDate,
      parentId,
      discountPercent = 0,
      paymentPlan = 'monthly',
    } = req.body || {};

    if (!isStr(name)) throw bad('name is required');

    if (!validDate(birthDate)) {
      throw bad('birthDate must be a valid date (YYYY-MM-DD)');
    }

    const age = ageOf(birthDate);

    if (age < s().minAge || age > s().maxAge) {
      throw bad(
        `Child age must be between ${s().minAge} and ${s().maxAge}`,
      );
    }

    const parent = await requireParent(parentId);

    if (!PLANS.includes(paymentPlan)) {
      throw bad(`paymentPlan must be one of ${PLANS.join(', ')}`);
    }

    if (req.user.role === 'manager') {
      if (discountPercent !== 0) throw forbidden('Managers cannot grant discounts');
      if (paymentPlan !== 'monthly') throw forbidden('Managers cannot change payment plan');
    }

    validateDiscount(discountPercent);

    const child = await store.insert(
      'children',
      {
        name,
        birthDate: birthDate.slice(0, 10),
        parentId: parent.id,
        groupId: null,
        discountPercent,
        paymentPlan,
      },
      actor(req),
    );

    return withAge(child);
  };

  const update = async (req, id) => {
    const child = await store.get('children', id);
    if (!child) throw notFound('Child not found');

    const group = child.groupId ? await store.get('groups', child.groupId) : null;
    if (!canSeeChild(req, child, group)) throw forbidden('Not your child');

    const {
      name,
      birthDate,
      parentId,
      discountPercent,
      paymentPlan,
    } = req.body || {};

    const patch = {};

    if (name !== undefined) {
      if (!isStr(name)) throw bad('name must be a string');
      patch.name = name;
    }

    if (birthDate !== undefined) {
      if (!validDate(birthDate)) throw bad('invalid birthDate');

      const age = ageOf(birthDate);

      if (age < s().minAge || age > s().maxAge) {
        throw bad('Child age is out of range');
      }

      if (child.groupId && age !== (await getGroup(child.groupId)).age) {
        throw conflict('New age does not match the child group');
      }

      patch.birthDate = birthDate.slice(0, 10);
    }

    if (parentId !== undefined) {
      patch.parentId = (await requireParent(parentId)).id;
    }

    if (discountPercent !== undefined || paymentPlan !== undefined) {
      if (req.user.role === 'manager') {
        throw forbidden('Managers cannot change financial parameters');
      }

      if (discountPercent !== undefined) {
        validateDiscount(discountPercent);
        patch.discountPercent = discountPercent;
      }

      if (paymentPlan !== undefined) {
        if (!PLANS.includes(paymentPlan)) {
          throw bad(`paymentPlan must be one of ${PLANS.join(', ')}`);
        }
        patch.paymentPlan = paymentPlan;
      }
    }

    return withAge(
      await store.update('children', child.id, patch, actor(req)),
    );
  };

  const remove = async (req, id) => {
    if (req.user.role === 'manager') {
      throw forbidden('Managers cannot delete children');
    }
    const child = await store.get('children', id);
    if (!child) throw notFound('Child not found');

    await store.remove('children', child.id, actor(req));
  };

  const getBilling = async (req, id) => {
    const child = await store.get('children', id);
    if (!child) throw notFound('Child not found');

    const group = child.groupId ? await store.get('groups', child.groupId) : null;
    if (!canSeeChild(req, child, group)) throw forbidden('Not your child');

    const { months, plan, workDays } = req.query || {};

    if (plan !== undefined && !PLANS.includes(plan)) {
      throw bad(`plan must be one of ${PLANS.join(', ')}`);
    }
    const m = months === undefined ? undefined : Number(months);
    if (m !== undefined && (!Number.isInteger(m) || m < 1 || m > 12)) {
      throw bad('months must be an integer 1..12');
    }
    const w = workDays === undefined ? undefined : Number(workDays);
    if (w !== undefined && (!Number.isInteger(w) || w < 1 || w > 31)) {
      throw bad('workDays must be an integer 1..31');
    }

    return calcBilling(child, s(), { months: m, plan, workDays: w });
  };

  const getSchedule = async (req, id) => {
    const child = await store.get('children', id);
    if (!child) throw notFound('Child not found');

    const group = child.groupId ? await store.get('groups', child.groupId) : null;
    if (!canSeeChild(req, child, group)) throw forbidden('Not your child');

    return viewSchedule(
      await store.getSchedule(),
      child.groupId ? [child.groupId] : [],
    );
  };

  return {
    list,
    getById,
    create,
    update,
    remove,
    getBilling,
    getSchedule,
  };
}

module.exports = { createChildrenService };
