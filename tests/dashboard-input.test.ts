import { describe, expect, test } from 'bun:test';

import {
  cycleFocusTarget,
  formatChatComposerLine,
  formatDebugFilterLine,
  getPairKindShortcut,
} from '../src/lib/dashboard-input';

describe('dashboard input helpers', () => {
  test('keeps pair-switch shortcuts inactive while chat is focused', () => {
    expect(getPairKindShortcut('1', 'chat')).toBeNull();
    expect(getPairKindShortcut('2', 'chat')).toBeNull();
  });

  test('returns pair-switch shortcuts outside chat focus', () => {
    expect(getPairKindShortcut('1', 'pairs')).toBe('perp');
    expect(getPairKindShortcut('2', 'chart')).toBe('spot');
  });

  test('cycles focus through the trades panel before chat', () => {
    expect(cycleFocusTarget('pairs')).toBe('chart');
    expect(cycleFocusTarget('chart')).toBe('orderbook');
    expect(cycleFocusTarget('orderbook')).toBe('trades');
    expect(cycleFocusTarget('trades')).toBe('chat');
    expect(cycleFocusTarget('chat')).toBe('pairs');
  });

  test('cycles focus into debug when debug mode is enabled', () => {
    expect(cycleFocusTarget('chat', true)).toBe('debug');
    expect(cycleFocusTarget('debug', true)).toBe('pairs');
  });

  test('renders a visible cursor for the active empty chat composer', () => {
    expect(formatChatComposerLine('', 'chat')).toBe(
      '> █ Ask about the market, keys, or the current pair...',
    );
  });

  test('renders a trailing cursor for active chat input', () => {
    expect(formatChatComposerLine('0.01', 'chat')).toBe('> 0.01█');
  });

  test('renders a visible cursor for the active debug filter', () => {
    expect(formatDebugFilterLine('', 'debug')).toBe(
      'filter> █ Filter logs by scope, message, or details...',
    );
    expect(formatDebugFilterLine('relay', 'debug')).toBe('filter> relay█');
  });
});
