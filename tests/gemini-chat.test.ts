import { describe, expect, test } from 'bun:test';

import {
  buildGeminiCliPrompt,
  extractGeminiCliError,
  normalizeGeminiCliOutput,
} from '../src/services/gemini-chat';

describe('gemini chat service', () => {
  test('builds a Gemini CLI prompt with system context and history', () => {
    expect(
      buildGeminiCliPrompt(
        [{ id: 'user-1', role: 'user', content: 'What changed?' }],
        {
          pairLabel: 'BTC-USDC',
          priceLabel: '68250.40',
          resolutionLabel: '15m',
        },
      ),
    ).toContain('Active pair: BTC-USDC.');
  });

  test('normalizes Gemini CLI output', () => {
    expect(
      normalizeGeminiCliOutput('\u001b[32mFirst line\nSecond line\u001b[0m\n'),
    ).toBe('First line\nSecond line');
  });

  test('extracts Gemini CLI stderr details', () => {
    expect(extractGeminiCliError('\u001b[31mAuth failed\u001b[0m\n', 1)).toBe(
      'Auth failed',
    );
  });
});
