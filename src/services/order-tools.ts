import { getNetworkConfig, type RuntimeNetwork } from '../config/networks';
import { getMarketPairs, type PairKind } from './market-catalog';
import {
  cancelPerpOrderLive,
  listLivePerpPairs,
  placePerpOrderLive,
} from './perp-trading';
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
  warnings: string[];
  summary: string;
};

export async function placeOrderTool(
  input: PlaceOrderInput & { passphrase?: string },
) {
  const network = input.network ?? 'deepx_devnet';
  const livePair = asLivePerpPair(input.pair);
  const passphrase = resolveLivePassphrase(network, input.passphrase);

  if (livePair && passphrase) {
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
  const livePair = asLivePerpPair(input.pair);
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

export function listSupportedMarkets(network: RuntimeNetwork) {
  return getMarketPairs(getNetworkConfig(network)).map((pair) => ({
    label: pair.label,
    kind: pair.kind,
    priceDecimals: pair.priceDecimal,
    sizeDecimals: pair.orderDecimal,
  }));
}

export function buildDryRunOrder(input: PlaceOrderInput): OrderToolResult {
  const network = input.network ?? 'deepx_devnet';
  const pair = findPair(network, input.pair);
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
    'Wallet signing and exchange submission are not implemented in this repository yet.',
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
    warnings,
    summary: buildOrderSummary({
      network,
      pair: pair.label,
      side,
      type,
      size,
      price,
      tif,
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

export function resolveLivePassphrase(
  network: RuntimeNetwork,
  passphrase?: string,
) {
  if (typeof passphrase === 'string' && passphrase.trim().length > 0) {
    return passphrase.trim();
  }

  return getRememberedWalletPassphrase(network);
}

function asLivePerpPair(pair: string) {
  return listLivePerpPairs().find((item) => item === pair);
}

function findPair(network: RuntimeNetwork, requestedPair: string) {
  const normalized = requestedPair.trim().toUpperCase();
  const pair = getMarketPairs(getNetworkConfig(network)).find(
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

function formatNotional(price: string, size: string): string {
  return (Number(price) * Number(size)).toFixed(2);
}

function buildOrderSummary(input: {
  network: RuntimeNetwork;
  pair: string;
  side: OrderSide;
  type: OrderType;
  size: string;
  price?: string;
  tif: 'GTC' | 'IOC' | 'FOK';
}) {
  const priceSuffix = input.price ? ` @ ${input.price}` : '';
  return `${input.network} ${input.side} ${input.size} ${input.pair} ${input.type}${priceSuffix} ${input.tif}`;
}
