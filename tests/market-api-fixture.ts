import {
  clearNetworkMarketsCache,
  type MarketPair,
} from '../src/services/market-catalog';

const MOCK_PERP_MARKETS = [
  {
    id: 3,
    name: 'ETH-USDC',
    oraclePrice: '1930',
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
    oraclePrice: '152.5',
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
    price: '1926.25',
    baseSymbol: 'eth',
    quoteSymbol: 'usdc',
    baseDecimal: 18,
    quoteDecimal: 6,
    tickSize: 0.0001,
  },
  {
    name: 'SOL/USDC',
    pair: '0x282895afbd8da7b26d15bff7a85a0d33aa03a08daa5bb90e38c6b92019e19c53',
    price: '151.7500',
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

      if (url.pathname === '/v2/market/perp/candles') {
        return new Response(
          JSON.stringify({
            code: 200,
            msg: 'success',
            data: {
              details: [
                {
                  time: 1713312000000,
                  open: '1900',
                  high: '1925',
                  low: '1895',
                  close: '1925',
                  volume: '120',
                },
                {
                  time: 1713225600000,
                  open: '1900',
                  high: '1910',
                  low: '1890',
                  close: '1900',
                  volume: '100',
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.pathname === '/v2/market/spot/candles') {
        return new Response(
          JSON.stringify({
            code: 200,
            msg: 'success',
            data: {
              details: [
                {
                  time: 1713312000000,
                  open: '149.5',
                  high: '151.25',
                  low: '149.25',
                  close: '151.25',
                  volume: '1400',
                },
                {
                  time: 1713225600000,
                  open: '149.5',
                  high: '150.0',
                  low: '149.0',
                  close: '149.5',
                  volume: '1000',
                },
              ],
            },
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
