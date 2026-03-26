import type { NetworkConfig } from '../config/networks';
import { normalizeUnixTimestamp } from '../lib/time';
import { logError, logNetworkRequest, logNetworkResponse } from './logger';
import type { MarketPair } from './market-catalog';

export type CandleBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

export async function fetchCandles(input: {
  network: NetworkConfig;
  pair: MarketPair;
  timeFrame: string;
  limit?: number;
}): Promise<CandleBar[]> {
  const end = Date.now();
  const start = end - 24 * 60 * 60 * 1000;
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

  return bars.reverse().slice(-(input.limit ?? 28));
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
