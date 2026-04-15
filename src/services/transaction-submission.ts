import type { JsonRpcProvider, TransactionReceipt } from 'ethers';

import type { NetworkConfig } from '../config/networks';
import { logNetworkRequest, logNetworkResponse } from './logger';

const TRANSACTION_RECEIPT_CONFIRMATIONS = 1;
const TRANSACTION_RECEIPT_TIMEOUT_MS = 15_000;

export type TransactionSubmissionResult = {
  txHash: string;
  receipt: TransactionReceipt;
};

export async function submitRpcTransaction(input: {
  network: NetworkConfig;
  provider: JsonRpcProvider;
  signedTx: string;
}): Promise<TransactionSubmissionResult> {
  logNetworkRequest({
    scope: 'rpc',
    method: 'POST',
    url: input.network.rpcUrl,
    body: JSON.stringify({
      method: 'eth_sendRawTransaction',
      signedTx: input.signedTx,
    }),
  });

  try {
    const response = await input.provider.broadcastTransaction(input.signedTx);
    const receipt = await input.provider.waitForTransaction(
      response.hash,
      TRANSACTION_RECEIPT_CONFIRMATIONS,
      TRANSACTION_RECEIPT_TIMEOUT_MS,
    );

    if (!receipt) {
      throw new Error(
        `RPC accepted transaction ${response.hash}, but no receipt was available after ${TRANSACTION_RECEIPT_TIMEOUT_MS / 1000}s.`,
      );
    }

    if (receipt.status === 0) {
      throw new Error(
        `Transaction ${response.hash} was mined in block ${receipt.blockNumber} but reverted.`,
      );
    }

    logNetworkResponse({
      scope: 'rpc',
      method: 'POST',
      url: input.network.rpcUrl,
      status: 200,
      body: JSON.stringify({
        txHash: response.hash,
        blockNumber: receipt.blockNumber,
        receiptStatus: receipt.status,
      }),
    });

    return {
      txHash: response.hash,
      receipt,
    };
  } catch (error) {
    const message = formatRpcFailureMessage(error);
    logNetworkResponse({
      scope: 'rpc',
      method: 'POST',
      url: input.network.rpcUrl,
      status: 500,
      body: message,
    });
    throw new Error(message, { cause: error });
  }
}

export function getTransactionSubmissionRpcUrl(network: NetworkConfig) {
  return network.rpcUrl;
}

export function formatRpcFailureMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      return `RPC transaction submission failed: ${message}`;
    }
  }

  return 'RPC transaction submission failed.';
}
