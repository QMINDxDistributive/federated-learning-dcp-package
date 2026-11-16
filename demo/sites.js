'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SITES_DIR = path.join(__dirname, 'data', 'sites');

/** Load the per-state training files written by tools/brfss/prepare.py. */
function loadSites() {
  return fs
    .readdirSync(SITES_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'test.json')
    .sort()
    .map((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(SITES_DIR, f), 'utf8'));
      return { name: data.site, data };
    });
}

function loadTestSet() {
  return JSON.parse(fs.readFileSync(path.join(SITES_DIR, 'test.json'), 'utf8'));
}

module.exports = { loadSites, loadTestSet, SITES_DIR };
