import { describe, expect, test } from 'bun:test';

import { parseCliArgs } from '../src/lib/parse-cli-args';

describe('parseCliArgs', () => {
  test('defaults to devnet', () => {
    expect(parseCliArgs([]).network.id).toBe('deepx_devnet');
  });

  test('normalizes testnet aliases', () => {
    expect(parseCliArgs(['--network', 'testnet']).network.id).toBe(
      'deepx_testnet',
    );
    expect(parseCliArgs(['-n', 'deepx_testnet']).network.id).toBe(
      'deepx_testnet',
    );
  });

  test('preserves passthrough args not consumed by cli flags', () => {
    expect(
      parseCliArgs(['--network', 'devnet', 'markets', '--foo']).passthroughArgs,
    ).toEqual(['markets', '--foo']);
  });
});
