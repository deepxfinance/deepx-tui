import { JsonRpcProvider, Network, type TransactionReceipt } from 'ethers';

import type { NetworkConfig } from '../config/networks';
import { logNetworkRequest, logNetworkResponse } from './logger';

const TRANSACTION_RECEIPT_CONFIRMATIONS = 1;
const TRANSACTION_RECEIPT_TIMEOUT_MS = 60_000;
const TRANSACTION_SUBMISSION_RPC_METHOD = 'eth_sendRawTransaction';

export type TransactionSubmissionResult = {
  txHash: string;
  receipt: TransactionReceipt;
};

type RpcFailureContext = {
  rpcUrl?: string;
  requestBody?: string;
  txHash?: string;
  responseBody?: string;
};

export async function submitRpcTransaction(input: {
  network: NetworkConfig;
  provider: JsonRpcProvider;
  signedTx: string;
}): Promise<TransactionSubmissionResult> {
  const requestBody = buildTransactionSubmissionRequestBody(input.signedTx);

  logNetworkRequest({
    scope: 'rpc',
    method: 'POST',
    url: input.network.rpcUrl,
    body: requestBody,
  });

  try {
    const txHash = (await input.provider.send(
      TRANSACTION_SUBMISSION_RPC_METHOD,
      [input.signedTx],
    )) as string;
    const receipt = await input.provider.waitForTransaction(
      txHash,
      TRANSACTION_RECEIPT_CONFIRMATIONS,
      TRANSACTION_RECEIPT_TIMEOUT_MS,
    );

    if (!receipt) {
      throw createRpcFailureError(
        `RPC accepted transaction ${txHash}, but no receipt was available after ${TRANSACTION_RECEIPT_TIMEOUT_MS / 1000}s.`,
        {
          txHash,
          responseBody: JSON.stringify({
            txHash,
            receipt: null,
            timeoutMs: TRANSACTION_RECEIPT_TIMEOUT_MS,
          }),
        },
      );
    }

    if (receipt.status === 0) {
      throw createRpcFailureError(
        `Transaction ${txHash} was mined in block ${receipt.blockNumber} but reverted.`,
        {
          txHash,
          responseBody: JSON.stringify({
            txHash,
            blockNumber: receipt.blockNumber,
            receiptStatus: receipt.status,
          }),
        },
      );
    }

    logNetworkResponse({
      scope: 'rpc',
      method: 'POST',
      url: input.network.rpcUrl,
      status: 200,
      body: JSON.stringify({
        txHash,
        blockNumber: receipt.blockNumber,
        receiptStatus: receipt.status,
      }),
    });

    return {
      txHash,
      receipt,
    };
  } catch (error) {
    const message = formatRpcFailureMessage(error, {
      rpcUrl: input.network.rpcUrl,
      requestBody,
      txHash: getRpcFailureProperty(error, 'txHash'),
      responseBody: extractRpcResponseBody(error),
    });
    logNetworkResponse({
      scope: 'rpc',
      method: 'POST',
      url: input.network.rpcUrl,
      status: 500,
      body: message,
    });
    throw new Error(message);
  }
}

export function createRpcProvider(network: NetworkConfig) {
  const staticNetwork = Network.from({
    chainId: network.chainId,
    name: network.id,
  });

  return new JsonRpcProvider(network.rpcUrl, staticNetwork, {
    staticNetwork,
  });
}

export function getTransactionSubmissionRpcUrl(network: NetworkConfig) {
  return network.rpcUrl;
}

export function formatRpcFailureMessage(
  error: unknown,
  context: RpcFailureContext = {},
) {
  const message = getPrimaryErrorMessage(error);
  const lines = [
    message
      ? `RPC transaction submission failed: ${message}`
      : 'RPC transaction submission failed.',
  ];

  if (context.rpcUrl) {
    lines.push(`RPC: ${context.rpcUrl}`);
  }

  if (context.txHash) {
    lines.push(`Tx Hash: ${context.txHash}`);
  }

  if (context.requestBody) {
    lines.push('Request Body:');
    lines.push(context.requestBody);
  }

  if (context.responseBody) {
    lines.push('Response Body:');
    lines.push(context.responseBody);
  }

  return lines.join('\n');
}

function buildTransactionSubmissionRequestBody(signedTx: string) {
  return JSON.stringify({
    jsonrpc: '2.0',
    method: TRANSACTION_SUBMISSION_RPC_METHOD,
    params: [signedTx],
  });
}

function createRpcFailureError(
  message: string,
  context: Pick<RpcFailureContext, 'txHash' | 'responseBody'>,
) {
  const error = new Error(message) as Error &
    Pick<RpcFailureContext, 'txHash' | 'responseBody'>;
  error.txHash = context.txHash;
  error.responseBody = context.responseBody;
  return error;
}

function getPrimaryErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error.trim();
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      return message;
    }
  }

  if (!isRecord(error)) {
    return '';
  }

  for (const key of ['shortMessage', 'message', 'reason', 'details'] as const) {
    const value = error[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function extractRpcResponseBody(error: unknown) {
  const explicitResponseBody = getRpcFailureProperty(error, 'responseBody');
  if (explicitResponseBody) {
    return explicitResponseBody;
  }

  if (!isRecord(error)) {
    return undefined;
  }

  if (typeof error.body === 'string' && error.body.trim()) {
    return error.body.trim();
  }

  for (const key of ['error', 'info', 'data', 'response'] as const) {
    const value = error[key];
    const serialized = serializeRpcErrorValue(value);
    if (serialized) {
      return serialized;
    }
  }

  return undefined;
}

function getRpcFailureProperty(error: unknown, key: 'txHash' | 'responseBody') {
  if (!isRecord(error)) {
    return undefined;
  }

  const value = error[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function serializeRpcErrorValue(value: unknown) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (value == null) {
    return undefined;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
