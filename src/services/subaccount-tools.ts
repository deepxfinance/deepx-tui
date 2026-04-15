import { Contract, toUtf8Bytes, Wallet } from 'ethers';

import { getNetworkConfig, type RuntimeNetwork } from '../config/networks';
import { SUBACCOUNT_CONTRACT_ADDRESS } from './subaccount-contract';
import {
  createRpcProvider,
  submitRpcTransaction,
} from './transaction-submission';
import { getRememberedWalletPassphrase } from './wallet-session';
import { decryptPrivateKey, readWalletRecord } from './wallet-store';

const SUBACCOUNT_INITIALIZE_ABI = [
  'function initializeSubaccount(bytes name)',
] as const;

const INITIALIZE_SUBACCOUNT_GAS_LIMIT = 1000000n;

export type CreateSubaccountInput = {
  network?: RuntimeNetwork;
  name: string;
  passphrase?: string;
  confirm?: boolean;
};

export type CreateSubaccountToolResult =
  | {
      status: 'dry_run';
      network: RuntimeNetwork;
      name: string;
      explorerUrl: string;
      warnings: string[];
      summary: string;
    }
  | {
      status: 'submitted';
      network: RuntimeNetwork;
      walletAddress: string;
      name: string;
      txHash: string;
      explorerUrl: string;
      summary: string;
    };

export async function createSubaccountTool(
  input: CreateSubaccountInput,
): Promise<CreateSubaccountToolResult> {
  const network = input.network ?? 'deepx_devnet';
  const name = normalizeSubaccountName(input.name);
  const passphrase = resolveLivePassphrase(network, input.passphrase);

  if (input.confirm === true && passphrase) {
    return initializeSubaccountLive({
      network,
      name,
      passphrase,
      confirm: true,
    });
  }

  return buildDryRunSubaccountCreation({
    network,
    name,
    hasConfirmation: input.confirm === true,
    hasPassphrase: Boolean(passphrase),
  });
}

export async function initializeSubaccountLive(input: {
  network?: RuntimeNetwork;
  name: string;
  passphrase: string;
  confirm: boolean;
}): Promise<Extract<CreateSubaccountToolResult, { status: 'submitted' }>> {
  if (!input.confirm) {
    throw new Error('Live subaccount creation requires confirm=true.');
  }

  const networkId = input.network ?? 'deepx_devnet';
  const network = getNetworkConfig(networkId);
  const walletRecord = await readWalletRecord(networkId);
  if (!walletRecord) {
    throw new Error(`No local wallet found for ${networkId}.`);
  }

  const name = normalizeSubaccountName(input.name);
  const privateKey = decryptPrivateKey(walletRecord.crypto, input.passphrase);
  const provider = createRpcProvider(network);
  const signer = new Wallet(privateKey, provider);
  const contract = new Contract(
    SUBACCOUNT_CONTRACT_ADDRESS,
    SUBACCOUNT_INITIALIZE_ABI,
    signer,
  );
  // biome-ignore lint/complexity/useDateNow: DeepX transaction nonces use Date valueOf for backend compatibility.
  const nonce = new Date().valueOf();
  const txRequest = await contract
    .getFunction('initializeSubaccount')
    .populateTransaction(encodeSubaccountName(name));

  const signedTx = await signer.signTransaction({
    ...txRequest,
    nonce,
    chainId: network.chainId,
    gasLimit: INITIALIZE_SUBACCOUNT_GAS_LIMIT,
  });
  const { txHash } = await submitRpcTransaction({
    network,
    provider,
    signedTx,
  });
  const explorerUrl = `${network.explorerUrl}/tx/${txHash}`;

  return {
    status: 'submitted',
    network: network.id,
    walletAddress: walletRecord.address,
    name,
    txHash,
    explorerUrl,
    summary: buildSubmittedSubaccountSummary({
      networkLabel: network.shortLabel,
      name,
      txHash,
      explorerUrl,
    }),
  };
}

export function encodeSubaccountName(name: string) {
  return toUtf8Bytes(normalizeSubaccountName(name));
}

export function buildDryRunSubaccountCreation(input: {
  network: RuntimeNetwork;
  name: string;
  hasConfirmation: boolean;
  hasPassphrase: boolean;
}): Extract<CreateSubaccountToolResult, { status: 'dry_run' }> {
  const network = getNetworkConfig(input.network);
  const warnings = ['Dry-run only. No subaccount was created.'];

  if (!input.hasConfirmation) {
    warnings.unshift(
      'Confirmation flag was not set. Treat this as a planning ticket only.',
    );
  }

  if (!input.hasPassphrase) {
    warnings.push(
      'Live subaccount creation requires an unlocked wallet session or explicit passphrase.',
    );
  }

  return {
    status: 'dry_run',
    network: network.id,
    name: input.name,
    explorerUrl: `${network.explorerUrl}/tx`,
    warnings,
    summary: [
      'Subaccount creation dry run',
      `Name: ${input.name}`,
      `Network: ${network.shortLabel}`,
    ].join('\n'),
  };
}

export function buildSubmittedSubaccountSummary(input: {
  networkLabel: string;
  name: string;
  txHash: string;
  explorerUrl: string;
}) {
  return [
    'Subaccount creation submitted',
    `Name: ${input.name}`,
    `Network: ${input.networkLabel}`,
    `Tx Hash: ${truncateTxHash(input.txHash)}`,
    'Explorer:',
    input.explorerUrl,
  ].join('\n');
}

function resolveLivePassphrase(network: RuntimeNetwork, explicit?: string) {
  const normalizedExplicit = explicit?.trim();
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  return getRememberedWalletPassphrase(network);
}

function normalizeSubaccountName(name: string) {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error('Subaccount name is required.');
  }

  return normalized;
}

function truncateTxHash(txHash: string) {
  if (txHash.length <= 13) {
    return txHash;
  }

  return `${txHash.slice(0, 8)}...${txHash.slice(-4)}`;
}
