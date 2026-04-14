import { describe, expect, test } from 'bun:test';

import { WELCOME_LOGO_LINES } from '../src/screens/dashboard-screen';

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
});
