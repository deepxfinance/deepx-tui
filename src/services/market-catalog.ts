import type { NetworkConfig } from '../config/networks';

export type PairKind = 'perp' | 'spot';

export type MarketPair = {
  kind: PairKind;
  label: string;
  pairId: string;
  priceDecimal: number;
  orderDecimal: number;
  baseDecimals: number;
  baseSymbol: string;
  quoteSymbol: string;
  marketId?: number;
};

export function getMarketPairs(_network: NetworkConfig): MarketPair[] {
  return [
    {
      kind: 'perp',
      label: 'ETH-USDC',
      pairId: '3',
      marketId: 3,
      priceDecimal: 2,
      orderDecimal: 3,
      baseDecimals: 18,
      baseSymbol: 'ETH',
      quoteSymbol: 'USDC',
    },
    {
      kind: 'perp',
      label: 'SOL-USDC',
      pairId: '4',
      marketId: 4,
      priceDecimal: 2,
      orderDecimal: 2,
      baseDecimals: 9,
      baseSymbol: 'SOL',
      quoteSymbol: 'USDC',
    },
    {
      kind: 'spot',
      label: 'ETH/USDC',
      pairId: '3',
      priceDecimal: 4,
      orderDecimal: 3,
      baseDecimals: 18,
      baseSymbol: 'ETH',
      quoteSymbol: 'USDC',
    },
    {
      kind: 'spot',
      label: 'SOL/USDC',
      pairId: '4',
      priceDecimal: 4,
      orderDecimal: 2,
      baseDecimals: 9,
      baseSymbol: 'SOL',
      quoteSymbol: 'USDC',
    },
  ];
}

export function getPairsByKind(
  pairs: MarketPair[],
  kind: PairKind,
): MarketPair[] {
  return pairs.filter((pair) => pair.kind === kind);
}
