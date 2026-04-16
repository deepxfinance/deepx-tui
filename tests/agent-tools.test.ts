import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  DEEPX_AGENT_TOOL_NAMES,
  executeDeepxAgentTool,
} from '../src/services/agent-tools';
import { installMockMarketApi } from './market-api-fixture';

let restoreFetch: (() => void) | undefined;

beforeEach(() => {
  restoreFetch = installMockMarketApi();
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe('agent tools', () => {
  test('exposes current supported tool names', () => {
    expect(DEEPX_AGENT_TOOL_NAMES).toEqual([
      'deepx_list_markets',
      'deepx_get_market_price_info',
      'deepx_get_wallet_portfolio',
      'deepx_list_subaccounts',
      'deepx_create_subaccount',
      'deepx_place_order',
      'deepx_cancel_order',
      'deepx_list_open_orders',
      'deepx_close_position',
      'deepx_update_position',
    ]);
  });

  test('returns structured results for successful calls', async () => {
    const result = await executeDeepxAgentTool('deepx_list_open_orders', {
      network: 'deepx_devnet',
    });

    expect(result as Record<string, unknown>).toEqual({
      network: 'deepx_devnet',
      orders: [],
      summary:
        'Open orders are unavailable in dry-run mode because live account queries are not implemented yet.',
    });
  });

  test('routes market price lookups through the market price tool', async () => {
    const result = await executeDeepxAgentTool(
      'deepx_get_market_price_info',
      {
        network: 'deepx_testnet',
        pair: 'ETH-USDC',
      },
      {
        getMarketPriceInfo: async ({ network, pair }) => ({
          pair,
          kind: 'perp',
          latestPrice: '1925.00',
          last24hChange: '+25.00',
          last24hChangePercent: '+1.32%',
          summary: `${pair} on ${network.id}`,
        }),
      },
    );

    expect(result).toEqual({
      pair: 'ETH-USDC',
      kind: 'perp',
      latestPrice: '1925.00',
      last24hChange: '+25.00',
      last24hChangePercent: '+1.32%',
      summary: 'ETH-USDC on deepx_testnet',
    });
  });

  test('routes portfolio lookups through the wallet portfolio tool', async () => {
    const result = await executeDeepxAgentTool(
      'deepx_get_wallet_portfolio',
      {
        network: 'deepx_testnet',
      },
      {
        getWalletPortfolio: async ({ network } = {}) => ({
          status: 'success',
          network: network ?? 'deepx_devnet',
          walletAddress: '0xabc',
          subaccountAddress: '0xabc',
          netValue: '10.0',
          netValueDisplay: '$10.00',
          totalValue: '12.0',
          totalValueDisplay: '$12.00',
          totalDeposits: '15.0',
          totalDepositsDisplay: '$15.00',
          totalBorrowed: '3.0',
          totalBorrowedDisplay: '$3.00',
          totalUnrealizedPnl: '0.0',
          totalUnrealizedPnlDisplay: '$0.00',
          marginRatio: '-1',
          totalCollateral: '15.0',
          totalMarginRequired: '5.0',
          totalMaintenanceMarginRequired: '0.0',
          assets: [],
          positions: [],
          summary: 'stubbed wallet portfolio',
        }),
      },
    );

    expect(result).toMatchObject({
      status: 'success',
      network: 'deepx_testnet',
      walletAddress: '0xabc',
      summary: 'stubbed wallet portfolio',
    });
  });

  test('normalizes network aliases for tool execution', async () => {
    const result = await executeDeepxAgentTool(
      'deepx_get_wallet_portfolio',
      {
        network: 'testnet',
      },
      {
        getWalletPortfolio: async ({ network } = {}) => ({
          status: 'success',
          network: network ?? 'deepx_devnet',
          walletAddress: '0xabc',
          subaccountAddress: '0xabc',
          netValue: '10.0',
          netValueDisplay: '$10.00',
          totalValue: '12.0',
          totalValueDisplay: '$12.00',
          totalDeposits: '15.0',
          totalDepositsDisplay: '$15.00',
          totalBorrowed: '3.0',
          totalBorrowedDisplay: '$3.00',
          totalUnrealizedPnl: '0.0',
          totalUnrealizedPnlDisplay: '$0.00',
          marginRatio: '-1',
          totalCollateral: '15.0',
          totalMarginRequired: '5.0',
          totalMaintenanceMarginRequired: '0.0',
          assets: [],
          positions: [],
          summary: 'stubbed wallet portfolio',
        }),
      },
    );

    expect(result).toMatchObject({
      status: 'success',
      network: 'deepx_testnet',
      walletAddress: '0xabc',
      summary: 'stubbed wallet portfolio',
    });
  });

  test('normalizes beta_testnet for live action gating', async () => {
    const result = await executeDeepxAgentTool('deepx_cancel_order', {
      network: 'beta_testnet',
      pair: 'ETH-USDC',
      orderId: 42,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      network: 'deepx_testnet',
      pair: 'ETH-USDC',
      orderId: 42,
      summary:
        'Live order cancellation is disabled in AI chat for order 42 on ETH-USDC.',
    });
  });

  test('uses the provided default network when tool args omit network', async () => {
    const result = await executeDeepxAgentTool(
      'deepx_list_open_orders',
      {},
      {
        defaultNetwork: 'deepx_testnet',
      },
    );

    expect(result as Record<string, unknown>).toEqual({
      network: 'deepx_testnet',
      orders: [],
      summary:
        'Open orders are unavailable in dry-run mode because live account queries are not implemented yet.',
    });
  });

  test('routes subaccount lookups through the user subaccounts tool', async () => {
    const result = await executeDeepxAgentTool(
      'deepx_list_subaccounts',
      {
        network: 'deepx_testnet',
      },
      {
        listUserSubaccounts: async ({ network } = {}) => ({
          status: 'success',
          network: network ?? 'deepx_devnet',
          walletAddress: '0xabc',
          subaccounts: [
            {
              address: '0xdef',
              name: 'main',
            },
          ],
          numberOfSubaccounts: 1,
          numberOfSubaccountsCreated: 1,
          ifStakedQuoteAssetAmount: '0',
          summary: 'stubbed subaccounts',
        }),
      },
    );

    expect(result as unknown).toEqual({
      status: 'success',
      network: 'deepx_testnet',
      walletAddress: '0xabc',
      subaccounts: [
        {
          address: '0xdef',
          name: 'main',
        },
      ],
      numberOfSubaccounts: 1,
      numberOfSubaccountsCreated: 1,
      ifStakedQuoteAssetAmount: '0',
      summary: 'stubbed subaccounts',
    });
  });

  test('throws for unknown tool names', async () => {
    await expect(
      executeDeepxAgentTool('deepx_unknown', {}),
    ).rejects.toThrowError('Unknown tool "deepx_unknown".');
  });

  test('routes subaccount creation through the create subaccount tool', async () => {
    const result = await executeDeepxAgentTool(
      'deepx_create_subaccount',
      {
        network: 'deepx_testnet',
        name: 'main',
      },
      {
        createSubaccount: async ({ network, name }) => ({
          status: 'dry_run',
          network: network ?? 'deepx_devnet',
          name,
          explorerUrl: 'https://example.test/tx',
          warnings: [],
          summary: 'stubbed subaccount creation',
        }),
      },
    );

    expect(result as Record<string, unknown>).toEqual({
      status: 'dry_run',
      network: 'deepx_testnet',
      name: 'main',
      explorerUrl: 'https://example.test/tx',
      warnings: [],
      summary: 'stubbed subaccount creation',
    });
  });

  test('blocks live subaccount creation requests in AI chat mode', async () => {
    const result = await executeDeepxAgentTool('deepx_create_subaccount', {
      network: 'deepx_devnet',
      name: 'main',
      confirm: true,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      network: 'deepx_devnet',
      pair: undefined,
      orderId: undefined,
      summary:
        'Live subaccount creation is disabled in AI chat for the local wallet.',
      warnings: [
        'AI chat is advisory-only for live account-management actions.',
        'Use an explicit account workflow for any live subaccount creation.',
      ],
    });
  });

  test('stages live placement requests as dry runs in AI chat mode', async () => {
    const result = await executeDeepxAgentTool('deepx_place_order', {
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      side: 'BUY',
      type: 'LIMIT',
      size: '1',
      price: '1000',
      confirm: true,
    });

    expect(result).toMatchObject({
      status: 'dry_run',
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      side: 'BUY',
      type: 'LIMIT',
      size: '1.000',
      price: '1000.00',
      warnings: [
        'Confirmation flag was not set. Treat this as a planning ticket only.',
        'Dry-run only. No live order was submitted.',
        'Live submission requires the terminal Confirm action with an unlocked wallet session.',
      ],
    });
  });

  test('blocks live cancellation requests in AI chat mode', async () => {
    const result = await executeDeepxAgentTool('deepx_cancel_order', {
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      orderId: 42,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      orderId: 42,
      summary:
        'Live order cancellation is disabled in AI chat for order 42 on ETH-USDC.',
      warnings: [
        'AI chat is advisory-only for trading actions.',
        'Use an explicit order-entry workflow for any live submission or cancellation.',
      ],
    });
  });

  test('blocks live close-position requests in AI chat mode', async () => {
    const result = await executeDeepxAgentTool('deepx_close_position', {
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      price: '2500',
    });

    expect(result).toMatchObject({
      status: 'blocked',
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      summary: 'Live position close is disabled in AI chat for ETH-USDC.',
      warnings: [
        'AI chat is advisory-only for trading actions.',
        'Use an explicit order-entry workflow for any live submission or cancellation.',
      ],
    });
  });

  test('blocks live position-update requests in AI chat mode', async () => {
    const result = await executeDeepxAgentTool('deepx_update_position', {
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      takeProfit: '2800',
      stopLoss: '2300',
    });

    expect(result).toMatchObject({
      status: 'blocked',
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      summary: 'Live position update is disabled in AI chat for ETH-USDC.',
      warnings: [
        'AI chat is advisory-only for trading actions.',
        'Use an explicit order-entry workflow for any live submission or cancellation.',
      ],
    });
  });
});
