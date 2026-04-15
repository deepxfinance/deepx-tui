import { describe, expect, test } from 'bun:test';

import {
  buildOrderBookColumns,
  buildOrderBookRowKey,
  buildTradeRowKey,
  buildTradeRows,
  DEFAULT_ORDERBOOK_DEPTH,
  formatPercentChange,
  formatVolume,
  getOrderbookHeaderRow,
  getOrderbookStatusSegments,
  getTradesHeaderRow,
} from '../src/components/orderbook-panel';

describe('orderbook panel', () => {
  test('builds sell-left and buy-right columns from orderbook levels', () => {
    const columns = buildOrderBookColumns(
      {
        orderSellList: [
          { price: '101', qty: '1.2', value: '121.2' },
          { price: '102', qty: '0.8', value: '81.6' },
        ],
        orderBuyList: [
          { price: '99', qty: '2', value: '198' },
          { price: '98', qty: '1.5', value: '147' },
        ],
      },
      2,
    );

    expect(columns.asks).toEqual([
      '102.00     0.800     81.60',
      '101.00     1.200     121.20',
    ]);
    expect(columns.bids).toEqual([
      '99.00      2.000     198.00',
      '98.00      1.500     147.00',
    ]);
  });

  test('pads empty orderbook rows deterministically', () => {
    const columns = buildOrderBookColumns(null, 2);

    expect(columns.asks).toEqual(['', 'Waiting for asks...']);
    expect(columns.bids).toEqual(['Waiting for bids...', '']);
  });

  test('builds unique row keys from side and index', () => {
    expect([
      buildOrderBookRowKey('ask', 0),
      buildOrderBookRowKey('ask', 1),
      buildOrderBookRowKey('bid', 0),
    ]).toEqual(['ask-0', 'ask-1', 'bid-0']);
  });

  test('defaults the orderbook depth to 20 rows per side', () => {
    expect(DEFAULT_ORDERBOOK_DEPTH).toBe(20);
    expect(
      buildOrderBookColumns(null, DEFAULT_ORDERBOOK_DEPTH).asks,
    ).toHaveLength(20);
    expect(
      buildOrderBookColumns(null, DEFAULT_ORDERBOOK_DEPTH).bids,
    ).toHaveLength(20);
  });

  test('builds deterministic latest trade rows', () => {
    expect(
      buildTradeRows(
        [
          {
            price: '99.5',
            qty: '0.45',
            time: 1_710_000_000,
            filledDirection: 'BUY',
          },
          {
            price: '99.25',
            filledQty: '0.1',
            createdAt: '2024-03-09T16:00:05.000Z',
            filledDirection: 'SELL',
          },
        ],
        2,
      ),
    ).toEqual([
      { value: '16:00:00  99.50    0.450', isBuy: true },
      { value: '16:00:05  99.25    0.100', isBuy: false },
    ]);
  });

  test('pads empty latest trade rows deterministically', () => {
    expect(buildTradeRows([], 2)).toEqual([
      { value: 'Waiting for trades...', isBuy: true },
      { value: '', isBuy: true },
    ]);
  });

  test('builds unique trade row keys from index', () => {
    expect([buildTradeRowKey(0), buildTradeRowKey(1)]).toEqual([
      'trade-0',
      'trade-1',
    ]);
  });

  test('formats compact orderbook stats for the header', () => {
    expect(formatPercentChange(undefined)).toBe('--');
    expect(formatPercentChange(1.234)).toBe('+1.23%');
    expect(formatPercentChange(-5)).toBe('-5.00%');
    expect(formatVolume(undefined)).toBe('--');
    expect(formatVolume(987.6)).toBe('987.60');
    expect(formatVolume(12_345)).toBe('12.35K');
    expect(formatVolume(9_876_543)).toBe('9.88M');
  });

  test('pads table headers to the same columns as the data rows', () => {
    expect(getOrderbookHeaderRow()).toBe('PRICE      SIZE      TOTAL');
    expect(getTradesHeaderRow()).toBe('TIME      PRICE    SIZE');
  });

  test('builds shimmer segments for the live orderbook status', () => {
    const segments = getOrderbookStatusSegments(3, true);

    expect(segments.map((segment) => segment.text).join('')).toBe('Live');
    expect(segments.some((segment) => segment.color !== undefined)).toBe(true);
    expect(segments.some((segment) => segment.bold)).toBe(true);
  });

  test('keeps the connecting orderbook status static', () => {
    const segments = getOrderbookStatusSegments(5, false);

    expect(segments.map((segment) => segment.text).join('')).toBe(
      'Connecting orderbook...',
    );
    expect(segments.every((segment) => segment.color === undefined)).toBe(true);
    expect(segments.every((segment) => segment.dimColor)).toBe(true);
    expect(segments.every((segment) => !segment.bold)).toBe(true);
  });
});
