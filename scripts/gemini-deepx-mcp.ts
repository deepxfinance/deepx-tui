#!/usr/bin/env bun

import process from 'node:process';

import {
  cancelOrderTool,
  listOpenOrdersDryRun,
  listSupportedMarkets,
  placeOrderTool,
} from '../src/services/order-tools';

type JsonRpcRequest = {
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

const serverInfo = {
  name: 'deepx-mcp',
  version: '0.1.0',
};

const tools = [
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
];

let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  consumeMessages();
});

process.stdin.on('end', () => {
  process.exit(0);
});

function consumeMessages() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const header = buffer.slice(0, headerEnd);
    const contentLength = parseContentLength(header);
    const messageEnd = headerEnd + 4 + contentLength;

    if (buffer.length < messageEnd) {
      return;
    }

    const body = buffer.slice(headerEnd + 4, messageEnd);
    buffer = buffer.slice(messageEnd);
    void handleMessage(body);
  }
}

function parseContentLength(header: string): number {
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) {
    throw new Error('Missing Content-Length header.');
  }

  return Number(match[1]);
}

async function handleMessage(body: string) {
  const request = JSON.parse(body) as JsonRpcRequest;

  if (request.method === 'notifications/initialized') {
    return;
  }

  if (request.method === 'initialize') {
    writeResponse({
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo,
      },
    });
    return;
  }

  if (request.method === 'ping') {
    writeResponse({
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: {},
    });
    return;
  }

  if (request.method === 'tools/list') {
    writeResponse({
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: { tools },
    });
    return;
  }

  if (request.method === 'tools/call') {
    const name = String(request.params?.name ?? '');
    const args = (request.params?.arguments ?? {}) as Record<string, unknown>;

    try {
      const result = await callTool(name, args);
      writeResponse({
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      });
    } catch (error) {
      writeResponse({
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
      });
    }
    return;
  }

  writeResponse({
    jsonrpc: '2.0',
    id: request.id ?? null,
    error: {
      code: -32601,
      message: `Method not found: ${request.method}`,
    },
  });
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

function writeResponse(response: JsonRpcResponse) {
  const json = JSON.stringify(response);
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`,
  );
}
