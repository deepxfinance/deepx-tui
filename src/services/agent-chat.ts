import process from 'node:process';

import {
  type Candidate,
  type Content,
  type FunctionCall,
  type GenerateContentParameters,
  GoogleGenAI,
  type Part,
} from '@google/genai';

import type { RuntimeNetwork } from '../config/networks';
import {
  buildChatSystemPrompt,
  buildGenAiContents,
  type ChatMessage,
} from '../lib/dashboard-chat';
import {
  DEEPX_AGENT_TOOL_DECLARATIONS,
  type DeepxAgentToolName,
  executeDeepxAgentTool,
} from './agent-tools';

export const GENAI_MODEL = 'gemini-3-flash-preview';

const MAX_TOOL_ROUNDS = 4;

type AgentContext = {
  network: RuntimeNetwork;
  pairLabel: string;
  priceLabel: string;
  walletUnlocked: boolean;
};

export type AgentStagedOrder = {
  network: string;
  pair: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  size: string;
  price?: string;
};

export type AgentChatResult = {
  reply: string;
  stagedOrder?: AgentStagedOrder;
};

export type PendingAgentAction = {
  id: string;
  toolName: DeepxAgentToolName;
  title: string;
  summaryLines: string[];
  args: Record<string, unknown>;
  requiresPassphrase: boolean;
  confirmLabel: string;
  cancelLabel: string;
};

export type AgentContinuation = {
  defaultNetwork: RuntimeNetwork;
  systemInstruction: string;
  contents: Content[];
  modelToolCallContent: Content;
  functionCall: Required<Pick<FunctionCall, 'name'>> & FunctionCall;
  stagedOrders: AgentStagedOrder[];
  round: number;
};

export type AgentChatTurnResult =
  | AgentChatFinalResult
  | {
      kind: 'needs_user_action';
      action: PendingAgentAction;
      continuation: AgentContinuation;
    };

export type AgentChatFinalResult = {
  kind: 'final';
  reply: string;
  stagedOrder?: AgentStagedOrder;
};

type GenAiResponseLike = {
  candidates?: Candidate[];
  text?: string;
  functionCalls?: FunctionCall[];
};

export type GenAiClientLike = {
  models: {
    generateContent(
      input: GenerateContentParameters,
    ): Promise<GenAiResponseLike>;
    generateContentStream?(
      input: GenerateContentParameters,
    ): Promise<AsyncIterable<GenAiResponseLike>>;
  };
};

export async function requestAgentChat(input: {
  messages: ChatMessage[];
  context: AgentContext;
  client?: GenAiClientLike;
  onText?: (text: string) => void;
}): Promise<string> {
  const result = await requestAgentChatWithActions(input);
  if (result.kind === 'needs_user_action') {
    return result.action.summaryLines.join('\n');
  }

  return result.reply;
}

export async function requestAgentChatWithActions(input: {
  messages: ChatMessage[];
  context: AgentContext;
  client?: GenAiClientLike;
  onText?: (text: string) => void;
}): Promise<AgentChatTurnResult> {
  if (!input.messages.some((message) => message.role === 'user')) {
    throw new Error('No user prompt available for the DeepX agent.');
  }

  const client = input.client ?? createGenAiClient();
  const systemInstruction = buildChatSystemPrompt(input.context);
  const contents = buildGenAiContents(input.messages) as Content[];

  return runAgentToolLoop({
    client,
    defaultNetwork: input.context.network,
    systemInstruction,
    contents,
    stagedOrders: [],
    startingRound: 0,
    onText: input.onText,
  });
}

export async function continueAgentChatAfterUserAction(input: {
  continuation: AgentContinuation;
  actionResult: unknown;
  client?: GenAiClientLike;
  onText?: (text: string) => void;
}): Promise<AgentChatTurnResult> {
  const client = input.client ?? createGenAiClient();
  const { continuation } = input;
  const contents = [
    ...continuation.contents,
    continuation.modelToolCallContent,
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: continuation.functionCall.id,
            name: continuation.functionCall.name,
            response: {
              output: input.actionResult,
            },
          },
        },
      ],
    },
  ] satisfies Content[];

  return runAgentToolLoop({
    client,
    defaultNetwork: continuation.defaultNetwork,
    systemInstruction: continuation.systemInstruction,
    contents,
    stagedOrders: continuation.stagedOrders,
    startingRound: continuation.round + 1,
    onText: input.onText,
  });
}

export async function executeConfirmedAgentAction(input: {
  action: PendingAgentAction;
  defaultNetwork: RuntimeNetwork;
  passphrase?: string;
}) {
  return await executeDeepxAgentTool(
    input.action.toolName,
    buildConfirmedAgentActionArgs(input),
    {
      allowLiveExecution: true,
      defaultNetwork: input.defaultNetwork,
    },
  );
}

export function buildConfirmedAgentActionArgs(input: {
  action: PendingAgentAction;
  defaultNetwork: RuntimeNetwork;
  passphrase?: string;
}) {
  return {
    ...input.action.args,
    network: input.defaultNetwork,
    confirm: true,
    passphrase: input.passphrase,
  };
}

export function buildCancelledAgentActionResult(action: PendingAgentAction) {
  return {
    status: 'cancelled',
    toolName: action.toolName,
    summary: 'User cancelled this action in the terminal.',
  };
}

async function runAgentToolLoop(input: {
  client: GenAiClientLike;
  defaultNetwork: RuntimeNetwork;
  systemInstruction: string;
  contents: Content[];
  stagedOrders: AgentStagedOrder[];
  startingRound: number;
  onText?: (text: string) => void;
}): Promise<AgentChatTurnResult> {
  let contents = input.contents;
  const stagedOrders = input.stagedOrders;

  for (let round = input.startingRound; round < MAX_TOOL_ROUNDS; round += 1) {
    input.onText?.('');

    const response = await requestAgentModelResponse({
      client: input.client,
      onText: input.onText,
      request: {
        model: GENAI_MODEL,
        contents,
        config: {
          systemInstruction: input.systemInstruction,
          tools: [
            {
              functionDeclarations: DEEPX_AGENT_TOOL_DECLARATIONS,
            },
          ],
        },
      },
    });

    const functionCalls = normalizeFunctionCalls(response.functionCalls);
    if (functionCalls.length === 0) {
      const text = normalizeAgentText(resolveResponseText(response));
      if (!text) {
        throw new Error('GenAI SDK returned no text.');
      }

      return {
        kind: 'final',
        reply: text,
        stagedOrder: stagedOrders.at(-1),
      };
    }

    const modelToolCallContent = buildModelToolCallContent(
      response,
      functionCalls,
    );
    const pendingActionCall = functionCalls.find((call) =>
      shouldRequireUserAction(call.name),
    );
    if (pendingActionCall) {
      return {
        kind: 'needs_user_action',
        action: buildPendingAgentAction(
          pendingActionCall,
          input.defaultNetwork,
        ),
        continuation: {
          defaultNetwork: input.defaultNetwork,
          systemInstruction: input.systemInstruction,
          contents,
          modelToolCallContent,
          functionCall: pendingActionCall,
          stagedOrders,
          round,
        },
      };
    }

    contents = [
      ...contents,
      modelToolCallContent,
      {
        role: 'user',
        parts: await Promise.all(
          functionCalls.map(async (call) => ({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: await executeToolCall(
                call,
                stagedOrders,
                input.defaultNetwork,
              ),
            },
          })),
        ),
      },
    ];
  }

  throw new Error('GenAI SDK exceeded the tool-call limit.');
}

export function createGenAiClient(
  apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
): GenAiClientLike {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error(
      `Set GEMINI_API_KEY or GOOGLE_API_KEY to enable live replies from ${GENAI_MODEL}.`,
    );
  }

  return new GoogleGenAI({
    apiKey: apiKey.trim(),
  }) as unknown as GenAiClientLike;
}

export function normalizeAgentText(text?: string) {
  return (text ?? '').trim();
}

async function requestAgentModelResponse(input: {
  client: GenAiClientLike;
  request: GenerateContentParameters;
  onText?: (text: string) => void;
}): Promise<GenAiResponseLike> {
  const generateContentStream = input.client.models.generateContentStream;
  if (!generateContentStream) {
    return await input.client.models.generateContent(input.request);
  }

  const stream = await generateContentStream(input.request);
  let text = '';
  const functionCallParts = new Map<string, Part>();

  for await (const chunk of stream) {
    text = mergeStreamText(text, resolveResponseText(chunk));
    if (text) {
      input.onText?.(text);
    }

    for (const [index, part] of getFunctionCallParts(chunk).entries()) {
      const call = part.functionCall;
      if (!call) {
        continue;
      }

      functionCallParts.set(getFunctionCallKey(call, index), {
        functionCall: {
          id: call.id,
          name: call.name,
          args: isRecord(call.args) ? call.args : {},
        },
        thoughtSignature: part.thoughtSignature,
      });
    }
  }

  return {
    text,
    candidates:
      functionCallParts.size > 0
        ? [
            {
              content: {
                role: 'model',
                parts: [...functionCallParts.values()],
              },
            },
          ]
        : undefined,
    functionCalls: [...functionCallParts.values()]
      .map((part) => part.functionCall)
      .filter((call): call is FunctionCall => call !== undefined),
  };
}

function resolveResponseText(response: GenAiResponseLike) {
  const candidateParts = response.candidates?.[0]?.content?.parts;
  if (candidateParts) {
    return candidateParts
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');
  }

  return response.text ?? '';
}

function buildModelToolCallContent(
  response: GenAiResponseLike,
  functionCalls: Array<Required<Pick<FunctionCall, 'name'>> & FunctionCall>,
): Content {
  const candidateParts = response.candidates?.[0]?.content?.parts;
  const functionCallParts = candidateParts?.filter((part) => part.functionCall);

  if (functionCallParts && functionCallParts.length === functionCalls.length) {
    return {
      role: 'model',
      parts: functionCallParts,
    };
  }

  return {
    role: 'model',
    parts: functionCalls.map((call) => buildFunctionCallPart(call)),
  };
}

function normalizeFunctionCalls(
  functionCalls?: FunctionCall[],
): Array<Required<Pick<FunctionCall, 'name'>> & FunctionCall> {
  return (functionCalls ?? []).map((call) => {
    const name = call.name?.trim();
    if (!name) {
      throw new Error('GenAI SDK returned a tool call without a name.');
    }

    return {
      ...call,
      name,
      args: isRecord(call.args) ? call.args : {},
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildFunctionCallPart(call: FunctionCall): Part {
  return {
    functionCall: {
      id: call.id,
      name: call.name,
      args: call.args,
    },
  };
}

function mergeStreamText(currentText: string, nextText?: string) {
  const normalizedNextText = nextText ?? '';
  if (!normalizedNextText) {
    return currentText;
  }

  if (!currentText || normalizedNextText.startsWith(currentText)) {
    return normalizedNextText;
  }

  if (currentText.endsWith(normalizedNextText)) {
    return currentText;
  }

  return `${currentText}${normalizedNextText}`;
}

function getFunctionCallParts(response: GenAiResponseLike): Part[] {
  return (
    response.candidates?.[0]?.content?.parts?.filter((part) =>
      Boolean(part.functionCall),
    ) ?? []
  );
}

function getFunctionCallKey(call: FunctionCall, index: number) {
  return call.id?.trim() || `${call.name?.trim() ?? 'tool-call'}-${index}`;
}

function shouldRequireUserAction(
  toolName: string,
): toolName is DeepxAgentToolName {
  return (
    toolName === 'deepx_place_order' ||
    toolName === 'deepx_cancel_order' ||
    toolName === 'deepx_close_position' ||
    toolName === 'deepx_update_position' ||
    toolName === 'deepx_create_subaccount'
  );
}

function buildPendingAgentAction(
  call: Required<Pick<FunctionCall, 'name'>> & FunctionCall,
  defaultNetwork: RuntimeNetwork,
): PendingAgentAction {
  const args = isRecord(call.args) ? call.args : {};
  const { passphrase: _passphrase, ...safeArgs } = args;
  const toolName = call.name as DeepxAgentToolName;
  return {
    id: call.id ?? `${toolName}-${Date.now()}`,
    toolName,
    title: buildPendingActionTitle(toolName),
    summaryLines: buildPendingActionSummary(toolName, safeArgs, defaultNetwork),
    args: safeArgs,
    requiresPassphrase: true,
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
  };
}

function buildPendingActionTitle(toolName: DeepxAgentToolName) {
  switch (toolName) {
    case 'deepx_place_order':
      return 'Confirm order';
    case 'deepx_cancel_order':
      return 'Confirm cancellation';
    case 'deepx_close_position':
      return 'Confirm position close';
    case 'deepx_update_position':
      return 'Confirm position update';
    case 'deepx_create_subaccount':
      return 'Confirm subaccount creation';
    default:
      return 'Confirm action';
  }
}

function buildPendingActionSummary(
  toolName: DeepxAgentToolName,
  args: Record<string, unknown>,
  defaultNetwork: RuntimeNetwork,
) {
  const network = String(defaultNetwork);

  switch (toolName) {
    case 'deepx_place_order':
      return [
        `Action: ${String(args.side ?? 'BUY')} ${String(args.size ?? '')} ${String(args.pair ?? '').trim()}`,
        `Type: ${String(args.type ?? 'LIMIT')}`,
        ...(args.price == null || args.price === ''
          ? []
          : [`Price: ${String(args.price)}`]),
        `Network: ${network}`,
      ];
    case 'deepx_cancel_order':
      return [
        `Action: cancel order ${String(args.orderId ?? '')}`,
        `Pair: ${String(args.pair ?? '').trim()}`,
        `Network: ${network}`,
      ];
    case 'deepx_close_position':
      return [
        `Action: close position on ${String(args.pair ?? '').trim()}`,
        `Price: ${String(args.price ?? '')}`,
        `Network: ${network}`,
      ];
    case 'deepx_update_position':
      return [
        `Action: update position on ${String(args.pair ?? '').trim()}`,
        `Take profit: ${String(args.takeProfit ?? 'unchanged')}`,
        `Stop loss: ${String(args.stopLoss ?? 'unchanged')}`,
        `Network: ${network}`,
      ];
    case 'deepx_create_subaccount':
      return [
        `Action: create subaccount ${String(args.name ?? '').trim()}`,
        `Network: ${network}`,
      ];
    default:
      return [`Action: ${toolName}`];
  }
}

async function executeToolCall(
  call: FunctionCall,
  stagedOrders: AgentStagedOrder[],
  defaultNetwork: RuntimeNetwork,
) {
  try {
    const output = await executeDeepxAgentTool(
      call.name ?? '',
      call.args ?? {},
      {
        allowLiveExecution: false,
        defaultNetwork,
      },
    );
    collectStagedOrder(call.name ?? '', output, stagedOrders);

    return {
      output,
    };
  } catch (error) {
    return {
      error: {
        message:
          error instanceof Error
            ? error.message
            : 'Unknown tool execution error.',
      },
    };
  }
}

function collectStagedOrder(
  toolName: string,
  output: unknown,
  stagedOrders: AgentStagedOrder[],
) {
  if (toolName !== 'deepx_place_order' || !isRecord(output)) {
    return;
  }

  if (output.status !== 'dry_run') {
    return;
  }

  const side = output.side === 'SELL' ? 'SELL' : 'BUY';
  const type = output.type === 'MARKET' ? 'MARKET' : 'LIMIT';
  const pair = String(output.pair ?? '').trim();
  const size = String(output.size ?? '').trim();
  if (!pair || !size) {
    return;
  }

  const price =
    typeof output.price === 'string' && output.price.trim()
      ? output.price.trim()
      : undefined;

  stagedOrders.push({
    network: String(output.network ?? 'deepx_devnet'),
    pair,
    side,
    type,
    size,
    price,
  });
}
