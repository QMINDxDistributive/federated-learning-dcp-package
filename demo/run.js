'use strict';

/**
 * Showcase demo coordinator: serves the live system view and the join page, keeps track of the
 * laptops that have joined, and runs federated training on request.
 *
 *   node demo/run.js            dashboard at http://localhost:3000, join page on the LAN
 *   node demo/run.js --dcp      default the dashboard to DCP mode (laptops)
 *   node demo/run.js --dcp-job  default the dashboard to DCP mode (data in the job)
 *   node demo/run.js --cli      no dashboard: simulation with the five sample states
 *
 * Joining (decision 0004): the dashboard always shows a join link and QR code. A laptop opens it,
 * runs the one command it shows (demo/agent.js), and appears on the dashboard. Any number can
 * join, up to the number of compute groups in demo/devices.json.
 *
 * Modes:
 *   sim  Simulation. Add simulated laptops in the dashboard; everything runs in this process.
 *   dcp     The laptops that joined. This process never sees their rows: each round it sends one
 *           DCP job per laptop, pointing at that laptop's localhost URL, attached to that laptop's
 *           compute group. The laptop's worker reads its own rows and returns only aggregates.
 *   dcpjob  Data in the job (decision 0001, Alex's showcase advice): the sample states on this
 *           machine, each sent inside its own DCP job on the public network (or the shared group
 *           in DCP_ATTACH_KEY). Real DCP, no per-laptop compute groups needed. In a real
 *           deployment the data would stay on each site; the dashboard says so.
 *
 * Network: the dashboard, its events and the training controls answer only on this machine
 * (loopback). Only the join page, the agent download and the agent API are reachable from the LAN.
 * HOST (default 0.0.0.0) and PORT (default 3000) set where it listens; PUBLIC_URL overrides the
 * address shown in the join link (e.g. a tunnel).
 */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { train, predictProba } = require('../src');
const { workFunction } = require('../src/lr/workFunction');
const { loadTestSet, SITES_DIR } = require('./sites');
const { createRegistry, loadGroupPool } = require('./participants');
const { auc, accuracy } = require('./metrics');
const { passwordsNeeded } = require('../src/runners/dcpInit');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const argv = process.argv.slice(2);
const HYPER_MAX_ROUNDS = 10; // Newton converges in about 6 rounds here; caps the DCP cost
const HYPER = { l2: 1, siteSizeCheck: 'warn', tolerance: 1e-8, maxRounds: HYPER_MAX_ROUNDS };
const REFERENCE = path.join(__dirname, '..', 'test', 'fixtures', 'brfss-reference.json');
const BASELINES = path.join(__dirname, 'data', 'baselines.json');
const MIN_PARTICIPANTS = 2;

// The coordinator's held-out evaluation set. It is not any site's training data.
const testSet = loadTestSet();

// Sample datasets: used by simulated laptops, and offered on the join page as demo setup.
const SAMPLES = fs.readdirSync(SITES_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'test.json')
  .map((f) => f.replace(/\.json$/, ''))
  .sort();
function sampleFile(name) {
  return SAMPLES.includes(name) ? path.join(SITES_DIR, `${name}.json`) : null;
}

function readJsonFile(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function evaluate(model) {
  const p = testSet.X.map((x) => predictProba(model, x));
  return { auc: auc(testSet.y, p), accuracy: accuracy(testSet.y, p) };
}

// ---- Events to the dashboard ----

const clients = new Set();
function emit(e) {
  e.t = Date.now();
  const line = `data: ${JSON.stringify(e)}\n\n`;
  for (const res of clients) res.write(line);
}

// ---- Participants ----

const groups = loadGroupPool();
const registry = createRegistry({
  groups,
  featureNames: testSet.featureNames,
  onChange: (action, participant) => {
    emit({ type: 'participant', action, participant });
    if (action !== 'updated') console.log(`${action}: ${participant.name}${participant.simulated ? ' (simulated)' : ` on ${participant.device}`}`);
  },
});
setInterval(registry.sweep, 3000).unref();

function addSimulated(dataset) {
  const used = registry.active(true).map((p) => p.dataset);
  const pick = dataset && SAMPLES.includes(dataset) ? dataset : SAMPLES.find((s) => !used.includes(s)) || SAMPLES[used.length % SAMPLES.length];
  const data = JSON.parse(fs.readFileSync(sampleFile(pick), 'utf8'));
  const n = registry.list().filter((p) => p.simulated).length + 1;
  return registry.join({
    token: registry.token,
    simulated: true,
    name: pick,
    dataset: pick,
    device: `sim-machine-${n}`,
    rows: data.X.length,
    featureNames: data.featureNames,
  });
}

function lanAddresses() {
  const rank = (a) => (a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : a.startsWith('172.') ? 2 : 3);
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out.sort((a, b) => rank(a) - rank(b));
}

function joinUrls() {
  const bases = process.env.PUBLIC_URL ? [process.env.PUBLIC_URL.replace(/\/$/, '')] : [];
  for (const a of lanAddresses()) bases.push(`http://${a}:${PORT}`);
  if (!bases.length) bases.push(`http://localhost:${PORT}`);
  return bases.map((b) => `${b}/join?t=${registry.token}`);
}

function dcpGroupProblem() {
  if (groups.pool.length || groups.shared) return null;
  return 'No compute groups configured. Laptops can join, but DCP training needs one compute group per laptop: copy demo/devices.example.json to demo/devices.json and add groups from the DCP portal.';
}

// ---- Runners ----

/** Simulation: same events as DCP, paced for an audience. */
function createSimRunner(sites, onSiteEvent) {
  const wait = (lo, hi) => new Promise((r) => setTimeout(r, lo + Math.random() * (hi - lo)));
  return {
    mode: 'sim',
    siteNames: sites.map((s) => s.name),
    runRound(stage, args, round) {
      return Promise.all(sites.map(async (s, k) => {
        const base = { site: s.name, round, stage };
        const wire = JSON.parse(JSON.stringify(args));
        await wait(k * 90, k * 90 + 40);
        onSiteEvent({ ...base, type: 'deployed', bytes: JSON.stringify({ ...wire, site: s.name }).length, remote: true });
        await wait(250, 450);
        onSiteEvent({ ...base, type: 'accepted', jobId: `sim-${stage}-${round}-${s.name}` });
        await wait(400, 900);
        onSiteEvent({ ...base, type: 'distributed' });
        const t0 = Date.now();
        const result = JSON.parse(JSON.stringify(workFunction(s.data, { ...wire, site: s.name })));
        await wait(700, 1500);
        onSiteEvent({ ...base, type: 'result', ms: Date.now() - t0, bytes: JSON.stringify(result).length, device: result.device, n: result.n, sourceBytes: result.sourceBytes });
        return result;
      }));
    },
  };
}

function simSites(participants) {
  return participants.map((p) => {
    const file = sampleFile(p.dataset);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { name: p.name, data: { ...data, site: p.name, device: p.device, sourceBytes: fs.statSync(file).size } };
  });
}

// One DCP session per server: keystores are unlocked once; each run uses whoever is online.
let dcpSession = null;
async function getDcpSession(passphrases = null) {
  if (!dcpSession) {
    const { createDcpRunner } = require('../src');
    dcpSession = await createDcpRunner([], {
      passphrases,
      onSiteEvent: (e) => emit({ ...e, type: 'site', event: e.type }),
    });
  }
  return dcpSession;
}

function dcpSites(participants) {
  const missing = participants.filter((p) => !p.group).map((p) => p.name);
  if (missing.length) throw new Error(`No compute group for ${missing.join(', ')}. ${dcpGroupProblem() || ''}`.trim());
  return participants.map((p) => ({
    name: p.name,
    dataUrl: `http://localhost:${p.port}/data.json`,
    computeGroups: [{ attachKey: p.group.joinKey, attachSecret: p.group.joinSecret }],
  }));
}

/** Wrap a runner to count what crosses the network, for the run stats.
 *  dataBytes: { site: bytes } of rows sent inside each job (dcpjob mode), counted every round. */
function metered(runner, tally, dataBytes = {}) {
  return {
    ...runner,
    async runRound(stage, args, round) {
      const results = await runner.runRound(stage, args, round);
      tally.slices += results.length;
      tally.bytesSent += runner.siteNames.reduce((a, name) => a + JSON.stringify({ ...args, site: name }).length + (dataBytes[name] || 0), 0);
      tally.dataBytesSent += runner.siteNames.reduce((a, name) => a + (dataBytes[name] || 0), 0);
      for (const r of results) {
        tally.bytesReceived += JSON.stringify(r).length;
        if (r.device) tally.devices[r.site] = r.device;
        if (stage === 'stats') {
          tally.rows += r.n;
          tally.rawBytes += r.sourceBytes || 0;
        }
      }
      return results;
    },
  };
}

/** The pooled scikit-learn fixture only applies when the five sample states each take part once. */
function referenceFor(participants) {
  const ref = readJsonFile(REFERENCE);
  if (!ref) return { ref: null, why: 'No scikit-learn reference found (test/fixtures/brfss-reference.json).' };
  const used = participants.map((p) => p.dataset).sort();
  if (JSON.stringify(used) === JSON.stringify([...ref.sites].sort())) return { ref, why: null };
  return { ref: null, why: `The pooled scikit-learn reference covers exactly ${ref.sites.join(', ')}, one laptop each. This run had ${used.map((d) => d || 'custom data').join(', ')}.` };
}

function notEnough(mode, n) {
  if (mode === 'dcp') return `Need at least ${MIN_PARTICIPANTS} laptops online to train; ${n} joined. Share the join link.`;
  return `Add at least ${MIN_PARTICIPANTS} ${mode === 'dcpjob' ? 'states' : 'simulated laptops'} first.`;
}

async function runTraining(mode, emitFn, participants) {
  if (participants.length < MIN_PARTICIPANTS) throw new Error(notEnough(mode, participants.length));
  let runner;
  const dataBytes = {};
  if (mode === 'dcp') {
    runner = (await getDcpSession()).withSites(dcpSites(participants));
  } else if (mode === 'dcpjob') {
    const sites = simSites(participants);
    for (const s of sites) dataBytes[s.name] = JSON.stringify(s.data).length;
    runner = (await getDcpSession()).withSites(sites);
  } else {
    runner = createSimRunner(simSites(participants), (e) => emitFn({ ...e, type: 'site', event: e.type }));
  }

  emitFn({
    type: 'start',
    mode,
    maxRounds: HYPER_MAX_ROUNDS,
    sites: participants.map((p) => ({ id: p.id, name: p.name, port: p.port, device: p.device, rows: p.rows })),
  });
  if (runner.dccPerSlice) {
    const n = runner.siteNames.length;
    emitFn({ type: 'cost', dccPerSlice: runner.dccPerSlice, typical: n * 7 * runner.dccPerSlice, ceiling: n * (1 + HYPER_MAX_ROUNDS) * runner.dccPerSlice });
  }

  const tally = { slices: 0, bytesSent: 0, dataBytesSent: 0, bytesReceived: 0, rows: 0, rawBytes: 0, devices: {} };
  const t0 = Date.now();
  const model = await train({ runner: metered(runner, tally, dataBytes), hyperparameters: HYPER, onEvent: (e) => e.type !== 'done' && emitFn(e) });
  const durationMs = Date.now() - t0;

  const { ref, why } = referenceFor(participants);
  const maxDiff = ref
    ? Math.max(Math.abs(model.intercept - ref.pooled.intercept), ...model.coefficients.map((c, j) => Math.abs(c - ref.pooled.coefficients[j])))
    : null;
  const baselines = (readJsonFile(BASELINES) || { localOnly: [] }).localOnly;
  const localOnly = participants
    .map((p) => {
      const b = baselines.find((x) => x.site === p.dataset);
      return b && { site: p.name, n: b.n, auc: b.auc, accuracy: b.accuracy };
    })
    .filter(Boolean);

  emitFn({
    type: 'done',
    mode,
    durationMs,
    rounds: model.training.rounds,
    converged: model.training.converged,
    featureNames: model.featureNames,
    coefficients: model.coefficients,
    intercept: model.intercept,
    reference: ref && { coefficients: ref.pooled.coefficients, intercept: ref.pooled.intercept, auc: ref.pooled.testAuc, maxDiff },
    referenceNote: why,
    federated: evaluate(model),
    testRows: testSet.y.length,
    localOnly,
    run: { ...tally, dccPerSlice: runner.dccPerSlice || null },
  });
  return model;
}

// ---- HTTP ----

function isLoopback(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

/** Training controls: loopback only, and only from this server's own page (not another site). */
function isLocalPage(req) {
  const origin = req.headers.origin;
  return isLoopback(req) && (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
}

function readJson(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > limit) {
        reject(Object.assign(new Error('request too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (_) { reject(Object.assign(new Error('bad JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendFile(res, file, type) {
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(file).pipe(res);
}

function api(req, res, fn) {
  readJson(req)
    .then(fn)
    .then((out) => sendJson(res, 200, out), (err) => sendJson(res, err.status || 500, { error: err.message }));
}

let running = false;

function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  // ---- reachable from the LAN: joining ----
  if (p === '/join' && req.method === 'GET') return sendFile(res, path.join(__dirname, 'dashboard', 'join.html'), 'text/html; charset=utf-8');
  if (p === '/join/agent.js' && req.method === 'GET') return sendFile(res, path.join(__dirname, 'agent.js'), 'text/javascript; charset=utf-8');
  if (p === '/join/samples' && req.method === 'GET') {
    if (url.searchParams.get('t') !== registry.token) return sendJson(res, 403, { error: 'This join link is out of date.' });
    const taken = registry.list().filter((x) => !x.simulated).map((x) => x.dataset);
    return sendJson(res, 200, SAMPLES.map((name) => ({ name, taken: taken.filter((d) => d === name).length })));
  }
  const sample = p.match(/^\/join\/sample\/([a-z0-9-]+)\.json$/);
  if (sample && req.method === 'GET') {
    if (url.searchParams.get('t') !== registry.token) return sendJson(res, 403, { error: 'This join link is out of date.' });
    const file = sampleFile(sample[1]);
    if (!file) return sendJson(res, 404, { error: 'no such sample' });
    return sendFile(res, file, 'application/json');
  }
  if (req.method === 'POST' && p === '/api/join') return api(req, res, (b) => registry.join({ ...b, simulated: false }));
  if (req.method === 'POST' && p === '/api/heartbeat') return api(req, res, (b) => registry.heartbeat(b));
  if (req.method === 'POST' && p === '/api/leave') return api(req, res, (b) => registry.leave(b));

  // ---- this machine only: dashboard and controls ----
  if (!isLoopback(req)) {
    res.writeHead(403);
    return res.end('The dashboard is only available on the coordinator machine. To join, open the join link.');
  }
  if (p === '/') return sendFile(res, path.join(__dirname, 'dashboard', 'index.html'), 'text/html; charset=utf-8');
  if (p === '/config') {
    return sendJson(res, 200, {
      defaultMode: argv.includes('--dcp-job') ? 'dcpjob' : argv.includes('--dcp') ? 'dcp' : 'sim',
      dcpJobGroup: process.env.DCP_ATTACH_KEY ? 'shared compute group' : 'public DCP network',
      joinUrls: joinUrls(),
      participants: registry.list(),
      slots: registry.slots(),
      samples: SAMPLES,
      minParticipants: MIN_PARTICIPANTS,
      running,
      dcpProblem: dcpGroupProblem(),
      // Which DCP passwords the page should ask for (none once DCP is unlocked this session).
      dcpPasswords: dcpSession ? { identity: false, payment: false } : passwordsNeeded(),
    });
  }
  if (p === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.method === 'POST' && !isLocalPage(req)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  if (req.method === 'POST' && p === '/api/sim/add') return api(req, res, (b) => addSimulated(b.dataset));
  if (req.method === 'POST' && p === '/api/remove') return api(req, res, (b) => ({ ok: registry.remove(b.id) }));
  if (req.method === 'POST' && p === '/train') {
    if (running) return sendJson(res, 409, { error: 'Training is already running' });
    const mode = ['dcp', 'dcpjob'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'sim';
    const participants = registry.active(mode !== 'dcp');
    running = true;
    return readJson(req)
      .then(async (body) => {
        if (participants.length < MIN_PARTICIPANTS) throw Object.assign(new Error(notEnough(mode, participants.length)), { status: 400 });
        if (mode !== 'sim') {
          if (mode === 'dcp') dcpSites(participants); // fail fast if a laptop has no compute group
          // Unlock with the passwords from the page. They are used once and not kept or logged.
          if (!dcpSession) await getDcpSession({ identity: body.identityPassword, payment: body.paymentPassword });
        }
      })
      .then(
        () => {
          runTraining(mode, emit, participants)
            .catch((err) => emit({ type: 'error', message: err.message }))
            .finally(() => { running = false; emit({ type: 'idle' }); });
          res.writeHead(202);
          res.end('started');
        },
        (err) => {
          running = false;
          const wrong = err.code === 'WRONG_PASSWORD';
          sendJson(res, wrong ? 401 : err.status || 500, { error: err.message, keystore: err.keystore || null });
        }
      );
  }
  res.writeHead(404);
  res.end();
}

if (argv.includes('--cli')) {
  // Terminal only: simulation with every sample state as a laptop.
  SAMPLES.forEach((s) => addSimulated(s));
  runTraining('sim', (e) => {
    if (e.type === 'round') console.log(`round ${e.round}: loss ${e.loss.toFixed(4)} (${e.durationMs} ms)`);
    if (e.type === 'done') {
      console.log(`done in ${e.rounds} rounds, ${e.durationMs} ms. federated AUC ${e.federated.auc.toFixed(4)}`);
      for (const l of e.localOnly) console.log(`  ${l.site} alone (${l.n} rows): AUC ${l.auc.toFixed(4)}`);
      if (e.reference) console.log(`max difference vs pooled scikit-learn: ${e.reference.maxDiff.toExponential(2)}`);
      console.log(`sent ${e.run.bytesSent} B, received ${e.run.bytesReceived} B; ${e.run.rawBytes} B of rows stayed on the sites`);
    }
  }, registry.active(true)).then(() => process.exit(0), (err) => { console.error(err.message); process.exit(1); });
} else {
  http.createServer(handle).listen(PORT, HOST, () => {
    console.log(`Dashboard (this machine): http://localhost:${PORT}`);
    for (const u of joinUrls()) console.log(`Join link:                ${u}`);
    const s = registry.slots();
    console.log(s.total ? `Compute groups: ${s.total} (one per laptop)` : s.shared ? 'Compute groups: one shared group (DCP_ATTACH_KEY)' : 'Compute groups: none configured (simulation only; see demo/devices.example.json)');
  });
}
