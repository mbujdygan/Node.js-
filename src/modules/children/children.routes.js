'use strict';

const express = require('express');
const { authenticate, requireRole } = require('../auth/auth');
const childrenController = require('./children.controller');

function createChildrenRouter(store) {
  const router = express.Router();

  const staffMgr = [authenticate, requireRole('admin', 'manager')];
  const staffAdmin = [authenticate, requireRole('admin')];

  router.post('/', ...staffMgr, childrenController.createChild(store));
  router.get('/', authenticate, childrenController.getChildren(store));
  router.get('/:id', authenticate, childrenController.getChild(store));
  router.patch('/:id', authenticate, childrenController.updateChild(store));
  router.delete('/:id', ...staffMgr, childrenController.deleteChild(store));

  // Ендпоінти для billing та schedule
  router.get('/:id/billing', authenticate, requireRole('admin', 'manager', 'parent'), childrenController.getBilling(store));
  router.get('/:id/schedule', authenticate, childrenController.getSchedule(store));

  return router;
}

module.exports = { createChildrenRouter };
