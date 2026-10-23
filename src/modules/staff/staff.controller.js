'use strict';

const { createStaffService } = require('./staff.service');

function createStaffController(store) {
    const service = createStaffService(store);
    const actor = (req) => `${req.user.role}:${req.user.username}`;

    return {
    async list(req, res) {
        res.json(await service.list(req.query.type));
    },

    async get(req, res) {
        res.json(await service.get(req.params.id));
    },

    async create(req, res) {
        const result = await service.create(req.body || {}, actor(req));
        res.status(201).json(result);
    },

    async update(req, res) {
        const updated = await service.update(req.params.id, req.body || {}, actor(req));
        res.json(updated);
    },

    async remove(req, res) {
        await service.remove(req.params.id, actor(req));
        res.status(204).end();
    },

    async getSchedule(req, res) {
        const schedule = await service.getSchedule(req.params.id, req.user);
        res.json(schedule);
    },
    };
}

module.exports = { createStaffController };