import { describe, expect, test } from 'bun:test';

import {
  formatChatComposerLine,
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

  test('renders a visible cursor for the active empty chat composer', () => {
    expect(formatChatComposerLine('', 'chat')).toBe(
      '> █ Ask about the market, keys, or the current pair...',
    );
  });

  test('renders a trailing cursor for active chat input', () => {
    expect(formatChatComposerLine('0.01', 'chat')).toBe('> 0.01█');
  });
});
