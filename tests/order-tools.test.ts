import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  buildDryRunClosePosition,
  buildDryRunOrder,
  buildDryRunPositionUpdate,
  listOpenOrdersDryRun,
  listSupportedMarkets,
  placeOrderTool,
  resolveLivePassphrase,
} from '../src/services/order-tools';
import {
  clearRememberedWalletPassphrase,
  rememberWalletPassphrase,
} from '../src/services/wallet-session';
import { installMockMarketApi } from './market-api-fixture';

let restoreFetch: (() => void) | undefined;

describe('order tools', () => {
  beforeEach(() => {
    restoreFetch = installMockMarketApi();
  });

  afterEach(() => {
    clearRememberedWalletPassphrase('deepx_devnet');
    clearRememberedWalletPassphrase('deepx_testnet');
    restoreFetch?.();
    restoreFetch = undefined;
  });

  test('lists supported markets for a network', async () => {
    expect(
      (await listSupportedMarkets('deepx_devnet')).map(
        (market) => market.label,
      ),
    ).toEqual(['ETH-USDC', 'SOL-USDC', 'ETH/USDC', 'SOL/USDC']);
  });

  test('builds a dry-run limit order ticket', async () => {
    const result = await buildDryRunOrder({
      pair: 'ETH-USDC',
      side: 'BUY',
      type: 'LIMIT',
      size: '1.25',
      price: '2500.5',
      confirm: true,
    });

    expect(result).toMatchObject({
      status: 'dry_run',
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      side: 'BUY',
      type: 'LIMIT',
      size: '1.250',
      price: '2500.50',
      notional: '3125.63',
      explorerUrl: 'http://explorer-devnetx.deepx.fi/tx',
    });
    expect(result.summary).toBe(
      'Dry run only\n' +
        'Side: BUY\n' +
        'Pair: ETH-USDC\n' +
        'Type: LIMIT\n' +
        'Size: 1.250\n' +
        'Price: 2500.50\n' +
        'Network: DEVNET\n' +
        'Explorer:\n' +
        'http://explorer-devnetx.deepx.fi/tx',
    );
  });

  test('rejects unsupported markets', async () => {
    await expect(
      buildDryRunOrder({
        pair: 'BTC-USDC',
        side: 'BUY',
        type: 'LIMIT',
        size: '1',
        price: '100',
      }),
    ).rejects.toThrow('Unsupported pair "BTC-USDC"');
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

  test('keeps unlocked spot orders dry-run until explicitly confirmed', async () => {
    rememberWalletPassphrase('deepx_devnet', 'session-secret');

    const result = await placeOrderTool({
      pair: 'ETH/USDC',
      side: 'BUY',
      type: 'LIMIT',
      size: '1',
      price: '2500',
    });

    expect(result).toMatchObject({
      status: 'dry_run',
      network: 'deepx_devnet',
      pair: 'ETH/USDC',
      kind: 'spot',
    });
  });

  test('keeps unlocked perp orders dry-run until explicitly confirmed', async () => {
    rememberWalletPassphrase('deepx_devnet', 'session-secret');

    const result = await placeOrderTool({
      pair: 'ETH-USDC',
      side: 'BUY',
      type: 'LIMIT',
      size: '1',
      price: '2500',
    });

    expect(result).toMatchObject({
      status: 'dry_run',
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      kind: 'perp',
    });
  });

  test('builds a dry-run close-position ticket', async () => {
    expect(
      await buildDryRunClosePosition({
        pair: 'ETH-USDC',
        price: '2500.5',
        confirm: true,
      }),
    ).toMatchObject({
      status: 'dry_run',
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      action: 'close_position',
      price: '2500.50',
      slippage: '10',
    });
  });

  test('builds a dry-run position update ticket', async () => {
    expect(
      await buildDryRunPositionUpdate({
        pair: 'ETH-USDC',
        takeProfit: '2800',
        stopLoss: '2300',
        confirm: true,
      }),
    ).toMatchObject({
      status: 'dry_run',
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      action: 'update_position',
      takeProfit: '2800.00',
      stopLoss: '2300.00',
    });
  });
});
