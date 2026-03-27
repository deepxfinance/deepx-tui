import { describe, expect, test } from 'bun:test';

import {
  appendChatMessage,
  buildChatSystemPrompt,
  buildGenAiContents,
  createChatMessage,
  createInitialChatMessages,
  getChatLoadingMessage,
  getVisibleChatMessages,
} from '../src/lib/dashboard-chat';

describe('dashboard chat', () => {
  test('builds a system prompt with market context', () => {
    const prompt = buildChatSystemPrompt({
      pairLabel: 'BTC-USDC',
      priceLabel: '68250.40',
      resolutionLabel: '15m',
      walletUnlocked: true,
    });

    expect(prompt).toContain('BTC-USDC');
    expect(prompt).toContain('already unlocked');
    expect(prompt).toContain('status=submitted');
    expect(prompt).toContain('Do not ask for the passphrase again');
  });

  test('maps chat history into GenAI contents', () => {
    expect(
      buildGenAiContents([
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

  test('cycles a deterministic loading message', () => {
    expect(getChatLoadingMessage(0)).toBe('Thinking.');
    expect(getChatLoadingMessage(1)).toBe('Thinking..');
    expect(getChatLoadingMessage(2)).toBe('Thinking...');
    expect(getChatLoadingMessage(3)).toBe('Thinking.');
  });
});
