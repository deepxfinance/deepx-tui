import { useEffect, useMemo, useState } from 'react';

import type { NetworkConfig } from '../config/networks';
import {
  alignTimestampToResolution,
  normalizeUnixTimestamp,
} from '../lib/time';
import {
  type CandleBar,
  fetchCandles,
  resolutionToTimeFrame,
} from './deepx-api';
import { logError, logSocketEvent } from './logger';
import {
  getMarketPairs,
  getPairsByKind,
  type MarketPair,
  type PairKind,
} from './market-catalog';

type OverviewEntry = {
  latestPrice?: number;
  priceChange24h?: number;
  priceChange1h?: number;
  volume24h?: number;
  fundingRate?: number;
  openInterest?: string;
};

type OrderBookLevel = {
  price: string;
  qty: string;
  value: string;
};

type OrderBookState = {
  latestPrice: string;
  orderBuyList: OrderBookLevel[];
  orderSellList: OrderBookLevel[];
};

type TradeItem = {
  id?: string;
  price: string | number;
  qty?: string | number;
  filledQty?: string | number;
  amount?: string | number;
  size?: string | number;
  filledDirection?: string;
  isLong?: boolean;
  createdAt?: string;
  time?: string | number;
};

type UseMarketDataState = {
  pairGroups: Record<PairKind, MarketPair[]>;
  activePair: MarketPair;
  overview: Record<string, OverviewEntry>;
  candles: CandleBar[];
  orderbook: OrderBookState | null;
  trades: TradeItem[];
  isOverviewConnected: boolean;
  isOrderbookConnected: boolean;
  candleStreamStatus: 'live' | 'reconnecting' | 'stale';
  candleError?: string;
  orderbookError?: string;
  websocketDelayMs?: number;
};

export function useMarketData(input: {
  network: NetworkConfig;
  pairKind: PairKind;
  pairIndex: number;
  resolution: string;
}): UseMarketDataState {
  const allPairs = useMemo(
    () => getMarketPairs(input.network),
    [input.network],
  );
  const pairGroups = useMemo(
    () => ({
      perp: getPairsByKind(allPairs, 'perp'),
      spot: getPairsByKind(allPairs, 'spot'),
    }),
    [allPairs],
  );
  const activePair = getActivePair(pairGroups, input.pairKind, input.pairIndex);
  const [overview, setOverview] = useState<Record<string, OverviewEntry>>({});
  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [orderbook, setOrderbook] = useState<OrderBookState | null>(null);
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [isOverviewConnected, setIsOverviewConnected] = useState(false);
  const [isOrderbookConnected, setIsOrderbookConnected] = useState(false);
  const [isCandleStreamConnected, setIsCandleStreamConnected] = useState(false);
  const [lastCandleUpdateAt, setLastCandleUpdateAt] = useState<number | null>(
    null,
  );
  const [candleError, setCandleError] = useState<string>();
  const [orderbookError, setOrderbookError] = useState<string>();
  const [overviewWebSocketDelayMs, setOverviewWebSocketDelayMs] = useState<
    number | undefined
  >();
  const [orderbookWebSocketDelayMs, setOrderbookWebSocketDelayMs] = useState<
    number | undefined
  >();

  useEffect(() => {
    const websocket = new WebSocket(input.network.marketWsUrl);
    let pendingPingAt: number | null = null;
    const subscribedPairs = allPairs.map((pair) => ({
      type: pair.kind,
      name: pair.label,
    }));
    const sendPing = () => {
      if (websocket.readyState !== websocket.OPEN) {
        return;
      }

      pendingPingAt = Date.now();
      const payload = JSON.stringify({ action: 'ping' });
      logSocketEvent({
        scope: 'overview-ws',
        url: input.network.marketWsUrl,
        event: 'send',
        payload,
      });
      websocket.send(payload);
    };

    websocket.addEventListener('open', () => {
      setIsOverviewConnected(true);
      const payload = JSON.stringify({
        action: 'multi_subscribe',
        markets: subscribedPairs,
        subscriptions: [
          'latest_price',
          'price_change_1h',
          'price_change_24h',
          'funding_rate',
          'open_interest',
          'volume_stats',
        ],
      });
      logSocketEvent({
        scope: 'overview-ws',
        url: input.network.marketWsUrl,
        event: 'open',
        payload,
      });
      websocket.send(payload);
      sendPing();
    });

    websocket.addEventListener('message', (event) => {
      logSocketEvent({
        scope: 'overview-ws',
        url: input.network.marketWsUrl,
        event: 'message',
        payload: String(event.data),
      });
      const result = JSON.parse(String(event.data)) as {
        action?: string;
        type?: string;
        market?: { name?: string };
        channel?: string;
        message?: string;
        data?: unknown;
      };

      if (isWebSocketPongMessage(result) && pendingPingAt != null) {
        setOverviewWebSocketDelayMs(Date.now() - pendingPingAt);
        pendingPingAt = null;
        return;
      }

      const marketName = result.market?.name;
      if (result.type !== 'data' || !marketName) {
        return;
      }

      setOverview((current) => {
        const next = { ...current };
        const entry = { ...(next[marketName] ?? {}) };

        switch (result.channel) {
          case 'latest_price':
            entry.latestPrice = Number(result.data);
            break;
          case 'price_change_1h':
            entry.priceChange1h = Number(result.data);
            break;
          case 'price_change_24h':
            entry.priceChange24h = Number(result.data);
            break;
          case 'funding_rate':
            entry.fundingRate = Number(result.data);
            break;
          case 'open_interest':
            entry.openInterest = String(result.data);
            break;
          case 'volume_stats':
            entry.volume24h = Number(
              (result.data as { volume_24h?: { totalVolume?: number } })
                ?.volume_24h?.totalVolume ?? 0,
            );
            break;
        }

        next[marketName] = entry;
        return next;
      });
    });

    websocket.addEventListener('close', () => {
      logSocketEvent({
        scope: 'overview-ws',
        url: input.network.marketWsUrl,
        event: 'close',
      });
      setIsOverviewConnected(false);
      setOverviewWebSocketDelayMs(undefined);
      pendingPingAt = null;
    });

    websocket.addEventListener('error', () => {
      logSocketEvent({
        scope: 'overview-ws',
        url: input.network.marketWsUrl,
        event: 'error',
      });
      setIsOverviewConnected(false);
      setOverviewWebSocketDelayMs(undefined);
      pendingPingAt = null;
    });

    const heartbeat = setInterval(sendPing, 15000);

    return () => {
      clearInterval(heartbeat);
      websocket.close();
    };
  }, [allPairs, input.network.marketWsUrl]);

  useEffect(() => {
    let isCancelled = false;

    async function loadCandles() {
      try {
        setCandleError(undefined);
        const nextBars = await fetchCandles({
          network: input.network,
          pair: activePair,
          timeFrame: resolutionToTimeFrame(input.resolution),
          limit: 28,
        });
        if (!isCancelled) {
          setCandles(nextBars);
        }
      } catch (error) {
        if (!isCancelled) {
          logError('candles', 'Initial candle load failed', String(error));
          setCandleError((error as Error).message);
        }
      }
    }

    void loadCandles();

    return () => {
      isCancelled = true;
    };
  }, [activePair, input.network, input.resolution]);

  useEffect(() => {
    setOrderbook(null);
    setTrades([]);
    setOrderbookError(undefined);
    setIsCandleStreamConnected(false);
    setLastCandleUpdateAt(null);

    const websocket = new WebSocket(input.network.marketWsUrl);
    let pendingPingAt: number | null = null;
    const sendPing = () => {
      if (websocket.readyState !== websocket.OPEN) {
        return;
      }

      pendingPingAt = Date.now();
      const payload = JSON.stringify({ action: 'ping' });
      logSocketEvent({
        scope: 'market-ws',
        url: input.network.marketWsUrl,
        event: 'send',
        payload,
      });
      websocket.send(payload);
    };

    websocket.addEventListener('open', () => {
      setIsOrderbookConnected(true);
      setIsCandleStreamConnected(true);
      const payload = JSON.stringify({
        action: 'subscribe',
        market: {
          type: activePair.kind,
          name: activePair.label,
        },
        subscriptions: [
          { time_frame: resolutionToTimeFrame(input.resolution) },
          'orderbook',
          'trades',
          'latest_price',
          'price_change_24h',
          'volume_stats',
        ],
        options: {
          compress: false,
          orderbook_depth: 20,
          orderbook_price_size: 0.01,
        },
      });
      logSocketEvent({
        scope: 'market-ws',
        url: input.network.marketWsUrl,
        event: 'open',
        payload,
      });
      websocket.send(payload);
      sendPing();
    });

    websocket.addEventListener('message', (event) => {
      logSocketEvent({
        scope: 'market-ws',
        url: input.network.marketWsUrl,
        event: 'message',
        payload: String(event.data),
      });
      const result = JSON.parse(String(event.data)) as {
        action?: string;
        type?: string;
        channel?: string;
        market?: { name?: string };
        interval?: string;
        message?: string;
        data?: unknown;
      };

      if (isWebSocketPongMessage(result) && pendingPingAt != null) {
        setOrderbookWebSocketDelayMs(Date.now() - pendingPingAt);
        pendingPingAt = null;
        return;
      }

      if (result.type === 'error') {
        setOrderbookError(result.message ?? 'Orderbook stream error');
        return;
      }

      if (result.type === 'data' && result.channel === 'orderbook') {
        setOrderbook(result.data as OrderBookState);
        return;
      }

      if (result.type === 'data' && result.channel === 'trades') {
        const rawTrades =
          (result.data as { items?: TradeItem[] } | TradeItem[]) ?? [];
        const tradeItems = Array.isArray(rawTrades)
          ? rawTrades
          : (rawTrades.items ?? []);
        setTrades((current) => mergeTrades(current, tradeItems));
        return;
      }

      if (
        result.type === 'data' &&
        typeof result.channel === 'string' &&
        result.channel.startsWith('candles')
      ) {
        const candleBars = normalizeStreamCandles(result.data);
        if (candleBars.length > 0) {
          setLastCandleUpdateAt(Date.now());
          setCandles((current) => candleBars.reduce(mergeCandles, current));
        }
      }
    });

    websocket.addEventListener('close', () => {
      logSocketEvent({
        scope: 'market-ws',
        url: input.network.marketWsUrl,
        event: 'close',
      });
      setIsOrderbookConnected(false);
      setIsCandleStreamConnected(false);
      setOrderbookWebSocketDelayMs(undefined);
      pendingPingAt = null;
    });

    websocket.addEventListener('error', () => {
      logSocketEvent({
        scope: 'market-ws',
        url: input.network.marketWsUrl,
        event: 'error',
      });
      setIsOrderbookConnected(false);
      setIsCandleStreamConnected(false);
      setOrderbookError('Orderbook stream unavailable');
      setOrderbookWebSocketDelayMs(undefined);
      pendingPingAt = null;
    });

    const heartbeat = setInterval(sendPing, 15000);

    return () => {
      clearInterval(heartbeat);
      websocket.close();
    };
  }, [activePair, input.network.marketWsUrl, input.resolution]);

  useEffect(() => {
    const latestPrice = overview[activePair.label]?.latestPrice;
    if (!Number.isFinite(latestPrice)) {
      return;
    }

    setCandles((current) =>
      mergeLivePriceIntoCandles(
        current,
        latestPrice as number,
        input.resolution,
      ),
    );
  }, [activePair.label, input.resolution, overview]);

  return {
    pairGroups,
    activePair,
    overview,
    candles,
    orderbook,
    trades,
    isOverviewConnected,
    isOrderbookConnected,
    candleStreamStatus: getCandleStreamStatus(
      isCandleStreamConnected,
      lastCandleUpdateAt,
    ),
    candleError,
    orderbookError,
    websocketDelayMs:
      orderbookWebSocketDelayMs ?? overviewWebSocketDelayMs ?? undefined,
  };
}

export function isWebSocketPongMessage(input: {
  action?: string;
  type?: string;
  channel?: string;
  message?: string;
}): boolean {
  return [input.action, input.type, input.channel, input.message].some(
    (value) => value?.toLowerCase() === 'pong',
  );
}

function getActivePair(
  pairGroups: Record<PairKind, MarketPair[]>,
  pairKind: PairKind,
  pairIndex: number,
): MarketPair {
  const pair = pairGroups[pairKind][pairIndex] ?? pairGroups[pairKind][0];
  if (!pair) {
    throw new Error(`No pairs configured for ${pairKind}`);
  }

  return pair;
}

function mergeTrades(current: TradeItem[], incoming: TradeItem[]): TradeItem[] {
  const nextTrades = incoming.map((trade) => ({
    ...trade,
    isLong:
      trade.isLong ??
      (trade.filledDirection === 'Long' || trade.filledDirection === 'BUY'),
  }));
  const existingIds = new Set(
    current
      .map(
        (trade) =>
          trade.id ??
          `${trade.price}-${resolveTradeSize(trade)}-${trade.time ?? trade.createdAt ?? ''}`,
      )
      .filter(Boolean),
  );
  const uniqueIncoming = nextTrades.filter((trade) => {
    const tradeId =
      trade.id ??
      `${trade.price}-${resolveTradeSize(trade)}-${trade.time ?? trade.createdAt ?? ''}`;
    return !existingIds.has(tradeId);
  });

  return [...uniqueIncoming, ...current].slice(0, 20);
}

function resolveTradeSize(trade: TradeItem): string | number {
  return trade.qty ?? trade.filledQty ?? trade.amount ?? trade.size ?? '';
}

function normalizeStreamCandles(data: unknown): CandleBar[] {
  type StreamCandleBar = {
    time: string | number;
    open: string | number;
    high: string | number;
    low: string | number;
    close: string | number;
    volume: string | number;
  };

  const payload = data as
    | { details?: StreamCandleBar[] }
    | StreamCandleBar
    | StreamCandleBar[];

  if (Array.isArray(payload)) {
    return payload.map(toCandleBar).filter(isCandleBar);
  }

  if ('details' in payload) {
    return (payload.details ?? []).map(toCandleBar).filter(isCandleBar);
  }

  if (hasCandleFields(payload)) {
    return isCandleBar(toCandleBar(payload)) ? [toCandleBar(payload)] : [];
  }

  return [];
}

function mergeCandles(current: CandleBar[], incoming: CandleBar): CandleBar[] {
  if (!Number.isFinite(incoming.time)) {
    return current;
  }

  const next = [...current];
  const existingIndex = next.findIndex((bar) => bar.time === incoming.time);
  if (existingIndex >= 0) {
    next[existingIndex] = incoming;
    return next;
  }

  next.push(incoming);
  next.sort((left, right) => left.time - right.time);
  return next.slice(-28);
}

function mergeLivePriceIntoCandles(
  current: CandleBar[],
  latestPrice: number,
  resolution: string,
): CandleBar[] {
  if (current.length === 0 || !Number.isFinite(latestPrice)) {
    return current;
  }

  const bucketTime = alignTimestampToResolution(Date.now(), resolution);
  const lastBar = current[current.length - 1];
  if (!lastBar) {
    return current;
  }

  if (lastBar.time >= bucketTime) {
    const next = [...current];
    next[next.length - 1] = {
      ...lastBar,
      close: latestPrice,
      high: Math.max(lastBar.high, latestPrice),
      low: Math.min(lastBar.low, latestPrice),
    };
    return next;
  }

  return mergeCandles(current, {
    time: bucketTime,
    open: lastBar.close,
    high: Math.max(lastBar.close, latestPrice),
    low: Math.min(lastBar.close, latestPrice),
    close: latestPrice,
    volume: 0,
  });
}

function toCandleBar(bar: {
  time: string | number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
}): CandleBar {
  return {
    time: normalizeUnixTimestamp(Number(bar.time)),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Number(bar.volume),
  };
}

function hasCandleFields(value: unknown): value is {
  time: string | number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (
    'time' in value &&
    'open' in value &&
    'high' in value &&
    'low' in value &&
    'close' in value &&
    'volume' in value
  );
}

function isCandleBar(bar: CandleBar): boolean {
  return (
    Number.isFinite(bar.time) &&
    Number.isFinite(bar.open) &&
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    Number.isFinite(bar.close) &&
    Number.isFinite(bar.volume)
  );
}

function getCandleStreamStatus(
  isConnected: boolean,
  lastUpdateAt: number | null,
): 'live' | 'reconnecting' | 'stale' {
  if (!isConnected || lastUpdateAt === null) {
    return 'reconnecting';
  }

  if (Date.now() - lastUpdateAt > 90_000) {
    return 'stale';
  }

  return 'live';
}
