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
      async send(method: string, params: Array<string>) {
        calls.push(`send:${method}:${params.join(',')}`);
        return '0xabc';
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
    expect(calls).toEqual([
      'send:eth_sendRawTransaction:0xsigned',
      'wait:0xabc:1:60000',
    ]);
  });

  test('fails when the rpc accepts a transaction but no receipt appears', async () => {
    const provider = {
      async send() {
        return '0xmissing';
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
      'RPC transaction submission failed: RPC accepted transaction 0xmissing, but no receipt was available after 60s.\n' +
        'RPC: https://devnet-rpc-new.deepx.fi\n' +
        'Tx Hash: 0xmissing\n' +
        'Request Body:\n' +
        '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0xsigned"]}\n' +
        'Response Body:\n' +
        '{"txHash":"0xmissing","receipt":null,"timeoutMs":60000}',
    );
  });

  test('fails when the transaction receipt indicates a revert', async () => {
    const provider = {
      async send() {
        return '0xreverted';
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
      'RPC transaction submission failed: Transaction 0xreverted was mined in block 456 but reverted.\n' +
        'RPC: https://devnet-rpc-new.deepx.fi\n' +
        'Tx Hash: 0xreverted\n' +
        'Request Body:\n' +
        '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0xsigned"]}\n' +
        'Response Body:\n' +
        '{"txHash":"0xreverted","blockNumber":456,"receiptStatus":0}',
    );
  });

  test('formats rpc errors consistently', () => {
    expect(formatRpcFailureMessage(new Error('backend exploded'))).toBe(
      'RPC transaction submission failed: backend exploded',
    );
  });

  test('formats rpc failures with request and response context', () => {
    expect(
      formatRpcFailureMessage(new Error('backend exploded'), {
        rpcUrl: 'https://rpc.example.test',
        txHash: '0xabc',
        requestBody:
          '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0xsigned"]}',
        responseBody: '{"error":{"message":"backend exploded"}}',
      }),
    ).toBe(
      'RPC transaction submission failed: backend exploded\n' +
        'RPC: https://rpc.example.test\n' +
        'Tx Hash: 0xabc\n' +
        'Request Body:\n' +
        '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0xsigned"]}\n' +
        'Response Body:\n' +
        '{"error":{"message":"backend exploded"}}',
    );
  });

  test('includes rpc response body when broadcast fails before a tx hash exists', async () => {
    const provider = {
      async send() {
        const error = new Error('backend exploded') as Error & { body: string };
        error.body =
          '{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"backend exploded"}}';
        throw error;
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
      'RPC transaction submission failed: backend exploded\n' +
        'RPC: https://devnet-rpc-new.deepx.fi\n' +
        'Request Body:\n' +
        '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0xsigned"]}\n' +
        'Response Body:\n' +
        '{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"backend exploded"}}',
    );
  });
});
