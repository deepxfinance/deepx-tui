import { describe, expect, test } from 'bun:test';
import type { Content, GenerateContentParameters } from '@google/genai';

import {
  buildCancelledAgentActionResult,
  continueAgentChatAfterUserAction,
  type GenAiClientLike,
  requestAgentChat,
  requestAgentChatWithActions,
} from '../src/services/agent-chat';

describe('agent chat service', () => {
  test('passes system context into the GenAI request', async () => {
    const calls: GenerateContentParameters[] = [];
    const client: GenAiClientLike = {
      models: {
        async generateContent(input) {
          calls.push(input);
          return {
            text: 'Context acknowledged.',
          };
        },
      },
    };

    const result = await requestAgentChat({
      messages: [{ id: 'user-1', role: 'user', content: 'What changed?' }],
      context: {
        network: 'deepx_devnet',
        pairLabel: 'BTC-USDC',
        priceLabel: '68250.40',
        resolutionLabel: '15m',
        walletUnlocked: true,
      },
      client,
    });

    expect(result).toBe('Context acknowledged.');
    expect(calls).toHaveLength(1);
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.config?.systemInstruction).toContain(
      'Chart resolution: 15m.',
    );
  });

  test('executes local tools and sends tool responses back to the model', async () => {
    const calls: GenerateContentParameters[] = [];
    const client: GenAiClientLike = {
      models: {
        async generateContent(input) {
          calls.push(input);

          if (calls.length === 1) {
            return {
              functionCalls: [
                {
                  id: 'call-1',
                  name: 'deepx_list_open_orders',
                  args: { network: 'deepx_devnet' },
                },
              ],
            };
          }

          return {
            text: 'No open orders are available in dry-run mode.',
          };
        },
      },
    };

    const result = await requestAgentChat({
      messages: [
        { id: 'user-1', role: 'user', content: 'Do I have open orders?' },
      ],
      context: {
        network: 'deepx_devnet',
        pairLabel: 'BTC-USDC',
        priceLabel: '68250.40',
        resolutionLabel: '15m',
        walletUnlocked: true,
      },
      client,
    });

    expect(result).toBe('No open orders are available in dry-run mode.');
    expect(calls).toHaveLength(2);
    const secondCallContents = calls[1]?.contents as Content[];
    expect(secondCallContents.at(-2)).toEqual({
      role: 'model',
      parts: [
        {
          functionCall: {
            id: 'call-1',
            name: 'deepx_list_open_orders',
            args: { network: 'deepx_devnet' },
          },
        },
      ],
    });
    expect(secondCallContents.at(-1)).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call-1',
            name: 'deepx_list_open_orders',
            response: {
              output: {
                network: 'deepx_devnet',
                orders: [],
                summary:
                  'Open orders are unavailable in dry-run mode because live account queries are not implemented yet.',
              },
            },
          },
        },
      ],
    });
  });

  test('preserves thought signatures on model tool-call parts', async () => {
    const calls: GenerateContentParameters[] = [];
    const client: GenAiClientLike = {
      models: {
        async generateContent(input) {
          calls.push(input);

          if (calls.length === 1) {
            return {
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [
                      {
                        functionCall: {
                          id: 'call-3',
                          name: 'deepx_list_open_orders',
                          args: { network: 'deepx_devnet' },
                        },
                        thoughtSignature: 'sig-123',
                      },
                    ],
                  },
                },
              ],
              functionCalls: [
                {
                  id: 'call-3',
                  name: 'deepx_list_open_orders',
                  args: { network: 'deepx_devnet' },
                },
              ],
            };
          }

          return {
            text: 'Handled with preserved signature.',
          };
        },
      },
    };

    const result = await requestAgentChat({
      messages: [
        { id: 'user-1', role: 'user', content: 'Check open orders again.' },
      ],
      context: {
        network: 'deepx_devnet',
        pairLabel: 'BTC-USDC',
        priceLabel: '68250.40',
        resolutionLabel: '15m',
        walletUnlocked: true,
      },
      client,
    });

    expect(result).toBe('Handled with preserved signature.');
    const secondCallContents = calls[1]?.contents as Content[];
    expect(secondCallContents.at(-2)).toEqual({
      role: 'model',
      parts: [
        {
          functionCall: {
            id: 'call-3',
            name: 'deepx_list_open_orders',
            args: { network: 'deepx_devnet' },
          },
          thoughtSignature: 'sig-123',
        },
      ],
    });
  });

  test('returns structured tool errors to the model instead of aborting', async () => {
    const calls: GenerateContentParameters[] = [];
    const client: GenAiClientLike = {
      models: {
        async generateContent(input) {
          calls.push(input);

          if (calls.length === 1) {
            return {
              functionCalls: [
                {
                  id: 'call-2',
                  name: 'deepx_missing_tool',
                  args: {
                    network: 'deepx_devnet',
                  },
                },
              ],
            };
          }

          return {
            text: 'The requested tool is unavailable.',
          };
        },
      },
    };

    const result = await requestAgentChat({
      messages: [
        { id: 'user-1', role: 'user', content: 'Use a missing tool.' },
      ],
      context: {
        network: 'deepx_devnet',
        pairLabel: 'BTC-USDC',
        priceLabel: '68250.40',
        resolutionLabel: '15m',
        walletUnlocked: true,
      },
      client,
    });

    expect(result).toBe('The requested tool is unavailable.');
    const secondCallContents = calls[1]?.contents as Content[];
    expect(secondCallContents.at(-1)).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call-2',
            name: 'deepx_missing_tool',
            response: {
              error: {
                message: 'Unknown tool "deepx_missing_tool".',
              },
            },
          },
        },
      ],
    });
  });

  test('pauses for user action when AI place-order confirmation is missing', async () => {
    const calls: GenerateContentParameters[] = [];
    const client: GenAiClientLike = {
      models: {
        async generateContent(input) {
          calls.push(input);

          if (calls.length === 1) {
            return {
              functionCalls: [
                {
                  id: 'call-4',
                  name: 'deepx_place_order',
                  args: {
                    network: 'deepx_devnet',
                    pair: 'ETH-USDC',
                    side: 'BUY',
                    type: 'LIMIT',
                    size: '1',
                    price: '1000',
                    confirm: false,
                  },
                },
              ],
            };
          }

          throw new Error('The model should not continue before confirmation.');
        },
      },
    };

    const result = await requestAgentChatWithActions({
      messages: [
        { id: 'user-1', role: 'user', content: 'Submit that order now.' },
      ],
      context: {
        network: 'deepx_devnet',
        pairLabel: 'ETH-USDC',
        priceLabel: '1000.00',
        resolutionLabel: '15m',
        walletUnlocked: true,
      },
      client,
    });

    expect(result.kind).toBe('needs_user_action');
    if (result.kind !== 'needs_user_action') {
      throw new Error('Expected pending user action.');
    }
    expect(result.action).toMatchObject({
      id: 'call-4',
      toolName: 'deepx_place_order',
      title: 'Confirm order',
      requiresPassphrase: true,
      args: {
        network: 'deepx_devnet',
        pair: 'ETH-USDC',
        side: 'BUY',
        type: 'LIMIT',
        size: '1',
        price: '1000',
        confirm: false,
      },
    });
    expect(result.action.summaryLines).toContain('Action: BUY 1 ETH-USDC');
    expect(calls).toHaveLength(1);
  });

  test('does not let AI-supplied confirm=true bypass user action', async () => {
    const calls: GenerateContentParameters[] = [];
    const client: GenAiClientLike = {
      models: {
        async generateContent(input) {
          calls.push(input);

          if (calls.length === 1) {
            return {
              functionCalls: [
                {
                  id: 'call-5',
                  name: 'deepx_place_order',
                  args: {
                    network: 'deepx_devnet',
                    pair: 'ETH-USDC',
                    side: 'BUY',
                    type: 'LIMIT',
                    size: '1',
                    price: '1000',
                    confirm: true,
                  },
                },
              ],
            };
          }

          throw new Error('The model should not continue before confirmation.');
        },
      },
    };

    const result = await requestAgentChatWithActions({
      messages: [
        { id: 'user-1', role: 'user', content: 'Submit that order now.' },
      ],
      context: {
        network: 'deepx_devnet',
        pairLabel: 'ETH-USDC',
        priceLabel: '1000.00',
        resolutionLabel: '15m',
        walletUnlocked: true,
      },
      client,
    });

    expect(result.kind).toBe('needs_user_action');
    if (result.kind !== 'needs_user_action') {
      throw new Error('Expected pending user action.');
    }
    expect(result.action.args).toMatchObject({
      confirm: true,
      pair: 'ETH-USDC',
      size: '1',
    });
    expect(calls).toHaveLength(1);
  });

  test('resumes the agent after a user cancels a pending action', async () => {
    const calls: GenerateContentParameters[] = [];
    const client: GenAiClientLike = {
      models: {
        async generateContent(input) {
          calls.push(input);

          if (calls.length === 1) {
            return {
              functionCalls: [
                {
                  id: 'call-6',
                  name: 'deepx_place_order',
                  args: {
                    network: 'deepx_devnet',
                    pair: 'ETH-USDC',
                    side: 'BUY',
                    type: 'LIMIT',
                    size: '1',
                    price: '1000',
                  },
                },
              ],
            };
          }

          return {
            text: 'Cancelled. No transaction was submitted.',
          };
        },
      },
    };

    const pending = await requestAgentChatWithActions({
      messages: [
        { id: 'user-1', role: 'user', content: 'Submit that order now.' },
      ],
      context: {
        network: 'deepx_devnet',
        pairLabel: 'ETH-USDC',
        priceLabel: '1000.00',
        resolutionLabel: '15m',
        walletUnlocked: true,
      },
      client,
    });
    if (pending.kind !== 'needs_user_action') {
      throw new Error('Expected pending user action.');
    }

    const result = await continueAgentChatAfterUserAction({
      continuation: pending.continuation,
      actionResult: buildCancelledAgentActionResult(pending.action),
      client,
    });

    expect(result).toEqual({
      kind: 'final',
      reply: 'Cancelled. No transaction was submitted.',
      stagedOrder: undefined,
    });
    const secondCallContents = calls[1]?.contents as Content[];
    expect(secondCallContents.at(-1)).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call-6',
            name: 'deepx_place_order',
            response: {
              output: {
                status: 'cancelled',
                toolName: 'deepx_place_order',
                summary: 'User cancelled this action in the terminal.',
              },
            },
          },
        },
      ],
    });
  });

  test('defaults omitted tool network to the current session network', async () => {
    const calls: GenerateContentParameters[] = [];
    const client: GenAiClientLike = {
      models: {
        async generateContent(input) {
          calls.push(input);

          if (calls.length === 1) {
            return {
              functionCalls: [
                {
                  id: 'call-9',
                  name: 'deepx_list_open_orders',
                  args: {},
                },
              ],
            };
          }

          return {
            text: 'Used session network.',
          };
        },
      },
    };

    const result = await requestAgentChat({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Check open orders on this session.',
        },
      ],
      context: {
        network: 'deepx_testnet',
        pairLabel: 'BTC-USDC',
        priceLabel: '68250.40',
        resolutionLabel: '15m',
        walletUnlocked: true,
      },
      client,
    });

    expect(result).toBe('Used session network.');
    const secondCallContents = calls[1]?.contents as Content[];
    expect(secondCallContents.at(-1)).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call-9',
            name: 'deepx_list_open_orders',
            response: {
              output: {
                network: 'deepx_testnet',
                orders: [],
                summary:
                  'Open orders are unavailable in dry-run mode because live account queries are not implemented yet.',
              },
            },
          },
        },
      ],
    });
  });

  test('rejects requests without a user prompt', async () => {
    await expect(
      requestAgentChat({
        messages: [{ id: 'assistant-1', role: 'assistant', content: 'hello' }],
        context: {
          network: 'deepx_devnet',
          pairLabel: 'BTC-USDC',
          priceLabel: '68250.40',
          resolutionLabel: '15m',
          walletUnlocked: true,
        },
      }),
    ).rejects.toThrowError('No user prompt available for the DeepX agent.');
  });
});
