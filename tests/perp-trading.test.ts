import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { getNetworkConfig } from '../src/config/networks';
import {
  buildSubmittedOrderSummary,
  closePerpPositionLive,
  formatRpcFailureMessage,
  getTransactionSubmissionRpcUrl,
  listLivePerpPairs,
  placePerpOrderLive,
  updatePerpPositionLive,
} from '../src/services/perp-trading';
import { getPrimarySubaccountFromUserStats } from '../src/services/subaccount-contract';
import { installMockMarketApi } from './market-api-fixture';

let restoreFetch: (() => void) | undefined;

beforeEach(() => {
  restoreFetch = installMockMarketApi();
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe('perp trading config', () => {
  test('exposes the live perp markets', async () => {
    expect(await listLivePerpPairs()).toEqual(['ETH-USDC', 'SOL-USDC']);
  });

  test('network config exposes chain and explorer metadata', () => {
    expect(getNetworkConfig('devnet')).toMatchObject({
      chainId: 4845,
      explorerUrl: 'http://explorer-devnetx.deepx.fi',
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

  test('selects the primary contract subaccount for live perp transactions', () => {
    expect(
      getPrimarySubaccountFromUserStats({
        walletAddress: '0x1111000000000000000000000000000000001111',
        subaccounts: [
          {
            subaccount: '0x2222000000000000000000000000000000002222',
          },
          {
            subaccount: '0x3333000000000000000000000000000000003333',
          },
        ],
      }),
    ).toBe('0x2222000000000000000000000000000000002222');

    expect(() =>
      getPrimarySubaccountFromUserStats({
        walletAddress: '0x1111000000000000000000000000000000001111',
        subaccounts: [],
      }),
    ).toThrow(
      'No subaccount found for 0x1111000000000000000000000000000000001111. Create or initialize a subaccount first.',
    );
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
    ).toBe('https://devnet-rpc-new.deepx.fi');
  });

  test('formats submitted orders as a readable terminal block', () => {
    expect(
      buildSubmittedOrderSummary({
        networkLabel: 'DEVNET',
        pair: 'ETH-USDC',
        side: 'BUY',
        type: 'MARKET',
        size: '0.01',
        txHash:
          '0xb4740e33b3d7681c153386e7fb1e9f5b1e6bef7be5da37d72251eb2ae81732fb',
        explorerUrl:
          'http://explorer-devnet.deepx.fi/tx/0xb4740e33b3d7681c153386e7fb1e9f5b1e6bef7be5da37d72251eb2ae81732fb',
      }),
    ).toBe(
      'Order submitted\n' +
        'Side: BUY\n' +
        'Pair: ETH-USDC\n' +
        'Type: MARKET\n' +
        'Size: 0.01\n' +
        'Network: DEVNET\n' +
        'Tx Hash: 0xb4740e...32fb\n' +
        'Explorer:\n' +
        'http://explorer-devnet.deepx.fi/tx/0xb4740e33b3d7681c153386e7fb1e9f5b1e6bef7be5da37d72251eb2ae81732fb',
    );
  });

  test('includes the rpc error message in failure messages', () => {
    expect(formatRpcFailureMessage(new Error('backend exploded'))).toBe(
      'RPC transaction submission failed: backend exploded',
    );
  });
});
