import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { getNetworkConfig } from '../src/config/networks';
import { getNetworkMarkets } from '../src/services/market-catalog';
import {
  buildSpotOrderCall,
  calculateQuoteAmount,
  encodeSpotPairId,
  listLiveSpotPairs,
} from '../src/services/spot-trading';
import { installMockMarketApi } from './market-api-fixture';

let restoreFetch: (() => void) | undefined;

beforeEach(() => {
  restoreFetch = installMockMarketApi();
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe('spot trading config', () => {
  test('exposes the live spot markets', async () => {
    expect(await listLiveSpotPairs()).toEqual(['ETH/USDC', 'SOL/USDC']);
  });

  test('encodes numeric spot pair ids as bytes32 values', () => {
    expect(encodeSpotPairId('3')).toBe(
      '0x0000000000000000000000000000000000000000000000000000000000000003',
    );
  });

  test('calculates quote amount from base amount and price', () => {
    expect(
      calculateQuoteAmount({
        baseAmount: 1_250_000_000_000_000_000n,
        baseDecimals: 18,
        price: '2500.5',
      }),
    ).toBe(3_125_625_000n);
  });

  test('builds a subaccount limit buy call', async () => {
    const ethSpotPair = (
      await getNetworkMarkets(getNetworkConfig('deepx_devnet'))
    )
      .filter((pair) => pair.kind === 'spot')
      .find((pair) => pair.label === 'ETH/USDC');
    if (!ethSpotPair) {
      throw new Error(
        'ETH/USDC spot pair is missing from test market catalog.',
      );
    }

    expect(
      buildSpotOrderCall({
        pair: ethSpotPair,
        side: 'BUY',
        type: 'LIMIT',
        size: '1.25',
        price: '2500.5',
      }),
    ).toEqual({
      functionName: 'subaccountPlaceOrderBuyB',
      args: [
        '0x9068d4ac891a14784c17877eb74bd8489b3367c71d72766dbfa4dfbfb662fa37',
        3_125_625_000n,
        1_250_000_000_000_000_000n,
        0,
        false,
      ],
    });
  });

  test('builds a subaccount market sell call without price', async () => {
    const ethSpotPair = (
      await getNetworkMarkets(getNetworkConfig('deepx_devnet'))
    )
      .filter((pair) => pair.kind === 'spot')
      .find((pair) => pair.label === 'ETH/USDC');
    if (!ethSpotPair) {
      throw new Error(
        'ETH/USDC spot pair is missing from test market catalog.',
      );
    }

    expect(
      buildSpotOrderCall({
        pair: ethSpotPair,
        side: 'SELL',
        type: 'MARKET',
        size: '0.5',
      }),
    ).toEqual({
      functionName: 'subaccountPlaceMarketOrderSellBWithoutPrice',
      args: [
        '0x9068d4ac891a14784c17877eb74bd8489b3367c71d72766dbfa4dfbfb662fa37',
        0n,
        500_000_000_000_000_000n,
        false,
        false,
      ],
    });
  });

  test('builds a subaccount market buy call with price and slippage', async () => {
    const ethSpotPair = (
      await getNetworkMarkets(getNetworkConfig('deepx_devnet'))
    )
      .filter((pair) => pair.kind === 'spot')
      .find((pair) => pair.label === 'ETH/USDC');
    if (!ethSpotPair) {
      throw new Error(
        'ETH/USDC spot pair is missing from test market catalog.',
      );
    }

    expect(
      buildSpotOrderCall({
        pair: ethSpotPair,
        side: 'BUY',
        type: 'MARKET',
        size: '0.5',
        price: '2000',
        slippage: 15,
      }),
    ).toEqual({
      functionName: 'subaccountPlaceMarketOrderBuyBWithPrice',
      args: [
        '0x9068d4ac891a14784c17877eb74bd8489b3367c71d72766dbfa4dfbfb662fa37',
        1_000_000_000n,
        500_000_000_000_000_000n,
        15,
        false,
        false,
      ],
    });
  });

  test('uses the live bytes32 spot pair id for sol market orders', async () => {
    const solSpotPair = (
      await getNetworkMarkets(getNetworkConfig('deepx_devnet'))
    )
      .filter((pair) => pair.kind === 'spot')
      .find((pair) => pair.label === 'SOL/USDC');
    if (!solSpotPair) {
      throw new Error(
        'SOL/USDC spot pair is missing from test market catalog.',
      );
    }

    expect(
      buildSpotOrderCall({
        pair: solSpotPair,
        side: 'BUY',
        type: 'MARKET',
        size: '0.01',
      }),
    ).toEqual({
      functionName: 'subaccountPlaceMarketOrderBuyBWithoutPrice',
      args: [
        '0x282895afbd8da7b26d15bff7a85a0d33aa03a08daa5bb90e38c6b92019e19c53',
        0n,
        10_000_000n,
        false,
        false,
      ],
    });
  });
});
