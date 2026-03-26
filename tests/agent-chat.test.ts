import { describe, expect, test } from 'bun:test';
import type { Content, GenerateContentParameters } from '@google/genai';

import {
  type GenAiClientLike,
  requestAgentChat,
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
        pairLabel: 'BTC-USDC',
        priceLabel: '68250.40',
        resolutionLabel: '15m',
      },
      client,
    });

    expect(result).toBe('Context acknowledged.');
    expect(calls).toHaveLength(1);
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.config?.systemInstruction).toContain(
      'Active pair: BTC-USDC.',
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
        pairLabel: 'BTC-USDC',
        priceLabel: '68250.40',
        resolutionLabel: '15m',
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
                  name: 'deepx_place_order',
                  args: {
                    network: 'deepx_devnet',
                    pair: 'ETH-USDC',
                    side: 'BUY',
                    type: 'LIMIT',
                    size: '0',
                    price: '1000',
                  },
                },
              ],
            };
          }

          return {
            text: 'The requested order was invalid because size must be positive.',
          };
        },
      },
    };

    const result = await requestAgentChat({
      messages: [{ id: 'user-1', role: 'user', content: 'Plan a bad order.' }],
      context: {
        pairLabel: 'BTC-USDC',
        priceLabel: '68250.40',
        resolutionLabel: '15m',
      },
      client,
    });

    expect(result).toBe(
      'The requested order was invalid because size must be positive.',
    );
    const secondCallContents = calls[1]?.contents as Content[];
    expect(secondCallContents.at(-1)).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call-2',
            name: 'deepx_place_order',
            response: {
              error: {
                message: 'Invalid size. Expected a positive number.',
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
          pairLabel: 'BTC-USDC',
          priceLabel: '68250.40',
          resolutionLabel: '15m',
        },
      }),
    ).rejects.toThrowError('No user prompt available for the DeepX agent.');
  });
});
