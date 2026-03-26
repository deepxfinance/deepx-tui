import type { FunctionDeclaration } from '@google/genai';

import type { RuntimeNetwork } from '../config/networks';
import {
  cancelOrderTool,
  listOpenOrdersDryRun,
  listSupportedMarkets,
  placeOrderTool,
} from './order-tools';
import { listLivePerpPairs } from './perp-trading';

export type DeepxAgentToolName =
  | 'deepx_list_markets'
  | 'deepx_place_order'
  | 'deepx_cancel_order'
  | 'deepx_list_open_orders';

type ToolArguments = Record<string, unknown>;

export const DEEPX_AGENT_TOOL_DECLARATIONS = [
  {
    name: 'deepx_list_markets',
    description:
      'List supported DeepX markets and precision metadata for the requested network.',
    parametersJsonSchema: {
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
      'Place a DeepX order. Perp orders become live when confirm=true and the wallet is already unlocked in this session or a passphrase is provided. Passphrase is optional for an unlocked session wallet. All other markets stay dry-run.',
    parametersJsonSchema: {
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
      'Cancel a DeepX perp order. Requires confirm=true and a wallet passphrase for live perp cancels.',
    parametersJsonSchema: {
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
    parametersJsonSchema: {
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
] as const satisfies FunctionDeclaration[];

export const DEEPX_AGENT_TOOL_NAMES = DEEPX_AGENT_TOOL_DECLARATIONS.map(
  (tool) => tool.name,
);

export async function executeDeepxAgentTool(
  name: string,
  args: ToolArguments,
  options: {
    allowLiveExecution?: boolean;
  } = {},
) {
  const allowLiveExecution = options.allowLiveExecution ?? false;

  switch (name) {
    case 'deepx_list_markets':
      return {
        network: normalizeNetwork(args.network),
        markets: listSupportedMarkets(normalizeNetwork(args.network)),
      };
    case 'deepx_place_order':
      if (!allowLiveExecution && hasLiveExecutionRequest(args)) {
        return buildLiveExecutionBlockedResult({
          action: 'place_order',
          network: normalizeNetwork(args.network),
          pair: String(args.pair ?? ''),
        });
      }

      return await placeOrderTool({
        network: normalizeNetwork(args.network),
        pair: String(args.pair ?? ''),
        side: String(args.side ?? 'BUY') as 'BUY' | 'SELL',
        type: String(args.type ?? 'LIMIT') as 'LIMIT' | 'MARKET',
        size: args.size as string | number,
        price: args.price as string | number | undefined,
        tif: args.tif as 'GTC' | 'IOC' | 'FOK' | undefined,
        note: args.note as string | undefined,
        passphrase: allowLiveExecution
          ? (args.passphrase as string | undefined)
          : undefined,
        confirm: allowLiveExecution
          ? (args.confirm as boolean | undefined)
          : false,
      });
    case 'deepx_cancel_order':
      if (
        !allowLiveExecution &&
        (hasLiveExecutionRequest(args) ||
          isLivePerpPair(String(args.pair ?? '')))
      ) {
        return buildLiveExecutionBlockedResult({
          action: 'cancel_order',
          network: normalizeNetwork(args.network),
          pair: String(args.pair ?? ''),
          orderId: Number(args.orderId ?? 0),
        });
      }

      return await cancelOrderTool({
        network: normalizeNetwork(args.network),
        pair: String(args.pair ?? ''),
        orderId: Number(args.orderId ?? 0),
        passphrase: allowLiveExecution
          ? (args.passphrase as string | undefined)
          : undefined,
        confirm: allowLiveExecution
          ? (args.confirm as boolean | undefined)
          : false,
      });
    case 'deepx_list_open_orders':
      return listOpenOrdersDryRun(normalizeNetwork(args.network));
    default:
      throw new Error(`Unknown tool "${name}".`);
  }
}

function normalizeNetwork(value: unknown): RuntimeNetwork {
  return value === 'deepx_testnet' ? 'deepx_testnet' : 'deepx_devnet';
}

function hasLiveExecutionRequest(args: ToolArguments) {
  return (
    args.confirm === true ||
    (typeof args.passphrase === 'string' && args.passphrase.trim().length > 0)
  );
}

function isLivePerpPair(pair: string) {
  return listLivePerpPairs().some((livePair) => livePair === pair);
}

function buildLiveExecutionBlockedResult(input: {
  action: 'place_order' | 'cancel_order';
  network: RuntimeNetwork;
  pair: string;
  orderId?: number;
}) {
  const orderLabel =
    input.action === 'cancel_order' && input.orderId
      ? `order ${input.orderId} on ${input.pair}`
      : input.pair;

  return {
    status: 'blocked',
    network: input.network,
    pair: input.pair,
    orderId: input.orderId,
    summary: `Live ${input.action === 'place_order' ? 'order placement' : 'order cancellation'} is disabled in AI chat for ${orderLabel}.`,
    warnings: [
      'AI chat is advisory-only for trading actions.',
      'Use an explicit order-entry workflow for any live submission or cancellation.',
    ],
  };
}
