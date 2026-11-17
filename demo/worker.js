'use strict';

/**
 * Start a DCP worker on this computer that joins only the shared compute group, so jobs sent to
 * that group (DCP · data in job mode, npm run dcp:hello with the group) have a worker to run on.
 *
 *   npm run demo:worker
 *
 * The group comes from "sharedGroup" in demo/devices.json, or DCP_ATTACH_KEY / DCP_ATTACH_SECRET.
 * Other computers can join the same group without this script: open https://dcp.work in a browser
 * and set the compute group (join key and secret) in the top left.
 *
 * Starts two processes through npx (dcp-worker 4.7.0): the Node evaluator (a sandbox that is fine
 * for a demo, not for production) and the worker, which leaves the global group (--no-global).
 * Ctrl+C stops both.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { loadGroupPool } = require('./participants');

const DCP_WORKER_VERSION = '4.7.0';
const WIN = process.platform === 'win32';
const q = (s) => (WIN ? `"${s}"` : s); // npx runs through a shell on Windows

const children = [];
function stopAll() {
  for (const c of children) {
    if (c.exitCode !== null) continue;
    if (WIN) execFile('taskkill', ['/pid', String(c.pid), '/T', '/F'], () => {});
    else c.kill();
  }
}

/** See demo/agent.js: `-t node` alone looks for the native evaluator, so find evaluator-node.js. */
function findNodeEvaluator() {
  const helper = path.join(os.tmpdir(), `fl-worker-find-evaluator-${process.pid}.js`);
  fs.writeFileSync(helper, `const p = require('path'), fs = require('fs');
for (const d of process.env.PATH.split(p.delimiter)) {
  const f = p.join(d, '..', 'dcp-client', 'libexec', 'evaluator-node.js');
  if (fs.existsSync(f)) { console.log(f); process.exit(0); }
}
process.exit(1);
`);
  return new Promise((resolve) => {
    execFile('npx', ['--yes', '-p', `dcp-worker@${DCP_WORKER_VERSION}`, 'node', helper], { shell: WIN }, (err, stdout) => {
      fs.rmSync(helper, { force: true });
      resolve(err ? null : stdout.trim().split(/\r?\n/).pop());
    });
  });
}

function run(label, args, env) {
  const child = spawn('npx', ['--yes', '-p', `dcp-worker@${DCP_WORKER_VERSION}`, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: WIN,
    env: { ...process.env, ...env },
  });
  const print = (chunk) => chunk.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${label}] ${l}`));
  child.stdout.on('data', print);
  child.stderr.on('data', print);
  child.on('exit', (code) => console.log(`[${label}] exited${code === null ? '' : ` with code ${code}`}`));
  children.push(child);
  return child;
}

async function main() {
  const group = loadGroupPool().shared;
  if (!group) {
    console.error('No shared compute group. Set "sharedGroup" in demo/devices.json (see demo/dcp-credentials.md),');
    console.error('or DCP_ATTACH_KEY and DCP_ATTACH_SECRET.');
    process.exit(1);
  }
  console.log(`Compute group: ${group.joinKey}`);
  console.log('Starting the DCP evaluator (Node sandbox: fine for a demo, not for production)...');
  const evaluator = await findNodeEvaluator();
  if (!evaluator) {
    console.error('Could not find the Node evaluator in the dcp-worker install.');
    process.exit(1);
  }
  run('evaluator', ['dcp-evaluator-start', '-t', 'node', '-e', q(process.execPath), `--additional-files=${q(evaluator)}`],
    { I_WANT_AN_INSECURE_DCP_WORKER: 'badly' });
  setTimeout(() => {
    console.log(`Starting the DCP worker in group ${group.joinKey} only. Ctrl+C to stop.`);
    run('worker', ['dcp-worker', '--output', 'text', '--no-global', '--join', q(`${group.joinKey},${group.joinSecret}`)]);
  }, 3000);
}

process.on('SIGINT', () => { stopAll(); setTimeout(() => process.exit(0), 300); });
process.on('SIGTERM', () => { stopAll(); setTimeout(() => process.exit(0), 300); });
main();
