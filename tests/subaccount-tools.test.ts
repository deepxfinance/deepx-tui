import { describe, expect, test } from 'bun:test';

import {
  buildDryRunSubaccountCreation,
  buildSubmittedSubaccountSummary,
  createSubaccountTool,
  encodeSubaccountName,
  initializeSubaccountLive,
  SUBACCOUNT_INITIALIZE_ABI,
  sendInitializeSubaccountTransaction,
} from '../src/services/subaccount-tools';

describe('subaccount tools', () => {
  test('uses the provided initializeSubaccount ABI shape', () => {
    expect(SUBACCOUNT_INITIALIZE_ABI).toEqual([
      {
        inputs: [
          {
            internalType: 'bytes',
            name: 'name',
            type: 'bytes',
          },
        ],
        name: 'initializeSubaccount',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ]);
  });

  test('sends initializeSubaccount through the signer with utf8 name bytes', async () => {
    const sendCalls: Array<Record<string, unknown>> = [];
    const populateCalls: Uint8Array[] = [];

    const txHash = await sendInitializeSubaccountTransaction({
      contract: {
        getFunction(name) {
          expect(name).toBe('initializeSubaccount');
          return {
            async populateTransaction(nameBytes) {
              populateCalls.push(nameBytes);
              return {
                to: '0x1111000000000000000000000000000000001111',
                data: '0xdeadbeef',
              };
            },
          };
        },
      },
      signer: {
        async sendTransaction(request) {
          sendCalls.push(request);
          return {
            hash: '0xabc123',
            async wait() {
              return { status: 1 };
            },
          };
        },
      },
      chainId: 778,
      name: 'main',
    });

    expect(txHash).toBe('0xabc123');
    expect(Array.from(populateCalls[0] ?? [])).toEqual([109, 97, 105, 110]);
    expect(sendCalls).toEqual([
      {
        to: '0x1111000000000000000000000000000000001111',
        data: '0xdeadbeef',
        gasLimit: 1000000n,
        chainId: 778,
      },
    ]);
  });

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
