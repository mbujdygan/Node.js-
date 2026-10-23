'use strict';

const { hashPassword } = require('../auth/auth');
const { bad, notFound, conflict } = require('../../errors');

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const publicUser = ({ passwordHash, ...user }) => user;

function createParentsService(store) {
  async function getParent(id) {
    const parent = await store.get('users', id);
    if (!parent || parent.role !== 'parent') {
      throw notFound('Parent not found');
    }
    return parent;
  }

  return {
    async create(data, actor) {
      const { username, password, name, phone } = data;

      if (![username, password, name].every(isStr)) {
        throw bad('username, password, name are required');
      }

      if (await store.one('users', { username })) {
        throw conflict('Username already exists');
      }

      const user = await store.insert('users', {
        username,
        name,
        phone: phone || null,
        role: 'parent',
        passwordHash: hashPassword(password),
      }, actor);

      return publicUser(user);
    },

    async list() {
      const parents = await store.where('users', { role: 'parent' });
      return parents.map(publicUser);
    },

    async get(id) {
      return publicUser(await getParent(id));
    },

    async update(id, data, actor) {
      const parent = await getParent(id);
      const { name, phone } = data;
      const patch = {};

      if (name !== undefined) {
        if (!isStr(name)) {
          throw bad('name must be a non-empty string');
        }
        patch.name = name;
      }

      if (phone !== undefined) {
        if (phone !== null && !isStr(phone)) {
          throw bad('phone must be a string or null');
        }
        patch.phone = phone;
      }

      if (Object.keys(patch).length === 0) {
        throw bad('No valid fields to update');
      }

      const updated = await store.update('users', parent.id, patch, actor);
      return publicUser(updated);
    },

    async remove(id, actor) {
      const parent = await getParent(id);
      const children = await store.where('children', {
        parentId: parent.id,
      });

      if (children.length > 0) {
        throw conflict('Cannot delete parent with children');
      }

      await store.remove('users', parent.id, actor);
    },
  };
}

module.exports = { createParentsService };

