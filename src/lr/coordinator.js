'use strict';

const { unpackUpper, choleskySolve } = require('./math');

/**
 * Coordinator-side logic: round 0 (standardization and validation) and the Newton update.
 * Pure functions of site results and state. No DCP, no I/O.
 */

function siteSizeLimit(d, method = 'newton') {
  return method === 'newton' ? Math.max(50, d + (d * (d + 1)) / 2 + 2) : Math.max(50, d + 2);
}

function resolveClassWeights(classWeight, classCounts) {
  if (classWeight === null) return [1, 1];
  if (classWeight === 'balanced') {
    const N = classCounts[0] + classCounts[1];
    return [N / (2 * classCounts[0]), N / (2 * classCounts[1])];
  }
  return [Number(classWeight[0]), Number(classWeight[1])];
}

/** Warn-only check for a feature recorded in different units or coding at one site. */
function siteShiftCheck(siteNames, stats, threshold) {
  const warnings = [];
  if (threshold === null || stats.length < 2) return warnings;
  const p = stats[0].sum.length;
  const names = stats[0].featureNames;
  for (let k = 0; k < stats.length; k++) {
    for (let j = 0; j < p; j++) {
      let nO = 0, sO = 0, qO = 0;
      for (let o = 0; o < stats.length; o++) {
        if (o === k) continue;
        nO += stats[o].n; sO += stats[o].sum[j]; qO += stats[o].sumSq[j];
      }
      const muO = sO / nO;
      const sdO = Math.sqrt(Math.max(0, qO / nO - muO * muO));
      const m = stats[k].sum[j] / stats[k].n;
      const s = Math.sqrt(Math.max(0, stats[k].sumSq[j] / stats[k].n - m * m));
      if (sdO === 0) continue;
      const ratio = s / sdO;
      if (Math.abs(m - muO) > threshold * sdO || ratio < 0.1 || ratio > 10) {
        warnings.push(
          `Site shift: site "${siteNames[k]}" feature "${names[j]}" has mean ${m.toFixed(4)} (SD ${s.toFixed(4)}) ` +
            `vs ${muO.toFixed(4)} (SD ${sdO.toFixed(4)}) at the other sites. Check units and coding.`
        );
      }
    }
  }
  return warnings;
}

/**
 * Round 0: turn each site's stats into global mean, std, N and class weights, and validate.
 * Throws before any training round if the sites cannot train together.
 */
function processStats(siteNames, stats, h) {
  const warnings = [];
  const names = stats[0].featureNames;
  const p = names.length;
  for (let k = 0; k < stats.length; k++) {
    const s = stats[k];
    if (JSON.stringify(s.featureNames) !== JSON.stringify(names)) {
      throw new Error(`Site "${siteNames[k]}" has different feature names or order than site "${siteNames[0]}"`);
    }
    if (s.classCounts[0] === 0 || s.classCounts[1] === 0) {
      throw new Error(`Site "${siteNames[k]}" does not have both classes`);
    }
  }

  const d = p + (h.fitIntercept ? 1 : 0);
  const limit = h.minSiteRows === 'auto' ? siteSizeLimit(d, h.method) : h.minSiteRows;
  for (let k = 0; k < stats.length; k++) {
    if (stats[k].n < limit) {
      const msg = `Site "${siteNames[k]}" has ${stats[k].n} rows, below minSiteRows ${limit}`;
      if (h.siteSizeCheck === 'error') throw new Error(msg);
      warnings.push(msg);
    }
  }

  const N = stats.reduce((a, s) => a + s.n, 0);
  const classCounts = [0, 1].map((c) => stats.reduce((a, s) => a + s.classCounts[c], 0));
  let mean = new Array(p).fill(0);
  let std = new Array(p).fill(1);
  if (h.standardize) {
    for (let j = 0; j < p; j++) {
      const sum = stats.reduce((a, s) => a + s.sum[j], 0);
      const sumSq = stats.reduce((a, s) => a + s.sumSq[j], 0);
      mean[j] = sum / N;
      const v = sumSq / N - mean[j] * mean[j];
      std[j] = Math.sqrt(Math.max(0, v));
      if (!(std[j] > 0)) throw new Error(`Feature "${names[j]}" is constant across all sites`);
    }
  }

  warnings.push(...siteShiftCheck(siteNames, stats, h.siteShiftWarning));

  return {
    N,
    d,
    featureNames: names,
    mean,
    std,
    classCounts,
    classWeights: resolveClassWeights(h.classWeight, classCounts),
    warnings,
  };
}

function penaltyMask(d, fitIntercept) {
  return Array.from({ length: d }, (_, i) => (fitIntercept && i === 0 ? 0 : 1));
}

function initialNewtonState(d, h) {
  return { beta: new Array(d).fill(0), damping: h.damping, prev: null };
}

/**
 * One Newton update from all site results at state.beta.
 * Returns { state (for the next round), loss at state.beta, converged, rejected, maxStep }.
 *
 * Damping: the loss at a new beta is only known in the next round. If it went up, the step is
 * rejected, we return to the previous beta and retry with 10x damping. Otherwise damping / 10.
 */
function newtonUpdate(state, results, h) {
  const d = state.beta.length;
  const D = penaltyMask(d, h.fitIntercept);
  const beta = state.beta;

  let loss = 0;
  for (const r of results) loss += r.loss;
  for (let j = 0; j < d; j++) loss += 0.5 * h.l2 * D[j] * beta[j] * beta[j];

  const prev = state.prev;
  if (prev && loss > prev.loss * (1 + 1e-12)) {
    // Reject: go back to the previous beta with more damping.
    const damping = Math.max(state.damping * 10, 1e-4);
    const step = choleskySolve(addDiag(prev.H, damping), prev.g);
    const next = prev.beta.map((b, j) => b - step[j]);
    return {
      state: { beta: next, damping, prev },
      loss,
      converged: false,
      rejected: true,
      maxStep: Math.max(...step.map(Math.abs)),
    };
  }

  if (prev) {
    const rel = Math.abs(loss - prev.loss) / Math.max(1, Math.abs(loss));
    if (rel < h.tolerance) {
      return { state: { ...state, prev: { ...prev, loss } }, loss, converged: true, rejected: false, maxStep: 0 };
    }
  }

  const g = new Array(d).fill(0);
  const Hp = new Array((d * (d + 1)) / 2).fill(0);
  for (const r of results) {
    for (let j = 0; j < d; j++) g[j] += r.gradient[j];
    for (let j = 0; j < Hp.length; j++) Hp[j] += r.hessian[j];
  }
  for (let j = 0; j < d; j++) g[j] += h.l2 * D[j] * beta[j];
  const H = unpackUpper(Hp, d);
  for (let j = 0; j < d; j++) H[j][j] += h.l2 * D[j];

  const damping = state.damping / 10 < 1e-12 ? 0 : state.damping / 10;
  const step = choleskySolve(damping > 0 ? addDiag(H, damping) : H, g);
  const next = beta.map((b, j) => b - step[j]);
  const maxStep = Math.max(...step.map(Math.abs));

  return {
    state: { beta: next, damping, prev: { beta, loss, g, H } },
    loss,
    converged: maxStep < h.tolerance,
    rejected: false,
    maxStep,
  };
}

function addDiag(M, v) {
  return M.map((row, i) => row.map((x, j) => (i === j ? x + v : x)));
}

/** Check a site result before using it (LR spec, Failure handling). */
function validateResult(result, stage, expected) {
  const bad = (m) => new Error(`Invalid ${stage} result from site "${expected.site}": ${m}`);
  if (!result || result.stage !== stage) throw bad('wrong stage');
  if (result.site && result.site !== expected.site) throw bad(`computed on data for site "${result.site}"`);
  const finite = (arr) => Array.isArray(arr) && arr.every(Number.isFinite);
  if (stage === 'stats') {
    if (!finite(result.sum) || !finite(result.sumSq)) throw bad('non-finite sums');
  } else {
    if (result.n !== expected.n) throw bad(`n = ${result.n}, round 0 said ${expected.n}`);
    if (!finite(result.gradient) || result.gradient.length !== expected.d) throw bad('bad gradient');
    if (!finite(result.hessian) || result.hessian.length !== (expected.d * (expected.d + 1)) / 2) throw bad('bad hessian');
    if (!Number.isFinite(result.loss)) throw bad('non-finite loss');
  }
  return result;
}

module.exports = {
  siteSizeLimit,
  resolveClassWeights,
  siteShiftCheck,
  processStats,
  initialNewtonState,
  newtonUpdate,
  validateResult,
};
