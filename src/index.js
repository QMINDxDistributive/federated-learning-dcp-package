'use strict';

const { train } = require('./lr/train');
const { predictProba } = require('./lr/model');
const { createLocalRunner } = require('./runners/local');

module.exports = {
  train,
  predictProba,
  createLocalRunner,
  // Loaded lazily so the package works without dcp-client for local use.
  get createDcpRunner() {
    return require('./runners/dcp').createDcpRunner;
  },
};
