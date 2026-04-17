import { describe, expect, test } from 'bun:test';

import {
  buildOrderBookColumns,
  buildOrderBookDisplayRows,
  buildOrderBookRowKey,
  buildTradeRowKey,
  buildTradeRows,
  calculateOrderBookHeatWidth,
  DEFAULT_ORDERBOOK_DEPTH,
  formatPercentChange,
  formatVolume,
  getLiveStatusDotSegment,
  getMidPriceLabel,
  getOrderBookHeatSegments,
  getOrderbookHeaderRow,
  getOrderbookStatusSegments,
  getPriceChangeColor,
  getTradesHeaderRow,
} from '../src/components/orderbook-panel';

describe('orderbook panel', () => {
  test('keeps the top rows closest to mid price on both sides', () => {
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
      '101.00     1.200     121.20',
      '102.00     0.800     81.60',
    ]);
    expect(columns.bids).toEqual([
      '99.00      2.000     198.00',
      '98.00      1.500     147.00',
    ]);
  });

  test('pads empty orderbook rows deterministically', () => {
    const columns = buildOrderBookColumns(null, 2);

    expect(columns.asks).toEqual(['Waiting for asks...', '']);
    expect(columns.bids).toEqual(['Waiting for bids...', '']);
  });

  test('calculates orderbook heat widths from relative size', () => {
    expect(calculateOrderBookHeatWidth('0', 5, 25)).toBe(0);
    expect(calculateOrderBookHeatWidth('1', 4, 24)).toBe(6);
    expect(calculateOrderBookHeatWidth('4', 4, 24)).toBe(24);
  });

  test('anchors heat segments to the requested side of the row', () => {
    expect(getOrderBookHeatSegments('ABCDE', 2, 'start')).toEqual({
      leading: '',
      highlighted: 'AB',
      trailing: 'CDE',
    });
    expect(getOrderBookHeatSegments('ABCDE', 2, 'end')).toEqual({
      leading: 'ABC',
      highlighted: 'DE',
      trailing: '',
    });
  });

  test('extends heat segments against the fixed table width', () => {
    expect(getOrderBookHeatSegments('ABCDE', 7, 'start', 7)).toEqual({
      leading: '',
      highlighted: 'ABCDE  ',
      trailing: '',
    });
    expect(getOrderBookHeatSegments('ABCDE', 7, 'end', 7)).toEqual({
      leading: '',
      highlighted: '  ABCDE',
      trailing: '',
    });
  });

  test('builds display rows with cumulative depth widths from the mid outward', () => {
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
      { text: '101.00     1.000     101.00', heatWidth: 7 },
      { text: '102.00     4.000     408.00', heatWidth: 31 },
    ]);
    expect(rows.bids).toEqual([
      { text: '99.00      2.000     198.00', heatWidth: 21 },
      { text: '98.00      1.000     98.00', heatWidth: 31 },
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

  test('maps price change direction to exchange colors', () => {
    expect(getPriceChangeColor(undefined)).toBe('gray');
    expect(getPriceChangeColor(0)).toBe('gray');
    expect(getPriceChangeColor(1.5)).toBe('#28DE9C');
    expect(getPriceChangeColor(-1.5)).toBe('#FF3131');
  });

  test('pads table headers to the same columns as the data rows', () => {
    expect(getOrderbookHeaderRow()).toBe('PRICE      SIZE      TOTAL');
    expect(getTradesHeaderRow()).toBe('TIME      PRICE    SIZE');
  });

  test('calculates mid price from the best bid and best ask', () => {
    expect(
      getMidPriceLabel(
        {
          orderSellList: [
            { price: '101.00', qty: '1', value: '101' },
            { price: '101.50', qty: '2', value: '203' },
          ],
          orderBuyList: [
            { price: '99.00', qty: '1', value: '99' },
            { price: '100.00', qty: '2', value: '200' },
          ],
        },
        '98.00',
      ),
    ).toBe('100.50');
  });

  test('keeps mid price precision from orderbook and fallback labels', () => {
    expect(
      getMidPriceLabel(
        {
          orderSellList: [{ price: '101.1250', qty: '1', value: '101.1250' }],
          orderBuyList: [{ price: '100.8750', qty: '1', value: '100.8750' }],
        },
        '100.0000',
      ),
    ).toBe('101.0000');
  });

  test('falls back to the latest price when both sides are not available', () => {
    expect(
      getMidPriceLabel(
        {
          orderSellList: [{ price: '101.00', qty: '1', value: '101' }],
          orderBuyList: [],
        },
        '99.25',
      ),
    ).toBe('99.25');
    expect(getMidPriceLabel(null, '99.25')).toBe('99.25');
  });

  test('builds a live status label with a static dot', () => {
    const segments = getOrderbookStatusSegments({
      kind: 'live',
      isConnected: true,
    });

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
        bold: false,
      },
    ]);
  });

  test('keeps the live status dot static', () => {
    expect(getLiveStatusDotSegment()).toEqual({
      key: 'orderbook-status-dot',
      text: ' ●',
      color: '#28DE9C',
      dimColor: false,
      bold: false,
    });
  });

  test('keeps the connecting orderbook status static', () => {
    const segments = getOrderbookStatusSegments({
      kind: 'live',
      isConnected: false,
    });

    expect(segments.map((segment) => segment.text).join('')).toBe(
      'Connecting orderbook...',
    );
    expect(segments.every((segment) => segment.color === undefined)).toBe(true);
    expect(segments.every((segment) => segment.dimColor)).toBe(true);
    expect(segments.every((segment) => !segment.bold)).toBe(true);
  });

  test('renders a frozen snapshot status label', () => {
    expect(
      getOrderbookStatusSegments({
        kind: 'snapshot',
        timeLabel: '14:23:11',
      }),
    ).toEqual([
      {
        key: 'orderbook-status-snapshot',
        text: 'Snapshot 14:23:11',
        color: '#D7E3F4',
        dimColor: false,
        bold: false,
      },
    ]);
  });
});
