import { afterEach, describe, expect, test } from 'bun:test';

import {
  buildDryRunOrder,
  listOpenOrdersDryRun,
  listSupportedMarkets,
  resolveLivePassphrase,
} from '../src/services/order-tools';
import {
  clearRememberedWalletPassphrase,
  rememberWalletPassphrase,
} from '../src/services/wallet-session';

describe('order tools', () => {
  afterEach(() => {
    clearRememberedWalletPassphrase('deepx_devnet');
    clearRememberedWalletPassphrase('deepx_testnet');
  });

  test('lists supported markets for a network', () => {
    expect(
      listSupportedMarkets('deepx_devnet').map((market) => market.label),
    ).toEqual(['ETH-USDC', 'SOL-USDC', 'ETH/USDC', 'SOL/USDC']);
  });

  test('builds a dry-run limit order ticket', () => {
    expect(
      buildDryRunOrder({
        pair: 'ETH-USDC',
        side: 'BUY',
        type: 'LIMIT',
        size: '1.25',
        price: '2500.5',
        confirm: true,
      }),
    ).toMatchObject({
      status: 'dry_run',
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      side: 'BUY',
      type: 'LIMIT',
      size: '1.250',
      price: '2500.50',
      notional: '3125.63',
    });
  });

  test('rejects unsupported markets', () => {
    expect(() =>
      buildDryRunOrder({
        pair: 'BTC-USDC',
        side: 'BUY',
        type: 'LIMIT',
        size: '1',
        price: '100',
      }),
    ).toThrow('Unsupported pair "BTC-USDC"');
  });

  test('returns placeholder open orders in dry-run mode', () => {
    expect(listOpenOrdersDryRun('deepx_testnet')).toEqual({
      network: 'deepx_testnet',
      orders: [],
      summary:
        'Open orders are unavailable in dry-run mode because live account queries are not implemented yet.',
    });
  });

  test('uses the remembered session passphrase when one is available', () => {
    rememberWalletPassphrase('deepx_devnet', 'session-secret');

    expect(resolveLivePassphrase('deepx_devnet')).toBe('session-secret');
  });
});
