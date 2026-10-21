'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { unauthorized, forbidden } = require('./errors');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-me';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username, staffId: user.staffId },
    SECRET(), { expiresIn: '12h' },
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return next(unauthorized('Missing bearer token'));
  try {
    req.user = jwt.verify(token, SECRET());
    return next();
  } catch (e) {
    return next(unauthorized('Invalid or expired token'));
  }
}

const requireRole = (...roles) => (req, res, next) => (
  roles.includes(req.user.role) ? next() : next(forbidden('Insufficient role'))
);

module.exports = { hashPassword, verifyPassword, signToken, authenticate, requireRole };
