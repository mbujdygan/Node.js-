'use strict';

const express = require('express');
const { authenticate, requireRole } = require('../auth/auth');
const { createParentsController } = require('./parents.controller');

function createParentsRouter(store) {
  const router = express.Router();
  const controller = createParentsController(store);

  router.use(authenticate, requireRole('admin', 'manager'));

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);

  return router;
}

module.exports = { createParentsRouter };
