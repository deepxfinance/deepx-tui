import { Box, Text } from 'ink';
import type { FC } from 'react';
import { useMemo } from 'react';

import { padRight } from '../lib/format';
import { formatLocalTimeOfDayWithMilliseconds } from '../lib/time';

const SELL_COLOR = '#FF3131';
const BUY_COLOR = '#28DE9C';
const SELL_BAR_COLOR = '#3E0F15';
const BUY_BAR_COLOR = '#0D3B2D';
const MID_HIGHLIGHT_COLOR = '#F0C36A';
const MUTED_COLOR = 'gray';
const PANEL_TITLE_COLOR = '#D7E3F4';
const VOLUME_COLOR = '#F0C36A';
const ORDERBOOK_TABLE_WIDTH = 31;
const ORDERBOOK_GROUP_WIDTH = ORDERBOOK_TABLE_WIDTH * 2;
const TRADES_TABLE_WIDTH = 40;
const ORDERBOOK_SIDE_GAP = 2;
const ORDERBOOK_GROUP_TO_TRADES_GAP = 20;
export const DEFAULT_ORDERBOOK_DEPTH = 20;
export const DEFAULT_TRADES_DEPTH = 20;

type StatusSegment = {
  key: string;
  text: string;
  color?: string;
  dimColor: boolean;
  bold: boolean;
};

export type OrderBookLevel = {
  price: string;
  qty: string;
  value: string;
};

type OrderBookDisplayRow = {
  text: string;
  heatWidth: number;
};

export type TradeItem = {
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

export type OrderbookPanelStatus =
  | { kind: 'live'; isConnected: boolean }
  | { kind: 'snapshot'; timeLabel: string };

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
  status?: OrderbookPanelStatus;
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
  status = { kind: 'live', isConnected: false },
  errorMessage,
  depth = DEFAULT_ORDERBOOK_DEPTH,
  tradesDepth = DEFAULT_TRADES_DEPTH,
}) => {
  const rows = useMemo(
    () => buildOrderBookDisplayRows(orderbook, depth),
    [depth, orderbook],
  );
  const tradeRows = useMemo(
    () => buildTradeRows(trades, tradesDepth),
    [trades, tradesDepth],
  );
  const midPriceLabel = useMemo(
    () => getMidPriceLabel(orderbook, latestPrice),
    [latestPrice, orderbook],
  );
  const statusSegments = getOrderbookStatusSegments(status);
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
        <Text color={MUTED_COLOR}>
          {'1H '}
          <Text color={getPriceChangeColor(priceChange1h)}>
            {formatPercentChange(priceChange1h)}
          </Text>
          {'  24H '}
          <Text color={getPriceChangeColor(priceChange24h)}>
            {formatPercentChange(priceChange24h)}
          </Text>
          {'  VOL '}
          <Text color={VOLUME_COLOR}>{formatVolume(volume24h)}</Text>
        </Text>
      </Box>
      <Box>
        <Box
          flexDirection="column"
          width={ORDERBOOK_GROUP_WIDTH}
          marginRight={ORDERBOOK_GROUP_TO_TRADES_GAP}
        >
          <Box>
            <Box
              width={ORDERBOOK_TABLE_WIDTH}
              marginRight={ORDERBOOK_SIDE_GAP}
              justifyContent="flex-end"
            >
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
              marginRight={ORDERBOOK_SIDE_GAP}
            >
              <Box width={ORDERBOOK_TABLE_WIDTH} justifyContent="flex-end">
                <Text color={MUTED_COLOR}>{getOrderbookHeaderRow()}</Text>
              </Box>
              {rows.bids.map((row, index) => (
                <Box
                  key={buildOrderBookRowKey('bid', index)}
                  width={ORDERBOOK_TABLE_WIDTH}
                  justifyContent="flex-end"
                >
                  <Text>
                    {renderOrderBookHeatRow({
                      row,
                      color: BUY_COLOR,
                      backgroundColor: BUY_BAR_COLOR,
                      bold: false,
                      heatAlign: 'end',
                    })}
                  </Text>
                </Box>
              ))}
            </Box>
            <Box flexDirection="column" width={ORDERBOOK_TABLE_WIDTH}>
              <Box width={ORDERBOOK_TABLE_WIDTH}>
                <Text color={MUTED_COLOR}>{getOrderbookHeaderRow()}</Text>
              </Box>
              {rows.asks.map((row, index) => (
                <Box
                  key={buildOrderBookRowKey('ask', index)}
                  width={ORDERBOOK_TABLE_WIDTH}
                >
                  <Text>
                    {renderOrderBookHeatRow({
                      row,
                      color: SELL_COLOR,
                      backgroundColor: SELL_BAR_COLOR,
                      bold: false,
                      heatAlign: 'start',
                    })}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
          <Box justifyContent="center">
            <Text backgroundColor={MID_HIGHLIGHT_COLOR} color="black" bold>
              {` MID ${midPriceLabel} `}
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
                row.value ? (row.isBuy ? BUY_COLOR : SELL_COLOR) : MUTED_COLOR
              }
              bold={false}
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
  status: OrderbookPanelStatus,
): StatusSegment[] {
  if (status.kind === 'snapshot') {
    return [
      {
        key: 'orderbook-status-snapshot',
        text: `Snapshot ${status.timeLabel}`,
        color: PANEL_TITLE_COLOR,
        dimColor: false,
        bold: false,
      },
    ];
  }

  const text = status.isConnected ? 'Live' : 'Connecting orderbook...';

  if (!status.isConnected) {
    return text.split('').map((character, index) => ({
      key: `orderbook-status-${index}`,
      text: character,
      dimColor: true,
      bold: false,
    }));
  }

  return [
    {
      key: 'orderbook-status-live',
      text,
      color: BUY_COLOR,
      dimColor: false,
      bold: false,
    },
    getLiveStatusDotSegment(),
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
      asks: padRows(['Waiting for asks...'], depth, 'start'),
      bids: padRows(['Waiting for bids...'], depth, 'start'),
    };
  }

  return {
    asks: padRows(
      [...(orderbook.orderSellList ?? [])]
        .slice(0, depth)
        .map(formatOrderBookRow),
      depth,
      'start',
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
        'start',
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
  const askCumulativeQuantities = getCumulativeOrderBookQuantities(visibleAsks);
  const bidCumulativeQuantities = getCumulativeOrderBookQuantities(visibleBids);
  const maxAskQty = askCumulativeQuantities.at(-1) ?? 0;
  const maxBidQty = bidCumulativeQuantities.at(-1) ?? 0;

  return {
    asks: padOrderBookDisplayRows(
      visibleAsks.map((item, index) =>
        buildOrderBookDisplayRow(
          item,
          askCumulativeQuantities[index] ?? 0,
          maxAskQty,
        ),
      ),
      depth,
      'start',
    ),
    bids: padOrderBookDisplayRows(
      visibleBids.map((item, index) =>
        buildOrderBookDisplayRow(
          item,
          bidCumulativeQuantities[index] ?? 0,
          maxBidQty,
        ),
      ),
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
  return `${padRight('TIME', 13)}${padRight('PRICE', 9)}SIZE`;
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

export function getMidPriceLabel(
  orderbook: {
    orderSellList?: OrderBookLevel[];
    orderBuyList?: OrderBookLevel[];
  } | null,
  fallbackPrice: string,
) {
  const bestBid = getBestBidPrice(orderbook?.orderBuyList ?? []);
  const bestAsk = getBestAskPrice(orderbook?.orderSellList ?? []);

  if (bestBid == null || bestAsk == null) {
    return fallbackPrice;
  }

  const precision = Math.max(
    countDecimalPlaces(bestBid.raw),
    countDecimalPlaces(bestAsk.raw),
    countDecimalPlaces(fallbackPrice),
  );

  return ((bestBid.value + bestAsk.value) / 2).toFixed(precision);
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
  cumulativeQuantity: number,
  maxQuantity: number,
): OrderBookDisplayRow {
  const text = formatOrderBookRow(item);
  return {
    text,
    heatWidth: calculateOrderBookHeatWidth(
      cumulativeQuantity,
      maxQuantity,
      ORDERBOOK_TABLE_WIDTH,
    ),
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
  return `${padRight(formatTradeTime(trade), 13)}${padRight(
    formatCompactDecimal(trade.price, 2),
    9,
  )}${formatCompactDecimal(resolveTradeSize(trade), 3)}`;
}

function getBestBidPrice(levels: OrderBookLevel[]) {
  return levels.reduce<{ raw: string; value: number } | null>((best, level) => {
    const value = Number(level.price);
    if (!Number.isFinite(value)) {
      return best;
    }

    if (!best || value > best.value) {
      return { raw: String(level.price), value };
    }

    return best;
  }, null);
}

function getBestAskPrice(levels: OrderBookLevel[]) {
  return levels.reduce<{ raw: string; value: number } | null>((best, level) => {
    const value = Number(level.price);
    if (!Number.isFinite(value)) {
      return best;
    }

    if (!best || value < best.value) {
      return { raw: String(level.price), value };
    }

    return best;
  }, null);
}

function countDecimalPlaces(value: string | number) {
  const normalized = String(value).trim();
  if (normalized.length === 0) {
    return 0;
  }

  const exponentMatch = normalized.match(/e-(\d+)$/i);
  if (exponentMatch) {
    return Number(exponentMatch[1]);
  }

  const parts = normalized.split('.');
  return parts[1]?.length ?? 0;
}

function getCumulativeOrderBookQuantities(levels: OrderBookLevel[]) {
  let runningTotal = 0;

  return levels.map((level) => {
    const quantity = Number(level.qty);
    if (Number.isFinite(quantity) && quantity > 0) {
      runningTotal += quantity;
    }

    return runningTotal;
  });
}

function renderOrderBookHeatRow(input: {
  row: OrderBookDisplayRow;
  color: string;
  backgroundColor: string;
  bold: boolean;
  heatAlign: 'start' | 'end';
}) {
  if (!input.row.text) {
    return <Text color={MUTED_COLOR}> </Text>;
  }

  const segments = getOrderBookHeatSegments(
    input.row.text,
    input.row.heatWidth,
    input.heatAlign,
  );

  return (
    <>
      {segments.leading ? (
        <Text color={input.color}>{segments.leading}</Text>
      ) : null}
      {segments.highlighted ? (
        <Text
          backgroundColor={input.backgroundColor}
          color={input.color}
          bold={input.bold}
        >
          {segments.highlighted}
        </Text>
      ) : null}
      {segments.trailing ? (
        <Text color={input.color}>{segments.trailing}</Text>
      ) : null}
    </>
  );
}

export function getOrderBookHeatSegments(
  text: string,
  heatWidth: number,
  heatAlign: 'start' | 'end',
  rowWidth = text.length,
) {
  const boundedRowWidth = Math.max(text.length, rowWidth);
  const boundedHeatWidth = Math.min(Math.max(0, heatWidth), boundedRowWidth);
  const rowText =
    heatAlign === 'end'
      ? `${' '.repeat(Math.max(0, boundedRowWidth - text.length))}${text}`
      : `${text}${' '.repeat(Math.max(0, boundedRowWidth - text.length))}`;

  if (heatAlign === 'end') {
    return {
      leading: rowText.slice(0, boundedRowWidth - boundedHeatWidth),
      highlighted: rowText.slice(boundedRowWidth - boundedHeatWidth),
      trailing: '',
    };
  }

  return {
    leading: '',
    highlighted: rowText.slice(0, boundedHeatWidth),
    trailing: rowText.slice(boundedHeatWidth),
  };
}

function resolveTradeSize(trade: TradeItem): string | number {
  return trade.qty ?? trade.filledQty ?? trade.amount ?? trade.size ?? '';
}

function formatTradeTime(trade: TradeItem) {
  const numericTime = Number(trade.time);
  if (Number.isFinite(numericTime)) {
    const timestamp =
      numericTime > 1_000_000_000_000 ? numericTime : numericTime * 1000;
    return formatLocalTimeOfDayWithMilliseconds(timestamp);
  }

  if (trade.createdAt) {
    const parsed = Date.parse(trade.createdAt);
    if (Number.isFinite(parsed)) {
      return formatLocalTimeOfDayWithMilliseconds(parsed);
    }
  }

  return '--:--:--.---';
}

export function formatPercentChange(value?: number) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  const prefix = (value as number) > 0 ? '+' : '';
  return `${prefix}${(value as number).toFixed(2)}%`;
}

export function getPriceChangeColor(value?: number) {
  if (!Number.isFinite(value) || value === 0) {
    return MUTED_COLOR;
  }

  return (value as number) > 0 ? BUY_COLOR : SELL_COLOR;
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

export function getLiveStatusDotSegment(): StatusSegment {
  return {
    key: 'orderbook-status-dot',
    text: ' ●',
    color: BUY_COLOR,
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
