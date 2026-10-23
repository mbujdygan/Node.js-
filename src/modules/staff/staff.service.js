'use strict';

const { hashPassword } = require('../auth/auth');
const { bad, notFound, conflict, forbidden } = require('../../errors');
const { teacherView } = require('../schedule/schedule');

const STAFF_TYPES = ['educator', 'assistant', 'subject'];
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

function createStaffService(store) {
    const s = () => store.settings;

    async function getStaff(id) {
    const st = await store.get('staff', id);
    if (!st) throw notFound('Staff not found');
    return st;
    }

    return {
    async list(type) {
        if (type && !STAFF_TYPES.includes(type)) {
            throw bad(`type must be one of ${STAFF_TYPES.join(', ')}`);
        }
        return type ? await store.where('staff', { type }) : await store.list('staff');
    },

    async get(id) {
        return await getStaff(id);
    },

    async create(data, actor) {
        const { name, type, subjects, salary, username, password } = data;
        if (!isStr(name)) throw bad('name is required');
        if (!STAFF_TYPES.includes(type)) throw bad(`type must be one of ${STAFF_TYPES.join(', ')}`);
        if (salary !== undefined && !(Number(salary) >= 0)) throw bad('salary must be a non-negative number');

        let subs = [];
        if (type === 'subject') {
            if (!Array.isArray(subjects) || !subjects.length || !subjects.every((x) => s().subjects.includes(x))) {
                throw bad(`subjects must be a non-empty subset of ${s().subjects.join(', ')}`);
            }
        subs = subjects;
        }

        if ((username || password) && !(isStr(username) && isStr(password))) {
            throw bad('username and password must be set together');
        }
        if (username && (await store.one('users', { username }))) {
            throw conflict('Username already exists');
        }

        const st = await store.insert(
        'staff',
        { name, type, subjects: subs, salary: salary === undefined ? undefined : Number(salary) },
        actor
        );

        if (username) {
        const u = await store.insert(
            'users',
            { username, name, role: 'teacher', staffId: st.id, passwordHash: hashPassword(password) },
            actor
        );
        return { ...st, userId: u.id };
        }

        return st;
    },

    async update(id, data, actor) {
        const st = await getStaff(id);
        const { name, subjects, salary } = data;
        const patch = {};

        if (name !== undefined) {
        if (!isStr(name)) throw bad('name must be a string');
        patch.name = name;
        }
        if (salary !== undefined) {
        if (!(Number(salary) >= 0)) throw bad('salary must be a non-negative number');
        patch.salary = Number(salary);
        }
        if (subjects !== undefined) {
            if (st.type !== 'subject' || !Array.isArray(subjects) || !subjects.length || !subjects.every((x) => s().subjects.includes(x))) {
                throw bad('invalid subjects');
            }
        patch.subjects = subjects;
        }

        return await store.update('staff', st.id, patch, actor);
    },

    async remove(id, actor) {
        const st = await getStaff(id);
        const used = (await store.list('groups')).some((g) => g.educatorId === st.id || g.assistantId === st.id);
        if (used) throw conflict('Staff member is assigned to a group');

        const userAcc = await store.one('users', { staffId: st.id });
        if (userAcc) {
            await store.remove('users', userAcc.id, actor);
        }

        await store.remove('staff', st.id, actor);
    },

    async getSchedule(id, user) {
        const st = await getStaff(id);
        const own = user.role === 'teacher' && user.staffId === st.id;
        if (!own && !['admin', 'manager'].includes(user.role)) {
            throw forbidden('Not your schedule');
        }
        return teacherView(await store.getSchedule(), st.id);
    },
    };
}

module.exports = { createStaffService };