import { Box, Text } from 'ink';
import type { FC } from 'react';
import { useEffect, useState } from 'react';

import { padRight } from '../lib/format';

const SELL_COLOR = '#FF3131';
const BUY_COLOR = '#28DE9C';
const MID_HIGHLIGHT_COLOR = '#F0C36A';
const MUTED_COLOR = 'gray';
const PANEL_TITLE_COLOR = '#D7E3F4';
const ORDERBOOK_STATUS_SHIMMER_COLORS = [
  '#0F5C41',
  '#1E9F6E',
  '#28DE9C',
  '#E8FFF6',
  '#28DE9C',
  '#1E9F6E',
];
const ORDERBOOK_STATUS_ANIMATION_INTERVAL_MS = 160;
export const DEFAULT_ORDERBOOK_DEPTH = 20;
export const DEFAULT_TRADES_DEPTH = 20;

type StatusSegment = {
  key: string;
  text: string;
  color?: string;
  dimColor: boolean;
  bold: boolean;
};

type OrderBookLevel = {
  price: string;
  qty: string;
  value: string;
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

type OrderbookPanelProps = {
  pairLabel: string;
  latestPrice: string;
  priceChange1h?: number;
  priceChange24h?: number;
  volume24h?: number;
  orderbook: {
    orderSellList?: OrderBookLevel[];
    orderBuyList?: OrderBookLevel[];
  } | null;
  trades: TradeItem[];
  isConnected: boolean;
  errorMessage?: string;
  depth?: number;
  tradesDepth?: number;
};

export const OrderbookPanel: FC<OrderbookPanelProps> = ({
  pairLabel,
  latestPrice,
  priceChange1h,
  priceChange24h,
  volume24h,
  orderbook,
  trades,
  isConnected,
  errorMessage,
  depth = DEFAULT_ORDERBOOK_DEPTH,
  tradesDepth = DEFAULT_TRADES_DEPTH,
}) => {
  const [statusFrame, setStatusFrame] = useState(0);
  const rows = buildOrderBookColumns(orderbook, depth);
  const tradeRows = buildTradeRows(trades, tradesDepth);
  const statusSegments = getOrderbookStatusSegments(statusFrame, isConnected);

  useEffect(() => {
    if (!isConnected) {
      setStatusFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setStatusFrame((current) => current + 1);
    }, ORDERBOOK_STATUS_ANIMATION_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isConnected]);

  return (
    <Box
      borderStyle="round"
      borderColor="gray"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      width="100%"
      flexGrow={1}
    >
      <Box justifyContent="space-between">
        <Text color={PANEL_TITLE_COLOR}>{`Orderbook ${pairLabel}`}</Text>
        <Text backgroundColor={MID_HIGHLIGHT_COLOR} color="black" bold>
          {` MID ${latestPrice} `}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={MUTED_COLOR}>
          {`1H ${formatPercentChange(priceChange1h)}  24H ${formatPercentChange(priceChange24h)}  VOL ${formatVolume(volume24h)}`}
        </Text>
      </Box>
      <Box>
        <Box width="34%" marginRight={3}>
          <Text color={SELL_COLOR}>SELL</Text>
        </Box>
        <Box width="34%" marginRight={3}>
          <Text color={BUY_COLOR}>BUY</Text>
        </Box>
        <Box width="29%">
          <Text color="#7FDBFF">TRADES</Text>
        </Box>
      </Box>
      <Box>
        <Box flexDirection="column" width="34%" marginRight={3}>
          <Text color={MUTED_COLOR}>{getOrderbookHeaderRow()}</Text>
          {rows.asks.map((row, index) => (
            <Text
              key={buildOrderBookRowKey('ask', index)}
              color={row ? SELL_COLOR : MUTED_COLOR}
            >
              {row || ' '}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" width="34%" marginRight={3}>
          <Text color={MUTED_COLOR}>{getOrderbookHeaderRow()}</Text>
          {rows.bids.map((row, index) => (
            <Text
              key={buildOrderBookRowKey('bid', index)}
              color={row ? BUY_COLOR : MUTED_COLOR}
            >
              {row || ' '}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" width="29%">
          <Text color={MUTED_COLOR}>{getTradesHeaderRow()}</Text>
          {tradeRows.map((row, index) => (
            <Text
              key={buildTradeRowKey(index)}
              color={
                row.value ? (row.isBuy ? BUY_COLOR : SELL_COLOR) : MUTED_COLOR
              }
            >
              {row.value || ' '}
            </Text>
          ))}
        </Box>
      </Box>
      <Text color={MUTED_COLOR}>
        {statusSegments.map((segment) => (
          <Text
            key={segment.key}
            color={segment.color}
            dimColor={segment.dimColor}
            bold={segment.bold}
          >
            {segment.text}
          </Text>
        ))}
      </Text>
      {errorMessage ? <Text color={SELL_COLOR}>{errorMessage}</Text> : null}
    </Box>
  );
};

export function getOrderbookStatusSegments(
  frameIndex: number,
  isConnected: boolean,
): StatusSegment[] {
  const text = isConnected ? 'Live' : 'Connecting orderbook...';

  if (!isConnected) {
    return text.split('').map((character, index) => ({
      key: `orderbook-status-${index}`,
      text: character,
      dimColor: true,
      bold: false,
    }));
  }

  const shimmerPosition =
    Math.abs(frameIndex) %
    (text.length + ORDERBOOK_STATUS_SHIMMER_COLORS.length);
  const highlightIndex = Math.floor(ORDERBOOK_STATUS_SHIMMER_COLORS.length / 2);

  return text.split('').map((character, index) => {
    const color = getStatusShimmerColor(index, shimmerPosition);

    return {
      key: `orderbook-status-${index}`,
      text: character,
      color,
      dimColor: color === undefined,
      bold: shimmerPosition - index === highlightIndex,
    };
  });
}

export function buildOrderBookColumns(
  orderbook: {
    orderSellList?: OrderBookLevel[];
    orderBuyList?: OrderBookLevel[];
  } | null,
  depth: number,
) {
  if (!orderbook) {
    return {
      asks: padRows(['Waiting for asks...'], depth, 'end'),
      bids: padRows(['Waiting for bids...'], depth, 'start'),
    };
  }

  return {
    asks: padRows(
      [...(orderbook.orderSellList ?? [])]
        .slice(0, depth)
        .reverse()
        .map(formatOrderBookRow),
      depth,
      'end',
    ),
    bids: padRows(
      [...(orderbook.orderBuyList ?? [])]
        .slice(0, depth)
        .map(formatOrderBookRow),
      depth,
      'start',
    ),
  };
}

export function buildOrderBookRowKey(side: 'ask' | 'bid', index: number) {
  return `${side}-${index}`;
}

export function getOrderbookHeaderRow() {
  return `${padRight('PRICE', 11)}${padRight('SIZE', 10)}TOTAL`;
}

export function getTradesHeaderRow() {
  return `${padRight('TIME', 10)}${padRight('PRICE', 9)}SIZE`;
}

function padRows(rows: string[], depth: number, align: 'start' | 'end') {
  if (rows.length >= depth) {
    return rows.slice(0, depth);
  }

  const blanks = Array.from({ length: depth - rows.length }, () => '');
  return align === 'end' ? [...blanks, ...rows] : [...rows, ...blanks];
}

function formatOrderBookRow(item: OrderBookLevel) {
  return `${padRight(formatCompactDecimal(item.price, 2), 11)}${padRight(
    formatCompactDecimal(item.qty, 3),
    10,
  )}${formatCompactDecimal(item.value, 2)}`;
}

export function buildTradeRows(trades: TradeItem[], depth: number) {
  if (trades.length === 0) {
    return padTradeRows(
      [{ value: 'Waiting for trades...', isBuy: true }],
      depth,
    );
  }

  return padTradeRows(
    trades.slice(0, depth).map((trade) => ({
      value: formatTradeRow(trade),
      isBuy:
        trade.isLong ??
        (trade.filledDirection === 'Long' || trade.filledDirection === 'BUY'),
    })),
    depth,
  );
}

export function buildTradeRowKey(index: number) {
  return `trade-${index}`;
}

function padTradeRows(
  rows: Array<{ value: string; isBuy: boolean }>,
  depth: number,
) {
  if (rows.length >= depth) {
    return rows.slice(0, depth);
  }

  return [
    ...rows,
    ...Array.from({ length: depth - rows.length }, () => ({
      value: '',
      isBuy: true,
    })),
  ];
}

function formatTradeRow(trade: TradeItem) {
  return `${padRight(formatTradeTime(trade), 10)}${padRight(
    formatCompactDecimal(trade.price, 2),
    9,
  )}${formatCompactDecimal(resolveTradeSize(trade), 3)}`;
}

function resolveTradeSize(trade: TradeItem): string | number {
  return trade.qty ?? trade.filledQty ?? trade.amount ?? trade.size ?? '';
}

function formatTradeTime(trade: TradeItem) {
  const numericTime = Number(trade.time);
  if (Number.isFinite(numericTime)) {
    const timestamp =
      numericTime > 1_000_000_000_000 ? numericTime : numericTime * 1000;
    return formatTimestampUtc(timestamp);
  }

  if (trade.createdAt) {
    const parsed = Date.parse(trade.createdAt);
    if (Number.isFinite(parsed)) {
      return formatTimestampUtc(parsed);
    }
  }

  return '--:--:--';
}

function formatTimestampUtc(timestamp: number) {
  const date = new Date(timestamp);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

export function formatPercentChange(value?: number) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  const prefix = (value as number) > 0 ? '+' : '';
  return `${prefix}${(value as number).toFixed(2)}%`;
}

export function formatVolume(value?: number) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  const absolute = Math.abs(value as number);
  if (absolute >= 1_000_000_000) {
    return `${((value as number) / 1_000_000_000).toFixed(2)}B`;
  }

  if (absolute >= 1_000_000) {
    return `${((value as number) / 1_000_000).toFixed(2)}M`;
  }

  if (absolute >= 1_000) {
    return `${((value as number) / 1_000).toFixed(2)}K`;
  }

  return (value as number).toFixed(2);
}

function getStatusShimmerColor(
  index: number,
  shimmerPosition: number,
): string | undefined {
  const colorIndex = shimmerPosition - index;
  if (colorIndex < 0 || colorIndex >= ORDERBOOK_STATUS_SHIMMER_COLORS.length) {
    return undefined;
  }

  return ORDERBOOK_STATUS_SHIMMER_COLORS[colorIndex];
}

function formatCompactDecimal(value: string | number, digits: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '--';
  }

  return numericValue.toFixed(digits);
}
