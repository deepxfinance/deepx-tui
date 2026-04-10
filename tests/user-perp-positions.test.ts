import { describe, expect, test } from 'bun:test';
import { parseUnits } from 'ethers';

import { getNetworkConfig } from '../src/config/networks';
import { getMarketPairs } from '../src/services/market-catalog';
import {
  buildPositionPanelRows,
  mergePerpPositions,
  type PerpPosition,
  parseUserPerpPositionsMessage,
} from '../src/services/user-perp-positions';

const walletAddress = '0x1234000000000000000000000000000000005678';
const perpPairs = getMarketPairs(getNetworkConfig('devnet')).filter(
  (pair) => pair.kind === 'perp',
);

describe('parseUserPerpPositionsMessage', () => {
  test('maps websocket payloads into normalized perp positions', () => {
    const message = JSON.stringify({
      channel: 'user_perp_positions',
      market: { id: 3 },
      data: {
        address: walletAddress.toUpperCase(),
        positions: {
          items: [
            {
              market_id: 3,
              is_long: true,
              base_asset_amount: '0.125',
              entry_price: '1820.5',
              leverage: 10,
              last_funding_rate: '0',
              isolated_margin: '25',
              version: 2,
              unrealized_pnl: '12.5',
              realized_pnl: '0',
              funding_payment: '-1.25',
              owner: walletAddress,
              take_profit: '1900',
              stop_loss: '1750',
              liquidate_price: '1600',
            },
          ],
        },
      },
    });

    const parsed = parseUserPerpPositionsMessage(
      message,
      walletAddress,
      perpPairs,
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.marketId).toBe(3);
    expect(parsed?.owner).toBe(walletAddress.toLowerCase());
    expect(parsed?.positions).toHaveLength(1);
    expect(parsed?.positions[0]).toMatchObject({
      marketId: 3,
      isLong: true,
      leverage: 10,
      owner: walletAddress,
    });
    expect(parsed?.positions[0]?.baseAssetAmount).toBe(parseUnits('0.125', 18));
    expect(parsed?.positions[0]?.entryPrice).toBe(parseUnits('1820.5', 6));
    expect(parsed?.positions[0]?.fundingPayment).toBe(parseUnits('-1.25', 6));
  });

  test('ignores other addresses and zero-size payload items', () => {
    const parsed = parseUserPerpPositionsMessage(
      JSON.stringify({
        channel: 'user_perp_positions',
        data: {
          address: '0x9999000000000000000000000000000000009999',
          positions: {
            items: [{ market_id: 3, base_asset_amount: '1' }],
          },
        },
      }),
      walletAddress,
      perpPairs,
    );

    const zeroSized = parseUserPerpPositionsMessage(
      JSON.stringify({
        channel: 'user_perp_positions',
        data: {
          address: walletAddress,
          positions: {
            items: [{ market_id: 3, base_asset_amount: '0' }],
          },
        },
      }),
      walletAddress,
      perpPairs,
    );

    expect(parsed).toBeNull();
    expect(zeroSized?.positions).toEqual([]);
  });
});

describe('mergePerpPositions', () => {
  test('replaces market-specific snapshots for the same owner', () => {
    const existing = [
      createPosition({ marketId: 3, owner: walletAddress, unrealizedPnl: '5' }),
      createPosition({ marketId: 4, owner: walletAddress, unrealizedPnl: '2' }),
    ];
    const incoming = [
      createPosition({ marketId: 3, owner: walletAddress, unrealizedPnl: '8' }),
    ];

    const merged = mergePerpPositions(existing, incoming, walletAddress, 3);

    expect(merged).toHaveLength(2);
    expect(
      merged.find((position) => position.marketId === 3)?.unrealizedPnl,
    ).toBe(parseUnits('8', 6));
    expect(merged.find((position) => position.marketId === 4)).toBeDefined();
  });
});

describe('buildPositionPanelRows', () => {
  test('formats compact table rows with live pnl when overview prices exist', () => {
    const rows = buildPositionPanelRows({
      positions: [
        createPosition({
          marketId: 3,
          isLong: true,
          baseAssetAmount: '0.125',
          entryPrice: '1820.5',
          leverage: 10,
          unrealizedPnl: '1',
        }),
      ],
      pairs: perpPairs,
      overview: {
        'ETH-USDC': { latestPrice: 1900 },
      },
      maxRows: 3,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toContain('ETH-USDC');
    expect(rows[0]?.text).toContain('LONG10x');
    expect(rows[0]?.text).toContain('0.125');
    expect(rows[0]?.text).toContain('1820.5');
    expect(rows[0]?.text).toContain('+9.93');
    expect(rows[0]?.tone).toBe('green');
  });

  test('returns an empty-state row when there are no positions', () => {
    const rows = buildPositionPanelRows({
      positions: [],
      pairs: perpPairs,
      overview: {},
      maxRows: 2,
    });

    expect(rows).toEqual([
      {
        key: 'empty',
        text: 'No open perp positions.',
        tone: 'gray',
      },
    ]);
  });
});

function createPosition(input: {
  marketId: number;
  owner?: string;
  isLong?: boolean;
  baseAssetAmount?: string;
  entryPrice?: string;
  leverage?: number;
  unrealizedPnl?: string;
}): PerpPosition {
  return {
    marketId: input.marketId,
    isLong: input.isLong ?? true,
    baseAssetAmount: parseUnits(
      input.baseAssetAmount ?? '1',
      getBaseDecimals(input.marketId),
    ),
    entryPrice: parseUnits(input.entryPrice ?? '100', 6),
    leverage: input.leverage ?? 5,
    lastFundingRate: 0n,
    isolatedMargin: 0n,
    version: 1n,
    unrealizedPnl: parseUnits(input.unrealizedPnl ?? '0', 6),
    realizedPnl: 0n,
    fundingPayment: 0n,
    owner: input.owner ?? walletAddress,
    takeProfit: 0n,
    stopLoss: 0n,
    liquidatePrice: 0n,
  };
}

function getBaseDecimals(marketId: number) {
  return (
    perpPairs.find((pair) => pair.marketId === marketId)?.baseDecimals ?? 18
  );
}
