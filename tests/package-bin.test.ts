import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('package bin entrypoints', () => {
  test('exposes the deepx executable', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      bin?: Record<string, string>;
    };

    expect(packageJson.bin).toEqual({
      deepx: './bin/deepx',
    });
  });
});
