'use strict';

const { workFunction } = require('../lr/workFunction');

/**
 * Runs every site's work function in this process, no DCP. Used for tests, development and as
 * the demo fallback. Inputs and results go through JSON, the same as they would over DCP.
 *
 * sites: [{ name, data: { X, y, featureNames } }]
 */
function createLocalRunner(sites, { delayMs = 0 } = {}) {
  return {
    mode: 'local',
    siteNames: sites.map((s) => s.name),
    async runRound(stage, args) {
      const wireArgs = JSON.parse(JSON.stringify(args));
      const out = [];
      for (const s of sites) {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        out.push(JSON.parse(JSON.stringify(workFunction(s.data, wireArgs))));
      }
      return out;
    },
  };
}

module.exports = { createLocalRunner };
