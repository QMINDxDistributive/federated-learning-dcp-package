'use strict';

/**
 * Precompute "each state trains alone" for the results popup, once, when the data is prepared.
 * The coordinator then never needs any state's rows: in DCP mode they stay on the laptops.
 *
 *   node demo/baselines.js     writes demo/data/baselines.json
 */

const fs = require('node:fs');
const path = require('node:path');
const { train, predictProba, createLocalRunner } = require('../src');
const { loadSites, loadTestSet } = require('./sites');
const { auc, accuracy } = require('./metrics');

const OUT = path.join(__dirname, 'data', 'baselines.json');
const HYPER = { l2: 1, siteSizeCheck: 'warn', tolerance: 1e-8, maxRounds: 25, siteShiftWarning: null };

async function main() {
  const test = loadTestSet();
  const out = [];
  for (const s of loadSites()) {
    const model = await train({ runner: createLocalRunner([s]), hyperparameters: HYPER });
    const p = test.X.map((x) => predictProba(model, x));
    out.push({ site: s.name, n: s.data.X.length, auc: auc(test.y, p), accuracy: accuracy(test.y, p) });
  }
  fs.writeFileSync(OUT, JSON.stringify({ note: 'Each state trained alone, scored on test.json. Written by demo/baselines.js.', localOnly: out }, null, 2) + '\n');
  for (const r of out) console.log(`${r.site.padEnd(12)} ${String(r.n).padStart(5)} rows  AUC ${r.auc.toFixed(4)}`);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
