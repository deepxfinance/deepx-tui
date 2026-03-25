import { describe, expect, test } from 'bun:test';

import { getNetworkConfig } from '../src/config/networks';
import { resolutionToTimeFrame } from '../src/services/deepx-api';
import { getMarketPairs, getPairsByKind } from '../src/services/market-catalog';

describe('market-catalog', () => {
  test('exposes perp and spot pairs', () => {
    const pairs = getMarketPairs(getNetworkConfig('devnet'));
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
});
