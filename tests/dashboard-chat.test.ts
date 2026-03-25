import { describe, expect, test } from 'bun:test';

import {
  appendChatMessage,
  buildChatSystemPrompt,
  buildGeminiContents,
  createChatMessage,
  createInitialChatMessages,
  getVisibleChatMessages,
} from '../src/lib/dashboard-chat';

describe('dashboard chat', () => {
  test('builds a system prompt with market context', () => {
    expect(
      buildChatSystemPrompt({
        pairLabel: 'BTC-USDC',
        priceLabel: '68250.40',
        resolutionLabel: '15m',
      }),
    ).toContain('BTC-USDC');
  });

  test('maps chat history into Gemini contents', () => {
    expect(
      buildGeminiContents([
        { id: 'user-1', role: 'user', content: 'hello' },
        { id: 'assistant-2', role: 'assistant', content: 'hi' },
      ]),
    ).toEqual([
      { role: 'user', parts: [{ text: 'hello' }] },
      { role: 'model', parts: [{ text: 'hi' }] },
    ]);
  });

  test('caps the conversation to the newest messages', () => {
    let messages = createInitialChatMessages();

    for (let index = 0; index < 8; index += 1) {
      messages = appendChatMessage(messages, 'user', `message ${index}`);
      messages = appendChatMessage(messages, 'assistant', `reply ${index}`);
    }

    expect(messages).toHaveLength(12);
    expect(messages[0]?.content).toBe('message 2');
    expect(messages.at(-2)?.content).toBe('message 7');
    expect(messages.at(-1)?.content).toBe('reply 7');
    expect(messages.at(-1)?.role).toBe('assistant');
  });

  test('returns the most recent visible messages', () => {
    const messages = [
      { id: 'assistant-1', role: 'assistant' as const, content: 'a' },
      { id: 'user-2', role: 'user' as const, content: 'b' },
      { id: 'assistant-3', role: 'assistant' as const, content: 'c' },
    ];

    expect(getVisibleChatMessages(messages, 2)).toEqual([
      { id: 'user-2', role: 'user', content: 'b' },
      { id: 'assistant-3', role: 'assistant', content: 'c' },
    ]);
  });

  test('creates stable incrementing chat ids', () => {
    expect(
      createChatMessage('assistant', 'next', [
        { id: 'assistant-7', role: 'assistant', content: 'prev' },
      ]),
    ).toEqual({
      id: 'assistant-8',
      role: 'assistant',
      content: 'next',
    });
  });
});
