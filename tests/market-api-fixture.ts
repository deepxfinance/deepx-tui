import {
  clearNetworkMarketsCache,
  type MarketPair,
} from '../src/services/market-catalog';

const MOCK_PERP_MARKETS = [
  {
    id: 3,
    name: 'ETH-USDC',
    baseSymbol: 'eth',
    quoteSymbol: 'usdc',
    baseDecimal: 18,
    quoteDecimal: 6,
    orderSpecTickSize: '10000',
    orderSpecStepSize: '1000000000000000',
  },
  {
    id: 4,
    name: 'SOL-USDC',
    baseSymbol: 'sol',
    quoteSymbol: 'usdc',
    baseDecimal: 9,
    quoteDecimal: 6,
    orderSpecTickSize: '10000',
    orderSpecStepSize: '10000000',
  },
] as const;

const MOCK_SPOT_MARKETS = [
  {
    name: 'ETH/USDC',
    pair: '0x9068d4ac891a14784c17877eb74bd8489b3367c71d72766dbfa4dfbfb662fa37',
    baseSymbol: 'eth',
    quoteSymbol: 'usdc',
    baseDecimal: 18,
    quoteDecimal: 6,
    tickSize: 0.0001,
  },
  {
    name: 'SOL/USDC',
    pair: '0x282895afbd8da7b26d15bff7a85a0d33aa03a08daa5bb90e38c6b92019e19c53',
    baseSymbol: 'sol',
    quoteSymbol: 'usdc',
    baseDecimal: 9,
    quoteDecimal: 6,
    tickSize: 0.0001,
  },
] as const;

export const MOCK_NETWORK_MARKETS: MarketPair[] = [
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
    quoteDecimals: 6,
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
    quoteDecimals: 6,
  },
  {
    kind: 'spot',
    label: 'ETH/USDC',
    pairId:
      '0x9068d4ac891a14784c17877eb74bd8489b3367c71d72766dbfa4dfbfb662fa37',
    priceDecimal: 4,
    orderDecimal: 3,
    baseDecimals: 18,
    baseSymbol: 'ETH',
    quoteSymbol: 'USDC',
    quoteDecimals: 6,
  },
  {
    kind: 'spot',
    label: 'SOL/USDC',
    pairId:
      '0x282895afbd8da7b26d15bff7a85a0d33aa03a08daa5bb90e38c6b92019e19c53',
    priceDecimal: 4,
    orderDecimal: 2,
    baseDecimals: 9,
    baseSymbol: 'SOL',
    quoteSymbol: 'USDC',
    quoteDecimals: 6,
  },
];

export function installMockMarketApi() {
  const originalFetch = globalThis.fetch;

  clearNetworkMarketsCache();
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/v2/market/perp/markets') {
        return new Response(
          JSON.stringify({
            code: 200,
            msg: 'success',
            data: MOCK_PERP_MARKETS,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.pathname === '/v2/market/spot/markets') {
        return new Response(
          JSON.stringify({
            code: 200,
            msg: 'success',
            data: MOCK_SPOT_MARKETS,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response(`Unhandled fetch in test: ${url.toString()}`, {
        status: 500,
      });
    },
    {
      preconnect: originalFetch.preconnect?.bind(originalFetch),
    },
  ) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
    clearNetworkMarketsCache();
  };
}
