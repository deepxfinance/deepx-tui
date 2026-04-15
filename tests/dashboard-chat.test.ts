import { describe, expect, test } from 'bun:test';

import {
  appendChatMessage,
  buildChatSystemPrompt,
  buildGenAiContents,
  createChatMessage,
  createInitialChatMessages,
  getChatLoadingMessage,
  getChatLoadingSegments,
  getVisibleChatMessages,
} from '../src/lib/dashboard-chat';

describe('dashboard chat', () => {
  test('builds a system prompt with market context', () => {
    const prompt = buildChatSystemPrompt({
      network: 'deepx_testnet',
      pairLabel: 'BTC-USDC',
      priceLabel: '68250.40',
      resolutionLabel: '15m',
      walletUnlocked: true,
    });

    expect(prompt).toContain('already unlocked');
    expect(prompt).toContain('status=submitted');
    expect(prompt).toContain('never set confirm=true from AI chat');
    expect(prompt).toContain('chooses Confirm in the below-input selector');
    expect(prompt).toContain(
      'Do not tell the user to use an Order Entry panel',
    );
    expect(prompt).toContain('always include that transaction explorer link');
    expect(prompt).toContain('compact terminal-friendly block');
    expect(prompt).toContain('Use uppercase BUY or SELL exactly');
    expect(prompt).toContain(
      'Do not switch between perp and spot markets unless the user explicitly names the pair format or explicitly asks for spot or perp.',
    );
    expect(prompt).toContain(
      'If the active pair is SOL-USDC and the user says buy SOL, prepare SOL-USDC, not SOL/USDC.',
    );
    expect(prompt).toContain(
      'The current terminal session network is deepx_testnet; use that network for tool calls unless the user explicitly asks for a different one.',
    );
  });

  test('maps chat history into GenAI contents', () => {
    expect(
      buildGenAiContents([
        { id: 'user-1', role: 'user', content: 'hello' },
        { id: 'command-2', role: 'command', content: '/help' },
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

  test('builds shimmer segments for the loading message', () => {
    expect(getChatLoadingSegments(0)).toEqual([
      {
        key: 'loading-0-T',
        text: 'T',
        color: '#2D7FA3',
        dimColor: false,
        bold: false,
      },
      {
        key: 'loading-1-h',
        text: 'h',
        color: undefined,
        dimColor: true,
        bold: false,
      },
      {
        key: 'loading-2-i',
        text: 'i',
        color: undefined,
        dimColor: true,
        bold: false,
      },
      {
        key: 'loading-3-n',
        text: 'n',
        color: undefined,
        dimColor: true,
        bold: false,
      },
      {
        key: 'loading-4-k',
        text: 'k',
        color: undefined,
        dimColor: true,
        bold: false,
      },
      {
        key: 'loading-5-i',
        text: 'i',
        color: undefined,
        dimColor: true,
        bold: false,
      },
      {
        key: 'loading-6-n',
        text: 'n',
        color: undefined,
        dimColor: true,
        bold: false,
      },
      {
        key: 'loading-7-g',
        text: 'g',
        color: undefined,
        dimColor: true,
        bold: false,
      },
      {
        key: 'loading-8-dot',
        text: '.',
        color: undefined,
        dimColor: true,
        bold: false,
      },
    ]);
    expect(
      getChatLoadingSegments(1)
        .map((segment) => segment.text)
        .join(''),
    ).toBe('Thinking.');
    expect(getChatLoadingSegments(8).slice(3, 9)).toEqual([
      {
        key: 'loading-3-n',
        text: 'n',
        color: '#4BB6E3',
        dimColor: false,
        bold: false,
      },
      {
        key: 'loading-4-k',
        text: 'k',
        color: '#7FDBFF',
        dimColor: false,
        bold: false,
      },
      {
        key: 'loading-5-i',
        text: 'i',
        color: '#F2FDFF',
        dimColor: false,
        bold: true,
      },
      {
        key: 'loading-6-n',
        text: 'n',
        color: '#7FDBFF',
        dimColor: false,
        bold: false,
      },
      {
        key: 'loading-7-g',
        text: 'g',
        color: '#4BB6E3',
        dimColor: false,
        bold: false,
      },
      {
        key: 'loading-8-dot',
        text: '.',
        color: '#2D7FA3',
        dimColor: false,
        bold: false,
      },
    ]);
  });
});
