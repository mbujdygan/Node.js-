'use strict';

const express = require('express');
const { authenticate, requireRole } = require('../auth/auth');
const { createChildrenController } = require('./children.controller');
const { createChildrenService } = require('./children.service');

function createChildrenRouter(store) {
  const router = express.Router();
  const childrenService = createChildrenService(store);
  const controller = createChildrenController(childrenService);

  const staffMgr = [authenticate, requireRole('admin', 'manager')];

  router.post('/', ...staffMgr, controller.create);
  router.get('/', authenticate, controller.list);
  router.get('/:id', authenticate, controller.getById);
  router.patch('/:id', authenticate, controller.update);
  router.delete('/:id', ...staffMgr, controller.remove);

  router.get(
    '/:id/billing',
    authenticate,
    requireRole('admin', 'manager', 'parent'),
    controller.getBilling,
  );
  router.get('/:id/schedule', authenticate, controller.getSchedule);

  return router;
}

module.exports = { createChildrenRouter };
