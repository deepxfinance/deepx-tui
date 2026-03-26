import { describe, expect, test } from 'bun:test';

import {
  DEEPX_AGENT_TOOL_NAMES,
  executeDeepxAgentTool,
} from '../src/services/agent-tools';

describe('agent tools', () => {
  test('exposes current supported tool names', () => {
    expect(DEEPX_AGENT_TOOL_NAMES).toEqual([
      'deepx_list_markets',
      'deepx_place_order',
      'deepx_cancel_order',
      'deepx_list_open_orders',
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
});
