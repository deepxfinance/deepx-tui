import { describe, expect, test } from 'bun:test';

import {
  DEEPX_AGENT_TOOL_NAMES,
  executeDeepxAgentTool,
} from '../src/services/agent-tools';

describe('agent tools', () => {
  test('exposes current supported tool names', () => {
    expect(DEEPX_AGENT_TOOL_NAMES).toEqual([
      'deepx_list_markets',
      'deepx_get_user_balance',
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

    expect(result).toEqual({
      network: 'deepx_devnet',
      orders: [],
      summary:
        'Open orders are unavailable in dry-run mode because live account queries are not implemented yet.',
    });
  });

  test('routes balance lookups through the user balance tool', async () => {
    const result = await executeDeepxAgentTool(
      'deepx_get_user_balance',
      {
        network: 'deepx_testnet',
      },
      {
        getUserBalance: async ({ network }) => ({
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
          summary: 'stubbed balance',
        }),
      },
    );

    expect(result).toMatchObject({
      status: 'success',
      network: 'deepx_testnet',
      walletAddress: '0xabc',
      summary: 'stubbed balance',
    });
  });

  test('throws for unknown tool names', async () => {
    await expect(
      executeDeepxAgentTool('deepx_unknown', {}),
    ).rejects.toThrowError('Unknown tool "deepx_unknown".');
  });

  test('blocks live placement requests in AI chat mode', async () => {
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
      status: 'blocked',
      network: 'deepx_devnet',
      pair: 'ETH-USDC',
      orderId: undefined,
      summary: 'Live order placement is disabled in AI chat for ETH-USDC.',
      warnings: [
        'AI chat is advisory-only for trading actions.',
        'Use an explicit order-entry workflow for any live submission or cancellation.',
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
