'use strict';

/**
 * Federated learning site agent: run on a laptop that holds a dataset, to join a training
 * session as a DCP worker (decision 0004). The coordinator's join page gives you this file and
 * the exact command. It uses only Node built-ins, so you do not need the repo.
 *
 *   node fl-agent.js <coordinator-url> <token> --data <file.json> [--name <name>] [--no-worker]
 *   node fl-agent.js <coordinator-url> <token> --sample alaska    (demo setup, see below)
 *
 * --sample <state> is a demo convenience: if <state>.json is not in this folder yet, it
 * downloads that sample state's file from the coordinator once and saves it here. Do that before
 * the presentation; from then on the file lives on this laptop. In real use, pass --data.
 *
 * What it does:
 *   1. Serves your data file at http://localhost:<port>/data.json, bound to 127.0.0.1, so no
 *      other machine can read it.
 *   2. Registers with the coordinator. It sends your data's name, row count and feature names,
 *      never the rows. The coordinator gives it one DCP compute group.
 *   3. Starts a DCP worker that joins only that group and may fetch only your localhost port.
 *      Training jobs for this laptop run here, read your rows over loopback, and send back
 *      only aggregates (gradient, Hessian, loss, counts).
 *   4. Sends a heartbeat every 5 seconds. Ctrl+C leaves the session and stops the worker.
 *
 * Data file: JSON { "featureNames": [...], "X": [[...], ...], "y": [0|1, ...], "site"?: "name" }
 */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');

const DCP_WORKER_VERSION = '4.7.0';
const HEARTBEAT_MS = 5000;

function usage(msg) {
  if (msg) console.error(`\n${msg}`);
  console.error('\nUsage: node fl-agent.js <coordinator-url> <token> (--data <file.json> | --sample <state>) [--name <name>] [--no-worker]\n');
  process.exit(1);
}

function parseArgs(argv) {
  const out = { positional: [], data: null, sample: null, name: null, worker: true, device: os.hostname() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data') out.data = argv[++i];
    else if (a === '--sample') out.sample = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--device') out.device = argv[++i];
    else if (a === '--no-worker') out.worker = false;
    else if (a.startsWith('--')) usage(`Unknown option ${a}`);
    else out.positional.push(a);
  }
  return out;
}

function fmtBytes(b) {
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}

function stamp() {
  return new Date().toLocaleTimeString();
}

async function post(base, path, body) {
  const res = await fetch(new URL(path, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(json.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return json;
}

function loadData(file) {
  if (!file) usage('Missing --data <file.json> or --sample <state>');
  if (!fs.existsSync(file)) usage(`No such file: ${file}`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    usage(`${file} is not valid JSON: ${e.message}`);
  }
  const ok = data && Array.isArray(data.X) && Array.isArray(data.y) && Array.isArray(data.featureNames) && data.X.length === data.y.length && data.X.length > 0;
  if (!ok) usage(`${file} must be JSON with featureNames, X (rows) and y (labels) of the same length`);
  return { data, bytes: fs.statSync(file).size };
}

const children = [];
function killChildren() {
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // With shell: true on Windows, kill() stops only the shell; taskkill /T stops the whole tree.
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(c.pid), '/T', '/F'], () => {});
    else c.kill();
  }
}

function startWorker(group, port) {
  const run = (label, args) => {
    const child = spawn('npx', ['--yes', '-p', `dcp-worker@${DCP_WORKER_VERSION}`, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const print = (chunk) => chunk.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`  [${label}] ${l}`));
    child.stdout.on('data', print);
    child.stderr.on('data', print);
    child.on('exit', (code) => console.log(`  [${label}] exited${code === null ? '' : ` with code ${code}`}`));
    children.push(child);
    return child;
  };
  console.log('Starting the DCP evaluator (Node sandbox, fine for a demo, not for production) and worker...');
  run('evaluator', ['dcp-evaluator-start', '-t', 'node']);
  const workerArgs = ['dcp-worker', '--output', 'text', '--no-global', '--allow-origin', `http://localhost:${port}`, '--join', `${group.joinKey},${group.joinSecret}`];
  setTimeout(() => run('worker', workerArgs), 3000);
}

/** Demo setup only: save a sample state's file to this folder, once. */
async function fetchSample(coordinator, token, state) {
  const name = String(state).toLowerCase().replace(/[^a-z0-9-]/g, '');
  const file = `${name}.json`;
  if (fs.existsSync(file)) return file;
  const res = await fetch(new URL(`/join/sample/${name}.json?t=${encodeURIComponent(token)}`, coordinator));
  if (!res.ok) usage(`Could not download sample "${name}" (HTTP ${res.status}).`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`Demo setup: saved sample dataset ${file} on this laptop. Next time it is read from here.`);
  return file;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [coordinator, token] = opts.positional;
  if (!coordinator || !token) usage('Missing coordinator URL or token. Copy the command from the join page.');
  if (!opts.data && opts.sample) opts.data = await fetchSample(coordinator, token, opts.sample);
  const { data, bytes } = loadData(opts.data);
  const rows = data.X.length;

  let me = null; // set once registered
  let body = null;
  let reads = 0;
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.split('?')[0] === '/data.json' && body) {
      reads++;
      console.log(`[${stamp()}] DCP worker on this laptop read ${rows.toLocaleString()} rows (${fmtBytes(bytes)}) over loopback. Read #${reads}.`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(body);
    }
    res.writeHead(body ? 404 : 503);
    res.end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve); // any free port; only programs on this laptop can connect
  });
  const port = server.address().port;

  try {
    me = await post(coordinator, '/api/join', {
      token,
      name: opts.name || data.site || opts.device,
      dataset: data.site || null,
      device: opts.device,
      rows,
      featureNames: data.featureNames,
      port,
    });
  } catch (e) {
    console.error(`\nCould not join ${coordinator}: ${e.message}`);
    if (!e.status) console.error('Check that this laptop is on the same network as the coordinator and the URL is right.');
    process.exit(1);
  }
  body = JSON.stringify({ ...data, site: me.name, device: opts.device, sourceBytes: bytes });

  console.log(`\nJoined ${coordinator} as "${me.name}"`);
  console.log(`Data:     ${rows.toLocaleString()} rows from ${opts.data} (stays on this laptop)`);
  console.log(`Serving:  http://localhost:${port}/data.json (this laptop only)`);
  console.log(`Group:    ${me.computeGroup ? me.computeGroup.joinKey + (me.sharedGroup ? ' (shared by all laptops)' : '') : 'none'}\n`);

  let workerRunning = false;
  if (!me.computeGroup) {
    console.log('The coordinator has no compute group for this laptop, so the DCP worker was not started.');
    console.log('You will show up on the coordinator screen, but DCP training needs a group. Ask the coordinator to add one.\n');
  } else if (opts.worker) {
    startWorker(me.computeGroup, port);
    workerRunning = true;
  } else {
    console.log('Start the DCP worker yourself (in two more terminals):');
    console.log(`  npx -p dcp-worker@${DCP_WORKER_VERSION} dcp-evaluator-start -t node`);
    console.log(`  npx -p dcp-worker@${DCP_WORKER_VERSION} dcp-worker --no-global --allow-origin http://localhost:${port} --join ${me.computeGroup.joinKey},<secret>\n`);
  }

  const beat = async () => {
    const alive = workerRunning && children.some((c) => c.exitCode === null);
    try {
      await post(coordinator, '/api/heartbeat', { id: me.id, secret: me.secret, workerRunning: alive || !opts.worker, reads });
    } catch (e) {
      if (e.status === 404) {
        console.error(`\nThe coordinator no longer knows this laptop (${e.message}).`);
        shutdown(1);
      }
      // Network blips: keep trying; the coordinator marks us offline after ~15 s.
    }
  };
  const timer = setInterval(beat, HEARTBEAT_MS);
  beat();
  console.log('Waiting for training jobs. Ctrl+C to leave.');

  let stopping = false;
  async function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    killChildren();
    try {
      await post(coordinator, '/api/leave', { id: me.id, secret: me.secret });
      console.log('\nLeft the session.');
    } catch (_) { /* coordinator may be gone */ }
    process.exit(code);
  }
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

main().catch((e) => {
  console.error(e);
  killChildren();
  process.exit(1);
});
