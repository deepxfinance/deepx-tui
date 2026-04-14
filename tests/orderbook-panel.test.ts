import { describe, expect, test } from 'bun:test';

import {
  buildOrderBookColumns,
  buildOrderBookRowKey,
  DEFAULT_ORDERBOOK_DEPTH,
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
      '102.00   0.800   81.60',
      '101.00   1.200   121.20',
    ]);
    expect(columns.bids).toEqual([
      '99.00    2.000   198.00',
      '98.00    1.500   147.00',
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
});
