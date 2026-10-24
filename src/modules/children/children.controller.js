'use strict';

function createChildrenController(childrenService) {
  return {
    list: async (req, res) => {
      res.json(await childrenService.list(req));
    },

    getById: async (req, res) => {
      res.json(await childrenService.getById(req, req.params.id));
    },

    create: async (req, res) => {
      res.status(201).json(await childrenService.create(req));
    },

    update: async (req, res) => {
      res.json(await childrenService.update(req, req.params.id));
    },

    remove: async (req, res) => {
      await childrenService.remove(req, req.params.id);
      res.status(204).end();
    },
  };
}

module.exports = { createChildrenController };
