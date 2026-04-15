import { describe, expect, test } from 'bun:test';

import { getNetworkConfig } from '../src/config/networks';
import { getMarketPairs } from '../src/services/market-catalog';
import {
  buildSpotOrderCall,
  calculateQuoteAmount,
  encodeSpotPairId,
  listLiveSpotPairs,
} from '../src/services/spot-trading';

const spotPairs = getMarketPairs(getNetworkConfig('deepx_devnet')).filter(
  (pair) => pair.kind === 'spot',
);
const ethSpotPair = spotPairs.find((pair) => pair.label === 'ETH/USDC');

if (!ethSpotPair) {
  throw new Error('ETH/USDC spot pair is missing from test market catalog.');
}

describe('spot trading config', () => {
  test('exposes the live spot markets', () => {
    expect(listLiveSpotPairs()).toEqual(['ETH/USDC', 'SOL/USDC']);
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

  test('builds a subaccount limit buy call', () => {
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
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        3_125_625_000n,
        1_250_000_000_000_000_000n,
        0,
        false,
      ],
    });
  });

  test('builds a subaccount market sell call without price', () => {
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
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        0n,
        500_000_000_000_000_000n,
        false,
        false,
      ],
    });
  });

  test('builds a subaccount market buy call with price and slippage', () => {
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
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        1_000_000_000n,
        500_000_000_000_000_000n,
        15,
        false,
        false,
      ],
    });
  });
});
