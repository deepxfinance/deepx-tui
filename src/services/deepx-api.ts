import type { NetworkConfig } from '../config/networks';
import { normalizeUnixTimestamp } from '../lib/time';
import { logError, logNetworkRequest, logNetworkResponse } from './logger';
import {
  getNetworkMarkets,
  type MarketPair,
  type PairKind,
} from './market-catalog';

export const DEFAULT_CANDLE_HISTORY_LIMIT = 150;

export type CandleBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketPriceInfo = {
  pair: string;
  kind: PairKind;
  latestPrice: string;
  last24hChange: string;
  last24hChangePercent: string;
  summary: string;
};

type ApiEnvelope<T> = {
  code: string;
  msg?: string;
  data: T;
};

type CandleDetail = {
  time: string | number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

type CandleResponse = {
  details: CandleDetail[];
};

type PerpMarketPriceApi = {
  id: number;
  name: string;
  oraclePrice?: string | number;
};

type SpotMarketPriceApi = {
  name: string;
  pair: string;
  price?: string | number;
};

export async function fetchCandles(input: {
  network: NetworkConfig;
  pair: MarketPair;
  timeFrame: string;
  limit?: number;
}): Promise<CandleBar[]> {
  const limit = input.limit ?? DEFAULT_CANDLE_HISTORY_LIMIT;
  const end = Date.now();
  const start = end - candleWindowDurationMs(input.timeFrame, limit);
  const searchParams = new URLSearchParams({
    start: String(start),
    end: String(end),
    timeFrame: input.timeFrame,
    tradeView: 'true',
  });

  if (input.pair.kind === 'perp') {
    searchParams.set(
      'marketId',
      String(input.pair.marketId ?? input.pair.pairId),
    );
  } else {
    searchParams.set('pair', input.pair.label);
  }

  const pathname =
    input.pair.kind === 'perp'
      ? '/v2/market/perp/candles'
      : '/v2/market/spot/candles';

  const response = await fetchJson<ApiEnvelope<CandleResponse>>(
    input.network,
    `${pathname}?${searchParams.toString()}`,
  );
  const details = response.data.details ?? [];
  const bars = details.map((bar) => ({
    time: normalizeUnixTimestamp(Number(bar.time)),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Number(bar.volume),
  }));

  return bars.reverse().slice(-limit);
}

export async function fetchMarketPriceInfo(input: {
  network: NetworkConfig;
  pair: string;
}): Promise<MarketPriceInfo> {
  const market = await findMarketPair(input.network, input.pair);
  const currentPrice = await fetchCurrentMarketPrice(input.network, market);
  const candles = await fetchCandles({
    network: input.network,
    pair: market,
    timeFrame: '1h',
    limit: 25,
  });

  const latestBar = candles.at(-1);
  const anchorBar = candles[0];
  if (!latestBar || !anchorBar) {
    throw new Error(
      `Price history is unavailable for ${market.label} on ${input.network.id}.`,
    );
  }

  const latestPrice = currentPrice ?? latestBar.close;
  const last24hChange = latestPrice - anchorBar.close;
  const last24hChangePercent =
    anchorBar.close === 0 ? 0 : (last24hChange / anchorBar.close) * 100;

  return {
    pair: market.label,
    kind: market.kind,
    latestPrice: latestPrice.toFixed(market.priceDecimal),
    last24hChange: `${last24hChange >= 0 ? '+' : ''}${last24hChange.toFixed(market.priceDecimal)}`,
    last24hChangePercent: `${last24hChangePercent >= 0 ? '+' : ''}${last24hChangePercent.toFixed(2)}%`,
    summary: [
      `${market.label} ${market.kind} market`,
      `latest price ${latestPrice.toFixed(market.priceDecimal)}`,
      `24h change ${last24hChange >= 0 ? '+' : ''}${last24hChange.toFixed(market.priceDecimal)} (${last24hChangePercent >= 0 ? '+' : ''}${last24hChangePercent.toFixed(2)}%)`,
    ].join(', '),
  };
}

export async function fetchJson<T>(
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

async function fetchCurrentMarketPrice(
  network: NetworkConfig,
  market: Awaited<ReturnType<typeof findMarketPair>>,
) {
  if (market.kind === 'perp') {
    const response = await fetchJson<ApiEnvelope<PerpMarketPriceApi[]>>(
      network,
      '/v2/market/perp/markets',
    );
    const entry = (response.data ?? []).find(
      (item) =>
        Number(item.id) === Number(market.marketId) ||
        item.name === market.label,
    );

    return parseFiniteNumber(entry?.oraclePrice);
  }

  const response = await fetchJson<ApiEnvelope<SpotMarketPriceApi[]>>(
    network,
    '/v2/market/spot/markets',
  );
  const entry = (response.data ?? []).find(
    (item) => item.pair === market.pairId || item.name === market.label,
  );

  return parseFiniteNumber(entry?.price);
}

export function resolutionToTimeFrame(resolution: string): string {
  switch (resolution) {
    case '1':
      return '1m';
    case '5':
      return '5m';
    case '15':
      return '15m';
    case '30':
      return '30m';
    case '60':
      return '1h';
    case '240':
      return '4h';
    case '1D':
      return '1d';
    case '1W':
      return '1w';
    case '1M':
      return '1M';
    default:
      return '5m';
  }
}

export function candleWindowDurationMs(
  timeFrame: string,
  limit: number,
): number {
  const interval = timeFrameToMilliseconds(timeFrame);
  const bufferedLimit = Math.max(limit + 4, 1);
  return interval * bufferedLimit;
}

function timeFrameToMilliseconds(timeFrame: string): number {
  switch (timeFrame) {
    case '1m':
      return 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '1h':
      return 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '1d':
      return 24 * 60 * 60_000;
    case '1w':
      return 7 * 24 * 60 * 60_000;
    case '1M':
      return 30 * 24 * 60 * 60_000;
    default:
      return 5 * 60_000;
  }
}

async function findMarketPair(network: NetworkConfig, requestedPair: string) {
  const normalized = requestedPair.trim().toUpperCase();
  const pair = (await getNetworkMarkets(network)).find(
    (item) => item.label.toUpperCase() === normalized,
  );

  if (!pair) {
    throw new Error(
      `Unsupported pair "${requestedPair}" for ${network.id}. Use deepx_list_markets first.`,
    );
  }

  return pair;
}

function parseFiniteNumber(value: string | number | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}
