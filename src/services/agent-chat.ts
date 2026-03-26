import process from 'node:process';

import {
  type Content,
  type FunctionCall,
  type GenerateContentParameters,
  GoogleGenAI,
} from '@google/genai';

import {
  buildChatSystemPrompt,
  buildGenAiContents,
  type ChatMessage,
} from '../lib/dashboard-chat';
import {
  DEEPX_AGENT_TOOL_DECLARATIONS,
  executeDeepxAgentTool,
} from './agent-tools';

export const GENAI_MODEL = 'gemini-3-flash-previous';

const MAX_TOOL_ROUNDS = 4;

type AgentContext = {
  pairLabel: string;
  priceLabel: string;
  resolutionLabel: string;
};

type GenAiResponseLike = {
  text?: string;
  functionCalls?: FunctionCall[];
};

export type GenAiClientLike = {
  models: {
    generateContent(
      input: GenerateContentParameters,
    ): Promise<GenAiResponseLike>;
  };
};

export async function requestAgentChat(input: {
  messages: ChatMessage[];
  context: AgentContext;
  client?: GenAiClientLike;
}): Promise<string> {
  if (!input.messages.some((message) => message.role === 'user')) {
    throw new Error('No user prompt available for the DeepX agent.');
  }

  const client = input.client ?? createGenAiClient();
  const systemInstruction = buildChatSystemPrompt(input.context);
  let contents = buildGenAiContents(input.messages) as Content[];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.models.generateContent({
      model: GENAI_MODEL,
      contents,
      config: {
        systemInstruction,
        tools: [
          {
            functionDeclarations: DEEPX_AGENT_TOOL_DECLARATIONS,
          },
        ],
      },
    });

    const functionCalls = normalizeFunctionCalls(response.functionCalls);
    if (functionCalls.length === 0) {
      const text = normalizeAgentText(response.text);
      if (!text) {
        throw new Error('GenAI SDK returned no text.');
      }

      return text;
    }

    contents = [
      ...contents,
      {
        role: 'model',
        parts: functionCalls.map((call) => ({
          functionCall: {
            id: call.id,
            name: call.name,
            args: call.args,
          },
        })),
      },
      {
        role: 'user',
        parts: await Promise.all(
          functionCalls.map(async (call) => ({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: await executeToolCall(call),
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

async function executeToolCall(call: FunctionCall) {
  try {
    return {
      output: await executeDeepxAgentTool(call.name ?? '', call.args ?? {}),
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
