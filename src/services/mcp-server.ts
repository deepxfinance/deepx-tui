import {
  cancelOrderTool,
  listOpenOrdersDryRun,
  listSupportedMarkets,
  placeOrderTool,
} from './order-tools';

export type JsonRpcRequest = {
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

export const supportedProtocolVersions = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;

export const serverInfo = {
  name: 'deepx-mcp',
  version: '0.1.0',
};

export const tools = [
  {
    name: 'deepx_list_markets',
    description:
      'List supported DeepX markets and precision metadata for the requested network.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        network: {
          type: 'string',
          enum: ['deepx_devnet', 'deepx_testnet'],
          default: 'deepx_devnet',
        },
      },
    },
  },
  {
    name: 'deepx_place_order',
    description:
      'Place a DeepX order. Perp orders become live when confirm=true and passphrase is supplied. All other markets stay dry-run.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['pair', 'side', 'type', 'size'],
      properties: {
        network: {
          type: 'string',
          enum: ['deepx_devnet', 'deepx_testnet'],
          default: 'deepx_devnet',
        },
        pair: { type: 'string' },
        side: { type: 'string', enum: ['BUY', 'SELL'] },
        type: { type: 'string', enum: ['LIMIT', 'MARKET'] },
        size: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        price: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        tif: { type: 'string', enum: ['GTC', 'IOC', 'FOK'], default: 'GTC' },
        note: { type: 'string' },
        passphrase: { type: 'string' },
        confirm: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'deepx_cancel_order',
    description:
      'Cancel a DeepX perp order. Requires confirm=true and passphrase for live perp cancels.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['pair', 'orderId'],
      properties: {
        network: {
          type: 'string',
          enum: ['deepx_devnet', 'deepx_testnet'],
          default: 'deepx_devnet',
        },
        pair: { type: 'string' },
        orderId: { type: 'number' },
        passphrase: { type: 'string' },
        confirm: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'deepx_list_open_orders',
    description:
      'Return the current dry-run open-order placeholder for the requested network.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        network: {
          type: 'string',
          enum: ['deepx_devnet', 'deepx_testnet'],
          default: 'deepx_devnet',
        },
      },
    },
  },
] as const;

function negotiateProtocolVersion(version: unknown) {
  if (typeof version !== 'string' || version.length === 0) {
    return supportedProtocolVersions[0];
  }

  if (
    supportedProtocolVersions.includes(
      version as (typeof supportedProtocolVersions)[number],
    )
  ) {
    return version;
  }

  return null;
}

export async function handleMcpRequest(
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  if (request.method === 'notifications/initialized') {
    return null;
  }

  if (request.method === 'initialize') {
    const protocolVersion = negotiateProtocolVersion(
      request.params?.protocolVersion,
    );

    if (!protocolVersion) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32602,
          message: `Unsupported protocol version: ${String(request.params?.protocolVersion ?? '')}`,
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: {
        protocolVersion,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo,
        instructions:
          'Use DeepX tools for market lookup and order dry-runs. Live perp execution requires confirm=true and an unlocked wallet passphrase.',
      },
    };
  }

  if (request.method === 'ping') {
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: {},
    };
  }

  if (request.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: { tools },
    };
  }

  if (request.method === 'tools/call') {
    const name = String(request.params?.name ?? '');
    const args = (request.params?.arguments ?? {}) as Record<string, unknown>;

    if (!tools.some((tool) => tool.name === name)) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32602,
          message: `Unknown tool: ${name}`,
        },
      };
    }

    try {
      const result = await callTool(name, args);
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
          isError: false,
        },
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: (error as Error).message,
            },
          ],
        },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id: request.id ?? null,
    error: {
      code: -32601,
      message: `Method not found: ${request.method}`,
    },
  };
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'deepx_list_markets':
      return {
        network:
          (args.network as 'deepx_devnet' | 'deepx_testnet') ?? 'deepx_devnet',
        markets: listSupportedMarkets(
          (args.network as 'deepx_devnet' | 'deepx_testnet') ?? 'deepx_devnet',
        ),
      };
    case 'deepx_place_order':
      return await placeOrderTool({
        network: args.network as 'deepx_devnet' | 'deepx_testnet' | undefined,
        pair: String(args.pair ?? ''),
        side: String(args.side ?? 'BUY') as 'BUY' | 'SELL',
        type: String(args.type ?? 'LIMIT') as 'LIMIT' | 'MARKET',
        size: args.size as string | number,
        price: args.price as string | number | undefined,
        tif: args.tif as 'GTC' | 'IOC' | 'FOK' | undefined,
        note: args.note as string | undefined,
        passphrase: args.passphrase as string | undefined,
        confirm: args.confirm as boolean | undefined,
      });
    case 'deepx_cancel_order':
      return await cancelOrderTool({
        network: args.network as 'deepx_devnet' | 'deepx_testnet' | undefined,
        pair: String(args.pair ?? ''),
        orderId: Number(args.orderId ?? 0),
        passphrase: args.passphrase as string | undefined,
        confirm: args.confirm as boolean | undefined,
      });
    case 'deepx_list_open_orders':
      return listOpenOrdersDryRun(
        (args.network as 'deepx_devnet' | 'deepx_testnet') ?? 'deepx_devnet',
      );
    default:
      throw new Error(`Unknown tool "${name}".`);
  }
}
