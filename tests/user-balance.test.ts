import { describe, expect, test } from 'bun:test';

import {
  fetchUserBalance,
  getUserBalanceTool,
} from '../src/services/user-balance';

describe('user balance tool', () => {
  test('returns unavailable when no local wallet exists', async () => {
    const result = await getUserBalanceTool(
      { network: 'deepx_devnet' },
      {
        async readWalletRecord() {
          return null;
        },
      },
    );

    expect(result).toEqual({
      status: 'unavailable',
      network: 'deepx_devnet',
      summary:
        'No local wallet found for deepx_devnet. Import or unlock a wallet first.',
    });
  });

  test('builds a live balance summary from contract data', async () => {
    const result = await fetchUserBalance({
      network: 'deepx_devnet',
      walletAddress: '0x1234000000000000000000000000000000005678',
      subaccountAddress: '0x1234000000000000000000000000000000005678',
      contracts: {
        async subaccountInfo() {
          return {
            spot_positions: [
              {
                symbol:
                  '0x5553444300000000000000000000000000000000000000000000000000000000',
                token_amount: 250_000_000n,
              },
              {
                symbol:
                  '0x4554480000000000000000000000000000000000000000000000000000000000',
                token_amount: 2_000_000_000_000_000_000n,
              },
            ],
            borrow_positions: [
              {
                asset: '0x736f6c',
                amount: 3_000_000_000n,
                interest: 500_000_000n,
              },
            ],
          };
        },
        async getOraclePriceAll() {
          return [
            {
              symbol:
                '0x4554482d55534443000000000000000000000000000000000000000000000000',
              price: 2_000_000_000n,
            },
            {
              symbol:
                '0x534f4c2d55534443000000000000000000000000000000000000000000000000',
              price: 150_000_000n,
            },
          ];
        },
        async totalCollateralAndMarginRequiredFor(_account, weightDirection) {
          return weightDirection === 0
            ? {
                collateral: 4_300_000_000n,
                margin_required: 1_000_000_000n,
              }
            : {
                collateral: 4_300_000_000n,
                margin_required: 800_000_000n,
              };
        },
        async userPerpPositions() {
          return [
            {
              market_id: 3,
              is_long: true,
              base_asset_amount: 500_000_000_000_000_000n,
              entry_price: 1_900_000_000n,
            },
            {
              market_id: 4,
              is_long: false,
              base_asset_amount: 4_000_000_000n,
              entry_price: 120_000_000n,
            },
          ];
        },
        async assetPools() {
          return [
            {
              market_id: 1,
              initial_asset_weight: 10_000n,
            },
            {
              market_id: 3,
              initial_asset_weight: 8_000n,
            },
            {
              market_id: 4,
              initial_asset_weight: 7_000n,
            },
          ];
        },
      },
    });

    expect(result).toMatchObject({
      status: 'success',
      network: 'deepx_devnet',
      walletAddress: '0x1234000000000000000000000000000000005678',
      totalDeposits: '4250.0',
      totalBorrowed: '450.0',
      totalUnrealizedPnl: '-70.0',
      totalValue: '3730.0',
      netValue: '3300.0',
      totalCollateral: '4300.0',
      totalMarginRequired: '1000.0',
      totalMaintenanceMarginRequired: '800.0',
      marginRatio: '5.37',
      totalValueDisplay: '$3,730.00',
      totalBorrowedDisplay: '$450.00',
      totalUnrealizedPnlDisplay: '-$70.00',
    });

    expect(result.assets).toEqual([
      {
        symbol: 'USDC',
        name: 'USDC',
        address: '0x9eb03d8ac62ae18398ced13c033db78b905ad8c9',
        decimals: 6,
        price: '1.0',
        assetWeight: '1.0',
        balance: '250.0',
        balanceUsd: '250.0',
        balanceUsdDisplay: '$250.00',
        balanceBorrowed: '0.0',
        balanceBorrowedUsd: '0.0',
        balanceBorrowedUsdDisplay: '$0.00',
        borrowInterest: '0.0',
        borrowInterestUsd: '0.0',
      },
      {
        symbol: 'ETH',
        name: 'ETH',
        address: '0xD6c9c7078fc1Fe5065bc85f4743FAB219Bb053fd',
        decimals: 18,
        price: '2000.0',
        assetWeight: '0.8',
        balance: '2.0',
        balanceUsd: '4000.0',
        balanceUsdDisplay: '$4,000.00',
        balanceBorrowed: '0.0',
        balanceBorrowedUsd: '0.0',
        balanceBorrowedUsdDisplay: '$0.00',
        borrowInterest: '0.0',
        borrowInterestUsd: '0.0',
      },
      {
        symbol: 'SOL',
        name: 'SOL',
        address: '0x1fa7329ef1dae5c4b734b337c83466316f3bae94',
        decimals: 9,
        price: '150.0',
        assetWeight: '0.7',
        balance: '0.0',
        balanceUsd: '0.0',
        balanceUsdDisplay: '$0.00',
        balanceBorrowed: '3.0',
        balanceBorrowedUsd: '450.0',
        balanceBorrowedUsdDisplay: '$450.00',
        borrowInterest: '0.5',
        borrowInterestUsd: '75.0',
      },
    ]);

    expect(result.summary).toContain('total value $3,730.00');
    expect(result.summary).toContain('margin ratio 5.37');
  });
});
