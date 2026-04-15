import { getNetworkConfig, type RuntimeNetwork } from '../config/networks';
import { getNetworkMarkets, type PairKind } from './market-catalog';
import {
  cancelPerpOrderLive,
  closePerpPositionLive,
  listLivePerpPairs,
  placePerpOrderLive,
  updatePerpPositionLive,
} from './perp-trading';
import { listLiveSpotPairs, placeSpotOrderLive } from './spot-trading';
import { getRememberedWalletPassphrase } from './wallet-session';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';

export type PlaceOrderInput = {
  network?: RuntimeNetwork;
  pair: string;
  side: OrderSide;
  type: OrderType;
  size: string | number;
  price?: string | number;
  tif?: 'GTC' | 'IOC' | 'FOK';
  slippage?: string | number;
  note?: string;
  confirm?: boolean;
};

export type OrderToolResult = {
  status: 'dry_run';
  network: RuntimeNetwork;
  pair: string;
  kind: PairKind;
  side: OrderSide;
  type: OrderType;
  size: string;
  price?: string;
  tif: 'GTC' | 'IOC' | 'FOK';
  notional?: string;
  explorerUrl: string;
  warnings: string[];
  summary: string;
};

export type PositionToolResult = {
  status: 'dry_run';
  network: RuntimeNetwork;
  pair: string;
  action: 'close_position' | 'update_position';
  price?: string;
  slippage?: string;
  takeProfit?: string;
  stopLoss?: string;
  warnings: string[];
  summary: string;
};

export async function placeOrderTool(
  input: PlaceOrderInput & { passphrase?: string },
) {
  const network = input.network ?? 'deepx_devnet';
  const livePair = await asLivePerpPair(network, input.pair);
  const liveSpotPair = await asLiveSpotPair(network, input.pair);
  const passphrase = resolveLivePassphrase(network, input.passphrase);

  if (livePair && input.confirm === true && passphrase) {
    return placePerpOrderLive({
      network,
      pair: livePair,
      side: input.side,
      type: input.type,
      size: input.size,
      price: input.price,
      passphrase,
      confirm: input.confirm ?? false,
    });
  }

  if (liveSpotPair && input.confirm === true && passphrase) {
    return placeSpotOrderLive({
      network,
      pair: liveSpotPair,
      side: input.side,
      type: input.type,
      size: input.size,
      price: input.price,
      slippage: input.slippage,
      passphrase,
      confirm: input.confirm ?? false,
    });
  }

  return buildDryRunOrder(input);
}

export async function cancelOrderTool(input: {
  network?: RuntimeNetwork;
  pair: string;
  orderId: number;
  passphrase?: string;
  confirm?: boolean;
}) {
  const network = input.network ?? 'deepx_devnet';
  const livePair = await asLivePerpPair(network, input.pair);
  if (livePair) {
    const passphrase = resolveLivePassphrase(network, input.passphrase);
    if (!passphrase) {
      throw new Error(
        'Live order cancellation requires passphrase. Unlock the wallet in this session or provide passphrase explicitly.',
      );
    }

    return cancelPerpOrderLive({
      network,
      pair: livePair,
      orderId: input.orderId,
      passphrase,
      confirm: input.confirm ?? false,
    });
  }

  return {
    status: 'dry_run',
    summary: `Cancel order ${input.orderId} on ${input.pair} is not implemented for this market.`,
  };
}

export async function closePositionTool(input: {
  network?: RuntimeNetwork;
  pair: string;
  price: string | number;
  slippage?: string | number;
  passphrase?: string;
  confirm?: boolean;
}) {
  const network = input.network ?? 'deepx_devnet';
  const livePair = await asLivePerpPair(network, input.pair);
  if (livePair) {
    const passphrase = resolveLivePassphrase(network, input.passphrase);
    if (!passphrase) {
      throw new Error(
        'Live position close requires passphrase. Unlock the wallet in this session or provide passphrase explicitly.',
      );
    }

    return closePerpPositionLive({
      network,
      pair: livePair,
      price: input.price,
      slippage: input.slippage,
      passphrase,
      confirm: input.confirm ?? false,
    });
  }

  return buildDryRunClosePosition(input);
}

export async function updatePositionTool(input: {
  network?: RuntimeNetwork;
  pair: string;
  takeProfit?: string | number;
  stopLoss?: string | number;
  passphrase?: string;
  confirm?: boolean;
}) {
  const network = input.network ?? 'deepx_devnet';
  const livePair = await asLivePerpPair(network, input.pair);
  if (livePair) {
    const passphrase = resolveLivePassphrase(network, input.passphrase);
    if (!passphrase) {
      throw new Error(
        'Live position update requires passphrase. Unlock the wallet in this session or provide passphrase explicitly.',
      );
    }
    if (input.takeProfit == null || input.stopLoss == null) {
      throw new Error(
        'Live position update requires both takeProfit and stopLoss. Use 0 to clear either trigger.',
      );
    }

    return updatePerpPositionLive({
      network,
      pair: livePair,
      takeProfit: input.takeProfit,
      stopLoss: input.stopLoss,
      passphrase,
      confirm: input.confirm ?? false,
    });
  }

  return buildDryRunPositionUpdate(input);
}

export async function listSupportedMarkets(network: RuntimeNetwork) {
  return (await getNetworkMarkets(getNetworkConfig(network))).map((pair) => ({
    label: pair.label,
    kind: pair.kind,
    priceDecimals: pair.priceDecimal,
    sizeDecimals: pair.orderDecimal,
  }));
}

export async function buildDryRunOrder(
  input: PlaceOrderInput,
): Promise<OrderToolResult> {
  const network = input.network ?? 'deepx_devnet';
  const networkConfig = getNetworkConfig(network);
  const pair = await findPair(network, input.pair);
  const side = normalizeSide(input.side);
  const type = normalizeType(input.type);
  const size = normalizeDecimal(input.size, pair.orderDecimal, 'size');
  const price =
    type === 'LIMIT'
      ? normalizeDecimal(input.price, pair.priceDecimal, 'price')
      : undefined;
  const tif = input.tif ?? 'GTC';
  const warnings = [
    'Dry-run only. No live order was submitted.',
    'Live submission requires the terminal Confirm action with an unlocked wallet session.',
  ];

  if (!input.confirm) {
    warnings.unshift(
      'Confirmation flag was not set. Treat this as a planning ticket only.',
    );
  }

  return {
    status: 'dry_run',
    network,
    pair: pair.label,
    kind: pair.kind,
    side,
    type,
    size,
    price,
    tif,
    notional: price ? formatNotional(price, size) : undefined,
    explorerUrl: `${networkConfig.explorerUrl}/tx`,
    warnings,
    summary: buildOrderSummary({
      statusLabel: 'Dry run only',
      networkLabel: networkConfig.shortLabel,
      pair: pair.label,
      side,
      type,
      size,
      price,
      txHash: undefined,
      explorerUrl: `${networkConfig.explorerUrl}/tx`,
    }),
  };
}

export function listOpenOrdersDryRun(network: RuntimeNetwork) {
  return {
    network,
    orders: [],
    summary:
      'Open orders are unavailable in dry-run mode because live account queries are not implemented yet.',
  };
}

export async function buildDryRunClosePosition(input: {
  network?: RuntimeNetwork;
  pair: string;
  price: string | number;
  slippage?: string | number;
  confirm?: boolean;
}): Promise<PositionToolResult> {
  const network = input.network ?? 'deepx_devnet';
  const pair = await findPair(network, input.pair);
  const price = normalizeDecimal(input.price, pair.priceDecimal, 'price');
  const slippage = normalizeIntegerString(input.slippage, 'slippage', '10');
  const warnings = [
    'Dry-run only. No live position close was submitted.',
    'This tool needs an unlocked wallet session plus explicit confirmation for live execution.',
  ];

  if (!input.confirm) {
    warnings.unshift(
      'Confirmation flag was not set. Treat this as a planning ticket only.',
    );
  }

  return {
    status: 'dry_run',
    network,
    pair: pair.label,
    action: 'close_position',
    price,
    slippage,
    warnings,
    summary: `${network} close position on ${pair.label} @ ${price} with slippage ${slippage}`,
  };
}

export async function buildDryRunPositionUpdate(input: {
  network?: RuntimeNetwork;
  pair: string;
  takeProfit?: string | number;
  stopLoss?: string | number;
  confirm?: boolean;
}): Promise<PositionToolResult> {
  const network = input.network ?? 'deepx_devnet';
  const pair = await findPair(network, input.pair);
  const takeProfit =
    input.takeProfit == null
      ? undefined
      : normalizeNonNegativeDecimal(
          input.takeProfit,
          pair.priceDecimal,
          'takeProfit',
        );
  const stopLoss =
    input.stopLoss == null
      ? undefined
      : normalizeNonNegativeDecimal(
          input.stopLoss,
          pair.priceDecimal,
          'stopLoss',
        );

  if (!takeProfit && !stopLoss) {
    throw new Error('Position update requires takeProfit, stopLoss, or both.');
  }

  const warnings = [
    'Dry-run only. No live position update was submitted.',
    'Live execution currently requires both takeProfit and stopLoss values. Use 0 to clear either trigger.',
  ];

  if (!input.confirm) {
    warnings.unshift(
      'Confirmation flag was not set. Treat this as a planning ticket only.',
    );
  }

  return {
    status: 'dry_run',
    network,
    pair: pair.label,
    action: 'update_position',
    takeProfit,
    stopLoss,
    warnings,
    summary: `${network} update position on ${pair.label} with TP ${takeProfit ?? 'unchanged'} and SL ${stopLoss ?? 'unchanged'}`,
  };
}

export function resolveLivePassphrase(
  network: RuntimeNetwork,
  passphrase?: string,
) {
  if (typeof passphrase === 'string' && passphrase.trim().length > 0) {
    return passphrase.trim();
  }

  return getRememberedWalletPassphrase(network);
}

async function asLivePerpPair(network: RuntimeNetwork, pair: string) {
  return (await listLivePerpPairs(network)).find((item) => item === pair);
}

async function asLiveSpotPair(network: RuntimeNetwork, pair: string) {
  return (await listLiveSpotPairs(network)).find((item) => item === pair);
}

async function findPair(network: RuntimeNetwork, requestedPair: string) {
  const normalized = requestedPair.trim().toUpperCase();
  const pair = (await getNetworkMarkets(getNetworkConfig(network))).find(
    (item) => item.label.toUpperCase() === normalized,
  );

  if (!pair) {
    throw new Error(
      `Unsupported pair "${requestedPair}" for ${network}. Use deepx_list_markets first.`,
    );
  }

  return pair;
}

function normalizeSide(value: string): OrderSide {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'BUY' || normalized === 'SELL') {
    return normalized;
  }

  throw new Error(`Invalid side "${value}". Expected BUY or SELL.`);
}

function normalizeType(value: string): OrderType {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'LIMIT' || normalized === 'MARKET') {
    return normalized;
  }

  throw new Error(`Invalid order type "${value}". Expected LIMIT or MARKET.`);
}

function normalizeDecimal(
  value: string | number | undefined,
  decimals: number,
  field: 'size' | 'price',
): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid ${field}. Expected a positive number.`);
  }

  return numeric.toFixed(decimals);
}

function normalizeNonNegativeDecimal(
  value: string | number | undefined,
  decimals: number,
  field: 'takeProfit' | 'stopLoss',
): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`Invalid ${field}. Expected a non-negative number.`);
  }

  return numeric.toFixed(decimals);
}

function normalizeIntegerString(
  value: string | number | undefined,
  field: 'slippage',
  fallback: string,
) {
  if (value == null) {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`Invalid ${field}. Expected a non-negative integer.`);
  }

  return String(numeric);
}

function formatNotional(price: string, size: string): string {
  return (Number(price) * Number(size)).toFixed(2);
}

function buildOrderSummary(input: {
  statusLabel: string;
  networkLabel: string;
  pair: string;
  side: OrderSide;
  type: OrderType;
  size: string;
  price?: string;
  txHash?: string;
  explorerUrl: string;
}) {
  return [
    input.statusLabel,
    `Side: ${input.side}`,
    `Pair: ${input.pair}`,
    `Type: ${input.type}`,
    `Size: ${input.size}`,
    ...(input.price ? [`Price: ${input.price}`] : []),
    `Network: ${input.networkLabel}`,
    ...(input.txHash ? [`Tx Hash: ${truncateTxHash(input.txHash)}`] : []),
    'Explorer:',
    input.explorerUrl,
  ].join('\n');
}

function truncateTxHash(txHash: string) {
  if (txHash.length <= 13) {
    return txHash;
  }

  return `${txHash.slice(0, 8)}...${txHash.slice(-4)}`;
}
