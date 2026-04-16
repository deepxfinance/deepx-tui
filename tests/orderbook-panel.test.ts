import { describe, expect, test } from 'bun:test';

import {
  buildOrderBookColumns,
  buildOrderBookDisplayRows,
  buildOrderBookRowKey,
  buildOrderbookBlinkSignatures,
  buildTradeRowKey,
  buildTradeRows,
  calculateOrderBookHeatWidth,
  createEmptyBlinkFrames,
  DEFAULT_ORDERBOOK_DEPTH,
  decayBlinkFrames,
  formatPercentChange,
  formatVolume,
  getLiveStatusDotSegment,
  getOrderbookHeaderRow,
  getOrderbookStatusSegments,
  getTradesHeaderRow,
  hasActiveBlinkFrames,
  isBlinkVisible,
  mergeBlinkFramesForChangedSections,
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

  test('calculates orderbook heat widths from relative size', () => {
    expect(calculateOrderBookHeatWidth('0', 5, 25)).toBe(0);
    expect(calculateOrderBookHeatWidth('1', 4, 24)).toBe(6);
    expect(calculateOrderBookHeatWidth('4', 4, 24)).toBe(24);
  });

  test('builds display rows with right-anchored heat widths', () => {
    const rows = buildOrderBookDisplayRows(
      {
        orderSellList: [
          { price: '101', qty: '1', value: '101' },
          { price: '102', qty: '4', value: '408' },
        ],
        orderBuyList: [
          { price: '99', qty: '2', value: '198' },
          { price: '98', qty: '1', value: '98' },
        ],
      },
      2,
    );

    expect(rows.asks).toEqual([
      { text: '102.00     4.000     408.00', heatWidth: 27 },
      { text: '101.00     1.000     101.00', heatWidth: 7 },
    ]);
    expect(rows.bids).toEqual([
      { text: '99.00      2.000     198.00', heatWidth: 27 },
      { text: '98.00      1.000     98.00', heatWidth: 13 },
    ]);
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

  test('builds deterministic latest trade rows in the local timezone', () => {
    const originalResolvedOptions =
      Intl.DateTimeFormat.prototype.resolvedOptions;

    Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
      return {
        ...originalResolvedOptions.call(this),
        timeZone: 'America/New_York',
      };
    };

    try {
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
        { value: '11:00:00  99.50    0.450', isBuy: true },
        { value: '11:00:05  99.25    0.100', isBuy: false },
      ]);
    } finally {
      Intl.DateTimeFormat.prototype.resolvedOptions = originalResolvedOptions;
    }
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

  test('builds a live status label with a breathing dot', () => {
    const segments = getOrderbookStatusSegments(3, true);

    expect(segments).toEqual([
      {
        key: 'orderbook-status-live',
        text: 'Live',
        color: '#28DE9C',
        dimColor: false,
        bold: false,
      },
      {
        key: 'orderbook-status-dot',
        text: ' ●',
        color: '#28DE9C',
        dimColor: false,
        bold: true,
      },
    ]);
  });

  test('cycles the breathing dot emphasis deterministically', () => {
    expect(getLiveStatusDotSegment(0)).toEqual({
      key: 'orderbook-status-dot',
      text: ' ●',
      color: '#1E9F6E',
      dimColor: false,
      bold: false,
    });
    expect(getLiveStatusDotSegment(2)).toEqual({
      key: 'orderbook-status-dot',
      text: ' ●',
      color: '#28DE9C',
      dimColor: false,
      bold: true,
    });
    expect(getLiveStatusDotSegment(5)).toEqual({
      key: 'orderbook-status-dot',
      text: ' ●',
      color: '#0F5C41',
      dimColor: false,
      bold: false,
    });
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

  test('builds stable blink signatures for orderbook sections', () => {
    expect(
      buildOrderbookBlinkSignatures({
        latestPrice: '100.25',
        priceChange1h: 1.2,
        priceChange24h: -3.4,
        volume24h: 5000,
        orderbook: {
          orderSellList: [{ price: '101', qty: '1', value: '101' }],
          orderBuyList: [{ price: '99', qty: '2', value: '198' }],
        },
        trades: [
          {
            id: 'trade-1',
            price: '100',
            qty: '0.5',
            filledDirection: 'BUY',
            time: 123,
          },
        ],
      }),
    ).toEqual({
      mid: '100.25',
      stats: '1.2|-3.4|5000',
      asks: '101:1:101',
      bids: '99:2:198',
      trades: 'trade-1:100:0.5::::BUY:::123',
    });
  });

  test('starts blink frames only for changed non-empty sections', () => {
    expect(
      mergeBlinkFramesForChangedSections(
        createEmptyBlinkFrames(),
        {
          mid: '100.00',
          stats: '1|2|3',
          asks: '101:1:101',
          bids: '99:2:198',
          trades: 't1',
        },
        {
          mid: '101.00',
          stats: '1|2|3',
          asks: '102:1:102',
          bids: '99:2:198',
          trades: '',
        },
      ),
    ).toEqual({
      mid: 6,
      stats: 0,
      asks: 6,
      bids: 0,
      trades: 0,
    });
  });

  test('decays blink frames deterministically', () => {
    expect(
      decayBlinkFrames({
        mid: 2,
        stats: 1,
        asks: 0,
        bids: 3,
        trades: 4,
      }),
    ).toEqual({
      mid: 1,
      stats: 0,
      asks: 0,
      bids: 2,
      trades: 3,
    });
    expect(hasActiveBlinkFrames(createEmptyBlinkFrames())).toBe(false);
    expect(
      hasActiveBlinkFrames({
        mid: 0,
        stats: 0,
        asks: 0,
        bids: 1,
        trades: 0,
      }),
    ).toBe(true);
    expect(isBlinkVisible(6)).toBe(true);
    expect(isBlinkVisible(5)).toBe(false);
    expect(isBlinkVisible(0)).toBe(false);
  });
});
