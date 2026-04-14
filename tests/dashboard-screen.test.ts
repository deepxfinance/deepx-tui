import { describe, expect, test } from 'bun:test';

import {
  getCommandMessageSegments,
  WELCOME_LOGO_LINES,
} from '../src/screens/dashboard-screen';
import { buildHelpLines } from '../src/screens/help-screen';

describe('dashboard welcome logo', () => {
  test('renders the expected five-line mark', () => {
    expect(WELCOME_LOGO_LINES.map((entry) => entry.line)).toEqual([
      '● ● ● ● ● ● · · · · ● ● ● ● ● ●',
      '· · ● ● ● ● ● · · ● ● ● ● ● · ·',
      '· · · · · ● ● ● ● ● ● · · · · ·',
      '· · ● ● ● ● ● · · ● ● ● ● ● · ·',
      '● ● ● ● ● ● · · · · ● ● ● ● ● ●',
    ]);
  });

  test('highlights slash-command names inside transcript entries', () => {
    expect(getCommandMessageSegments('/orderbook')).toEqual([
      { text: '/', color: 'gray' },
      { text: 'orderbook', color: '#AAB6FF' },
    ]);
  });

  test('keeps non-slash command transcript entries in the base command color', () => {
    expect(getCommandMessageSegments('└ ETH/USDC')).toEqual([
      { text: '└ ETH/USDC', color: 'gray' },
    ]);
  });

  test('dashboard help content includes the slash command summary', () => {
    expect(buildHelpLines('deepx')).toContain(
      '- /help: show this help summary inside the dashboard',
    );
    expect(buildHelpLines('deepx')).toContain(
      '- /candle: open the live candle chart for a selected pair',
    );
  });
});
