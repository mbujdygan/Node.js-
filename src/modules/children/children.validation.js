'use strict';

const isStr = (value) =>
  typeof value === 'string' && value.trim().length > 0;

const validDate = (value) =>
  isStr(value)
  && /^\d{4}-\d{2}-\d{2}/.test(value)
  && !Number.isNaN(Date.parse(value));

module.exports = {
  isStr,
  validDate,
};
