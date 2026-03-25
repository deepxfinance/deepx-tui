import { afterEach, describe, expect, test } from 'bun:test';

import {
  clearRememberedWalletPassphrase,
  getRememberedWalletPassphrase,
  rememberWalletPassphrase,
} from '../src/services/wallet-session';

describe('wallet-session', () => {
  afterEach(() => {
    clearRememberedWalletPassphrase('deepx_devnet');
    clearRememberedWalletPassphrase('deepx_testnet');
  });

  test('remembers passphrase in process memory', () => {
    rememberWalletPassphrase('deepx_devnet', 'secret-123');

    expect(getRememberedWalletPassphrase('deepx_devnet')).toBe('secret-123');
  });

  test('falls back to inherited environment variables', () => {
    process.env.DEEPX_SESSION_PASSPHRASE_DEEPX_TESTNET = 'env-secret';

    expect(getRememberedWalletPassphrase('deepx_testnet')).toBe('env-secret');
  });
});
