import { describe, expect, test } from 'bun:test';

import {
  buildDryRunSubaccountCreation,
  buildSubmittedSubaccountSummary,
  createSubaccountTool,
  encodeSubaccountName,
  initializeSubaccountLive,
} from '../src/services/subaccount-tools';

describe('subaccount tools', () => {
  test('encodes subaccount names as utf8 bytes', () => {
    expect(Array.from(encodeSubaccountName('main'))).toEqual([
      109, 97, 105, 110,
    ]);
  });

  test('requires a non-empty subaccount name', async () => {
    expect(() => encodeSubaccountName('   ')).toThrow(
      'Subaccount name is required.',
    );
    await expect(
      createSubaccountTool({ name: '   ', network: 'deepx_devnet' }),
    ).rejects.toThrow('Subaccount name is required.');
  });

  test('builds a dry-run creation ticket without confirmation', async () => {
    await expect(
      createSubaccountTool({ name: 'main', network: 'deepx_devnet' }),
    ).resolves.toEqual({
      status: 'dry_run',
      network: 'deepx_devnet',
      name: 'main',
      explorerUrl: 'http://explorer-devnetx.deepx.fi/tx',
      warnings: [
        'Confirmation flag was not set. Treat this as a planning ticket only.',
        'Dry-run only. No subaccount was created.',
        'Live subaccount creation requires an unlocked wallet session or explicit passphrase.',
      ],
      summary: 'Subaccount creation dry run\nName: main\nNetwork: DEVNET',
    });
  });

  test('builds a dry-run creation ticket helper', () => {
    expect(
      buildDryRunSubaccountCreation({
        network: 'deepx_testnet',
        name: 'strategy',
        hasConfirmation: true,
        hasPassphrase: false,
      }),
    ).toMatchObject({
      status: 'dry_run',
      network: 'deepx_testnet',
      name: 'strategy',
      warnings: [
        'Dry-run only. No subaccount was created.',
        'Live subaccount creation requires an unlocked wallet session or explicit passphrase.',
      ],
    });
  });

  test('requires explicit confirmation for live subaccount creation', async () => {
    await expect(
      initializeSubaccountLive({
        name: 'main',
        passphrase: 'secret',
        confirm: false,
      }),
    ).rejects.toThrow('Live subaccount creation requires confirm=true.');
  });

  test('formats submitted subaccount creation summaries', () => {
    expect(
      buildSubmittedSubaccountSummary({
        networkLabel: 'DEVNET',
        name: 'main',
        txHash:
          '0xb4740e33b3d7681c153386e7fb1e9f5b1e6bef7be5da37d72251eb2ae81732fb',
        explorerUrl:
          'http://explorer-devnet.deepx.fi/tx/0xb4740e33b3d7681c153386e7fb1e9f5b1e6bef7be5da37d72251eb2ae81732fb',
      }),
    ).toBe(
      'Subaccount creation submitted\n' +
        'Name: main\n' +
        'Network: DEVNET\n' +
        'Tx Hash: 0xb4740e...32fb\n' +
        'Explorer:\n' +
        'http://explorer-devnet.deepx.fi/tx/0xb4740e33b3d7681c153386e7fb1e9f5b1e6bef7be5da37d72251eb2ae81732fb',
    );
  });
});
