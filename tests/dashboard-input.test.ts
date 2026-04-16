import { describe, expect, test } from 'bun:test';

import {
  buildCommandPaletteItems,
  buildPairPickerItems,
  formatHistoryLine,
  formatNetworkLine,
  formatShellComposerLine,
  getHistoryValue,
  getNextWordIndex,
  getPrevWordIndex,
  insertCharAt,
  isSlashCommandInput,
  moveSelectionIndex,
  parseShellComposerParts,
  parseShellInput,
  removeCharAt,
  removeLineAfter,
  removeLineBefore,
  removeWordAfter,
  removeWordBefore,
} from '../src/lib/dashboard-input';

describe('dashboard input helpers', () => {
  describe('shell composer parsing', () => {
    test('splits text into before, at, and after segments', () => {
      expect(parseShellComposerParts('hello', 0)).toEqual({
        before: '',
        at: 'h',
        after: 'ello',
      });
      expect(parseShellComposerParts('hello', 2)).toEqual({
        before: 'he',
        at: 'l',
        after: 'lo',
      });
      expect(parseShellComposerParts('hello', 5)).toEqual({
        before: 'hello',
        at: '',
        after: '',
      });
    });

    test('handles empty input', () => {
      expect(parseShellComposerParts('', 0)).toEqual({
        before: '',
        at: '',
        after: '',
      });
    });
  });

  test('parses supported slash commands', () => {
    expect(parseShellInput('/candle')).toEqual({
      kind: 'command',
      command: 'candle',
    });
    expect(parseShellInput('/orderbook')).toEqual({
      kind: 'command',
      command: 'orderbook',
    });
    expect(parseShellInput('/help')).toEqual({
      kind: 'command',
      command: 'help',
    });
  });

  test('treats unknown slash input as chat', () => {
    expect(parseShellInput('/unknown')).toEqual({
      kind: 'chat',
      message: '/unknown',
    });
  });

  test('renders a visible cursor for the active empty shell input', () => {
    expect(formatShellComposerLine('', 0, true)).toBe(
      '> █ Type a message or use /orderbook, /help',
    );
  });

  test('renders the cursor at a specific position without shifting text', () => {
    const inverseBlock = '\x1b[7m \x1b[0m';
    const inverseH = '\x1b[7mh\x1b[0m';
    const inverseL = '\x1b[7ml\x1b[0m';

    expect(formatShellComposerLine('hello', 0, true)).toBe(`> ${inverseH}ello`);
    expect(formatShellComposerLine('hello', 2, true)).toBe(`> he${inverseL}lo`);
    expect(formatShellComposerLine('hello', 5, true)).toBe(
      `> hello${inverseBlock}`,
    );
  });

  describe('word navigation and deletion', () => {
    const text = 'hello world  deepx-tui';

    test('finds the previous word boundary', () => {
      expect(getPrevWordIndex(text, 22)).toBe(19);
      expect(getPrevWordIndex(text, 19)).toBe(13);
      expect(getPrevWordIndex(text, 13)).toBe(6);
      expect(getPrevWordIndex(text, 6)).toBe(0);
      expect(getPrevWordIndex(text, 0)).toBe(0);
    });

    test('finds the next word boundary', () => {
      expect(getNextWordIndex(text, 0)).toBe(5);
      expect(getNextWordIndex(text, 5)).toBe(11);
      expect(getNextWordIndex(text, 11)).toBe(18);
      expect(getNextWordIndex(text, 18)).toBe(22);
      expect(getNextWordIndex(text, 22)).toBe(22);
    });

    test('removes the word before the cursor', () => {
      expect(removeWordBefore(text, 5)).toBe(' world  deepx-tui');
      expect(removeWordBefore(text, 19)).toBe('hello world  tui');
      expect(removeWordBefore(text, 22)).toBe('hello world  deepx-');
    });

    test('removes the word after the cursor', () => {
      expect(removeWordAfter(text, 0)).toBe(' world  deepx-tui');
      expect(removeWordAfter(text, 5)).toBe('hello  deepx-tui');
      expect(removeWordAfter(text, 11)).toBe('hello world-tui');
    });

    test('clears line content before and after the cursor', () => {
      expect(removeLineBefore('hello world', 5)).toBe(' world');
      expect(removeLineBefore('hello world', 0)).toBe('hello world');
      expect(removeLineBefore('hello world', 11)).toBe('');
      expect(removeLineAfter('hello world', 5)).toBe('hello');
      expect(removeLineAfter('hello world', 0)).toBe('');
      expect(removeLineAfter('hello world', 11)).toBe('hello world');
    });
  });

  describe('input text manipulation', () => {
    test('inserts a character at the cursor', () => {
      expect(insertCharAt('hello', 2, 'X')).toBe('heXllo');
      expect(insertCharAt('hello', 0, 'X')).toBe('Xhello');
      expect(insertCharAt('hello', 5, 'X')).toBe('helloX');
    });

    test('deletes a character before the cursor', () => {
      expect(removeCharAt('hello', 2)).toBe('hllo');
      expect(removeCharAt('hello', 0)).toBe('hello');
      expect(removeCharAt('hello', 5)).toBe('hell');
    });

    test('deletes a character at the cursor', () => {
      expect(removeCharAt('hello', 2, true)).toBe('helo');
      expect(removeCharAt('hello', 0, true)).toBe('ello');
      expect(removeCharAt('hello', 5, true)).toBe('hello');
    });
  });

  test('detects live slash-command input for palette mode', () => {
    expect(isSlashCommandInput('/')).toBe(true);
    expect(isSlashCommandInput('  /ord')).toBe(true);
    expect(isSlashCommandInput('buy eth')).toBe(false);
  });

  test('builds a filtered slash-command palette', () => {
    expect(buildCommandPaletteItems('/').map((item) => item.label)).toEqual([
      '/orderbook',
      '/help',
    ]);
    expect(buildCommandPaletteItems('/can')).toEqual([]);
    expect(buildCommandPaletteItems('/ord').map((item) => item.label)).toEqual([
      '/orderbook',
    ]);
    expect(buildCommandPaletteItems('/unknown')).toEqual([]);
  });

  test('renders recent history entries above the input', () => {
    expect(formatHistoryLine(['hello', '/candle', 'orderbook:ETH-USDC'])).toBe(
      'History: hello  |  /candle  |  orderbook:ETH-USDC',
    );
  });

  test('renders the persistent network line', () => {
    expect(
      formatNetworkLine({
        networkLabel: 'DeepX Devnet',
        walletAddress: '0x1234000000000000000000000000000000005678',
        walletUnlocked: false,
      }),
    ).toContain('Network: DeepX Devnet');
  });

  test('moves pair selection with wraparound', () => {
    expect(moveSelectionIndex(0, 4, -1)).toBe(3);
    expect(moveSelectionIndex(3, 4, 1)).toBe(0);
  });

  test('builds pair picker items from market pairs', () => {
    expect(
      buildPairPickerItems([
        { label: 'SOL-USDC', kind: 'perp' },
        { label: 'BTC-USDC', kind: 'perp' },
        { label: 'ETH-USDC', kind: 'perp' },
        { label: 'SOL/USDC', kind: 'spot' },
      ]),
    ).toEqual([
      { label: 'ETH-USDC', description: 'PERP' },
      { label: 'SOL-USDC', description: 'PERP' },
      { label: 'SOL/USDC', description: 'SPOT' },
    ]);
  });

  describe('history navigation', () => {
    const history = ['first', 'second', 'third'];

    test('moves up from a draft to the latest history item', () => {
      const { nextIndex, nextValue } = getHistoryValue(
        history,
        null,
        'up',
        'draft',
      );
      expect(nextIndex).toBe(2);
      expect(nextValue).toBe('third');
    });

    test('moves up through history', () => {
      const { nextIndex, nextValue } = getHistoryValue(
        history,
        2,
        'up',
        'draft',
      );
      expect(nextIndex).toBe(1);
      expect(nextValue).toBe('second');

      const next = getHistoryValue(history, 1, 'up', 'draft');
      expect(next.nextIndex).toBe(0);
      expect(next.nextValue).toBe('first');
    });

    test('stays at the first history item when moving up from index zero', () => {
      const next = getHistoryValue(history, 0, 'up', 'draft');
      expect(next.nextIndex).toBe(0);
      expect(next.nextValue).toBe('first');
    });

    test('moves down through history', () => {
      const next = getHistoryValue(history, 0, 'down', 'draft');
      expect(next.nextIndex).toBe(1);
      expect(next.nextValue).toBe('second');
    });

    test('returns to the draft after the last history item', () => {
      const next = getHistoryValue(history, 2, 'down', 'draft');
      expect(next.nextIndex).toBe(null);
      expect(next.nextValue).toBe('draft');
    });

    test('keeps the draft when already outside history', () => {
      const next = getHistoryValue(history, null, 'down', 'draft');
      expect(next.nextIndex).toBe(null);
      expect(next.nextValue).toBe('draft');
    });

    test('handles empty history', () => {
      const next = getHistoryValue([], null, 'up', 'draft');
      expect(next.nextIndex).toBe(null);
      expect(next.nextValue).toBe('draft');
    });
  });
});
