import { describe, expect, test } from 'bun:test';

import {
  handleMcpRequest,
  supportedProtocolVersions,
  tools,
} from '../src/services/mcp-server';

describe('deepx mcp server', () => {
  test('negotiates a supported initialize protocol version', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0' as never,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '0.1.0',
        },
      },
    });

    expect(response?.error).toBeUndefined();
    expect(response?.result).toMatchObject({
      protocolVersion: '2025-11-25',
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
    });
  });

  test('rejects unsupported initialize protocol versions', async () => {
    const response = await handleMcpRequest({
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2099-01-01',
      },
    });

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32602,
        message: 'Unsupported protocol version: 2099-01-01',
      },
    });
  });

  test('returns structured tool results for successful calls', async () => {
    const response = await handleMcpRequest({
      id: 2,
      method: 'tools/call',
      params: {
        name: 'deepx_list_open_orders',
        arguments: {
          network: 'deepx_devnet',
        },
      },
    });

    expect(response?.error).toBeUndefined();
    expect(response?.result).toMatchObject({
      isError: false,
      structuredContent: {
        network: 'deepx_devnet',
        orders: [],
      },
    });
  });

  test('returns protocol errors for unknown tool names', async () => {
    const response = await handleMcpRequest({
      id: 3,
      method: 'tools/call',
      params: {
        name: 'deepx_unknown',
        arguments: {},
      },
    });

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 3,
      error: {
        code: -32602,
        message: 'Unknown tool: deepx_unknown',
      },
    });
  });

  test('exposes current supported tool names and protocol versions', () => {
    expect(supportedProtocolVersions).toEqual([
      '2025-11-25',
      '2025-06-18',
      '2025-03-26',
      '2024-11-05',
    ]);
    expect(tools.map((tool) => tool.name)).toEqual([
      'deepx_list_markets',
      'deepx_place_order',
      'deepx_cancel_order',
      'deepx_list_open_orders',
    ]);
  });
});
