import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CLI_VERSION } from '../src/lib/cli-version';

describe('CLI version metadata', () => {
  test('stays aligned with package.json', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      version?: string;
    };

    const version = packageJson.version ?? '';

    expect(version).not.toBe('');
    expect(CLI_VERSION).toBe(version);
  });
});
