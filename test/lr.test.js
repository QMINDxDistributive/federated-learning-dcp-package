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
  assert.deepEqual(Object.keys(r).sort(), ['device', 'gradient', 'hessian', 'loss', 'n', 'site', 'stage']);
  assert.equal(r.gradient.length, 3);
  assert.equal(r.hessian.length, 6);
  assert.ok(Math.abs(r.loss - 3 * Math.log(2)) < 1e-12);
});

test('remote data: work function accepts the site agent payload as JSON text or bytes', () => {
  const payload = { X: [[1, 2], [3, 4], [5, 7]], y: [0, 1, 1], featureNames: ['a', 'b'], site: 'alaska', device: 'LAPTOP-1', sourceBytes: 99 };
  const fromObject = workFunction(payload, { stage: 'stats', site: 'alaska' });
  assert.deepEqual(workFunction(JSON.stringify(payload), { stage: 'stats', site: 'alaska' }), fromObject);
  assert.deepEqual(workFunction(new TextEncoder().encode(JSON.stringify(payload)), { stage: 'stats', site: 'alaska' }), fromObject);
  assert.equal(fromObject.device, 'LAPTOP-1');
  assert.equal(fromObject.sourceBytes, 99);
});

test('remote data: a job that lands on the wrong laptop refuses to train', () => {
  const payload = { X: [[1, 2]], y: [1], featureNames: ['a', 'b'], site: 'florida' };
  assert.throws(() => workFunction(payload, { stage: 'stats', site: 'alaska' }), /Wrong device/);
  const { validateResult } = require('../src/lr/coordinator');
  assert.throws(() => validateResult({ stage: 'stats', site: 'florida', sum: [1], sumSq: [1] }, 'stats', { site: 'alaska' }), /florida/);
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

test('participants: join hands out one compute group per laptop and frees it on leave', () => {
  const { createRegistry } = require('../demo/participants');
  const events = [];
  let t = 0;
  const reg = createRegistry({
    groups: { pool: [{ joinKey: 'g1', joinSecret: 's1' }, { joinKey: 'g2', joinSecret: 's2' }], shared: null },
    featureNames: ['a', 'b'],
    onChange: (action, p) => events.push([action, p.name]),
    now: () => t,
    token: 'tok',
  });
  const base = { token: 'tok', rows: 100, featureNames: ['a', 'b'], port: 7000, device: 'PC' };
  assert.throws(() => reg.join({ ...base, token: 'old' }), /out of date/);
  assert.throws(() => reg.join({ ...base, featureNames: ['b', 'a'] }), /features/);

  const a = reg.join({ ...base, name: 'Alaska' });
  const b = reg.join({ ...base, name: 'alaska' });
  assert.equal(a.name, 'alaska');
  assert.equal(b.name, 'alaska-2');
  assert.deepEqual([a.computeGroup.joinKey, b.computeGroup.joinKey], ['g1', 'g2']);
  assert.throws(() => reg.join({ ...base, name: 'c' }), /compute groups are taken/);
  assert.ok(reg.list().every((p) => !('secret' in p) && typeof p.group === 'string'), 'secrets stay server-side');

  assert.throws(() => reg.heartbeat({ id: a.id, secret: 'wrong' }), /Unknown participant/);
  t = 20000;
  reg.heartbeat({ id: b.id, secret: b.secret, workerRunning: true });
  reg.sweep();
  assert.deepEqual(reg.active(false).map((p) => p.name), ['alaska-2']);

  reg.leave({ id: a.id, secret: a.secret });
  assert.equal(reg.join({ ...base, name: 'c' }).computeGroup.joinKey, 'g1');
  assert.deepEqual(events.map((e) => e[0]), ['joined', 'joined', 'updated', 'offline', 'left', 'joined']);

  const sim = reg.join({ token: 'tok', simulated: true, name: 'florida', rows: 5, featureNames: ['a', 'b'] });
  assert.equal(sim.computeGroup, null, 'simulated laptops do not use compute groups');
});

test('demo group config: sharedGroup from devices.json, env overrides, TODO ignored', () => {
  const os = require('node:os');
  const { loadGroupPool } = require('../demo/participants');
  const f = path.join(os.tmpdir(), `fl-devices-${process.pid}.json`);
  try {
    fs.writeFileSync(f, JSON.stringify({ sharedGroup: { joinKey: 'g1', joinSecret: 's1' }, computeGroups: [{ joinKey: 'TODO', joinSecret: 'TODO' }] }));
    assert.deepEqual(loadGroupPool(f, {}), { pool: [], shared: { joinKey: 'g1', joinSecret: 's1' } });
    assert.equal(loadGroupPool(f, { DCP_ATTACH_KEY: 'env', DCP_ATTACH_SECRET: 'x' }).shared.joinKey, 'env');
    fs.writeFileSync(f, JSON.stringify({ sharedGroup: { joinKey: 'TODO', joinSecret: 'TODO' } }));
    assert.equal(loadGroupPool(f, {}).shared, null);
  } finally {
    fs.rmSync(f, { force: true });
  }
});

test('demo session: survives a restart with the same token, laptops and groups; removed agents get 410', () => {
  const { createRegistry } = require('../demo/participants');
  const featureNames = ['a', 'b'];
  const groups = { pool: [{ joinKey: 'g1', joinSecret: 's' }, { joinKey: 'g2', joinSecret: 's' }], shared: null };
  let saved = null;
  const store = { load: () => saved, save: (s) => { saved = JSON.parse(JSON.stringify(s)); } };
  const r1 = createRegistry({ groups, featureNames, store });
  const base = { token: r1.token, rows: 100, featureNames };
  const a = r1.join({ ...base, name: 'alaska', port: 5001 });
  const b = r1.join({ ...base, name: 'florida', port: 5002, preferGroup: 'g2' });
  assert.equal(b.computeGroup.joinKey, 'g2');
  // persist() is debounced; save synchronously for the test by reading state through a new registry
  return new Promise((resolve) => setTimeout(() => {
    assert.ok(saved && saved.participants.length === 2);
    assert.ok(!JSON.stringify(saved).includes('joinSecret'), 'group secrets are not stored in the session');
    const r2 = createRegistry({ groups, featureNames, store });
    assert.equal(r2.token, r1.token);
    assert.equal(r2.heartbeat({ id: a.id, secret: a.secret }).group, 'g1');
    assert.equal(r2.heartbeat({ id: b.id, secret: b.secret }).group, 'g2');
    assert.equal(r2.slots().used, 2);
    // A rejoin that prefers its old group gets it back once free.
    r2.remove(a.id);
    assert.throws(() => r2.heartbeat({ id: a.id, secret: a.secret }), (e) => e.status === 410);
    const again = r2.join({ ...base, name: 'alaska', port: 5003, preferGroup: 'g1' });
    assert.equal(again.computeGroup.joinKey, 'g1');
    assert.equal(again.name, 'alaska');
    resolve();
  }, 300));
});
