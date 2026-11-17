'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Who has joined this training session (decision 0004).
 *
 * A laptop joins by opening the coordinator's join link and running the one command it shows.
 * That starts demo/agent.js on the laptop, which serves the laptop's own data file on localhost
 * and registers here with a description of the data: name, row count and feature names, never
 * the rows themselves. The coordinator gives each laptop one compute group from a pool, and the
 * laptop's DCP worker joins only that group. Each training job is attached to that one group, so
 * it can only be computed on that laptop.
 *
 * The pool lives in demo/devices.json (gitignored):
 *   { "computeGroups": [ { "joinKey": "...", "joinSecret": "..." }, ... ] }
 * Compute groups are created in the DCP portal (dcp-client has no API to create them), so the
 * pool size is the most laptops that can be in one session. Add groups to allow more.
 * Without a pool, one shared group gives every laptop the same group: that works, but a job may
 * land on the wrong laptop first and be retried. The shared group is "sharedGroup" in
 * devices.json, or DCP_ATTACH_KEY / DCP_ATTACH_SECRET (which win). The data-in-job mode sends
 * every job to the shared group, or to the public network without one.
 */

const CONFIG_FILE = path.join(__dirname, 'devices.json');
const HEARTBEAT_TIMEOUT_MS = 15 * 1000;

function loadGroupPool(file = CONFIG_FILE, env = process.env) {
  const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const real = (g) => g && g.joinKey && g.joinKey !== 'TODO';
  const pool = (cfg.computeGroups || []).filter(real);
  const shared = env.DCP_ATTACH_KEY
    ? { joinKey: env.DCP_ATTACH_KEY, joinSecret: env.DCP_ATTACH_SECRET }
    : real(cfg.sharedGroup) ? { joinKey: cfg.sharedGroup.joinKey, joinSecret: cfg.sharedGroup.joinSecret } : null;
  return { pool, shared };
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'site';
}

/**
 * groups:       { pool: [{ joinKey, joinSecret }], shared: { joinKey, joinSecret } | null }
 * featureNames: the features every site must have, in order (from the coordinator's test set)
 * onChange:     (action, participant) for 'joined' | 'updated' | 'offline' | 'left'
 */
function createRegistry({ groups, featureNames, onChange = () => {}, now = () => Date.now(), token = crypto.randomBytes(9).toString('base64url') }) {
  const byId = new Map();
  const usedSlots = new Set();

  function publicView(p) {
    const { secret, group, ...rest } = p;
    return { ...rest, group: group ? group.joinKey : null };
  }

  /** Names are unique among laptops of the same kind (real or simulated), since runs never mix them. */
  function uniqueName(base, simulated) {
    const taken = new Set([...byId.values()].filter((p) => p.simulated === simulated).map((p) => p.name));
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }

  function claimGroup() {
    for (let i = 0; i < groups.pool.length; i++) {
      if (!usedSlots.has(i)) {
        usedSlots.add(i);
        return { slot: i, group: groups.pool[i] };
      }
    }
    if (groups.shared) return { slot: null, group: groups.shared };
    if (groups.pool.length) throw httpError(409, `All ${groups.pool.length} compute groups are taken. Add more to demo/devices.json.`);
    return { slot: null, group: null };
  }

  function join(body) {
    if (body.token !== token) throw httpError(403, 'This join link is out of date. Open the link on the coordinator screen again.');
    const simulated = Boolean(body.simulated);
    const port = simulated ? null : Number(body.port);
    if (!simulated && (!Number.isInteger(port) || port < 1 || port > 65535)) throw httpError(400, 'bad port');
    const rows = Number(body.rows);
    if (!Number.isInteger(rows) || rows < 1) throw httpError(400, 'bad row count');
    if (JSON.stringify(body.featureNames) !== JSON.stringify(featureNames)) {
      throw httpError(400, `Data has features ${JSON.stringify(body.featureNames)}, but this model needs ${JSON.stringify(featureNames)} in that order.`);
    }
    const { slot, group } = simulated ? { slot: null, group: null } : claimGroup();
    const p = {
      id: crypto.randomBytes(6).toString('hex'),
      secret: crypto.randomBytes(12).toString('base64url'), // proves later heartbeats come from this agent
      name: uniqueName(slug(body.name), simulated),
      dataset: body.dataset ? slug(body.dataset) : null,
      device: String(body.device || 'unknown').slice(0, 64),
      rows,
      port,
      simulated,
      status: 'online',
      workerRunning: false,
      reads: 0,
      joinedAt: now(),
      lastSeen: now(),
      slot,
      group,
    };
    byId.set(p.id, p);
    onChange('joined', publicView(p));
    return { id: p.id, secret: p.secret, name: p.name, computeGroup: group, sharedGroup: slot === null && Boolean(group) };
  }

  function authed(body) {
    const p = byId.get(body && body.id);
    if (!p || p.secret !== body.secret || p.status === 'left') throw httpError(404, 'Unknown participant. Restart the agent to join again.');
    return p;
  }

  function heartbeat(body) {
    const p = authed(body);
    const wasOffline = p.status === 'offline';
    p.lastSeen = now();
    p.status = 'online';
    const changed = wasOffline || p.workerRunning !== Boolean(body.workerRunning) || p.reads !== Number(body.reads || 0);
    p.workerRunning = Boolean(body.workerRunning);
    p.reads = Number(body.reads || 0);
    if (changed) onChange('updated', publicView(p));
    return { ok: true };
  }

  function release(p) {
    if (p.slot !== null) usedSlots.delete(p.slot);
  }

  function leave(body) {
    const p = authed(body);
    p.status = 'left';
    release(p);
    byId.delete(p.id);
    onChange('left', publicView(p));
    return { ok: true };
  }

  /** Mark laptops that stopped sending heartbeats. They keep their group until they leave. */
  function sweep() {
    for (const p of byId.values()) {
      if (!p.simulated && p.status === 'online' && now() - p.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        p.status = 'offline';
        onChange('offline', publicView(p));
      }
    }
  }

  function remove(id) {
    const p = byId.get(id);
    if (!p) return false;
    release(p);
    byId.delete(id);
    onChange('left', publicView(p));
    return true;
  }

  return {
    token,
    join,
    heartbeat,
    leave,
    sweep,
    remove,
    list: () => [...byId.values()].map(publicView),
    /** Online participants with everything the DCP runner needs, including group credentials. */
    active: (simulated) => [...byId.values()].filter((p) => p.status === 'online' && p.simulated === simulated),
    slots: () => ({ total: groups.pool.length, used: usedSlots.size, shared: Boolean(groups.shared) }),
  };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = { createRegistry, loadGroupPool, CONFIG_FILE, HEARTBEAT_TIMEOUT_MS };
