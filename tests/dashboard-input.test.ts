import { describe, expect, test } from 'bun:test';

import {
  buildPairPickerItems,
  formatHistoryLine,
  formatNetworkLine,
  formatShellComposerLine,
  moveSelectionIndex,
  parseShellInput,
} from '../src/lib/dashboard-input';

describe('dashboard input helpers', () => {
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
    expect(formatShellComposerLine('', true)).toBe(
      '> █ Type a message or use /candle, /orderbook, /help',
    );
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
});
