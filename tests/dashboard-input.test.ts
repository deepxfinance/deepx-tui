import { describe, expect, test } from 'bun:test';

import {
  buildPairPickerItems,
  formatHistoryLine,
  formatNetworkLine,
  formatShellComposerLine,
  getHistoryValue,
  getNextWordIndex,
  getPrevWordIndex,
  insertCharAt,
  moveSelectionIndex,
  parseShellComposerParts,
  parseShellInput,
  removeCharAt,
  removeLineAfter,
  removeLineBefore,
  removeWordBefore,
} from '../src/lib/dashboard-input';

describe('dashboard input helpers', () => {
  describe('shell composer parsing', () => {
    test('splits text into before, at, after', () => {
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
      '> █ Type a message or use /candle, /orderbook, /help',
    );
  });

  test('renders a visible cursor at a specific index without shifting text', () => {
    const INVERSE_BLOCK = '\x1b[7m \x1b[0m';
    const INVERSE_H = '\x1b[7mh\x1b[0m';
    const INVERSE_L = '\x1b[7ml\x1b[0m';

    expect(formatShellComposerLine('hello', 0, true)).toBe(
      `> ${INVERSE_H}ello`,
    );
    expect(formatShellComposerLine('hello', 2, true)).toBe(
      `> he${INVERSE_L}lo`,
    );
    expect(formatShellComposerLine('hello', 5, true)).toBe(
      `> hello${INVERSE_BLOCK}`,
    );
  });

  describe('word navigation and deletion', () => {
    const text = 'hello world  deepx-tui';
    // Positions:
    // h e l l o   w o r l d     d e e p x - t u i
    // 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21
    // word boundaries (start of word/end of separators):
    // 0 ('hello'), 6 ('world'), 13 ('deepx'), 19 ('tui')

    test('finds previous word boundary', () => {
      expect(getPrevWordIndex(text, 22)).toBe(19); // end to start of 'tui'
      expect(getPrevWordIndex(text, 19)).toBe(13); // start of 'tui' to start of 'deepx'
      expect(getPrevWordIndex(text, 13)).toBe(6); // start of 'deepx' to start of 'world'
      expect(getPrevWordIndex(text, 6)).toBe(0); // start of 'world' to start of 'hello'
      expect(getPrevWordIndex(text, 0)).toBe(0);
    });

    test('finds next word boundary', () => {
      expect(getNextWordIndex(text, 0)).toBe(5); // start of 'hello' to end of 'hello'
      expect(getNextWordIndex(text, 5)).toBe(11); // end of 'hello' to end of 'world'
      expect(getNextWordIndex(text, 11)).toBe(18); // end of 'world' to end of 'deepx'
      expect(getNextWordIndex(text, 18)).toBe(22); // end of 'deepx' to end of 'tui'
      expect(getNextWordIndex(text, 22)).toBe(22);
    });

    test('removes word before cursor', () => {
      expect(removeWordBefore(text, 5)).toBe(' world  deepx-tui');
      expect(removeWordBefore(text, 19)).toBe('hello world  tui');
      expect(removeWordBefore(text, 22)).toBe('hello world  deepx-');
    });

    test('removes line before cursor (Ctrl+U)', () => {
      expect(removeLineBefore('hello world', 5)).toBe(' world');
      expect(removeLineBefore('hello world', 0)).toBe('hello world');
      expect(removeLineBefore('hello world', 11)).toBe('');
    });

    test('removes line after cursor (Ctrl+K)', () => {
      expect(removeLineAfter('hello world', 5)).toBe('hello');
      expect(removeLineAfter('hello world', 0)).toBe('');
      expect(removeLineAfter('hello world', 11)).toBe('hello world');
    });
  });

  describe('input text manipulation', () => {
    test('inserts character at cursor', () => {
      expect(insertCharAt('hello', 2, 'X')).toBe('heXllo');
      expect(insertCharAt('hello', 0, 'X')).toBe('Xhello');
      expect(insertCharAt('hello', 5, 'X')).toBe('helloX');
    });

    test('deletes character before cursor (backspace)', () => {
      expect(removeCharAt('hello', 2)).toBe('hllo');
      expect(removeCharAt('hello', 0)).toBe('hello');
      expect(removeCharAt('hello', 5)).toBe('hell');
    });

    test('deletes character at cursor (delete)', () => {
      expect(removeCharAt('hello', 2, true)).toBe('helo');
      expect(removeCharAt('hello', 0, true)).toBe('ello');
      expect(removeCharAt('hello', 5, true)).toBe('hello');
    });
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
        { label: 'ETH-USDC', kind: 'perp' },
        { label: 'SOL/USDC', kind: 'spot' },
      ]),
    ).toEqual([
      { label: 'ETH-USDC', description: 'PERP' },
      { label: 'SOL/USDC', description: 'SPOT' },
    ]);
  });

  describe('history navigation', () => {
    const history = ['first', 'second', 'third'];

    test('moves up from draft to latest history item', () => {
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

      const { nextIndex: firstIndex, nextValue: firstValue } = getHistoryValue(
        history,
        1,
        'up',
        'draft',
      );
      expect(firstIndex).toBe(0);
      expect(firstValue).toBe('first');
    });

    test('stays at first item if moving up at index 0', () => {
      const { nextIndex, nextValue } = getHistoryValue(
        history,
        0,
        'up',
        'draft',
      );
      expect(nextIndex).toBe(0);
      expect(nextValue).toBe('first');
    });

    test('moves down through history', () => {
      const { nextIndex, nextValue } = getHistoryValue(
        history,
        0,
        'down',
        'draft',
      );
      expect(nextIndex).toBe(1);
      expect(nextValue).toBe('second');
    });

    test('returns to draft if moving down from last item', () => {
      const { nextIndex, nextValue } = getHistoryValue(
        history,
        2,
        'down',
        'draft',
      );
      expect(nextIndex).toBe(null);
      expect(nextValue).toBe('draft');
    });

    test('stays at draft if moving down with null index', () => {
      const { nextIndex, nextValue } = getHistoryValue(
        history,
        null,
        'down',
        'draft',
      );
      expect(nextIndex).toBe(null);
      expect(nextValue).toBe('draft');
    });

    test('handles empty history', () => {
      const { nextIndex, nextValue } = getHistoryValue([], null, 'up', 'draft');
      expect(nextIndex).toBe(null);
      expect(nextValue).toBe('draft');
    });
  });
});
