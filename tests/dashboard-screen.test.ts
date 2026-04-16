import { describe, expect, test } from 'bun:test';

import {
  getAssistantMessageSegments,
  getCommandMessageSegments,
  getDashboardLayoutSlots,
  getInitialOutputView,
  getTranscriptMessageSpacing,
  getWelcomeLogoFrames,
  getWorkspaceHeight,
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

  test('blinks twice after the final light sweep, then settles lit', () => {
    const totalDots = WELCOME_LOGO_LINES.reduce(
      (count, entry) =>
        count +
        entry.line.split(' ').filter((character) => character === '●').length,
      0,
    );
    const blinkOffFrame = getWelcomeLogoFrames(totalDots + 1);
    expect(
      blinkOffFrame.flatMap((entry) =>
        entry.segments.filter(
          (segment) => segment.character === '●' && segment.color === '#34FFAD',
        ),
      ),
    ).toHaveLength(0);

    const settledFrame = getWelcomeLogoFrames(totalDots + 2);
    expect(
      settledFrame.flatMap((entry) =>
        entry.segments.filter(
          (segment) => segment.character === '●' && segment.color === '#34FFAD',
        ),
      ),
    ).toHaveLength(totalDots);

    const secondBlinkOffFrame = getWelcomeLogoFrames(totalDots + 3);
    expect(
      secondBlinkOffFrame.flatMap((entry) =>
        entry.segments.filter(
          (segment) => segment.character === '●' && segment.color === '#34FFAD',
        ),
      ),
    ).toHaveLength(0);

    const finalSettledFrame = getWelcomeLogoFrames(totalDots + 4);
    expect(
      finalSettledFrame.flatMap((entry) =>
        entry.segments.filter(
          (segment) => segment.character === '●' && segment.color === '#34FFAD',
        ),
      ),
    ).toHaveLength(totalDots);
  });

  test('highlights slash-command names inside transcript entries', () => {
    expect(getCommandMessageSegments('/orderbook')).toEqual([
      { text: '/', color: 'gray' },
      { text: 'orderbook', color: '#AAB6FF' },
    ]);
  });

  test('highlights submitted order assistant messages for terminal readability', () => {
    expect(
      getAssistantMessageSegments(
        'Order submitted\nSide: BUY\nExplorer: https://explorer-testnet.deepx.fi/tx/0xabc',
      ),
    ).toEqual([
      {
        key: 'assistant-0-Order submitted',
        text: 'Order submitted',
        color: 'green',
      },
      { key: 'assistant-1-\n', text: '\n', color: '#7FDBFF' },
      { key: 'assistant-2-Side:', text: 'Side:', color: '#D7E3F4' },
      { key: 'assistant-3- ', text: ' ', color: '#7FDBFF' },
      { key: 'assistant-4-BUY', text: 'BUY', color: '#28DE9C' },
      { key: 'assistant-5-\n', text: '\n', color: '#7FDBFF' },
      { key: 'assistant-6-Explorer:', text: 'Explorer:', color: '#D7E3F4' },
      { key: 'assistant-7- ', text: ' ', color: '#7FDBFF' },
      {
        key: 'assistant-8-https://explorer-testnet.deepx.fi/tx/0xabc',
        text: 'https://explorer-testnet.deepx.fi/tx/0xabc',
        color: '#AAB6FF',
      },
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
    expect(buildHelpLines('deepx')).toContain(
      '- optional debug mode writes expanded logs to a local debug file',
    );
  });

  test('starts with an empty workspace in both modes', () => {
    expect(getInitialOutputView('debug')).toEqual({ kind: 'empty' });
    expect(getInitialOutputView('default')).toEqual({ kind: 'empty' });
  });

  test('adds a blank line between user and assistant transcript messages', () => {
    expect(getTranscriptMessageSpacing('user', 'assistant')).toBe(1);
    expect(getTranscriptMessageSpacing('assistant', 'user')).toBe(0);
    expect(getTranscriptMessageSpacing('assistant', 'assistant')).toBe(0);
  });

  test('renders the slash-command selector below the input bar', () => {
    expect(
      getDashboardLayoutSlots({
        shellMode: 'chat',
        isCommandPaletteVisible: true,
        hasPendingTransactionConfirmation: false,
        hasPendingAgentAction: false,
        outputView: { kind: 'help' },
      }),
    ).toEqual({
      showPairPicker: false,
      showOutputView: true,
      showCommandPaletteBelowInput: true,
      showTransactionConfirmationBelowInput: false,
      showAgentActionBelowInput: false,
    });
  });

  test('renders the transaction confirmation selector below the input bar', () => {
    expect(
      getDashboardLayoutSlots({
        shellMode: 'chat',
        isCommandPaletteVisible: false,
        hasPendingTransactionConfirmation: true,
        hasPendingAgentAction: false,
        outputView: { kind: 'empty' },
      }),
    ).toEqual({
      showPairPicker: false,
      showOutputView: false,
      showCommandPaletteBelowInput: false,
      showTransactionConfirmationBelowInput: true,
      showAgentActionBelowInput: false,
    });
  });

  test('renders the agent action selector below the input bar', () => {
    expect(
      getDashboardLayoutSlots({
        shellMode: 'chat',
        isCommandPaletteVisible: false,
        hasPendingTransactionConfirmation: false,
        hasPendingAgentAction: true,
        outputView: { kind: 'empty' },
      }),
    ).toEqual({
      showPairPicker: false,
      showOutputView: false,
      showCommandPaletteBelowInput: false,
      showTransactionConfirmationBelowInput: false,
      showAgentActionBelowInput: true,
    });
  });

  test('hides the transaction selector behind command and pair selectors', () => {
    expect(
      getDashboardLayoutSlots({
        shellMode: 'chat',
        isCommandPaletteVisible: true,
        hasPendingTransactionConfirmation: true,
        hasPendingAgentAction: false,
        outputView: { kind: 'empty' },
      }).showTransactionConfirmationBelowInput,
    ).toBe(false);
    expect(
      getDashboardLayoutSlots({
        shellMode: 'pair-select',
        pendingCommand: 'candle',
        isCommandPaletteVisible: false,
        hasPendingTransactionConfirmation: true,
        hasPendingAgentAction: false,
        outputView: { kind: 'empty' },
      }).showTransactionConfirmationBelowInput,
    ).toBe(false);
  });

  test('shows pair selection below the input bar while keeping the workspace visible', () => {
    expect(
      getDashboardLayoutSlots({
        shellMode: 'pair-select',
        pendingCommand: 'orderbook',
        isCommandPaletteVisible: true,
        hasPendingTransactionConfirmation: true,
        hasPendingAgentAction: true,
        outputView: { kind: 'candle' },
      }),
    ).toEqual({
      showPairPicker: true,
      showOutputView: true,
      showCommandPaletteBelowInput: false,
      showTransactionConfirmationBelowInput: false,
      showAgentActionBelowInput: false,
    });
  });

  test('scales workspace height with terminal rows', () => {
    expect(getWorkspaceHeight(undefined)).toBe(22);
    expect(getWorkspaceHeight(40)).toBe(22);
    expect(getWorkspaceHeight(56)).toBe(38);
  });
});
