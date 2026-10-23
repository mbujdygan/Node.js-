'use strict';

const express = require('express');
const { authenticate, requireRole } = require('../auth/auth');
const { createStaffController } = require('./staff.controller');

function createStaffRouter(store) {
    const router = express.Router();
    const controller = createStaffController(store);

    const staffAdmin = [authenticate, requireRole('admin')];
    const staffMgr = [authenticate, requireRole('admin', 'manager')];

    router.post('/', ...staffAdmin, controller.create);
    router.get('/', ...staffMgr, controller.list);
    router.get('/:id', ...staffMgr, controller.get);
    router.patch('/:id', ...staffAdmin, controller.update);
    router.delete('/:id', ...staffAdmin, controller.remove);
    router.get('/:id/schedule', authenticate, controller.getSchedule);

    return router;
}

module.exports = { createStaffRouter };