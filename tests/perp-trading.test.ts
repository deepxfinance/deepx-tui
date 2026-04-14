import { describe, expect, test } from 'bun:test';

import { getNetworkConfig } from '../src/config/networks';
import {
  closePerpPositionLive,
  formatRpcFailureMessage,
  getTransactionSubmissionRpcUrl,
  listLivePerpPairs,
  placePerpOrderLive,
  updatePerpPositionLive,
} from '../src/services/perp-trading';

describe('perp trading config', () => {
  test('exposes the live perp markets', () => {
    expect(listLivePerpPairs()).toEqual(['ETH-USDC', 'SOL-USDC']);
  });

  test('network config exposes chain and explorer metadata', () => {
    expect(getNetworkConfig('devnet')).toMatchObject({
      chainId: 4845,
      explorerUrl: 'http://explorer-devnet.deepx.fi',
    });
  });

  test('requires explicit confirmation for live orders', async () => {
    await expect(
      placePerpOrderLive({
        pair: 'ETH-USDC',
        side: 'BUY',
        type: 'LIMIT',
        size: '1',
        price: '1000',
        passphrase: 'secret',
        confirm: false,
      }),
    ).rejects.toThrow('Live order submission requires confirm=true.');
  });

  test('requires explicit confirmation for live position closes', async () => {
    await expect(
      closePerpPositionLive({
        pair: 'ETH-USDC',
        price: '1000',
        passphrase: 'secret',
        confirm: false,
      }),
    ).rejects.toThrow('Live position close requires confirm=true.');
  });

  test('requires explicit confirmation for live position updates', async () => {
    await expect(
      updatePerpPositionLive({
        pair: 'ETH-USDC',
        takeProfit: '1200',
        stopLoss: '900',
        passphrase: 'secret',
        confirm: false,
      }),
    ).rejects.toThrow('Live position update requires confirm=true.');
  });

  test('uses the network rpc url for transaction submission', () => {
    expect(
      getTransactionSubmissionRpcUrl(getNetworkConfig('deepx_devnet')),
    ).toBe('https://devnet-rpc.deepx.fi');
  });

  test('includes the rpc error message in failure messages', () => {
    expect(formatRpcFailureMessage(new Error('backend exploded'))).toBe(
      'RPC transaction submission failed: backend exploded',
    );
  });
});
