import { formatUnits, parseUnits } from 'ethers';
import { useEffect, useMemo, useState } from 'react';

import type { NetworkConfig } from '../config/networks';
import { padRight } from '../lib/format';
import { logSocketEvent } from './logger';
import type { MarketPair } from './market-catalog';

const POSITIONS_WS_HEARTBEAT_MS = 30_000;
const DEFAULT_SNAPSHOT_TIMEOUT_MS = 2_000;
const WEBSOCKET_OPEN_STATE = 1;

type AddressScope = 'subaccount' | 'wallet';

type WebSocketLike = {
  readyState: number;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(
    type: 'message',
    listener: (event: { data?: unknown }) => void,
  ): void;
  addEventListener(type: 'close' | 'error', listener: () => void): void;
  send(payload: string): void;
  close(): void;
};

export type PerpPosition = {
  marketId: number;
  isLong: boolean;
  baseAssetAmount: bigint;
  entryPrice: bigint;
  leverage: number;
  lastFundingRate: bigint;
  isolatedMargin: bigint;
  version: bigint;
  unrealizedPnl: bigint;
  realizedPnl: bigint;
  fundingPayment: bigint;
  owner: string;
  takeProfit: bigint;
  stopLoss: bigint;
  liquidatePrice: bigint;
};

type WsMessage = {
  channel?: string;
  market?: { id?: number | string };
  data?: {
    address?: string;
    positions?: {
      items?: unknown[];
    };
  };
};

type PositionPanelRow = {
  key: string;
  text: string;
  tone: 'green' | 'red' | 'white' | 'gray';
} & (
  | {
      variant: 'message';
    }
  | {
      variant: 'position';
      marketLabel: string;
      sideLabel: string;
      sizeLabel: string;
      entryLabel: string;
      pnlLabel: string;
      sideTone: 'green' | 'red';
      pnlTone: 'green' | 'red' | 'white';
    }
);

export function useUserPerpPositions(input: {
  network: NetworkConfig;
  walletAddress: string;
  perpPairs: MarketPair[];
}) {
  const [positions, setPositions] = useState<PerpPosition[]>([]);
  const walletAddress = input.walletAddress.toLowerCase();
  const enabledPairs = useMemo(
    () => getEnabledPerpPairs(input.perpPairs),
    [input.perpPairs],
  );

  useEffect(() => {
    if (!walletAddress || enabledPairs.length === 0) {
      setPositions([]);
      return;
    }

    const websocket = createBrowserWebSocket(input.network.marketWsUrl);
    const heartbeat = setInterval(() => {
      if (websocket.readyState !== WEBSOCKET_OPEN_STATE) {
        return;
      }

      const payload = JSON.stringify({ action: 'ping' });
      logSocketEvent({
        scope: 'positions-ws',
        url: input.network.marketWsUrl,
        event: 'send',
        payload,
      });
      websocket.send(payload);
    }, POSITIONS_WS_HEARTBEAT_MS);

    websocket.addEventListener('open', () => {
      const payload = buildPositionsSubscriptionPayload(
        input.walletAddress,
        enabledPairs,
      );
      logSocketEvent({
        scope: 'positions-ws',
        url: input.network.marketWsUrl,
        event: 'open',
        payload,
      });
      websocket.send(payload);
    });

    websocket.addEventListener('message', (event) => {
      const payload = String(event.data);
      logSocketEvent({
        scope: 'positions-ws',
        url: input.network.marketWsUrl,
        event: 'message',
        payload,
      });
      const update = parseUserPerpPositionsMessage(
        payload,
        input.walletAddress,
        enabledPairs,
        { addressScope: 'wallet' },
      );
      if (!update) {
        return;
      }

      setPositions((current) =>
        mergePerpPositions(
          current,
          update.positions,
          update.owner,
          update.marketId,
        ),
      );
    });

    websocket.addEventListener('close', () => {
      logSocketEvent({
        scope: 'positions-ws',
        url: input.network.marketWsUrl,
        event: 'close',
      });
    });

    websocket.addEventListener('error', () => {
      logSocketEvent({
        scope: 'positions-ws',
        url: input.network.marketWsUrl,
        event: 'error',
      });
    });

    return () => {
      clearInterval(heartbeat);
      websocket.close();
    };
  }, [
    enabledPairs,
    input.network.marketWsUrl,
    input.walletAddress,
    walletAddress,
  ]);

  return positions;
}

export async function fetchUserPerpPositionsSnapshot(input: {
  network: NetworkConfig;
  walletAddress: string;
  perpPairs: MarketPair[];
  timeoutMs?: number;
  createWebSocket?: (url: string) => WebSocketLike;
}): Promise<PerpPosition[]> {
  const walletAddress = input.walletAddress.trim().toLowerCase();
  const enabledPairs = getEnabledPerpPairs(input.perpPairs);
  if (!walletAddress || enabledPairs.length === 0) {
    return [];
  }

  const expectedMarketIds = new Set(
    enabledPairs.map((pair) => pair.marketId ?? Number(pair.pairId)),
  );
  const createWebSocket = input.createWebSocket ?? createBrowserWebSocket;

  return await new Promise<PerpPosition[]>((resolve) => {
    let positions: PerpPosition[] = [];
    const receivedMarketIds = new Set<number>();
    let settled = false;
    const websocket = createWebSocket(input.network.marketWsUrl);

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearInterval(heartbeat);
      clearTimeout(timeoutHandle);
      try {
        websocket.close();
      } catch {
        // Ignore close failures from mocked sockets.
      }
      resolve(positions);
    };

    const heartbeat = setInterval(() => {
      if (websocket.readyState !== WEBSOCKET_OPEN_STATE) {
        return;
      }

      const payload = JSON.stringify({ action: 'ping' });
      logSocketEvent({
        scope: 'positions-ws',
        url: input.network.marketWsUrl,
        event: 'send',
        payload,
      });
      websocket.send(payload);
    }, POSITIONS_WS_HEARTBEAT_MS);

    const timeoutHandle = setTimeout(
      finish,
      input.timeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS,
    );

    websocket.addEventListener('open', () => {
      const payload = buildPositionsSubscriptionPayload(
        input.walletAddress,
        enabledPairs,
      );
      logSocketEvent({
        scope: 'positions-ws',
        url: input.network.marketWsUrl,
        event: 'open',
        payload,
      });
      websocket.send(payload);
    });

    websocket.addEventListener('message', (event) => {
      const payload = String(event.data);
      logSocketEvent({
        scope: 'positions-ws',
        url: input.network.marketWsUrl,
        event: 'message',
        payload,
      });
      const update = parseUserPerpPositionsMessage(
        payload,
        input.walletAddress,
        enabledPairs,
        { addressScope: 'wallet' },
      );
      if (!update) {
        return;
      }

      positions = mergePerpPositions(
        positions,
        update.positions,
        update.owner,
        update.marketId,
      );

      if (update.marketId != null) {
        receivedMarketIds.add(update.marketId);
        if (receivedMarketIds.size >= expectedMarketIds.size) {
          finish();
        }
      }
    });

    websocket.addEventListener('close', () => {
      logSocketEvent({
        scope: 'positions-ws',
        url: input.network.marketWsUrl,
        event: 'close',
      });
      finish();
    });

    websocket.addEventListener('error', () => {
      logSocketEvent({
        scope: 'positions-ws',
        url: input.network.marketWsUrl,
        event: 'error',
      });
      finish();
    });
  });
}

export function parseUserPerpPositionsMessage(
  rawMessage: string,
  subscribedAddress: string,
  perpPairs: MarketPair[],
  options: {
    addressScope?: AddressScope;
  } = {},
): {
  owner: string;
  marketId?: number;
  positions: PerpPosition[];
} | null {
  let message: WsMessage;
  try {
    message = JSON.parse(rawMessage) as WsMessage;
  } catch {
    return null;
  }

  if (message.channel !== 'user_perp_positions' || !message.data) {
    return null;
  }

  const owner = message.data.address?.toLowerCase();
  const normalizedSubscribedAddress = subscribedAddress.toLowerCase();
  const allowWalletScopeAddressMismatch = options.addressScope === 'wallet';
  if (
    !owner ||
    (owner !== normalizedSubscribedAddress && !allowWalletScopeAddressMismatch)
  ) {
    return null;
  }

  const enabledMarketIds = new Set(
    getEnabledPerpPairs(perpPairs).map(
      (pair) => pair.marketId ?? Number(pair.pairId),
    ),
  );
  const items = Array.isArray(message.data.positions?.items)
    ? message.data.positions.items
    : [];
  const positions = items
    .filter((entry) => isEnabledRawPosition(entry, enabledMarketIds))
    .map((entry) => mapRawPosition(entry, perpPairs));

  return {
    owner,
    marketId:
      message.market?.id == null ? undefined : Number(message.market.id),
    positions,
  };
}

export function mergePerpPositions(
  existing: PerpPosition[],
  incoming: PerpPosition[],
  owner: string,
  marketId?: number,
) {
  const normalizedOwner = owner.toLowerCase();
  if (marketId != null) {
    const next = existing.filter(
      (position) =>
        !(
          position.marketId === Number(marketId) &&
          position.owner.toLowerCase() === normalizedOwner
        ),
    );
    return [...next, ...incoming];
  }

  if (incoming.length === 0) {
    return existing.filter(
      (position) => position.owner.toLowerCase() !== normalizedOwner,
    );
  }

  let next = [...existing];
  const incomingMarketIds = new Set(
    incoming.map((position) => position.marketId),
  );
  for (const nextMarketId of incomingMarketIds) {
    next = next.filter(
      (position) =>
        !(
          position.marketId === nextMarketId &&
          position.owner.toLowerCase() === normalizedOwner
        ),
    );
  }

  return [...next, ...incoming];
}

export function buildPositionPanelRows(input: {
  positions: PerpPosition[];
  pairs: MarketPair[];
  overview: Record<string, { latestPrice?: number }>;
  maxRows: number;
}): PositionPanelRow[] {
  if (input.positions.length === 0) {
    return [
      {
        key: 'empty',
        text: 'No open perp positions.',
        tone: 'gray',
        variant: 'message',
      },
    ];
  }

  const rows = input.positions
    .slice()
    .sort((left, right) => left.marketId - right.marketId)
    .slice(0, input.maxRows);

  return rows.map((position) => {
    const pair = input.pairs.find(
      (entry) => (entry.marketId ?? Number(entry.pairId)) === position.marketId,
    );
    const pairLabel = pair?.label ?? `#${position.marketId}`;
    const sideLabel = `${position.isLong ? 'LONG' : 'SHRT'}${clampLeverage(
      position.leverage,
    )}`;
    const sizeLabel = formatAssetAmount(
      position.baseAssetAmount,
      pair?.baseDecimals ?? 18,
      pair?.orderDecimal ?? 3,
    );
    const entryLabel = formatMoney(
      position.entryPrice,
      6,
      pair?.priceDecimal ?? 2,
    );
    const pnlValue = resolvePositionPnl(
      position,
      pair,
      input.overview[pairLabel]?.latestPrice,
    );
    const pnlLabel = formatSignedMoney(pnlValue, 6, 2);
    const sideTone = position.isLong ? 'green' : 'red';
    const pnlTone = pnlValue > 0n ? 'green' : pnlValue < 0n ? 'red' : 'white';

    return {
      key: `${position.owner}-${position.marketId}`,
      text: `${padRight(pairLabel, 8)} ${padRight(sideLabel, 7)} ${padRight(
        sizeLabel,
        7,
      )} ${padRight(entryLabel, 8)} ${pnlLabel}`,
      tone: pnlTone,
      variant: 'position',
      marketLabel: padRight(pairLabel, 8),
      sideLabel: padRight(sideLabel, 7),
      sizeLabel: padRight(sizeLabel, 7),
      entryLabel: padRight(entryLabel, 8),
      pnlLabel,
      sideTone,
      pnlTone,
    };
  });
}

export function getPositionPanelHeader() {
  return `${padRight('MARKET', 8)} ${padRight('SIDE', 7)} ${padRight(
    'SIZE',
    7,
  )} ${padRight('ENTRY', 8)} PNL`;
}

function getEnabledPerpPairs(perpPairs: MarketPair[]) {
  return perpPairs.filter((pair) => pair.kind === 'perp');
}

function buildPositionsSubscriptionPayload(
  walletAddress: string,
  enabledPairs: MarketPair[],
) {
  return JSON.stringify({
    action: 'multi_subscribe',
    markets: enabledPairs.map((pair) => ({
      type: 'perp',
      id: pair.marketId ?? Number(pair.pairId),
    })),
    subscriptions: [
      {
        channel: 'user_perp_positions',
        address: walletAddress,
        addressType: 'wallet',
        status: 'open',
      },
    ],
    options: {
      compress: false,
    },
  });
}

function createBrowserWebSocket(url: string) {
  return new WebSocket(url) as unknown as WebSocketLike;
}

function mapRawPosition(raw: unknown, perpPairs: MarketPair[]): PerpPosition {
  const entry = raw as Record<string, unknown>;
  const marketId = Number(entry.market_id ?? entry.marketId ?? 0);
  const pair = perpPairs.find(
    (candidate) =>
      (candidate.marketId ?? Number(candidate.pairId)) === marketId,
  );
  const baseDecimals = pair?.baseDecimals ?? 18;

  return {
    marketId,
    isLong: Boolean(entry.is_long ?? entry.isLong),
    baseAssetAmount: parseUnitValue(
      entry.base_asset_amount ?? entry.baseAssetAmount,
      baseDecimals,
    ),
    entryPrice: parseUnitValue(entry.entry_price ?? entry.entryPrice, 6),
    leverage: Number(entry.leverage ?? 0),
    lastFundingRate: parseUnitValue(
      entry.last_funding_rate ?? entry.lastFundingRate,
      18,
    ),
    isolatedMargin: parseUnitValue(
      entry.isolated_margin ?? entry.isolatedMargin,
      6,
    ),
    version: BigInt(Number(entry.version ?? 0)),
    unrealizedPnl: parseUnitValue(entry.unrealized_pnl ?? entry.pnl ?? 0, 6),
    realizedPnl: parseUnitValue(
      entry.realized_pnl ?? entry.realizedPnl ?? 0,
      6,
    ),
    fundingPayment: parseUnitValue(
      entry.funding_payment ?? entry.fundingPayment ?? 0,
      6,
    ),
    owner: String(entry.owner ?? ''),
    takeProfit: parseUnitValue(entry.take_profit ?? entry.takeProfit ?? 0, 6),
    stopLoss: parseUnitValue(entry.stop_loss ?? entry.stopLoss ?? 0, 6),
    liquidatePrice: parseUnitValue(
      entry.liquidate_price ?? entry.liquidatePrice ?? 0,
      6,
    ),
  };
}

function isEnabledRawPosition(raw: unknown, enabledMarketIds: Set<number>) {
  const entry = raw as Record<string, unknown>;
  const marketId = Number(entry.market_id ?? entry.marketId);
  if (!enabledMarketIds.has(marketId)) {
    return false;
  }

  return Number(entry.base_asset_amount ?? entry.baseAssetAmount ?? 0) !== 0;
}

function parseUnitValue(value: unknown, decimals: number): bigint {
  const normalized = normalizeDecimal(value, decimals);
  if (!normalized) {
    return 0n;
  }

  return parseUnits(normalized, decimals);
}

function normalizeDecimal(value: unknown, decimals: number) {
  if (value == null) {
    return '0';
  }

  const normalized = String(value).replaceAll(',', '').trim();
  if (!normalized) {
    return '0';
  }

  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    const [whole, fraction = ''] = normalized.split('.');
    const trimmedFraction = fraction.slice(0, decimals);
    return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  }

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) {
    return '0';
  }

  return numericValue.toFixed(Math.min(decimals, 6));
}

function resolvePositionPnl(
  position: PerpPosition,
  pair: MarketPair | undefined,
  latestPrice?: number,
) {
  if (!pair || latestPrice == null || !Number.isFinite(latestPrice)) {
    return position.unrealizedPnl;
  }

  const markPrice = priceToSixDecimals(latestPrice);
  let pnl = (markPrice - position.entryPrice) * position.baseAssetAmount;
  if (!position.isLong) {
    pnl = -pnl;
  }

  return pnl / 10n ** BigInt(pair.baseDecimals);
}

function priceToSixDecimals(value: number) {
  return BigInt(Math.round(value * 1_000_000));
}

function formatAssetAmount(value: bigint, decimals: number, digits: number) {
  return trimDecimal(formatUnits(value, decimals), digits);
}

function formatMoney(value: bigint, decimals: number, digits: number) {
  return trimDecimal(formatUnits(value, decimals), digits);
}

function formatSignedMoney(value: bigint, decimals: number, digits: number) {
  const sign = value > 0n ? '+' : value < 0n ? '-' : '';
  const absoluteValue = value < 0n ? -value : value;
  return `${sign}${formatMoney(absoluteValue, decimals, digits)}`;
}

function trimDecimal(value: string, digits: number) {
  const [whole, fraction = ''] = value.split('.');
  const trimmedFraction = fraction.slice(0, digits).replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function clampLeverage(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  return `${Math.min(value, 99)}x`;
}
