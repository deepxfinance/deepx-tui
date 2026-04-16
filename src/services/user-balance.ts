import { Contract, formatUnits, toUtf8String } from 'ethers';

import { getNetworkConfig, type RuntimeNetwork } from '../config/networks';
import { getNetworkMarkets } from './market-catalog';
import {
  SUBACCOUNT_CONTRACT_ADDRESS,
  type UserStats,
} from './subaccount-contract';
import { createRpcProvider } from './transaction-submission';
import { fetchUserPerpPositionsSnapshot } from './user-perp-positions';
import { readWalletRecord } from './wallet-store';

const PERP_CONTRACT_ADDRESS = '0x000000000000000000000000000000000000044E';
const LENDING_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000450';
const LENDING_MARKET_ID = 1;
const USD_DECIMALS = 6;
const ASSET_WEIGHT_DECIMALS = 4;

export const SUBACCOUNT_ABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'new_account',
        type: 'address',
      },
    ],
    name: 'createOneClickTradingAccount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'user',
        type: 'address',
      },
    ],
    name: 'delegateAccounts',
    outputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'subaccount',
            type: 'address',
          },
          {
            internalType: 'bytes',
            name: 'name',
            type: 'bytes',
          },
        ],
        internalType: 'struct Subaccount.DelegateInfo[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'oct_account',
        type: 'address',
      },
    ],
    name: 'deleteOneClickTradingAccount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'subaccount',
        type: 'address',
      },
    ],
    name: 'deleteSubaccount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'disableOnClickTradingAccount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'enableOnClickTradingAccount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes',
        name: 'name',
        type: 'bytes',
      },
    ],
    name: 'initializeSubaccount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'owner',
        type: 'address',
      },
    ],
    name: 'oneClickTradingAccountsFor',
    outputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'account',
            type: 'address',
          },
          {
            internalType: 'uint8',
            name: 'mode',
            type: 'uint8',
          },
          {
            internalType: 'uint32',
            name: 'create_time',
            type: 'uint32',
          },
        ],
        internalType: 'struct Subaccount.OneClickTrading[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'subaccount',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'new_name',
        type: 'bytes',
      },
    ],
    name: 'renameSubaccount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'subaccount',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'delegate',
        type: 'address',
      },
    ],
    name: 'setDelegateAccount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'subaccount',
        type: 'address',
      },
      {
        internalType: 'bool',
        name: 'enable_spot_margin',
        type: 'bool',
      },
    ],
    name: 'setSpotMargin',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'subaccountInfo',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'authority', type: 'address' },
          { internalType: 'address', name: 'delegate', type: 'address' },
          { internalType: 'bytes', name: 'name', type: 'bytes' },
          {
            components: [
              { internalType: 'bytes', name: 'symbol', type: 'bytes' },
              {
                internalType: 'uint128',
                name: 'token_amount',
                type: 'uint128',
              },
            ],
            internalType: 'struct Subaccount.SpotPosition[]',
            name: 'spot_positions',
            type: 'tuple[]',
          },
          {
            components: [
              {
                internalType: 'uint8',
                name: 'lending_market_id',
                type: 'uint8',
              },
              { internalType: 'bytes', name: 'asset', type: 'bytes' },
              { internalType: 'uint128', name: 'amount', type: 'uint128' },
              { internalType: 'uint128', name: 'interest', type: 'uint128' },
            ],
            internalType: 'struct Subaccount.BorrowPosition[]',
            name: 'borrow_positions',
            type: 'tuple[]',
          },
          { internalType: 'uint32', name: 'next_order_id', type: 'uint32' },
          { internalType: 'uint8', name: 'status', type: 'uint8' },
          {
            internalType: 'bool',
            name: 'is_margin_trading_enabled',
            type: 'bool',
          },
        ],
        internalType: 'struct Subaccount.User',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'user',
        type: 'address',
      },
    ],
    name: 'userStats',
    outputs: [
      {
        components: [
          {
            components: [
              {
                internalType: 'address',
                name: 'subaccount',
                type: 'address',
              },
              {
                internalType: 'bytes',
                name: 'name',
                type: 'bytes',
              },
            ],
            internalType: 'struct Subaccount.SimpleSubaccount[]',
            name: 'subaccounts',
            type: 'tuple[]',
          },
          {
            internalType: 'uint64',
            name: 'if_staked_quote_asset_amount',
            type: 'uint64',
          },
          {
            internalType: 'uint16',
            name: 'number_of_sub_accounts',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'number_of_sub_accounts_created',
            type: 'uint16',
          },
        ],
        internalType: 'struct Subaccount.UserStats',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const PERP_ABI = [
  {
    inputs: [],
    name: 'getOraclePriceAll',
    outputs: [
      {
        components: [
          { internalType: 'bytes', name: 'symbol', type: 'bytes' },
          { internalType: 'uint128', name: 'price', type: 'uint128' },
        ],
        internalType: 'struct Perp.OraclePrice[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      {
        internalType: 'uint8',
        name: 'weight_direction',
        type: 'uint8',
      },
    ],
    name: 'totalCollateralAndMarginRequiredFor',
    outputs: [
      {
        components: [
          { internalType: 'uint128', name: 'collateral', type: 'uint128' },
          {
            internalType: 'uint128',
            name: 'margin_required',
            type: 'uint128',
          },
        ],
        internalType: 'struct Perp.TotalCollateralAndMargin',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      {
        internalType: 'uint16[]',
        name: 'market_id',
        type: 'uint16[]',
      },
    ],
    name: 'userPerpPositions',
    outputs: [
      {
        components: [
          { internalType: 'uint16', name: 'market_id', type: 'uint16' },
          { internalType: 'bool', name: 'is_long', type: 'bool' },
          {
            internalType: 'uint128',
            name: 'base_asset_amount',
            type: 'uint128',
          },
          { internalType: 'uint128', name: 'entry_price', type: 'uint128' },
          { internalType: 'uint8', name: 'leverage', type: 'uint8' },
          {
            internalType: 'int128',
            name: 'last_funding_rate',
            type: 'int128',
          },
          { internalType: 'uint64', name: 'version', type: 'uint64' },
          {
            internalType: 'int128',
            name: 'realized_pnl',
            type: 'int128',
          },
          {
            internalType: 'int128',
            name: 'funding_payment',
            type: 'int128',
          },
          { internalType: 'address', name: 'owner', type: 'address' },
          { internalType: 'uint128', name: 'take_profit', type: 'uint128' },
          { internalType: 'uint128', name: 'stop_loss', type: 'uint128' },
          {
            internalType: 'uint128',
            name: 'liquidate_price',
            type: 'uint128',
          },
        ],
        internalType: 'struct Perp.PerpPosition[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const LENDING_ABI = [
  {
    inputs: [
      {
        internalType: 'uint8',
        name: 'lending_market',
        type: 'uint8',
      },
    ],
    name: 'assetPools',
    outputs: [
      {
        components: [
          { internalType: 'uint8', name: 'market_id', type: 'uint8' },
          { internalType: 'bytes', name: 'asset', type: 'bytes' },
          { internalType: 'uint32', name: 'decimal', type: 'uint32' },
          {
            internalType: 'uint128',
            name: 'total_deposits',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'total_borrows',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'cumulative_deposit_interest',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'cumulative_borrow_interest',
            type: 'uint128',
          },
          {
            internalType: 'uint64',
            name: 'last_updated_slot',
            type: 'uint64',
          },
          {
            internalType: 'uint128',
            name: 'reserve_factor',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'custom_liquidation_bonus',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'initial_asset_weight',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'maintenance_asset_weight',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'initial_borrow_weight',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'maintenance_borrow_weight',
            type: 'uint128',
          },
          { internalType: 'uint128', name: 'apr_borrow', type: 'uint128' },
          { internalType: 'uint128', name: 'apr_lend', type: 'uint128' },
          {
            internalType: 'uint128',
            name: 'protocol_reserve',
            type: 'uint128',
          },
        ],
        internalType: 'struct Lending.AssetPoolState[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

type BalanceToken = {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  marketId: number;
};

type SpotPosition = {
  symbol: string;
  token_amount: bigint;
};

type BorrowPosition = {
  lending_market_id?: number;
  asset: string;
  amount: bigint;
  interest: bigint;
};

type UserSubaccountInfo = {
  authority?: string;
  delegate?: string;
  name?: string;
  spot_positions: SpotPosition[];
  borrow_positions: BorrowPosition[];
  next_order_id?: number;
  status?: number;
  is_margin_trading_enabled?: boolean;
};

type OraclePrice = {
  symbol: string;
  price: bigint;
};

type AssetPoolState = {
  market_id: number;
  initial_asset_weight: bigint;
};

type TotalCollateralAndMargin = {
  collateral: bigint;
  margin_required: bigint;
};

type WalletPortfolioContracts = {
  userStats(user: string): Promise<UserStats>;
  subaccountInfo(account: string): Promise<UserSubaccountInfo>;
  getOraclePriceAll(): Promise<OraclePrice[]>;
  totalCollateralAndMarginRequiredFor(
    account: string,
    weightDirection: number,
  ): Promise<TotalCollateralAndMargin>;
  assetPools(lendingMarketId: number): Promise<AssetPoolState[]>;
};

type WalletPortfolioDependencies = {
  readWalletRecord?: typeof readWalletRecord;
  createContracts?: (network: RuntimeNetwork) => WalletPortfolioContracts;
  fetchPerpPositions?: typeof fetchUserPerpPositionsSnapshot;
};

export type WalletPortfolioAsset = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  price: string;
  assetWeight: string;
  balance: string;
  balanceUsd: string;
  balanceUsdDisplay: string;
  balanceBorrowed: string;
  balanceBorrowedUsd: string;
  balanceBorrowedUsdDisplay: string;
  borrowInterest: string;
  borrowInterestUsd: string;
};

export type WalletPortfolioPosition = {
  marketId: number;
  pair: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  unrealizedPnlDisplay: string;
};

export type WalletPortfolioToolResult =
  | {
      status: 'unavailable';
      network: RuntimeNetwork;
      summary: string;
    }
  | {
      status: 'success';
      network: RuntimeNetwork;
      walletAddress: string;
      subaccountAddress: string;
      netValue: string;
      netValueDisplay: string;
      totalValue: string;
      totalValueDisplay: string;
      totalDeposits: string;
      totalDepositsDisplay: string;
      totalBorrowed: string;
      totalBorrowedDisplay: string;
      totalUnrealizedPnl: string;
      totalUnrealizedPnlDisplay: string;
      marginRatio: string;
      totalCollateral: string;
      totalMarginRequired: string;
      totalMaintenanceMarginRequired: string;
      assets: WalletPortfolioAsset[];
      positions: WalletPortfolioPosition[];
      summary: string;
    };

export type UserSubaccountsToolResult =
  | {
      status: 'unavailable';
      network: RuntimeNetwork;
      summary: string;
    }
  | {
      status: 'success';
      network: RuntimeNetwork;
      walletAddress: string;
      subaccounts: {
        address: string;
        name: string;
      }[];
      numberOfSubaccounts: number;
      numberOfSubaccountsCreated: number;
      ifStakedQuoteAssetAmount: string;
      summary: string;
    };

const NETWORK_BALANCE_TOKENS: Record<RuntimeNetwork, BalanceToken[]> = {
  deepx_devnet: [
    {
      name: 'USDC',
      symbol: 'USDC',
      address: '0x9eb03d8ac62ae18398ced13c033db78b905ad8c9',
      decimals: 6,
      marketId: 1,
    },
    {
      name: 'ETH',
      symbol: 'ETH',
      address: '0xD6c9c7078fc1Fe5065bc85f4743FAB219Bb053fd',
      decimals: 18,
      marketId: 3,
    },
    {
      name: 'SOL',
      symbol: 'SOL',
      address: '0x1fa7329ef1dae5c4b734b337c83466316f3bae94',
      decimals: 9,
      marketId: 4,
    },
  ],
  deepx_testnet: [
    {
      name: 'USDC',
      symbol: 'USDC',
      address: '0x9eb03d8ac62ae18398ced13c033db78b905ad8c9',
      decimals: 6,
      marketId: 1,
    },
    {
      name: 'ETH',
      symbol: 'ETH',
      address: '0x123ae070eb84068b5fed9f5b99f236507c44c880',
      decimals: 18,
      marketId: 3,
    },
    {
      name: 'SOL',
      symbol: 'SOL',
      address: '0x1fa7329ef1dae5c4b734b337c83466316f3bae94',
      decimals: 9,
      marketId: 4,
    },
  ],
};

export async function getWalletPortfolioTool(
  input: {
    network?: RuntimeNetwork;
  } = {},
  dependencies: WalletPortfolioDependencies = {},
): Promise<WalletPortfolioToolResult> {
  const network = input.network ?? 'deepx_devnet';
  const loadWalletRecord = dependencies.readWalletRecord ?? readWalletRecord;
  const walletRecord = await loadWalletRecord(network);

  if (!walletRecord) {
    return {
      status: 'unavailable',
      network,
      summary: `No local wallet found for ${network}. Import or unlock a wallet first.`,
    };
  }

  const contracts =
    dependencies.createContracts?.(network) ??
    createWalletPortfolioContracts(network);
  const subaccountAddress = await getPrimarySubaccountAddress(
    walletRecord.address,
    contracts,
  );

  if (!subaccountAddress) {
    return {
      status: 'unavailable',
      network,
      summary: `No subaccount found for ${walletRecord.address} on ${network}. Create or initialize a subaccount first.`,
    };
  }

  return fetchWalletPortfolio({
    network,
    walletAddress: walletRecord.address,
    subaccountAddress,
    contracts,
    fetchPerpPositions: dependencies.fetchPerpPositions,
  });
}

export async function listUserSubaccountsTool(
  input: {
    network?: RuntimeNetwork;
  } = {},
  dependencies: WalletPortfolioDependencies = {},
): Promise<UserSubaccountsToolResult> {
  const network = input.network ?? 'deepx_devnet';
  const loadWalletRecord = dependencies.readWalletRecord ?? readWalletRecord;
  const walletRecord = await loadWalletRecord(network);

  if (!walletRecord) {
    return {
      status: 'unavailable',
      network,
      summary: `No local wallet found for ${network}. Import or unlock a wallet first.`,
    };
  }

  const contracts =
    dependencies.createContracts?.(network) ??
    createWalletPortfolioContracts(network);
  const stats = await contracts.userStats(walletRecord.address);
  const subaccounts = stats.subaccounts.map((subaccount, index) => ({
    address: subaccount.subaccount,
    name: formatSubaccountName(subaccount.name, index),
  }));
  const numberOfSubaccounts = Number(stats.number_of_sub_accounts);
  const numberOfSubaccountsCreated = Number(
    stats.number_of_sub_accounts_created,
  );

  return {
    status: 'success',
    network,
    walletAddress: walletRecord.address,
    subaccounts,
    numberOfSubaccounts,
    numberOfSubaccountsCreated,
    ifStakedQuoteAssetAmount: String(stats.if_staked_quote_asset_amount),
    summary: buildSubaccountsSummary({
      network,
      walletAddress: walletRecord.address,
      subaccounts,
      numberOfSubaccounts,
      numberOfSubaccountsCreated,
    }),
  };
}

async function getPrimarySubaccountAddress(
  walletAddress: string,
  contracts: WalletPortfolioContracts,
) {
  const stats = await contracts.userStats(walletAddress);
  return stats.subaccounts[0]?.subaccount;
}

export async function fetchWalletPortfolio(input: {
  network: RuntimeNetwork;
  walletAddress: string;
  subaccountAddress: string;
  contracts: WalletPortfolioContracts;
  fetchPerpPositions?: typeof fetchUserPerpPositionsSnapshot;
}): Promise<Extract<WalletPortfolioToolResult, { status: 'success' }>> {
  const balanceTokens = NETWORK_BALANCE_TOKENS[input.network];
  const perpPairs = (
    await getNetworkMarkets(getNetworkConfig(input.network))
  ).filter((pair) => pair.kind === 'perp');
  const perpMarkets = perpPairs.map((pair) => ({
    marketId: pair.marketId ?? Number(pair.pairId),
    baseDecimals: pair.baseDecimals,
  }));
  const fetchPerpPositions =
    input.fetchPerpPositions ?? fetchUserPerpPositionsSnapshot;

  const [
    accountInfo,
    maintenanceMargin,
    initialMargin,
    oraclePrices,
    assetPools,
    positions,
  ] = await Promise.all([
    input.contracts.subaccountInfo(input.subaccountAddress),
    input.contracts.totalCollateralAndMarginRequiredFor(
      input.subaccountAddress,
      1,
    ),
    input.contracts.totalCollateralAndMarginRequiredFor(
      input.subaccountAddress,
      0,
    ),
    input.contracts.getOraclePriceAll(),
    input.contracts.assetPools(LENDING_MARKET_ID),
    fetchPerpPositions({
      network: getNetworkConfig(input.network),
      walletAddress: input.walletAddress,
      perpPairs,
    }),
  ]);

  const oraclePriceBySymbol = new Map(
    oraclePrices.map((price) => [
      normalizeOracleSymbol(price.symbol),
      price.price,
    ]),
  );
  const assetWeightByMarketId = new Map(
    assetPools.map((pool) => [pool.market_id, pool.initial_asset_weight]),
  );

  const assets = balanceTokens.map((token) => {
    const spotPosition = accountInfo.spot_positions.find(
      (position) =>
        normalizeOracleSymbol(position.symbol) === token.symbol.toUpperCase(),
    );
    const borrowPosition = accountInfo.borrow_positions.find(
      (position) =>
        safeDecodeBytes(position.asset).toLowerCase() ===
        token.symbol.toLowerCase(),
    );
    const priceRaw =
      oraclePriceBySymbol.get(token.symbol.toUpperCase()) ??
      (token.symbol === 'USDC' ? 10n ** BigInt(USD_DECIMALS) : 0n);
    const assetWeightRaw =
      assetWeightByMarketId.get(token.marketId) ??
      10n ** BigInt(ASSET_WEIGHT_DECIMALS);
    const balanceRaw = spotPosition?.token_amount ?? 0n;
    const balanceBorrowedRaw = borrowPosition?.amount ?? 0n;
    const borrowInterestRaw = borrowPosition?.interest ?? 0n;
    const balanceUsdRaw = multiplyAmountByPrice(
      balanceRaw,
      token.decimals,
      priceRaw,
    );
    const balanceBorrowedUsdRaw = multiplyAmountByPrice(
      balanceBorrowedRaw,
      token.decimals,
      priceRaw,
    );
    const borrowInterestUsdRaw = multiplyAmountByPrice(
      borrowInterestRaw,
      token.decimals,
      priceRaw,
    );

    return {
      symbol: token.symbol,
      name: token.name,
      address: token.address,
      decimals: token.decimals,
      price: formatUnits(priceRaw, USD_DECIMALS),
      assetWeight: formatUnits(assetWeightRaw, ASSET_WEIGHT_DECIMALS),
      balance: formatUnits(balanceRaw, token.decimals),
      balanceUsd: formatUnits(balanceUsdRaw, USD_DECIMALS),
      balanceUsdDisplay: formatUsdDisplay(balanceUsdRaw),
      balanceBorrowed: formatUnits(balanceBorrowedRaw, token.decimals),
      balanceBorrowedUsd: formatUnits(balanceBorrowedUsdRaw, USD_DECIMALS),
      balanceBorrowedUsdDisplay: formatUsdDisplay(balanceBorrowedUsdRaw),
      borrowInterest: formatUnits(borrowInterestRaw, token.decimals),
      borrowInterestUsd: formatUnits(borrowInterestUsdRaw, USD_DECIMALS),
      _balanceUsdRaw: balanceUsdRaw,
      _balanceBorrowedUsdRaw: balanceBorrowedUsdRaw,
    };
  });

  const totalDepositsRaw = assets.reduce(
    (sum, asset) => sum + asset._balanceUsdRaw,
    0n,
  );
  const totalBorrowedRaw = assets.reduce(
    (sum, asset) => sum + asset._balanceBorrowedUsdRaw,
    0n,
  );
  const summarizedPositions = positions
    .map((position) => {
      const pair = perpPairs.find(
        (candidate) =>
          (candidate.marketId ?? Number(candidate.pairId)) ===
          position.marketId,
      );
      const market = perpMarkets.find(
        (candidate) => candidate.marketId === position.marketId,
      );
      const currentPriceRaw =
        oraclePriceBySymbol.get(pair?.baseSymbol.toUpperCase() ?? '') ?? 0n;
      if (!market || !pair || position.baseAssetAmount === 0n) {
        return null;
      }

      let pnlRaw = multiplyAmountByPriceDifference(
        position.baseAssetAmount,
        market.baseDecimals,
        currentPriceRaw - position.entryPrice,
      );
      if (!position.isLong) {
        pnlRaw *= -1n;
      }

      return {
        marketId: position.marketId,
        pair: pair.label,
        side: position.isLong ? ('LONG' as const) : ('SHORT' as const),
        size: formatUnits(position.baseAssetAmount, market.baseDecimals),
        entryPrice: formatUnits(position.entryPrice, USD_DECIMALS),
        markPrice: formatUnits(currentPriceRaw, USD_DECIMALS),
        unrealizedPnl: formatUnits(pnlRaw, USD_DECIMALS),
        unrealizedPnlDisplay: formatUsdDisplay(pnlRaw),
        _unrealizedPnlRaw: pnlRaw,
      };
    })
    .filter((position) => position !== null);

  const totalUnrealizedPnlRaw = summarizedPositions.reduce(
    (sum, position) => sum + position._unrealizedPnlRaw,
    0n,
  );

  const totalValueRaw =
    totalUnrealizedPnlRaw + totalDepositsRaw - totalBorrowedRaw;
  const netValueRaw = initialMargin.collateral - initialMargin.margin_required;
  const marginRatio =
    maintenanceMargin.collateral > 0n && maintenanceMargin.margin_required > 0n
      ? formatRatio(
          maintenanceMargin.collateral,
          maintenanceMargin.margin_required,
          2,
        )
      : '-1';

  const summarizedAssets = assets.map(
    ({
      _balanceBorrowedUsdRaw: _ignoredBorrow,
      _balanceUsdRaw: _ignored,
      ...asset
    }) => asset,
  );
  const cleanPositions = summarizedPositions.map(
    ({ _unrealizedPnlRaw: _ignored, ...position }) => position,
  );

  return {
    status: 'success',
    network: input.network,
    walletAddress: input.walletAddress,
    subaccountAddress: input.subaccountAddress,
    netValue: formatUnits(netValueRaw, USD_DECIMALS),
    netValueDisplay: formatUsdDisplay(netValueRaw),
    totalValue: formatUnits(totalValueRaw, USD_DECIMALS),
    totalValueDisplay: formatUsdDisplay(totalValueRaw),
    totalDeposits: formatUnits(totalDepositsRaw, USD_DECIMALS),
    totalDepositsDisplay: formatUsdDisplay(totalDepositsRaw),
    totalBorrowed: formatUnits(totalBorrowedRaw, USD_DECIMALS),
    totalBorrowedDisplay: formatUsdDisplay(totalBorrowedRaw),
    totalUnrealizedPnl: formatUnits(totalUnrealizedPnlRaw, USD_DECIMALS),
    totalUnrealizedPnlDisplay: formatUsdDisplay(totalUnrealizedPnlRaw),
    totalCollateral: formatUnits(initialMargin.collateral, USD_DECIMALS),
    totalMarginRequired: formatUnits(
      initialMargin.margin_required,
      USD_DECIMALS,
    ),
    totalMaintenanceMarginRequired: formatUnits(
      maintenanceMargin.margin_required,
      USD_DECIMALS,
    ),
    marginRatio,
    assets: summarizedAssets,
    positions: cleanPositions,
    summary: buildWalletPortfolioSummary({
      network: input.network,
      walletAddress: input.walletAddress,
      totalValueRaw,
      netValueRaw,
      totalDepositsRaw,
      totalBorrowedRaw,
      totalUnrealizedPnlRaw,
      marginRatio,
    }),
  };
}

function createWalletPortfolioContracts(
  network: RuntimeNetwork,
): WalletPortfolioContracts {
  const provider = createRpcProvider(getNetworkConfig(network));
  const subaccountContract = new Contract(
    SUBACCOUNT_CONTRACT_ADDRESS,
    SUBACCOUNT_ABI,
    provider,
  );
  const perpContract = new Contract(PERP_CONTRACT_ADDRESS, PERP_ABI, provider);
  const lendingContract = new Contract(
    LENDING_CONTRACT_ADDRESS,
    LENDING_ABI,
    provider,
  );

  return {
    userStats(user) {
      return subaccountContract.userStats(user) as Promise<UserStats>;
    },
    subaccountInfo(account) {
      return subaccountContract.subaccountInfo(
        account,
      ) as Promise<UserSubaccountInfo>;
    },
    getOraclePriceAll() {
      return perpContract.getOraclePriceAll() as Promise<OraclePrice[]>;
    },
    totalCollateralAndMarginRequiredFor(account, weightDirection) {
      return perpContract.totalCollateralAndMarginRequiredFor(
        account,
        weightDirection,
      ) as Promise<TotalCollateralAndMargin>;
    },
    assetPools(lendingMarketId) {
      return lendingContract.assetPools(lendingMarketId) as Promise<
        AssetPoolState[]
      >;
    },
  };
}

function normalizeOracleSymbol(value: string) {
  return safeDecodeBytes(value).split('-')[0]?.toUpperCase() ?? '';
}

function safeDecodeBytes(value: string) {
  try {
    return toUtf8String(value).replaceAll('\u0000', '').trim();
  } catch {
    return value;
  }
}

function formatSubaccountName(value: string, index: number) {
  return safeDecodeBytes(value) || `Subaccount ${index + 1}`;
}

function multiplyAmountByPrice(
  amountRaw: bigint,
  amountDecimals: number,
  priceRaw: bigint,
) {
  return (amountRaw * priceRaw) / 10n ** BigInt(amountDecimals);
}

function multiplyAmountByPriceDifference(
  amountRaw: bigint,
  amountDecimals: number,
  priceDifferenceRaw: bigint,
) {
  return (amountRaw * priceDifferenceRaw) / 10n ** BigInt(amountDecimals);
}

function formatRatio(
  collateral: bigint,
  marginRequired: bigint,
  decimals: number,
) {
  const scale = 10n ** BigInt(decimals);
  const scaledValue = (collateral * scale) / marginRequired;
  return fixedFromScaledInteger(scaledValue, decimals);
}

function formatUsdDisplay(value: bigint) {
  const prefix = value < 0n ? '-$' : '$';
  const absolute = value < 0n ? value * -1n : value;
  return `${prefix}${addThousandsSeparators(
    fixedFromScaledInteger(absolute, USD_DECIMALS, 2),
  )}`;
}

function fixedFromScaledInteger(
  value: bigint,
  scaleDecimals: number,
  outputDecimals = scaleDecimals,
) {
  const negative = value < 0n;
  const absolute = negative ? value * -1n : value;
  const raw = absolute.toString().padStart(scaleDecimals + 1, '0');
  const integerPart = raw.slice(0, -scaleDecimals) || '0';
  const decimalPart = raw.slice(-scaleDecimals);
  const trimmedDecimalPart =
    outputDecimals === 0
      ? ''
      : decimalPart.padEnd(outputDecimals, '0').slice(0, outputDecimals);

  if (!trimmedDecimalPart) {
    return `${negative ? '-' : ''}${integerPart}`;
  }

  return `${negative ? '-' : ''}${integerPart}.${trimmedDecimalPart}`;
}

function addThousandsSeparators(value: string) {
  const [integerPart, decimalPart] = value.split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimalPart ? `${grouped}.${decimalPart}` : grouped;
}

function buildWalletPortfolioSummary(input: {
  network: RuntimeNetwork;
  walletAddress: string;
  totalValueRaw: bigint;
  netValueRaw: bigint;
  totalDepositsRaw: bigint;
  totalBorrowedRaw: bigint;
  totalUnrealizedPnlRaw: bigint;
  marginRatio: string;
}) {
  const marginLabel =
    input.marginRatio === '-1'
      ? 'margin ratio is not constrained'
      : `margin ratio ${input.marginRatio}`;

  return [
    `${input.network} wallet portfolio for ${input.walletAddress}:`,
    `total value ${formatUsdDisplay(input.totalValueRaw)}`,
    `net value ${formatUsdDisplay(input.netValueRaw)}`,
    `deposits ${formatUsdDisplay(input.totalDepositsRaw)}`,
    `borrowed ${formatUsdDisplay(input.totalBorrowedRaw)}`,
    `positions unrealized PnL ${formatUsdDisplay(input.totalUnrealizedPnlRaw)}`,
    marginLabel,
  ].join(', ');
}

function buildSubaccountsSummary(input: {
  network: RuntimeNetwork;
  walletAddress: string;
  subaccounts: { address: string; name: string }[];
  numberOfSubaccounts: number;
  numberOfSubaccountsCreated: number;
}) {
  if (input.subaccounts.length === 0) {
    return `No subaccounts found for ${input.walletAddress} on ${input.network}.`;
  }

  const rows = input.subaccounts
    .map(
      (subaccount, index) =>
        `${index + 1}. ${subaccount.name}: ${subaccount.address}`,
    )
    .join('\n');

  return [
    `Found ${input.numberOfSubaccounts} active subaccount(s) for ${input.walletAddress} on ${input.network}.`,
    `Total created: ${input.numberOfSubaccountsCreated}.`,
    rows,
  ].join('\n');
}

export const getUserBalanceTool = getWalletPortfolioTool;
export const fetchUserBalance = fetchWalletPortfolio;
