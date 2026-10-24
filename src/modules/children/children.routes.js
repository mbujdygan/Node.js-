'use strict';

const express = require('express');
const { authenticate, requireRole } = require('../auth/auth');
const { createChildrenService } = require('./children.service');
const { createChildrenController } = require('./children.controller');

function createChildrenRouter(store) {
  const router = express.Router();

  const service = createChildrenService(store);
  const controller = createChildrenController(service);

  const staffMgr = [authenticate, requireRole('admin', 'manager')];
  const staffAdmin = [authenticate, requireRole('admin')];

  router.post('/', ...staffMgr, controller.create);
  router.get('/', authenticate, controller.list);
  router.get('/:id', authenticate, controller.getById);
  router.patch('/:id', ...staffMgr, controller.update);
  router.delete('/:id', ...staffAdmin, controller.remove);

  return router;
}

module.exports = { createChildrenRouter };
