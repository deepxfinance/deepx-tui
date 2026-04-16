import type { FunctionDeclaration } from '@google/genai';

import {
  getNetworkConfig,
  normalizeRuntimeNetwork,
  type RuntimeNetwork,
} from '../config/networks';
import { fetchMarketPriceInfo } from './deepx-api';
import {
  cancelOrderTool,
  closePositionTool,
  listOpenOrdersDryRun,
  listSupportedMarkets,
  placeOrderTool,
  updatePositionTool,
} from './order-tools';
import { createSubaccountTool } from './subaccount-tools';
import {
  getWalletPortfolioTool,
  listUserSubaccountsTool,
} from './user-balance';

export type DeepxAgentToolName =
  | 'deepx_list_markets'
  | 'deepx_get_market_price_info'
  | 'deepx_get_wallet_portfolio'
  | 'deepx_list_subaccounts'
  | 'deepx_create_subaccount'
  | 'deepx_place_order'
  | 'deepx_cancel_order'
  | 'deepx_list_open_orders'
  | 'deepx_close_position'
  | 'deepx_update_position';

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
    name: 'deepx_get_market_price_info',
    description:
      'Return the latest market price plus last 24h price change info for a supported DeepX pair on the requested network.',
    parametersJsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['pair'],
      properties: {
        network: {
          type: 'string',
          enum: ['deepx_devnet', 'deepx_testnet'],
          default: 'deepx_devnet',
        },
        pair: { type: 'string' },
      },
    },
  },
  {
    name: 'deepx_get_wallet_portfolio',
    description:
      'Return wallet portfolio details, including balances, borrowing, and perp positions, for the locally stored wallet on the requested network.',
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
    name: 'deepx_list_subaccounts',
    description:
      'List all Subaccount contract subaccounts for the locally stored wallet on the requested network.',
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
    name: 'deepx_create_subaccount',
    description:
      'Create a new Subaccount contract subaccount for the locally stored wallet. Live creation requires confirm=true and an unlocked wallet session or explicit passphrase.',
    parametersJsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        network: {
          type: 'string',
          enum: ['deepx_devnet', 'deepx_testnet'],
          default: 'deepx_devnet',
        },
        name: { type: 'string' },
        passphrase: { type: 'string' },
        confirm: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'deepx_place_order',
    description:
      'Place a DeepX order. Perp and spot orders become live when confirm=true and the wallet is already unlocked in this session or a passphrase is provided. Passphrase is optional for an unlocked session wallet.',
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
        slippage: { anyOf: [{ type: 'string' }, { type: 'number' }] },
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
  {
    name: 'deepx_close_position',
    description:
      'Close a DeepX perp position at a limit price. Requires confirm=true and a wallet passphrase for live execution.',
    parametersJsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['pair', 'price'],
      properties: {
        network: {
          type: 'string',
          enum: ['deepx_devnet', 'deepx_testnet'],
          default: 'deepx_devnet',
        },
        pair: { type: 'string' },
        price: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        slippage: {
          anyOf: [{ type: 'string' }, { type: 'number' }],
          default: 10,
        },
        passphrase: { type: 'string' },
        confirm: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'deepx_update_position',
    description:
      'Update DeepX perp position take-profit and stop-loss points. For live execution, both takeProfit and stopLoss must be supplied. Use 0 to clear either trigger.',
    parametersJsonSchema: {
      type: 'object',
      additionalProperties: false,
      anyOf: [
        { required: ['pair', 'takeProfit'] },
        { required: ['pair', 'stopLoss'] },
      ],
      properties: {
        network: {
          type: 'string',
          enum: ['deepx_devnet', 'deepx_testnet'],
          default: 'deepx_devnet',
        },
        pair: { type: 'string' },
        takeProfit: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        stopLoss: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        passphrase: { type: 'string' },
        confirm: { type: 'boolean', default: false },
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
    defaultNetwork?: RuntimeNetwork;
    getMarketPriceInfo?: typeof fetchMarketPriceInfo;
    getWalletPortfolio?: typeof getWalletPortfolioTool;
    listUserSubaccounts?: typeof listUserSubaccountsTool;
    createSubaccount?: typeof createSubaccountTool;
  } = {},
) {
  const allowLiveExecution = options.allowLiveExecution ?? false;
  const toolNetwork = resolveToolNetwork(args.network, options.defaultNetwork);
  const marketPriceInfoTool =
    options.getMarketPriceInfo ?? fetchMarketPriceInfo;
  const walletPortfolioTool =
    options.getWalletPortfolio ?? getWalletPortfolioTool;
  const userSubaccountsTool =
    options.listUserSubaccounts ?? listUserSubaccountsTool;
  const createSubaccount = options.createSubaccount ?? createSubaccountTool;

  switch (name) {
    case 'deepx_list_markets':
      return {
        network: toolNetwork,
        markets: await listSupportedMarkets(toolNetwork),
      };
    case 'deepx_get_market_price_info':
      return await marketPriceInfoTool({
        network: getNetworkConfig(toolNetwork),
        pair: String(args.pair ?? ''),
      });
    case 'deepx_get_wallet_portfolio':
      return await walletPortfolioTool({
        network: toolNetwork,
      });
    case 'deepx_list_subaccounts':
      return await userSubaccountsTool({
        network: toolNetwork,
      });
    case 'deepx_create_subaccount':
      if (!allowLiveExecution && hasLiveExecutionRequest(args)) {
        return buildLiveExecutionBlockedResult({
          action: 'create_subaccount',
          network: toolNetwork,
        });
      }

      return await createSubaccount({
        network: toolNetwork,
        name: String(args.name ?? ''),
        passphrase: allowLiveExecution
          ? (args.passphrase as string | undefined)
          : undefined,
        confirm: allowLiveExecution
          ? (args.confirm as boolean | undefined)
          : false,
      });
    case 'deepx_place_order':
      return await placeOrderTool({
        network: toolNetwork,
        pair: String(args.pair ?? ''),
        side: String(args.side ?? 'BUY') as 'BUY' | 'SELL',
        type: String(args.type ?? 'LIMIT') as 'LIMIT' | 'MARKET',
        size: args.size as string | number,
        price: args.price as string | number | undefined,
        slippage: args.slippage as string | number | undefined,
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
          network: toolNetwork,
          pair: String(args.pair ?? ''),
          orderId: Number(args.orderId ?? 0),
        });
      }

      return await cancelOrderTool({
        network: toolNetwork,
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
      return listOpenOrdersDryRun(toolNetwork);
    case 'deepx_close_position':
      if (
        !allowLiveExecution &&
        (hasLiveExecutionRequest(args) ||
          isLivePerpPair(String(args.pair ?? '')))
      ) {
        return buildLiveExecutionBlockedResult({
          action: 'close_position',
          network: toolNetwork,
          pair: String(args.pair ?? ''),
        });
      }

      return await closePositionTool({
        network: toolNetwork,
        pair: String(args.pair ?? ''),
        price: args.price as string | number,
        slippage: args.slippage as string | number | undefined,
        passphrase: allowLiveExecution
          ? (args.passphrase as string | undefined)
          : undefined,
        confirm: allowLiveExecution
          ? (args.confirm as boolean | undefined)
          : false,
      });
    case 'deepx_update_position':
      if (
        !allowLiveExecution &&
        (hasLiveExecutionRequest(args) ||
          isLivePerpPair(String(args.pair ?? '')))
      ) {
        return buildLiveExecutionBlockedResult({
          action: 'update_position',
          network: toolNetwork,
          pair: String(args.pair ?? ''),
        });
      }

      return await updatePositionTool({
        network: toolNetwork,
        pair: String(args.pair ?? ''),
        takeProfit: args.takeProfit as string | number | undefined,
        stopLoss: args.stopLoss as string | number | undefined,
        passphrase: allowLiveExecution
          ? (args.passphrase as string | undefined)
          : undefined,
        confirm: allowLiveExecution
          ? (args.confirm as boolean | undefined)
          : false,
      });
    default:
      throw new Error(`Unknown tool "${name}".`);
  }
}

function resolveToolNetwork(
  value: unknown,
  defaultNetwork?: RuntimeNetwork,
): RuntimeNetwork {
  if (typeof value === 'string' && value.trim().length > 0) {
    return normalizeRuntimeNetwork(value);
  }

  return defaultNetwork ?? 'deepx_devnet';
}

function hasLiveExecutionRequest(args: ToolArguments) {
  return (
    args.confirm === true ||
    (typeof args.passphrase === 'string' && args.passphrase.trim().length > 0)
  );
}

function isLivePerpPair(pair: string) {
  return pair.includes('-') && !pair.includes('/');
}

function buildLiveExecutionBlockedResult(input: {
  action:
    | 'place_order'
    | 'cancel_order'
    | 'close_position'
    | 'update_position'
    | 'create_subaccount';
  network: RuntimeNetwork;
  pair?: string;
  orderId?: number;
}) {
  const orderLabel =
    input.action === 'cancel_order' && input.orderId
      ? `order ${input.orderId} on ${input.pair}`
      : input.pair || 'the local wallet';

  return {
    status: 'blocked',
    network: input.network,
    pair: input.pair,
    orderId: input.orderId,
    summary: `Live ${describeBlockedAction(input.action)} is disabled in AI chat for ${orderLabel}.`,
    warnings: buildBlockedActionWarnings(input.action),
  };
}

function describeBlockedAction(
  action:
    | 'place_order'
    | 'cancel_order'
    | 'close_position'
    | 'update_position'
    | 'create_subaccount',
) {
  switch (action) {
    case 'place_order':
      return 'order placement';
    case 'cancel_order':
      return 'order cancellation';
    case 'close_position':
      return 'position close';
    case 'update_position':
      return 'position update';
    case 'create_subaccount':
      return 'subaccount creation';
  }
}

function buildBlockedActionWarnings(
  action:
    | 'place_order'
    | 'cancel_order'
    | 'close_position'
    | 'update_position'
    | 'create_subaccount',
) {
  if (action === 'create_subaccount') {
    return [
      'AI chat is advisory-only for live account-management actions.',
      'Use an explicit account workflow for any live subaccount creation.',
    ];
  }

  return [
    'AI chat is advisory-only for trading actions.',
    'Use an explicit order-entry workflow for any live submission or cancellation.',
  ];
}
