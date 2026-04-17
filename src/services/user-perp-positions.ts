import { Contract, formatUnits, parseUnits } from 'ethers';
import { useEffect, useMemo, useState } from 'react';

import type { NetworkConfig } from '../config/networks';
import { padRight } from '../lib/format';
import type { MarketPair } from './market-catalog';
import type { MarketWsSession } from './market-ws-session';
import { createRpcProvider } from './transaction-submission';

const PERP_CONTRACT_ADDRESS = '0x000000000000000000000000000000000000044E';
const PERP_POSITION_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      {
        internalType: 'uint16[]',
        name: 'market_id',
        type: 'uint16[]',
      },
    ],
    name: 'userPerpPositions',
    outputs: [
      {
        components: [
          { internalType: 'uint16', name: 'market_id', type: 'uint16' },
          { internalType: 'bool', name: 'is_long', type: 'bool' },
          {
            internalType: 'uint128',
            name: 'base_asset_amount',
            type: 'uint128',
          },
          { internalType: 'uint128', name: 'entry_price', type: 'uint128' },
          { internalType: 'uint8', name: 'leverage', type: 'uint8' },
          {
            internalType: 'int128',
            name: 'last_funding_rate',
            type: 'int128',
          },
          { internalType: 'uint64', name: 'version', type: 'uint64' },
          {
            internalType: 'int128',
            name: 'realized_pnl',
            type: 'int128',
          },
          {
            internalType: 'int128',
            name: 'funding_payment',
            type: 'int128',
          },
          { internalType: 'address', name: 'owner', type: 'address' },
          { internalType: 'uint128', name: 'take_profit', type: 'uint128' },
          { internalType: 'uint128', name: 'stop_loss', type: 'uint128' },
          {
            internalType: 'uint128',
            name: 'liquidate_price',
            type: 'uint128',
          },
        ],
        internalType: 'struct Perp.PerpPosition[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

type AddressScope = 'subaccount' | 'wallet';

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

type RawPerpContractPosition = {
  market_id?: bigint | number | string;
  is_long?: boolean;
  base_asset_amount?: bigint | number | string;
  entry_price?: bigint | number | string;
  leverage?: bigint | number | string;
  last_funding_rate?: bigint | number | string;
  version?: bigint | number | string;
  realized_pnl?: bigint | number | string;
  funding_payment?: bigint | number | string;
  owner?: string;
  take_profit?: bigint | number | string;
  stop_loss?: bigint | number | string;
  liquidate_price?: bigint | number | string;
};

type PerpPositionContracts = {
  userPerpPositions(
    subaccountAddress: string,
    marketIds: number[],
  ): Promise<RawPerpContractPosition[]>;
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
  marketSession: MarketWsSession;
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

    const unsubscribe = input.marketSession.subscribe({
      key: buildPositionsSubscriptionKey(input.walletAddress, enabledPairs),
      payload: buildPositionsSubscriptionPayload(
        input.walletAddress,
        enabledPairs,
      ),
      scope: 'positions-ws',
      onMessage(rawMessage) {
        const update = parseUserPerpPositionsMessage(
          rawMessage,
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
      },
    });

    return () => {
      unsubscribe();
    };
  }, [enabledPairs, input.marketSession, input.walletAddress, walletAddress]);

  return positions;
}

export async function fetchUserPerpPositionsSnapshot(input: {
  network: NetworkConfig;
  subaccountAddress: string;
  perpPairs: MarketPair[];
  contracts?: PerpPositionContracts;
}): Promise<PerpPosition[]> {
  const subaccountAddress = input.subaccountAddress.trim().toLowerCase();
  const enabledPairs = getEnabledPerpPairs(input.perpPairs);
  if (!subaccountAddress || enabledPairs.length === 0) {
    return [];
  }

  const contracts =
    input.contracts ?? createPerpPositionContracts(input.network);
  const marketIds = enabledPairs.map(
    (pair) => pair.marketId ?? Number(pair.pairId),
  );
  const enabledMarketIds = new Set(marketIds);
  const rawPositions = await contracts.userPerpPositions(
    subaccountAddress,
    marketIds,
  );

  return rawPositions
    .map((raw) => mapContractPosition(raw, subaccountAddress))
    .filter(
      (position) =>
        enabledMarketIds.has(position.marketId) &&
        position.baseAssetAmount !== 0n,
    );
}

function createPerpPositionContracts(
  network: NetworkConfig,
): PerpPositionContracts {
  const provider = createRpcProvider(network);
  const perpContract = new Contract(
    PERP_CONTRACT_ADDRESS,
    PERP_POSITION_ABI,
    provider,
  );

  return {
    userPerpPositions(subaccountAddress, marketIds) {
      return perpContract.userPerpPositions(
        subaccountAddress,
        marketIds,
      ) as Promise<RawPerpContractPosition[]>;
    },
  };
}

function mapContractPosition(
  raw: RawPerpContractPosition,
  subaccountAddress: string,
) {
  const marketId = Number(raw.market_id ?? 0);

  return {
    marketId,
    isLong: Boolean(raw.is_long),
    baseAssetAmount: toBigIntValue(raw.base_asset_amount),
    entryPrice: toBigIntValue(raw.entry_price),
    leverage: Number(raw.leverage ?? 0),
    lastFundingRate: toBigIntValue(raw.last_funding_rate),
    isolatedMargin: 0n,
    version: toBigIntValue(raw.version),
    unrealizedPnl: 0n,
    realizedPnl: toBigIntValue(raw.realized_pnl),
    fundingPayment: toBigIntValue(raw.funding_payment),
    owner: raw.owner ?? subaccountAddress,
    takeProfit: toBigIntValue(raw.take_profit),
    stopLoss: toBigIntValue(raw.stop_loss),
    liquidatePrice: toBigIntValue(raw.liquidate_price),
  } satisfies PerpPosition;
}

function toBigIntValue(value: bigint | number | string | undefined) {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    return BigInt(value);
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }

  return 0n;
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

function buildPositionsSubscriptionKey(
  walletAddress: string,
  enabledPairs: MarketPair[],
) {
  const marketIds = enabledPairs
    .map((pair) => pair.marketId ?? Number(pair.pairId))
    .sort((left, right) => left - right)
    .join(',');
  return `positions:${walletAddress.toLowerCase()}:${marketIds}`;
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
