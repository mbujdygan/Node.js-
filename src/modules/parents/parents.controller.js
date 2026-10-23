'use strict';

const { createParentsService } = require('./parents.service');

function createParentsController(store) {
  const service = createParentsService(store);
  const actor = (req) => `${req.user.role}:${req.user.username}`;

  return {
    async create(req, res) {
      const parent = await service.create(req.body || {}, actor(req));
      res.status(201).json(parent);
    },

    async list(req, res) {
      res.json(await service.list());
    },

    async get(req, res) {
      res.json(await service.get(req.params.id));
    },

    async update(req, res) {
      const parent = await service.update(
        req.params.id,
        req.body || {},
        actor(req)
      );
      res.json(parent);
    },

    async remove(req, res) {
      await service.remove(req.params.id, actor(req));
      res.status(200).json({
        message: 'Parent deleted successfully',
      });
    },
  };
}

module.exports = { createParentsController };
