import { describe, expect, test } from 'bun:test';

import { formatFocusedInputValue, maskValue } from '../src/lib/format';

describe('format helpers', () => {
  test('keeps unfocused inputs unchanged', () => {
    expect(formatFocusedInputValue('******', false)).toBe('******');
  });

  test('renders a leading cursor for a focused empty input', () => {
    expect(formatFocusedInputValue(maskValue('', false), true)).toBe(
      '█ (empty)',
    );
  });

  test('renders a trailing cursor for a focused populated input', () => {
    expect(formatFocusedInputValue(maskValue('secret', false), true)).toBe(
      '******█',
    );
  });
});
