import type { NetworkConfig } from '../config/networks';
import { logError, logNetworkRequest, logNetworkResponse } from './logger';

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
  quoteDecimals?: number;
  marketId?: number;
};

type ApiEnvelope<T> = {
  code: string | number;
  msg?: string;
  data: T;
};

type PerpMarketApi = {
  id: number;
  name: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseDecimal: number;
  quoteDecimal: number;
  orderSpecTickSize: string;
  orderSpecStepSize: string;
};

type SpotMarketApi = {
  name: string;
  pair: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseDecimal: number;
  quoteDecimal: number;
  tickSize: number | string;
};

const networkMarketsCache = new Map<string, Promise<MarketPair[]>>();

export async function getNetworkMarkets(
  network: NetworkConfig,
): Promise<MarketPair[]> {
  const cacheKey = network.id;
  const cached = networkMarketsCache.get(cacheKey);
  if (cached) {
    return await cached;
  }

  const pending = fetchNetworkMarkets(network).catch((error) => {
    networkMarketsCache.delete(cacheKey);
    throw error;
  });
  networkMarketsCache.set(cacheKey, pending);
  return await pending;
}

export function clearNetworkMarketsCache() {
  networkMarketsCache.clear();
}

export function getPairsByKind(
  pairs: MarketPair[],
  kind: PairKind,
): MarketPair[] {
  return pairs.filter((pair) => pair.kind === kind);
}

async function fetchNetworkMarkets(
  network: NetworkConfig,
): Promise<MarketPair[]> {
  const [perpResponse, spotResponse] = await Promise.all([
    fetchBackendJson<ApiEnvelope<PerpMarketApi[]>>(
      network,
      '/v2/market/perp/markets',
    ),
    fetchBackendJson<ApiEnvelope<SpotMarketApi[]>>(
      network,
      '/v2/market/spot/markets',
    ),
  ]);

  const perpPairs = (perpResponse.data ?? []).map((market) => ({
    kind: 'perp' as const,
    label: market.name,
    pairId: String(market.id),
    marketId: Number(market.id),
    priceDecimal: decimalsFromAtomicStep(
      market.orderSpecTickSize,
      market.quoteDecimal,
    ),
    orderDecimal: decimalsFromAtomicStep(
      market.orderSpecStepSize,
      market.baseDecimal,
    ),
    baseDecimals: Number(market.baseDecimal),
    baseSymbol: String(market.baseSymbol).toUpperCase(),
    quoteSymbol: String(market.quoteSymbol).toUpperCase(),
    quoteDecimals: Number(market.quoteDecimal),
  }));

  const spotPairs = (spotResponse.data ?? []).map((market) => ({
    kind: 'spot' as const,
    label: market.name,
    pairId: market.pair,
    priceDecimal: decimalsFromTickSize(market.tickSize),
    orderDecimal: inferSpotOrderDecimals(Number(market.baseDecimal)),
    baseDecimals: Number(market.baseDecimal),
    baseSymbol: String(market.baseSymbol).toUpperCase(),
    quoteSymbol: String(market.quoteSymbol).toUpperCase(),
    quoteDecimals: Number(market.quoteDecimal),
  }));

  return [...perpPairs, ...spotPairs];
}

async function fetchBackendJson<T>(
  network: NetworkConfig,
  path: string,
): Promise<T> {
  const url = new URL(path, network.apiBaseUrl);
  logNetworkRequest({
    scope: 'market-http',
    method: 'GET',
    url: url.toString(),
  });

  const response = await fetch(url, {
    headers: {
      'content-type': 'application/json',
      'accept-language': 'en-US',
    },
  });
  const responseBody = await response.text();
  logNetworkResponse({
    scope: 'market-http',
    method: 'GET',
    url: url.toString(),
    status: response.status,
    body: responseBody,
  });

  if (!response.ok) {
    logError(
      'market-http',
      'Request failed',
      `${url} status=${response.status}`,
    );
    throw new Error(`Request failed with status ${response.status}`);
  }

  return JSON.parse(responseBody) as T;
}

function decimalsFromAtomicStep(step: string, unitDecimals: number) {
  const normalized = step.trim();
  if (!/^\d+$/.test(normalized) || Number(unitDecimals) < 0) {
    return 0;
  }

  const trailingZeros = normalized.match(/0*$/)?.[0].length ?? 0;
  return Math.max(0, Number(unitDecimals) - trailingZeros);
}

function decimalsFromTickSize(value: number | string) {
  const normalized = String(value).trim();
  if (!normalized.includes('.')) {
    return 0;
  }

  return normalized.replace(/0+$/, '').split('.')[1]?.length ?? 0;
}

function inferSpotOrderDecimals(baseDecimals: number) {
  // The current spot markets endpoint does not expose a base step size, so use
  // a compact display precision derived from the asset precision.
  if (baseDecimals >= 18) {
    return 3;
  }

  if (baseDecimals >= 9) {
    return 2;
  }

  return Math.min(Math.max(baseDecimals, 0), 4);
}
