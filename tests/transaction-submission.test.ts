import { describe, expect, test } from 'bun:test';
import type { JsonRpcProvider } from 'ethers';

import { getNetworkConfig } from '../src/config/networks';
import {
  formatRpcFailureMessage,
  submitRpcTransaction,
} from '../src/services/transaction-submission';

describe('transaction submission', () => {
  test('waits for a mined receipt after broadcasting a raw transaction', async () => {
    const calls: string[] = [];
    const provider = {
      async broadcastTransaction(signedTx: string) {
        calls.push(`broadcast:${signedTx}`);
        return { hash: '0xabc' };
      },
      async waitForTransaction(
        hash: string,
        confirmations: number,
        timeoutMs: number,
      ) {
        calls.push(`wait:${hash}:${confirmations}:${timeoutMs}`);
        return {
          hash,
          blockNumber: 123,
          status: 1,
        };
      },
    } as unknown as JsonRpcProvider;

    await expect(
      submitRpcTransaction({
        network: getNetworkConfig('deepx_devnet'),
        provider,
        signedTx: '0xsigned',
      }),
    ).resolves.toMatchObject({
      txHash: '0xabc',
      receipt: {
        blockNumber: 123,
        status: 1,
      },
    });
    expect(calls).toEqual(['broadcast:0xsigned', 'wait:0xabc:1:15000']);
  });

  test('fails when the rpc accepts a transaction but no receipt appears', async () => {
    const provider = {
      async broadcastTransaction() {
        return { hash: '0xmissing' };
      },
      async waitForTransaction() {
        return null;
      },
    } as unknown as JsonRpcProvider;

    await expect(
      submitRpcTransaction({
        network: getNetworkConfig('deepx_devnet'),
        provider,
        signedTx: '0xsigned',
      }),
    ).rejects.toThrow(
      'RPC transaction submission failed: RPC accepted transaction 0xmissing, but no receipt was available after 15s.',
    );
  });

  test('fails when the transaction receipt indicates a revert', async () => {
    const provider = {
      async broadcastTransaction() {
        return { hash: '0xreverted' };
      },
      async waitForTransaction() {
        return {
          hash: '0xreverted',
          blockNumber: 456,
          status: 0,
        };
      },
    } as unknown as JsonRpcProvider;

    await expect(
      submitRpcTransaction({
        network: getNetworkConfig('deepx_devnet'),
        provider,
        signedTx: '0xsigned',
      }),
    ).rejects.toThrow(
      'RPC transaction submission failed: Transaction 0xreverted was mined in block 456 but reverted.',
    );
  });

  test('formats rpc errors consistently', () => {
    expect(formatRpcFailureMessage(new Error('backend exploded'))).toBe(
      'RPC transaction submission failed: backend exploded',
    );
  });
});
