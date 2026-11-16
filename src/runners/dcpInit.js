'use strict';

const os = require('node:os');
const path = require('node:path');

/**
 * Initialise dcp-client, set the identity, and unlock the payment account once.
 *
 * Identity, in order of preference (see https://docs.dcp.dev/intro/getting-setup.html):
 *   1. DCP_API_KEY environment variable: an API key from the portal's Keys tab.
 *   2. ~/.dcp/id.keystore (an API key keystore downloaded from the portal).
 *
 * Payment: ~/.dcp/default.keystore (the bank account keystore from the portal's Bank tab).
 * Keystores are unlocked here, once, and every job reuses them, so the passphrase is asked for
 * one time instead of once per job.
 *
 * passphrases: optional { identity, payment }. When given (e.g. from the dashboard's password
 * dialog) the keystores are unlocked with them and nothing is prompted in the terminal. A wrong
 * passphrase throws a DCP_WA:UNLOCKX error. When omitted, dcp-client prompts in the terminal.
 * Passphrases are used once and not stored.
 *
 * Local-worker mode (job.localExec) pays nothing, so it skips the payment keystore.
 */
const UNLOCK_SECONDS = 8 * 60 * 60; // long enough for a demo session
const DCP_DIR = path.join(os.homedir(), '.dcp');

async function loadKeystore(wallet, name) {
  const loaded = await wallet.load(path.join(DCP_DIR, `${name}.keystore`));
  return loaded.keystore || loaded;
}

async function unlockOrExplain(keystore, passphrase, what) {
  try {
    // Always a string: unlock(undefined) would fall back to a terminal prompt and hang a server.
    await keystore.unlock(typeof passphrase === 'string' ? passphrase : '', UNLOCK_SECONDS);
  } catch (err) {
    if (String(err.code || err.message).includes('UNLOCKX')) {
      const e = new Error(`Wrong password for the ${what} keystore`);
      e.code = 'WRONG_PASSWORD';
      e.keystore = what;
      throw e;
    }
    throw err;
  }
}

let clientReady = null; // dcp-client's init() should run once per process, even if unlocking is retried

async function initDcp({ needPayment = true, passphrases = null } = {}) {
  if (!clientReady) clientReady = require('dcp-client').init();
  await clientReady;
  const identity = require('dcp/identity');
  const wallet = require('dcp/wallet');

  if (process.env.DCP_API_KEY) {
    await identity.set(process.env.DCP_API_KEY.trim());
  } else if (passphrases) {
    const idKs = await loadKeystore(wallet, 'id');
    await unlockOrExplain(idKs, passphrases.identity, 'identity (API key)');
    await identity.set(idKs);
  }

  let paymentKeystore = null;
  if (needPayment) {
    if (passphrases) {
      paymentKeystore = await loadKeystore(wallet, 'default');
      await unlockOrExplain(paymentKeystore, passphrases.payment, 'bank account');
    } else {
      paymentKeystore = await wallet.get();
      await paymentKeystore.unlock(undefined, UNLOCK_SECONDS);
    }
  }
  return { compute: require('dcp/compute'), paymentKeystore };
}

/** Which passwords the dashboard needs to ask for. */
function passwordsNeeded({ needPayment = true } = {}) {
  return { identity: !process.env.DCP_API_KEY, payment: needPayment };
}

module.exports = { initDcp, passwordsNeeded };
