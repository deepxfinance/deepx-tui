import { Box, Text } from 'ink';
import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';

import { padRight } from '../lib/format';
import { formatLocalTimeOfDayWithSeconds } from '../lib/time';

const SELL_COLOR = '#FF3131';
const BUY_COLOR = '#28DE9C';
const SELL_BAR_COLOR = '#3E0F15';
const BUY_BAR_COLOR = '#0D3B2D';
const SELL_BAR_BLINK_COLOR = '#5A1620';
const BUY_BAR_BLINK_COLOR = '#145440';
const MID_HIGHLIGHT_COLOR = '#F0C36A';
const MUTED_COLOR = 'gray';
const PANEL_TITLE_COLOR = '#D7E3F4';
const ORDERBOOK_STATUS_ANIMATION_INTERVAL_MS = 160;
const ORDERBOOK_DATA_BLINK_INTERVAL_MS = 140;
const ORDERBOOK_DATA_BLINK_TOTAL_FRAMES = 6;
const ORDERBOOK_TABLE_WIDTH = 31;
const ORDERBOOK_GROUP_WIDTH = ORDERBOOK_TABLE_WIDTH * 2;
const TRADES_TABLE_WIDTH = 40;
const ORDERBOOK_GROUP_TO_TRADES_GAP = 20;
export const DEFAULT_ORDERBOOK_DEPTH = 20;
export const DEFAULT_TRADES_DEPTH = 20;

type BlinkSection = 'mid' | 'stats';

type BlinkFrames = Record<BlinkSection, number>;

type BlinkSignatures = Record<BlinkSection, string>;

type RowBlinkSection = 'asks' | 'bids' | 'trades';

type RowBlinkFrames = Record<RowBlinkSection, number[]>;

type RowBlinkSignatures = Record<RowBlinkSection, string[]>;

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

type OrderBookDisplayRow = {
  text: string;
  heatWidth: number;
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
  const [blinkFrames, setBlinkFrames] = useState<BlinkFrames>(
    createEmptyBlinkFrames(),
  );
  const [rowBlinkFrames, setRowBlinkFrames] = useState<RowBlinkFrames>(
    createEmptyRowBlinkFrames(depth, tradesDepth),
  );
  const rows = buildOrderBookDisplayRows(orderbook, depth);
  const tradeRows = buildTradeRows(trades, tradesDepth);
  const statusSegments = getOrderbookStatusSegments(statusFrame, isConnected);
  const previousBlinkSignaturesRef = useRef<BlinkSignatures | null>(null);
  const previousRowBlinkSignaturesRef = useRef<RowBlinkSignatures | null>(null);

  useEffect(() => {
    const nextSignatures = buildOrderbookBlinkSignatures({
      latestPrice,
      priceChange1h,
      priceChange24h,
      volume24h,
    });
    const previousSignatures = previousBlinkSignaturesRef.current;

    if (previousSignatures) {
      setBlinkFrames((current) =>
        mergeBlinkFramesForChangedSections(
          current,
          previousSignatures,
          nextSignatures,
        ),
      );
    }

    previousBlinkSignaturesRef.current = nextSignatures;
  }, [latestPrice, priceChange1h, priceChange24h, volume24h]);

  useEffect(() => {
    const nextSignatures = buildOrderbookRowBlinkSignatures({
      rows,
      trades: tradeRows,
    });
    const previousSignatures = previousRowBlinkSignaturesRef.current;

    if (previousSignatures) {
      setRowBlinkFrames((current) =>
        mergeRowBlinkFramesForChangedItems(
          current,
          previousSignatures,
          nextSignatures,
        ),
      );
    } else {
      setRowBlinkFrames(createEmptyRowBlinkFrames(depth, tradesDepth));
    }

    previousRowBlinkSignaturesRef.current = nextSignatures;
  }, [depth, rows, tradeRows, tradesDepth]);

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

  useEffect(() => {
    if (
      !hasActiveBlinkFrames(blinkFrames) &&
      !hasActiveRowBlinkFrames(rowBlinkFrames)
    ) {
      return;
    }

    const timer = setInterval(() => {
      setBlinkFrames((current) => decayBlinkFrames(current));
      setRowBlinkFrames((current) => decayRowBlinkFrames(current));
    }, ORDERBOOK_DATA_BLINK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [blinkFrames, rowBlinkFrames]);

  const isMidBlinking = isBlinkVisible(blinkFrames.mid);
  const isStatsBlinking = isBlinkVisible(blinkFrames.stats);

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
      </Box>
      <Box marginBottom={1}>
        <Text
          color={isStatsBlinking ? MID_HIGHLIGHT_COLOR : MUTED_COLOR}
          bold={isStatsBlinking}
        >
          {`1H ${formatPercentChange(priceChange1h)}  24H ${formatPercentChange(priceChange24h)}  VOL ${formatVolume(volume24h)}`}
        </Text>
      </Box>
      <Box>
        <Box
          flexDirection="column"
          width={ORDERBOOK_GROUP_WIDTH}
          marginRight={ORDERBOOK_GROUP_TO_TRADES_GAP}
        >
          <Box>
            <Box width={ORDERBOOK_TABLE_WIDTH} marginRight={0}>
              <Text color={BUY_COLOR}>BID</Text>
            </Box>
            <Box width={ORDERBOOK_TABLE_WIDTH}>
              <Text color={SELL_COLOR}>ASK</Text>
            </Box>
          </Box>
          <Box>
            <Box
              flexDirection="column"
              width={ORDERBOOK_TABLE_WIDTH}
              marginRight={0}
            >
              <Text color={MUTED_COLOR}>{getOrderbookHeaderRow()}</Text>
              {rows.bids.map((row, index) => (
                <Text key={buildOrderBookRowKey('bid', index)}>
                  {renderOrderBookHeatRow({
                    row,
                    color: isBlinkVisible(rowBlinkFrames.bids[index])
                      ? '#8FF7CA'
                      : BUY_COLOR,
                    backgroundColor: isBlinkVisible(rowBlinkFrames.bids[index])
                      ? BUY_BAR_BLINK_COLOR
                      : BUY_BAR_COLOR,
                    bold: isBlinkVisible(rowBlinkFrames.bids[index]),
                  })}
                </Text>
              ))}
            </Box>
            <Box flexDirection="column" width={ORDERBOOK_TABLE_WIDTH}>
              <Text color={MUTED_COLOR}>{getOrderbookHeaderRow()}</Text>
              {rows.asks.map((row, index) => (
                <Text key={buildOrderBookRowKey('ask', index)}>
                  {renderOrderBookHeatRow({
                    row,
                    color: isBlinkVisible(rowBlinkFrames.asks[index])
                      ? '#FF9A9A'
                      : SELL_COLOR,
                    backgroundColor: isBlinkVisible(rowBlinkFrames.asks[index])
                      ? SELL_BAR_BLINK_COLOR
                      : SELL_BAR_COLOR,
                    bold: isBlinkVisible(rowBlinkFrames.asks[index]),
                  })}
                </Text>
              ))}
            </Box>
          </Box>
          <Box justifyContent="center">
            <Text
              backgroundColor={isMidBlinking ? '#FFF7C7' : MID_HIGHLIGHT_COLOR}
              color="black"
              bold
            >
              {` MID ${latestPrice} `}
            </Text>
          </Box>
        </Box>
        <Box flexDirection="column" width={TRADES_TABLE_WIDTH}>
          <Text color="#7FDBFF">TRADES</Text>
          <Text color={MUTED_COLOR}>{getTradesHeaderRow()}</Text>
          {tradeRows.map((row, index) => (
            <Text
              key={buildTradeRowKey(index)}
              color={
                row.value
                  ? isBlinkVisible(rowBlinkFrames.trades[index])
                    ? row.isBuy
                      ? '#8FF7CA'
                      : '#FF9A9A'
                    : row.isBuy
                      ? BUY_COLOR
                      : SELL_COLOR
                  : MUTED_COLOR
              }
              bold={
                Boolean(row.value) &&
                isBlinkVisible(rowBlinkFrames.trades[index])
              }
            >
              {row.value || ' '}
            </Text>
          ))}
        </Box>
      </Box>
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

  const breathingDot = getLiveStatusDotSegment(frameIndex);

  return [
    {
      key: 'orderbook-status-live',
      text,
      color: BUY_COLOR,
      dimColor: false,
      bold: false,
    },
    breathingDot,
  ];
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

export function buildOrderBookDisplayRows(
  orderbook: {
    orderSellList?: OrderBookLevel[];
    orderBuyList?: OrderBookLevel[];
  } | null,
  depth: number,
) {
  if (!orderbook) {
    return {
      asks: padOrderBookDisplayRows(
        [{ text: 'Waiting for asks...', heatWidth: 0 }],
        depth,
        'end',
      ),
      bids: padOrderBookDisplayRows(
        [{ text: 'Waiting for bids...', heatWidth: 0 }],
        depth,
        'start',
      ),
    };
  }

  const visibleAsks = [...(orderbook.orderSellList ?? [])].slice(0, depth);
  const visibleBids = [...(orderbook.orderBuyList ?? [])].slice(0, depth);
  const maxAskQty = getMaxOrderBookQuantity(visibleAsks);
  const maxBidQty = getMaxOrderBookQuantity(visibleBids);

  return {
    asks: padOrderBookDisplayRows(
      visibleAsks
        .reverse()
        .map((item) => buildOrderBookDisplayRow(item, maxAskQty)),
      depth,
      'end',
    ),
    bids: padOrderBookDisplayRows(
      visibleBids.map((item) => buildOrderBookDisplayRow(item, maxBidQty)),
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

export function calculateOrderBookHeatWidth(
  quantity: string | number,
  maxQuantity: number,
  rowWidth: number,
) {
  const numericQuantity = Number(quantity);
  if (
    !Number.isFinite(numericQuantity) ||
    numericQuantity <= 0 ||
    !Number.isFinite(maxQuantity) ||
    maxQuantity <= 0
  ) {
    return 0;
  }

  return Math.max(1, Math.ceil((numericQuantity / maxQuantity) * rowWidth));
}

export function createEmptyBlinkFrames(): BlinkFrames {
  return {
    mid: 0,
    stats: 0,
  };
}

export function createEmptyRowBlinkFrames(
  depth: number,
  tradesDepth: number,
): RowBlinkFrames {
  return {
    asks: Array.from({ length: depth }, () => 0),
    bids: Array.from({ length: depth }, () => 0),
    trades: Array.from({ length: tradesDepth }, () => 0),
  };
}

export function buildOrderbookBlinkSignatures(input: {
  latestPrice: string;
  priceChange1h?: number;
  priceChange24h?: number;
  volume24h?: number;
}): BlinkSignatures {
  return {
    mid: input.latestPrice,
    stats: [
      input.priceChange1h ?? '',
      input.priceChange24h ?? '',
      input.volume24h ?? '',
    ].join('|'),
  };
}

export function buildOrderbookRowBlinkSignatures(input: {
  rows: {
    asks: OrderBookDisplayRow[];
    bids: OrderBookDisplayRow[];
  };
  trades: Array<{ value: string; isBuy: boolean }>;
}): RowBlinkSignatures {
  return {
    asks: input.rows.asks.map((row) => `${row.text}:${row.heatWidth}`),
    bids: input.rows.bids.map((row) => `${row.text}:${row.heatWidth}`),
    trades: input.trades.map((trade) => `${trade.value}:${trade.isBuy}`),
  };
}

export function mergeBlinkFramesForChangedSections(
  current: BlinkFrames,
  previous: BlinkSignatures,
  next: BlinkSignatures,
): BlinkFrames {
  return {
    mid: shouldBlinkSection(previous.mid, next.mid)
      ? ORDERBOOK_DATA_BLINK_TOTAL_FRAMES
      : current.mid,
    stats: shouldBlinkSection(previous.stats, next.stats)
      ? ORDERBOOK_DATA_BLINK_TOTAL_FRAMES
      : current.stats,
  };
}

export function mergeRowBlinkFramesForChangedItems(
  current: RowBlinkFrames,
  previous: RowBlinkSignatures,
  next: RowBlinkSignatures,
): RowBlinkFrames {
  return {
    asks: mergeRowFrames(current.asks, previous.asks, next.asks),
    bids: mergeRowFrames(current.bids, previous.bids, next.bids),
    trades: mergeRowFrames(current.trades, previous.trades, next.trades),
  };
}

export function decayBlinkFrames(input: BlinkFrames): BlinkFrames {
  return {
    mid: Math.max(0, input.mid - 1),
    stats: Math.max(0, input.stats - 1),
  };
}

export function decayRowBlinkFrames(input: RowBlinkFrames): RowBlinkFrames {
  return {
    asks: input.asks.map(decayFrame),
    bids: input.bids.map(decayFrame),
    trades: input.trades.map(decayFrame),
  };
}

export function hasActiveBlinkFrames(input: BlinkFrames) {
  return Object.values(input).some((value) => value > 0);
}

export function hasActiveRowBlinkFrames(input: RowBlinkFrames) {
  return Object.values(input).some((frames) =>
    frames.some((value) => value > 0),
  );
}

export function isBlinkVisible(remainingFrames: number) {
  return remainingFrames > 0 && remainingFrames % 2 === 0;
}

function padRows(rows: string[], depth: number, align: 'start' | 'end') {
  if (rows.length >= depth) {
    return rows.slice(0, depth);
  }

  const blanks = Array.from({ length: depth - rows.length }, () => '');
  return align === 'end' ? [...blanks, ...rows] : [...rows, ...blanks];
}

function padOrderBookDisplayRows(
  rows: OrderBookDisplayRow[],
  depth: number,
  align: 'start' | 'end',
) {
  if (rows.length >= depth) {
    return rows.slice(0, depth);
  }

  const blanks = Array.from({ length: depth - rows.length }, () => ({
    text: '',
    heatWidth: 0,
  }));
  return align === 'end' ? [...blanks, ...rows] : [...rows, ...blanks];
}

function formatOrderBookRow(item: OrderBookLevel) {
  return `${padRight(formatCompactDecimal(item.price, 2), 11)}${padRight(
    formatCompactDecimal(item.qty, 3),
    10,
  )}${formatCompactDecimal(item.value, 2)}`;
}

function buildOrderBookDisplayRow(
  item: OrderBookLevel,
  maxQuantity: number,
): OrderBookDisplayRow {
  const text = formatOrderBookRow(item);
  return {
    text,
    heatWidth: calculateOrderBookHeatWidth(item.qty, maxQuantity, text.length),
  };
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

function shouldBlinkSection(previous: string, next: string) {
  return previous.length > 0 && next.length > 0 && previous !== next;
}

function mergeRowFrames(
  current: number[],
  previous: string[],
  next: string[],
): number[] {
  const nextLength = Math.max(current.length, previous.length, next.length);

  return Array.from({ length: nextLength }, (_, index) =>
    shouldBlinkSection(previous[index] ?? '', next[index] ?? '')
      ? ORDERBOOK_DATA_BLINK_TOTAL_FRAMES
      : (current[index] ?? 0),
  );
}

function decayFrame(frame: number) {
  return Math.max(0, frame - 1);
}

function getMaxOrderBookQuantity(levels: OrderBookLevel[]) {
  return levels.reduce((max, level) => {
    const quantity = Number(level.qty);
    if (!Number.isFinite(quantity)) {
      return max;
    }

    return Math.max(max, quantity);
  }, 0);
}

function renderOrderBookHeatRow(input: {
  row: OrderBookDisplayRow;
  color: string;
  backgroundColor: string;
  bold: boolean;
}) {
  if (!input.row.text) {
    return <Text color={MUTED_COLOR}> </Text>;
  }

  const heatWidth = Math.min(input.row.heatWidth, input.row.text.length);
  const leading = input.row.text.slice(0, heatWidth);
  const trailing = input.row.text.slice(heatWidth);

  return (
    <>
      {leading ? (
        <Text
          backgroundColor={input.backgroundColor}
          color={input.color}
          bold={input.bold}
        >
          {leading}
        </Text>
      ) : null}
      {trailing ? <Text color={input.color}>{trailing}</Text> : null}
    </>
  );
}

function resolveTradeSize(trade: TradeItem): string | number {
  return trade.qty ?? trade.filledQty ?? trade.amount ?? trade.size ?? '';
}

function formatTradeTime(trade: TradeItem) {
  const numericTime = Number(trade.time);
  if (Number.isFinite(numericTime)) {
    const timestamp =
      numericTime > 1_000_000_000_000 ? numericTime : numericTime * 1000;
    return formatLocalTimeOfDayWithSeconds(timestamp);
  }

  if (trade.createdAt) {
    const parsed = Date.parse(trade.createdAt);
    if (Number.isFinite(parsed)) {
      return formatLocalTimeOfDayWithSeconds(parsed);
    }
  }

  return '--:--:--';
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

export function getLiveStatusDotSegment(frameIndex: number): StatusSegment {
  const phase = Math.abs(frameIndex) % 6;

  if (phase <= 1) {
    return {
      key: 'orderbook-status-dot',
      text: ' ●',
      color: '#1E9F6E',
      dimColor: false,
      bold: false,
    };
  }

  if (phase <= 3) {
    return {
      key: 'orderbook-status-dot',
      text: ' ●',
      color: '#28DE9C',
      dimColor: false,
      bold: true,
    };
  }

  return {
    key: 'orderbook-status-dot',
    text: ' ●',
    color: '#0F5C41',
    dimColor: false,
    bold: false,
  };
}

function formatCompactDecimal(value: string | number, digits: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '--';
  }

  return numericValue.toFixed(digits);
}
