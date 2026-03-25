import process from 'node:process';

import type { RuntimeNetwork } from '../config/networks';

const sessionPassphrases = new Map<RuntimeNetwork, string>();

function envKey(network: RuntimeNetwork) {
  return `DEEPX_SESSION_PASSPHRASE_${network.toUpperCase()}`;
}

export function rememberWalletPassphrase(
  network: RuntimeNetwork,
  passphrase: string,
) {
  sessionPassphrases.set(network, passphrase);
  process.env[envKey(network)] = passphrase;
}

export function getRememberedWalletPassphrase(network: RuntimeNetwork) {
  return sessionPassphrases.get(network) ?? process.env[envKey(network)];
}

export function clearRememberedWalletPassphrase(network: RuntimeNetwork) {
  sessionPassphrases.delete(network);
  delete process.env[envKey(network)];
}
