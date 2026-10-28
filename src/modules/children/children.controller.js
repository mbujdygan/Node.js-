'use strict';

function createChildrenController(childrenService) {
  return {
    list: async (req, res, next) => {
      try {
        res.json(await childrenService.list(req));
      } catch (err) {
        next(err);
      }
    },

    getById: async (req, res, next) => {
      try {
        res.json(await childrenService.getById(req, req.params.id));
      } catch (err) {
        next(err);
      }
    },

    create: async (req, res, next) => {
      try {
        res.status(201).json(await childrenService.create(req));
      } catch (err) {
        next(err);
      }
    },

    update: async (req, res, next) => {
      try {
        res.json(await childrenService.update(req, req.params.id));
      } catch (err) {
        next(err);
      }
    },

    remove: async (req, res, next) => {
      try {
        await childrenService.remove(req, req.params.id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    getBilling: async (req, res, next) => {
      try {
        res.json(await childrenService.getBilling(req, req.params.id));
      } catch (err) {
        next(err);
      }
    },

    getSchedule: async (req, res, next) => {
      try {
        res.json(await childrenService.getSchedule(req, req.params.id));
      } catch (err) {
        next(err);
      }
    },
  };
}

module.exports = { createChildrenController };
