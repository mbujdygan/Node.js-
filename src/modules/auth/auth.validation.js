'use strict';

const Joi = require('joi');
const { bad, unauthorized } = require('../../errors');

// Непорожній рядок (пробіли по краях обрізаються, рядок з самих пробілів - помилка)
const text = () => Joi.string().trim().required();
// Пароль не обрізаємо, але рядок з самих пробілів недопустимий
const secret = () => Joi.string().regex(/\S/).required();

// POST /auth/login
const loginSchema = Joi.object({
  username: text(),
  password: secret(),
});

// POST /managers
const managerSchema = Joi.object({
  username: text(),
  password: secret(),
  name: text(),
});

// POST /parents
const parentSchema = Joi.object({
  username: text(),
  password: secret(),
  name: text(),
  phone: Joi.string().allow(null, '').optional(),
});

// POST /staff
const staffSchema = Joi.object({
  name: text(),
  type: Joi.string().valid('educator', 'assistant', 'subject').required(),
  salary: Joi.number().min(0).optional(),
  subjects: Joi.array().items(Joi.string()).optional(),
  username: Joi.string().trim().optional(),
  password: Joi.string().regex(/\S/).optional(),
}).and('username', 'password'); // логін і пароль - тільки разом

// Універсальний middleware. makeError визначає HTTP-статус помилки валідації.
const validateBody = (schema, makeError = bad) => (req, res, next) => {
  const { error, value } = schema.validate(req.body || {}, { abortEarly: false, allowUnknown: true });
  if (error) return next(makeError(error.details.map((d) => d.message).join(', ')));
  req.body = value;
  return next();
};

module.exports = {
  
  validateLogin: validateBody(loginSchema, () => unauthorized('Invalid credentials')),
  validateManager: validateBody(managerSchema),
  validateParent: validateBody(parentSchema),
  validateStaff: validateBody(staffSchema),
};