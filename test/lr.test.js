'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { choleskySolve, unpackUpper, sigmoid } = require('../src/lr/math');
const { workFunction } = require('../src/lr/workFunction');
const { resolveHyperparameters } = require('../src/lr/hyperparameters');
const { processStats, siteSizeLimit } = require('../src/lr/coordinator');
const { train, predictProba, createLocalRunner } = require('../src');

const SITES_DIR = path.join(__dirname, '..', 'demo', 'data', 'sites');
const FIXTURE = path.join(__dirname, 'fixtures', 'brfss-reference.json');

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

test('choleskySolve solves a known SPD system', () => {
  const A = [[4, 2, 0.4], [2, 5, 1], [0.4, 1, 3]];
  const xTrue = [1, -2, 0.5];
  const b = A.map((row) => row.reduce((s, a, j) => s + a * xTrue[j], 0));
  choleskySolve(A, b).forEach((v, j) => assert.ok(Math.abs(v - xTrue[j]) < 1e-12));
  assert.throws(() => choleskySolve([[1, 2], [2, 1]], [1, 1]), /positive definite/);
});

test('unpackUpper and sigmoid', () => {
  assert.deepEqual(unpackUpper([1, 2, 3], 2), [[1, 2], [2, 3]]);
  assert.equal(sigmoid(0), 0.5);
  assert.ok(Number.isFinite(sigmoid(-1000)) && Number.isFinite(sigmoid(1000)));
});

test('work function is self-contained (survives being re-created from its source)', () => {
  // DCP ships the function as source text, so it must not close over module scope.
  const rebuilt = new Function(`return (${workFunction.toString()})`)();
  const data = { X: [[1, 2], [3, 4], [5, 7]], y: [0, 1, 1], featureNames: ['a', 'b'] };
  assert.deepEqual(rebuilt(data, { stage: 'stats' }), workFunction(data, { stage: 'stats' }));
});

test('site results contain only aggregates, never rows', () => {
  const data = { X: [[1, 2], [3, 4], [5, 7]], y: [0, 1, 1], featureNames: ['a', 'b'] };
  const r = workFunction(data, { stage: 'newton', beta: [0, 0, 0], mean: [3, 4], std: [1, 1], classWeights: [1, 1], fitIntercept: true });
  assert.deepEqual(Object.keys(r).sort(), ['gradient', 'hessian', 'loss', 'n', 'stage']);
  assert.equal(r.gradient.length, 3);
  assert.equal(r.hessian.length, 6);
  assert.ok(Math.abs(r.loss - 3 * Math.log(2)) < 1e-12);
});

test('hyperparameter validation', () => {
  assert.equal(resolveHyperparameters({}).l2, 1);
  assert.throws(() => resolveHyperparameters({ l2: 0 }), /l2/);
  assert.throws(() => resolveHyperparameters({ learningRate: 0.1 }), /fedavg/);
  assert.throws(() => resolveHyperparameters({ nope: 1 }), /unknown key/);
});

test('site size rule: auto limit and error vs warn', () => {
  assert.equal(siteSizeLimit(14), 121); // matches the spec's Fed-Heart-Disease example
  const stats = [
    { n: 10, sum: [5], sumSq: [5], classCounts: [5, 5], featureNames: ['a'] },
    { n: 200, sum: [100], sumSq: [100], classCounts: [100, 100], featureNames: ['a'] },
  ];
  const h = resolveHyperparameters({ siteShiftWarning: null });
  assert.throws(() => processStats(['small', 'big'], stats, h), /below minSiteRows/);
  const out = processStats(['small', 'big'], stats, { ...h, siteSizeCheck: 'warn' });
  assert.equal(out.warnings.length, 1);
});

test('round 0 rejects sites whose features do not match', () => {
  const stats = [
    { n: 100, sum: [1], sumSq: [2], classCounts: [50, 50], featureNames: ['a'] },
    { n: 100, sum: [1], sumSq: [2], classCounts: [50, 50], featureNames: ['b'] },
  ];
  assert.throws(() => processStats(['x', 'y'], stats, resolveHyperparameters({})), /different feature names/);
});

test('site shift check flags a feature recorded in other units', () => {
  const mk = (m, s) => ({ n: 100, sum: [100 * m], sumSq: [100 * (s * s + m * m)], classCounts: [50, 50], featureNames: ['chol'] });
  const out = processStats(['a', 'b', 'c', 'd'], [mk(240, 50), mk(235, 48), mk(245, 52), mk(6, 1)], resolveHyperparameters({}));
  assert.ok(out.warnings.some((w) => w.includes('"d"') && w.includes('chol')));
});

test('federated Newton on BRFSS matches pooled scikit-learn to 1e-6', { skip: !fs.existsSync(FIXTURE) && 'run tools/reference first' }, async () => {
  const ref = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const model = await train({
    runner: createLocalRunner(loadSites()),
    hyperparameters: { l2: ref.l2, siteSizeCheck: 'warn', tolerance: 1e-10 },
  });
  assert.ok(model.training.converged, 'should converge');
  assert.ok(model.training.rounds <= 10, `took ${model.training.rounds} rounds`);
  assert.ok(Math.abs(model.intercept - ref.pooled.intercept) < 1e-6);
  model.coefficients.forEach((c, j) => {
    const diff = Math.abs(c - ref.pooled.coefficients[j]);
    assert.ok(diff < 1e-6, `${ref.featureNames[j]}: ${c} vs ${ref.pooled.coefficients[j]} (diff ${diff})`);
  });
  const test = JSON.parse(fs.readFileSync(path.join(SITES_DIR, 'test.json'), 'utf8'));
  const p = predictProba(model, test.X[0]);
  assert.ok(p > 0 && p < 1);
});
