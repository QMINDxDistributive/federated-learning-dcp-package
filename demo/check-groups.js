'use strict';

/**
 * Check that the scheduler accepts jobs for every compute group in demo/devices.json.
 *
 *   npm run demo:check-groups
 *
 * For each group (the computeGroups pool, plus sharedGroup if set) it deploys a tiny job attached
 * to that group, and cancels it as soon as the scheduler accepts it, so nothing is computed.
 * "Access Denied ... desired compute groups" means the scheduler rejected that group's join key
 * or secret. Asks for the DCP passwords once. Secrets are never printed.
 *
 * This checks the job side only. To check a worker can join a group, run
 *   npx --yes -p dcp-worker@4.7.0 dcp-worker --no-global --join "<key>,<secret>"
 */

const { loadGroupPool } = require('./participants');

async function checkGroup(compute, paymentKeystore, group) {
  const job = compute.for([1], (x) => x);
  job.public.name = `group check ${group.joinKey}`;
  job.computeGroups = [{ attachKey: group.joinKey, attachSecret: group.joinSecret }];
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok, msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, msg });
    };
    const timer = setTimeout(() => done(false, 'no answer from the scheduler after 60 s'), 60 * 1000);
    job.on('accepted', () => {
      done(true, 'accepted');
      job.cancel('group check only').catch(() => {});
    });
    job.exec(1, paymentKeystore).catch((err) => done(false, err.message));
  });
}

async function main() {
  const { pool, shared } = loadGroupPool();
  const groups = pool.map((g, i) => ({ ...g, label: `computeGroups[${i}]` }));
  if (shared) groups.push({ ...shared, label: 'sharedGroup' });
  if (!groups.length) {
    console.error('No compute groups in demo/devices.json (all TODO?).');
    process.exit(1);
  }
  const { compute, paymentKeystore } = await require('../src/runners/dcpInit').initDcp({ needPayment: true });
  console.log(`Checking ${groups.length} compute group(s)...\n`);
  let bad = 0;
  for (const g of groups) {
    const r = await checkGroup(compute, paymentKeystore, g);
    if (!r.ok) bad++;
    console.log(`  ${r.ok ? 'OK  ' : 'FAIL'}  ${g.joinKey.padEnd(16)} ${g.label.padEnd(18)} ${r.ok ? '' : r.msg}`);
  }
  console.log(bad ? `\n${bad} group(s) rejected. Check their joinKey and joinSecret in demo/devices.json.` : '\nAll groups accepted jobs.');
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
