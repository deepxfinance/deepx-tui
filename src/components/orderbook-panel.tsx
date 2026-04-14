import { Box, Text } from 'ink';
import type { FC } from 'react';

import { padRight } from '../lib/format';

const SELL_COLOR = '#FF3131';
const BUY_COLOR = '#28DE9C';

type OrderBookLevel = {
  price: string;
  qty: string;
  value: string;
};

type OrderbookPanelProps = {
  pairLabel: string;
  latestPrice: string;
  orderbook: {
    orderSellList?: OrderBookLevel[];
    orderBuyList?: OrderBookLevel[];
  } | null;
  isConnected: boolean;
  errorMessage?: string;
  depth?: number;
};

export const OrderbookPanel: FC<OrderbookPanelProps> = ({
  pairLabel,
  latestPrice,
  orderbook,
  isConnected,
  errorMessage,
  depth = 8,
}) => {
  const rows = buildOrderBookColumns(orderbook, depth);

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
      <Text color="gray">{`Orderbook ${pairLabel}`}</Text>
      <Box justifyContent="space-between">
        <Text color={SELL_COLOR}>SELL</Text>
        <Text backgroundColor="gray" color="black">
          {` MID ${latestPrice} `}
        </Text>
        <Text color={BUY_COLOR}>BUY</Text>
      </Box>
      <Box>
        <Box flexDirection="column" width="50%" marginRight={1}>
          <Text color="gray">PRICE SIZE TOTAL</Text>
          {rows.asks.map((row) => (
            <Text key={`ask-${row}`} color={row ? SELL_COLOR : 'gray'}>
              {row || ' '}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" width="50%">
          <Text color="gray">PRICE SIZE TOTAL</Text>
          {rows.bids.map((row) => (
            <Text key={`bid-${row}`} color={row ? BUY_COLOR : 'gray'}>
              {row || ' '}
            </Text>
          ))}
        </Box>
      </Box>
      <Text color="gray">
        {isConnected ? 'Streaming orderbook' : 'Connecting orderbook...'}
      </Text>
      {errorMessage ? <Text color={SELL_COLOR}>{errorMessage}</Text> : null}
    </Box>
  );
};

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

function padRows(rows: string[], depth: number, align: 'start' | 'end') {
  if (rows.length >= depth) {
    return rows.slice(0, depth);
  }

  const blanks = Array.from({ length: depth - rows.length }, () => '');
  return align === 'end' ? [...blanks, ...rows] : [...rows, ...blanks];
}

function formatOrderBookRow(item: OrderBookLevel) {
  return `${padRight(formatCompactDecimal(item.price, 2), 9)}${padRight(
    formatCompactDecimal(item.qty, 3),
    8,
  )}${formatCompactDecimal(item.value, 2)}`;
}

function formatCompactDecimal(value: string | number, digits: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '--';
  }

  return numericValue.toFixed(digits);
}
