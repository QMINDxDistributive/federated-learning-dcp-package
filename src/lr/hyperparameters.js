'use strict';

/**
 * Hyperparameter defaults and validation (LR spec, "How hyperparameters differ between methods").
 * Validation runs on the coordinator before any job is deployed.
 *
 * This build implements method "newton" only. FedAvg keys are recognised so they give a clear
 * error instead of "unknown key".
 */

const NEWTON_DEFAULTS = {
  method: 'newton',
  l2: 1.0,
  fitIntercept: true,
  standardize: true,
  maxRounds: 25,
  tolerance: 1e-6,
  minParticipants: null, // null = all sites
  minSiteRows: 'auto',
  siteSizeCheck: 'error',
  classWeight: null,
  siteShiftWarning: 3,
  roundTimeoutMs: 5 * 60 * 1000,
  maxRoundRetries: 2,
  damping: 0,
};

const FEDAVG_ONLY = ['learningRate', 'localEpochs', 'batchSize', 'proximalMu'];

function fail(msg) {
  throw new Error(`Invalid hyperparameters: ${msg}`);
}

function isInt(v) {
  return Number.isInteger(v);
}

function resolveHyperparameters(input = {}) {
  const method = input.method ?? 'newton';
  if (method === 'fedavg') fail('method "fedavg" is not implemented in this build yet');
  if (method !== 'newton') fail(`method must be "newton" or "fedavg", got ${JSON.stringify(method)}`);

  for (const key of Object.keys(input)) {
    if (FEDAVG_ONLY.includes(key)) fail(`"${key}" applies to method "fedavg" only`);
    if (!(key in NEWTON_DEFAULTS)) fail(`unknown key "${key}"`);
  }

  const h = { ...NEWTON_DEFAULTS, ...input };

  if (!(typeof h.l2 === 'number' && h.l2 > 0)) fail('l2 must be a number > 0 for method "newton"');
  if (typeof h.fitIntercept !== 'boolean') fail('fitIntercept must be a boolean');
  if (typeof h.standardize !== 'boolean') fail('standardize must be a boolean');
  if (!(isInt(h.maxRounds) && h.maxRounds >= 1 && h.maxRounds <= 1000)) fail('maxRounds must be an integer from 1 to 1000');
  if (!(typeof h.tolerance === 'number' && h.tolerance > 0)) fail('tolerance must be a number > 0');
  if (h.minParticipants !== null && !(isInt(h.minParticipants) && h.minParticipants >= 1)) fail('minParticipants must be null or an integer >= 1');
  if (h.minSiteRows !== 'auto' && !(isInt(h.minSiteRows) && h.minSiteRows >= 1)) fail('minSiteRows must be "auto" or an integer >= 1');
  if (!['error', 'warn'].includes(h.siteSizeCheck)) fail('siteSizeCheck must be "error" or "warn"');
  if (h.siteShiftWarning !== null && !(typeof h.siteShiftWarning === 'number' && h.siteShiftWarning > 0)) fail('siteShiftWarning must be null or a number > 0');
  if (!(isInt(h.roundTimeoutMs) && h.roundTimeoutMs > 0)) fail('roundTimeoutMs must be an integer > 0');
  if (!(isInt(h.maxRoundRetries) && h.maxRoundRetries >= 0)) fail('maxRoundRetries must be an integer >= 0');
  if (!(typeof h.damping === 'number' && h.damping >= 0)) fail('damping must be a number >= 0');

  const cw = h.classWeight;
  if (!(cw === null || cw === 'balanced' || (typeof cw === 'object' && cw[0] > 0 && cw[1] > 0))) {
    fail('classWeight must be null, "balanced", or { "0": w0, "1": w1 } with w > 0');
  }
  return h;
}

module.exports = { resolveHyperparameters, NEWTON_DEFAULTS };
