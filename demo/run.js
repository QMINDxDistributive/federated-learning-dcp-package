'use strict';

/**
 * Showcase demo: serves the dashboard and runs federated training on request.
 *
 *   node demo/run.js            dashboard at http://localhost:3000, choose mode in the page
 *   node demo/run.js --dcp      default the page to DCP mode
 *   node demo/run.js --cli      no dashboard, train once in the terminal (add --dcp for DCP)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { train, predictProba, createLocalRunner } = require('../src');
const { loadSites, loadTestSet } = require('./sites');
const { auc, accuracy } = require('./metrics');
const { passwordsNeeded } = require('../src/runners/dcpInit');

const PORT = Number(process.env.PORT) || 3000;
const argv = process.argv.slice(2);
const HYPER_MAX_ROUNDS = 10; // Newton converges in about 6 rounds here; caps the DCP cost
const HYPER = { l2: 1, siteSizeCheck: 'warn', tolerance: 1e-8, maxRounds: HYPER_MAX_ROUNDS };
const REFERENCE = path.join(__dirname, '..', 'test', 'fixtures', 'brfss-reference.json');

const sites = loadSites();
const testSet = loadTestSet();

function evaluate(model) {
  const p = testSet.X.map((x) => predictProba(model, x));
  return { auc: auc(testSet.y, p), accuracy: accuracy(testSet.y, p) };
}

/** Each state trains alone, for the comparison panel. Runs locally; it is the baseline. */
async function localOnlyModels() {
  const out = [];
  for (const s of sites) {
    const model = await train({ runner: createLocalRunner([s]), hyperparameters: { ...HYPER, siteShiftWarning: null } });
    out.push({ site: s.name, n: s.data.X.length, ...evaluate(model) });
  }
  return out;
}

// One DCP runner per server session: keystores are unlocked once and reused for every run.
let dcpRunner = null;
let emitCurrent = () => {};
async function getDcpRunner(passphrases = null) {
  if (!dcpRunner) {
    const { createDcpRunner } = require('../src');
    dcpRunner = await createDcpRunner(sites, {
      passphrases,
      onSiteEvent: (e) => emitCurrent({ ...e, type: 'site', event: e.type }),
    });
  }
  return dcpRunner;
}

async function makeRunner(mode, emit) {
  emitCurrent = emit;
  if (mode === 'dcp') return getDcpRunner();
  // Local mode: a small delay per site so the audience can follow each round.
  const base = createLocalRunner(sites);
  return {
    ...base,
    async runRound(stage, args, round) {
      const results = [];
      for (const name of base.siteNames) {
        emit({ type: 'site', site: name, round, stage, event: 'deployed' });
      }
      const all = await base.runRound(stage, args, round);
      for (let k = 0; k < all.length; k++) {
        await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
        emit({ type: 'site', site: base.siteNames[k], round, stage, event: 'result' });
        results.push(all[k]);
      }
      return results;
    },
  };
}

async function runTraining(mode, emit) {
  const reference = fs.existsSync(REFERENCE) ? JSON.parse(fs.readFileSync(REFERENCE, 'utf8')) : null;
  emit({ type: 'start', mode, sites: sites.map((s) => ({ name: s.name, n: s.data.X.length })) });
  const runner = await makeRunner(mode, emit);
  if (runner.dccPerSlice) {
    const n = sites.length;
    const typical = n * 7 * runner.dccPerSlice; // round 0 + about 6 Newton rounds
    const ceiling = n * (1 + HYPER_MAX_ROUNDS) * runner.dccPerSlice;
    emit({ type: 'cost', dccPerSlice: runner.dccPerSlice, typical, ceiling });
    console.log(`DCP price ${runner.dccPerSlice} DCC/slice: about ${typical} DCC for a normal run, at most ${ceiling} DCC before retries`);
  }
  const t0 = Date.now();
  const model = await train({ runner, hyperparameters: HYPER, onEvent: (e) => e.type !== 'done' && emit(e) });
  const fed = evaluate(model);
  emit({
    type: 'done',
    mode,
    durationMs: Date.now() - t0,
    rounds: model.training.rounds,
    converged: model.training.converged,
    featureNames: model.featureNames,
    coefficients: model.coefficients,
    intercept: model.intercept,
    reference: reference && { coefficients: reference.pooled.coefficients, intercept: reference.pooled.intercept, auc: reference.pooled.testAuc },
    federated: fed,
    localOnly: await localOnlyModels(),
  });
  return model;
}

function isLocalRequest(req) {
  const host = (req.headers.host || '').split(':')[0];
  const origin = req.headers.origin;
  const okHost = host === 'localhost' || host === '127.0.0.1';
  const okOrigin = !origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return okHost && okOrigin;
}

function readJson(req, limit = 10000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > limit) reject(new Error('request too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (_) { reject(new Error('bad JSON')); }
    });
    req.on('error', reject);
  });
}

// ---- CLI mode ----
if (argv.includes('--cli')) {
  const mode = argv.includes('--dcp') ? 'dcp' : 'local';
  runTraining(mode, (e) => {
    if (e.type === 'round') console.log(`round ${e.round}: loss ${e.loss.toFixed(4)} (${e.durationMs} ms)`);
    if (e.type === 'site' && e.event !== 'deployed') console.log(`  ${e.site}: ${e.event}${e.jobId ? ' ' + e.jobId : ''}${e.error ? ' ' + e.error : ''}`);
    if (e.type === 'done') {
      console.log(`done in ${e.rounds} rounds, ${e.durationMs} ms. federated AUC ${e.federated.auc.toFixed(4)}`);
      for (const l of e.localOnly) console.log(`  ${l.site} alone (${l.n} rows): AUC ${l.auc.toFixed(4)}`);
      if (e.reference) {
        const diff = Math.max(...e.coefficients.map((c, j) => Math.abs(c - e.reference.coefficients[j])));
        console.log(`max difference vs pooled scikit-learn: ${diff.toExponential(2)}`);
      }
    }
  }).then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
} else {
  // ---- Dashboard mode ----
  const clients = new Set();
  let running = false;
  let lastRun = [];
  const emit = (e) => {
    lastRun.push(e);
    const line = `data: ${JSON.stringify(e)}\n\n`;
    for (const res of clients) res.write(line);
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(path.join(__dirname, 'dashboard', 'index.html')).pipe(res);
    }
    if (url.pathname === '/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        defaultMode: argv.includes('--dcp') ? 'dcp' : 'local',
        sites: sites.map((s) => ({ name: s.name, n: s.data.X.length })),
        // Which DCP passwords the page should ask for (none once DCP is unlocked this session).
        dcpPasswords: dcpRunner ? { identity: false, payment: false } : passwordsNeeded(),
      }));
    }
    if (url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/train' && req.method === 'POST') {
      // Only accept requests from this machine's own dashboard page.
      if (!isLocalRequest(req)) {
        res.writeHead(403);
        return res.end('forbidden');
      }
      if (running) {
        res.writeHead(409);
        return res.end('already running');
      }
      const mode = url.searchParams.get('mode') === 'dcp' ? 'dcp' : 'local';
      running = true;
      return readJson(req)
        .then(async (body) => {
          if (mode === 'dcp' && !dcpRunner) {
            // Unlock with the passwords from the page. They are used once and not kept or logged.
            await getDcpRunner({ identity: body.identityPassword, payment: body.paymentPassword });
          }
        })
        .then(
          () => {
            lastRun = [];
            runTraining(mode, emit)
              .catch((err) => emit({ type: 'error', message: err.message }))
              .finally(() => { running = false; });
            res.writeHead(202);
            res.end('started');
          },
          (err) => {
            running = false;
            const wrong = err.code === 'WRONG_PASSWORD';
            res.writeHead(wrong ? 401 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message, keystore: err.keystore || null }));
          }
        );
    }
    res.writeHead(404);
    res.end();
  });
  // Bound to this machine only: the password dialog posts passwords to this server.
  server.listen(PORT, '127.0.0.1', () => console.log(`Dashboard: http://localhost:${PORT}`));
}
