'use strict';

const Joi = require('joi');
const { bad } = require('../../errors');

// Схема для /auth/login
const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

// Схема для /managers
const managerSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
  name: Joi.string().required(),
});

// Схема для /parents
const parentSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
  name: Joi.string().required(),
  phone: Joi.string().allow(null, '').optional(),
});

// Схема для /staff
const staffSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().valid('educator', 'assistant', 'subject').required(),
  salary: Joi.number().min(0).optional(),
  subjects: Joi.array().items(Joi.string()).optional(),
  username: Joi.string().optional(),
  password: Joi.string().optional(),
}).with('username', 'password').with('password', 'username');

// Універсальний middleware для обробки помилок Joi
const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body || {}, { abortEarly: false, allowUnknown: true });

  if (error) {
    const msg = error.details.map((d) => d.message).join(', ');
    throw bad(msg);
  }

  req.body = value;
  next();
};

module.exports = {
  validateLogin: validateBody(loginSchema),
  validateManager: validateBody(managerSchema),
  validateParent: validateBody(parentSchema),
  validateStaff: validateBody(staffSchema),
};
