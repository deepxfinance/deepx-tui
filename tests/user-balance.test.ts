import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  fetchWalletPortfolio,
  getWalletPortfolioTool,
  listUserSubaccountsTool,
  SUBACCOUNT_ABI,
} from '../src/services/user-balance';
import { installMockMarketApi } from './market-api-fixture';

let restoreFetch: (() => void) | undefined;

beforeEach(() => {
  restoreFetch = installMockMarketApi();
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe('wallet portfolio tool', () => {
  const walletRecord = {
    version: 1 as const,
    network: 'deepx_devnet' as const,
    address: '0x1111000000000000000000000000000000001111',
    createdAt: '2026-04-15T00:00:00.000Z',
    crypto: {
      algorithm: 'aes-256-gcm' as const,
      kdf: 'scrypt' as const,
      saltHex: '',
      ivHex: '',
      authTagHex: '',
      ciphertextHex: '',
    },
  };

  test('uses the current Subaccount contract ABI shape', () => {
    const functionNames = SUBACCOUNT_ABI.map((item) => item.name);

    expect(functionNames).toEqual([
      'createOneClickTradingAccount',
      'delegateAccounts',
      'deleteOneClickTradingAccount',
      'deleteSubaccount',
      'disableOnClickTradingAccount',
      'enableOnClickTradingAccount',
      'initializeSubaccount',
      'oneClickTradingAccountsFor',
      'renameSubaccount',
      'setDelegateAccount',
      'setSpotMargin',
      'subaccountInfo',
      'userStats',
    ]);

    const subaccountInfo = SUBACCOUNT_ABI.find(
      (item) => item.name === 'subaccountInfo',
    );
    const userTuple = subaccountInfo?.outputs[0]?.components;

    expect(userTuple?.map((component) => component.name)).toEqual([
      'authority',
      'delegate',
      'name',
      'spot_positions',
      'borrow_positions',
      'next_order_id',
      'status',
      'is_margin_trading_enabled',
    ]);
    expect(subaccountInfo?.outputs[0]?.internalType).toBe(
      'struct Subaccount.User',
    );
  });

  test('returns unavailable when no local wallet exists', async () => {
    const result = await getWalletPortfolioTool(
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

  test('fetches balances for the first contract subaccount', async () => {
    const calls: string[] = [];
    const result = await getWalletPortfolioTool(
      { network: 'deepx_devnet' },
      {
        async readWalletRecord() {
          return walletRecord;
        },
        async fetchPerpPositions() {
          calls.push('positions:wallet');
          return [];
        },
        createContracts() {
          return {
            async userStats(user) {
              calls.push(`userStats:${user}`);
              return {
                subaccounts: [
                  {
                    subaccount: '0x2222000000000000000000000000000000002222',
                    name: '0x6d61696e',
                  },
                ],
                if_staked_quote_asset_amount: 0n,
                number_of_sub_accounts: 1,
                number_of_sub_accounts_created: 1,
              };
            },
            async subaccountInfo(account) {
              calls.push(`subaccountInfo:${account}`);
              return {
                spot_positions: [],
                borrow_positions: [],
              };
            },
            async getOraclePriceAll() {
              return [];
            },
            async totalCollateralAndMarginRequiredFor(account) {
              calls.push(`margin:${account}`);
              return {
                collateral: 0n,
                margin_required: 0n,
              };
            },
            async assetPools() {
              return [];
            },
          };
        },
      },
    );

    expect(result).toMatchObject({
      status: 'success',
      walletAddress: '0x1111000000000000000000000000000000001111',
      subaccountAddress: '0x2222000000000000000000000000000000002222',
    });
    expect(calls).toContain(
      'userStats:0x1111000000000000000000000000000000001111',
    );
    expect(calls).toContain(
      'subaccountInfo:0x2222000000000000000000000000000000002222',
    );
    expect(calls).not.toContain(
      'subaccountInfo:0x1111000000000000000000000000000000001111',
    );
    expect(calls).toContain('positions:wallet');
  });

  test('returns unavailable when the wallet has no contract subaccounts', async () => {
    const result = await getWalletPortfolioTool(
      { network: 'deepx_devnet' },
      {
        async readWalletRecord() {
          return walletRecord;
        },
        createContracts() {
          return {
            async userStats() {
              return {
                subaccounts: [],
                if_staked_quote_asset_amount: 0n,
                number_of_sub_accounts: 0,
                number_of_sub_accounts_created: 0,
              };
            },
            async subaccountInfo() {
              throw new Error('subaccountInfo should not be called');
            },
            async getOraclePriceAll() {
              return [];
            },
            async totalCollateralAndMarginRequiredFor() {
              return {
                collateral: 0n,
                margin_required: 0n,
              };
            },
            async assetPools() {
              return [];
            },
          };
        },
      },
    );

    expect(result).toEqual({
      status: 'unavailable',
      network: 'deepx_devnet',
      summary:
        'No subaccount found for 0x1111000000000000000000000000000000001111 on deepx_devnet. Create or initialize a subaccount first.',
    });
  });

  test('lists all contract subaccounts for the local wallet', async () => {
    const result = await listUserSubaccountsTool(
      { network: 'deepx_devnet' },
      {
        async readWalletRecord() {
          return walletRecord;
        },
        createContracts() {
          return {
            async userStats(user) {
              expect(user).toBe(walletRecord.address);
              return {
                subaccounts: [
                  {
                    subaccount: '0x2222000000000000000000000000000000002222',
                    name: '0x6d61696e',
                  },
                  {
                    subaccount: '0x3333000000000000000000000000000000003333',
                    name: '0x',
                  },
                ],
                if_staked_quote_asset_amount: 12n,
                number_of_sub_accounts: 2,
                number_of_sub_accounts_created: 5,
              };
            },
            async subaccountInfo() {
              throw new Error('subaccountInfo should not be called');
            },
            async getOraclePriceAll() {
              return [];
            },
            async totalCollateralAndMarginRequiredFor() {
              return {
                collateral: 0n,
                margin_required: 0n,
              };
            },
            async assetPools() {
              return [];
            },
          };
        },
      },
    );

    expect(result).toEqual({
      status: 'success',
      network: 'deepx_devnet',
      walletAddress: walletRecord.address,
      subaccounts: [
        {
          address: '0x2222000000000000000000000000000000002222',
          name: 'main',
        },
        {
          address: '0x3333000000000000000000000000000000003333',
          name: 'Subaccount 2',
        },
      ],
      numberOfSubaccounts: 2,
      numberOfSubaccountsCreated: 5,
      ifStakedQuoteAssetAmount: '12',
      summary:
        'Found 2 active subaccount(s) for 0x1111000000000000000000000000000000001111 on deepx_devnet.\n' +
        'Total created: 5.\n' +
        '1. main: 0x2222000000000000000000000000000000002222\n' +
        '2. Subaccount 2: 0x3333000000000000000000000000000000003333',
    });
  });

  test('returns unavailable for subaccount listing when no local wallet exists', async () => {
    const result = await listUserSubaccountsTool(
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

  test('builds a live wallet portfolio summary from contract data', async () => {
    const result = await fetchWalletPortfolio({
      network: 'deepx_devnet',
      walletAddress: '0x1234000000000000000000000000000000005678',
      subaccountAddress: '0x1234000000000000000000000000000000005678',
      fetchPerpPositions: async () => [
        {
          marketId: 3,
          isLong: true,
          baseAssetAmount: 500_000_000_000_000_000n,
          entryPrice: 1_900_000_000n,
          leverage: 0,
          lastFundingRate: 0n,
          isolatedMargin: 0n,
          version: 1n,
          unrealizedPnl: 0n,
          realizedPnl: 0n,
          fundingPayment: 0n,
          owner: '0x1234000000000000000000000000000000005678',
          takeProfit: 0n,
          stopLoss: 0n,
          liquidatePrice: 0n,
        },
        {
          marketId: 4,
          isLong: false,
          baseAssetAmount: 4_000_000_000n,
          entryPrice: 120_000_000n,
          leverage: 0,
          lastFundingRate: 0n,
          isolatedMargin: 0n,
          version: 1n,
          unrealizedPnl: 0n,
          realizedPnl: 0n,
          fundingPayment: 0n,
          owner: '0x1234000000000000000000000000000000005678',
          takeProfit: 0n,
          stopLoss: 0n,
          liquidatePrice: 0n,
        },
      ],
      contracts: {
        async userStats() {
          return {
            subaccounts: [
              {
                subaccount: '0x1234000000000000000000000000000000005678',
                name: '0x6d61696e',
              },
            ],
            if_staked_quote_asset_amount: 0n,
            number_of_sub_accounts: 1,
            number_of_sub_accounts_created: 1,
          };
        },
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

    expect(result.positions).toEqual([
      {
        marketId: 3,
        pair: 'ETH-USDC',
        side: 'LONG',
        size: '0.5',
        entryPrice: '1900.0',
        markPrice: '2000.0',
        unrealizedPnl: '50.0',
        unrealizedPnlDisplay: '$50.00',
      },
      {
        marketId: 4,
        pair: 'SOL-USDC',
        side: 'SHORT',
        size: '4.0',
        entryPrice: '120.0',
        markPrice: '150.0',
        unrealizedPnl: '-120.0',
        unrealizedPnlDisplay: '-$120.00',
      },
    ]);

    expect(result.summary).toContain('total value $3,730.00');
    expect(result.summary).toContain('wallet portfolio');
    expect(result.summary).toContain('positions unrealized PnL -$70.00');
    expect(result.summary).toContain('margin ratio 5.37');
  });
});
