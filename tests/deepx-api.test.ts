import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { getNetworkConfig } from '../src/config/networks';
import {
  candleWindowDurationMs,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  fetchMarketPriceInfo,
  resolutionToTimeFrame,
} from '../src/services/deepx-api';
import {
  getNetworkMarkets,
  getPairsByKind,
} from '../src/services/market-catalog';
import { installMockMarketApi } from './market-api-fixture';

let restoreFetch: (() => void) | undefined;

beforeEach(() => {
  restoreFetch = installMockMarketApi();
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe('market-catalog', () => {
  test('exposes perp and spot pairs', async () => {
    const pairs = await getNetworkMarkets(getNetworkConfig('devnet'));
    expect(getPairsByKind(pairs, 'perp').map((pair) => pair.label)).toEqual([
      'ETH-USDC',
      'SOL-USDC',
    ]);
    expect(getPairsByKind(pairs, 'spot').map((pair) => pair.label)).toEqual([
      'ETH/USDC',
      'SOL/USDC',
    ]);
  });
});

describe('resolutionToTimeFrame', () => {
  test('maps terminal chart resolutions to deepx api values', () => {
    expect(resolutionToTimeFrame('1')).toBe('1m');
    expect(resolutionToTimeFrame('15')).toBe('15m');
    expect(resolutionToTimeFrame('30')).toBe('30m');
    expect(resolutionToTimeFrame('60')).toBe('1h');
    expect(resolutionToTimeFrame('240')).toBe('4h');
    expect(resolutionToTimeFrame('1D')).toBe('1d');
    expect(resolutionToTimeFrame('1W')).toBe('1w');
    expect(resolutionToTimeFrame('1M')).toBe('1M');
  });

  test('keeps a deep enough candle history window to fill the chart', () => {
    expect(DEFAULT_CANDLE_HISTORY_LIMIT).toBe(150);
  });

  test('expands the candle fetch window to match timeframe and history depth', () => {
    expect(candleWindowDurationMs('15m', DEFAULT_CANDLE_HISTORY_LIMIT)).toBe(
      154 * 15 * 60_000,
    );
  });
});

describe('fetchMarketPriceInfo', () => {
  test('returns latest price and 24h change info for a perp pair', async () => {
    const result = await fetchMarketPriceInfo({
      network: getNetworkConfig('devnet'),
      pair: 'ETH-USDC',
    });

    expect(result).toEqual({
      pair: 'ETH-USDC',
      kind: 'perp',
      latestPrice: '1925.00',
      last24hChange: '+25.00',
      last24hChangePercent: '+1.32%',
      summary:
        'ETH-USDC perp market, latest price 1925.00, 24h change +25.00 (+1.32%)',
    });
  });

  test('returns latest price and 24h change info for a spot pair', async () => {
    const result = await fetchMarketPriceInfo({
      network: getNetworkConfig('devnet'),
      pair: 'SOL/USDC',
    });

    expect(result).toEqual({
      pair: 'SOL/USDC',
      kind: 'spot',
      latestPrice: '151.2500',
      last24hChange: '+1.7500',
      last24hChangePercent: '+1.17%',
      summary:
        'SOL/USDC spot market, latest price 151.2500, 24h change +1.7500 (+1.17%)',
    });
  });
});
