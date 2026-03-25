import { describe, expect, test } from 'bun:test';

import { getNetworkConfig } from '../src/config/networks';
import {
  listLivePerpPairs,
  placePerpOrderLive,
} from '../src/services/perp-trading';

describe('perp trading config', () => {
  test('exposes the live perp markets', () => {
    expect(listLivePerpPairs()).toEqual(['ETH-USDC', 'SOL-USDC']);
  });

  test('network config exposes chain and explorer metadata', () => {
    expect(getNetworkConfig('devnet')).toMatchObject({
      chainId: 4835,
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
});
