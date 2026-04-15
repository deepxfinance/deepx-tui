import { describe, expect, test } from 'bun:test';

import {
  getCommandMessageSegments,
  getDashboardLayoutSlots,
  getWelcomeLogoFrames,
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

  test('lights large dots from top-left to bottom-right during the enter animation', () => {
    const firstFrame = getWelcomeLogoFrames(1);
    expect(
      firstFrame[0]?.segments
        .filter(
          (segment) => segment.character === '●' && segment.color === '#34FFAD',
        )
        .map((segment) => segment.key),
    ).toEqual(['logo-1-0']);

    const midFrame = getWelcomeLogoFrames(13);
    expect(
      midFrame[0]?.segments
        .filter(
          (segment) => segment.character === '●' && segment.color === '#34FFAD',
        )
        .map((segment) => segment.key),
    ).toEqual([
      'logo-1-0',
      'logo-1-1',
      'logo-1-2',
      'logo-1-3',
      'logo-1-4',
      'logo-1-5',
      'logo-1-10',
      'logo-1-11',
      'logo-1-12',
      'logo-1-13',
      'logo-1-14',
      'logo-1-15',
    ]);
    expect(
      midFrame[1]?.segments
        .filter(
          (segment) => segment.character === '●' && segment.color === '#34FFAD',
        )
        .map((segment) => segment.key),
    ).toEqual(['logo-2-2']);
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

  test('renders the slash-command selector below the input bar', () => {
    expect(
      getDashboardLayoutSlots({
        shellMode: 'chat',
        isCommandPaletteVisible: true,
        outputView: { kind: 'help' },
      }),
    ).toEqual({
      showPairPicker: false,
      showOutputView: true,
      showCommandPaletteBelowInput: true,
    });
  });

  test('keeps pair selection ahead of the input bar and hides the selector', () => {
    expect(
      getDashboardLayoutSlots({
        shellMode: 'pair-select',
        pendingCommand: 'orderbook',
        isCommandPaletteVisible: true,
        outputView: { kind: 'candle' },
      }),
    ).toEqual({
      showPairPicker: true,
      showOutputView: false,
      showCommandPaletteBelowInput: false,
    });
  });
});
