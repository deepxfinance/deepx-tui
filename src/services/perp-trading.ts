import { Contract, JsonRpcProvider, parseUnits, Wallet } from 'ethers';

import { getNetworkConfig, type RuntimeNetwork } from '../config/networks';
import { logNetworkRequest, logNetworkResponse } from './logger';
import { resolvePrimarySubaccountAddress } from './subaccount-contract';
import { decryptPrivateKey, readWalletRecord } from './wallet-store';

const PERP_CONTRACT_ADDRESS = '0x000000000000000000000000000000000000044E';
const PERP_ABI = [
  'function placePerpOrder(address subaccount,uint256 marketId,bool isLong,uint256 size,uint256 price,uint8 orderType,uint16 leverage,uint256 takeProfit,uint256 stopLoss,bool reduceOnly,uint8 postOnly)',
  'function cancelOrder(address subaccount,uint256 marketId,uint256 orderId)',
  'function closePosition(address subaccount,uint16 marketId,uint128 price,uint64 slippage)',
  'function setProfitAndLossPoint(address subaccount,uint16 marketId,uint128 takeProfitPoint,uint128 stopLossPoint)',
] as const;

type PerpPair = 'ETH-USDC' | 'SOL-USDC';

type PlacePerpOrderInput = {
  network?: RuntimeNetwork;
  pair: PerpPair;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  size: string | number;
  price?: string | number;
  leverage?: number;
  takeProfit?: string | number;
  stopLoss?: string | number;
  reduceOnly?: boolean;
  postOnly?: boolean;
  passphrase: string;
  confirm: boolean;
};

type CancelPerpOrderInput = {
  network?: RuntimeNetwork;
  pair: PerpPair;
  orderId: number;
  passphrase: string;
  confirm: boolean;
};

type ClosePerpPositionInput = {
  network?: RuntimeNetwork;
  pair: PerpPair;
  price: string | number;
  slippage?: string | number;
  passphrase: string;
  confirm: boolean;
};

type UpdatePerpPositionInput = {
  network?: RuntimeNetwork;
  pair: PerpPair;
  takeProfit: string | number;
  stopLoss: string | number;
  passphrase: string;
  confirm: boolean;
};

const perpMarkets = {
  'ETH-USDC': {
    marketId: 3,
    baseDecimals: 18,
    priceDecimals: 6,
    orderDecimals: 3,
  },
  'SOL-USDC': {
    marketId: 4,
    baseDecimals: 9,
    priceDecimals: 6,
    orderDecimals: 2,
  },
} as const satisfies Record<
  PerpPair,
  {
    marketId: number;
    baseDecimals: number;
    priceDecimals: number;
    orderDecimals: number;
  }
>;

export async function placePerpOrderLive(input: PlacePerpOrderInput): Promise<{
  status: 'submitted';
  network: RuntimeNetwork;
  pair: PerpPair;
  txHash: string;
  orderId?: string;
  explorerUrl: string;
  summary: string;
}> {
  if (!input.confirm) {
    throw new Error('Live order submission requires confirm=true.');
  }

  const networkId = input.network ?? 'deepx_devnet';
  const network = getNetworkConfig(networkId);
  const walletRecord = await readWalletRecord(networkId);
  if (!walletRecord) {
    throw new Error(`No local wallet found for ${networkId}.`);
  }

  const privateKey = decryptPrivateKey(walletRecord.crypto, input.passphrase);
  const provider = new JsonRpcProvider(network.rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const subaccountAddress = await resolvePrimarySubaccountAddress({
    walletAddress: walletRecord.address,
    provider,
  });
  const market = perpMarkets[input.pair];
  const contract = new Contract(PERP_CONTRACT_ADDRESS, PERP_ABI, signer);

  const size = parsePositiveDecimal(input.size, market.baseDecimals, 'size');
  const price =
    input.type === 'LIMIT'
      ? parsePositiveDecimal(input.price, market.priceDecimals, 'price')
      : 0n;
  const takeProfit = input.takeProfit
    ? parsePositiveDecimal(input.takeProfit, market.priceDecimals, 'takeProfit')
    : 0n;
  const stopLoss = input.stopLoss
    ? parsePositiveDecimal(input.stopLoss, market.priceDecimals, 'stopLoss')
    : 0n;
  const leverage = normalizeLeverage(input.leverage);
  // biome-ignore lint/complexity/useDateNow: DeepX transaction nonces use Date valueOf for backend compatibility.
  const nonce = new Date().valueOf();

  const txRequest = await contract
    .getFunction('placePerpOrder')
    .populateTransaction(
      subaccountAddress,
      market.marketId,
      input.side === 'BUY',
      size,
      price,
      input.type === 'MARKET' ? 1 : 0,
      leverage,
      takeProfit,
      stopLoss,
      input.reduceOnly ?? false,
      input.postOnly ? 1 : 0,
    );

  const signedTx = await signer.signTransaction({
    ...txRequest,
    nonce,
    chainId: network.chainId,
    gasLimit: 1000000n,
  });

  const txHash = await submitRpcTransaction({
    network,
    provider,
    signedTx,
  });

  return {
    status: 'submitted',
    network: network.id,
    pair: input.pair,
    txHash,
    explorerUrl: `${network.explorerUrl}/tx/${txHash}`,
    summary: buildSubmittedOrderSummary({
      networkLabel: network.shortLabel,
      pair: input.pair,
      side: input.side,
      type: input.type,
      size: String(input.size),
      price: input.price == null ? undefined : String(input.price),
      txHash,
      explorerUrl: `${network.explorerUrl}/tx/${txHash}`,
    }),
  };
}

export function buildSubmittedOrderSummary(input: {
  networkLabel: string;
  pair: PerpPair;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  size: string;
  price?: string;
  txHash: string;
  explorerUrl: string;
}) {
  return [
    'Order submitted',
    `Side: ${input.side}`,
    `Pair: ${input.pair}`,
    `Type: ${input.type}`,
    `Size: ${input.size}`,
    ...(input.price ? [`Price: ${input.price}`] : []),
    `Network: ${input.networkLabel}`,
    `Tx Hash: ${truncateTxHash(input.txHash)}`,
    'Explorer:',
    input.explorerUrl,
  ].join('\n');
}

export async function cancelPerpOrderLive(
  input: CancelPerpOrderInput,
): Promise<{
  status: 'submitted';
  network: RuntimeNetwork;
  pair: PerpPair;
  txHash: string;
  explorerUrl: string;
  summary: string;
}> {
  if (!input.confirm) {
    throw new Error('Live order cancellation requires confirm=true.');
  }

  const networkId = input.network ?? 'deepx_devnet';
  const network = getNetworkConfig(networkId);
  const walletRecord = await readWalletRecord(networkId);
  if (!walletRecord) {
    throw new Error(`No local wallet found for ${networkId}.`);
  }

  const privateKey = decryptPrivateKey(walletRecord.crypto, input.passphrase);
  const provider = new JsonRpcProvider(network.rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const subaccountAddress = await resolvePrimarySubaccountAddress({
    walletAddress: walletRecord.address,
    provider,
  });
  const market = perpMarkets[input.pair];
  const contract = new Contract(PERP_CONTRACT_ADDRESS, PERP_ABI, signer);
  // biome-ignore lint/complexity/useDateNow: DeepX transaction nonces use Date valueOf for backend compatibility.
  const nonce = new Date().valueOf();

  const txRequest = await contract
    .getFunction('cancelOrder')
    .populateTransaction(subaccountAddress, market.marketId, input.orderId);

  const signedTx = await signer.signTransaction({
    ...txRequest,
    nonce,
    chainId: network.chainId,
    gasLimit: 1000000n,
  });

  const txHash = await submitRpcTransaction({
    network,
    provider,
    signedTx,
  });

  return {
    status: 'submitted',
    network: network.id,
    pair: input.pair,
    txHash,
    explorerUrl: `${network.explorerUrl}/tx/${txHash}`,
    summary: `${network.shortLabel} cancel order ${input.orderId} on ${input.pair}`,
  };
}

export async function closePerpPositionLive(
  input: ClosePerpPositionInput,
): Promise<{
  status: 'submitted';
  network: RuntimeNetwork;
  pair: PerpPair;
  txHash: string;
  explorerUrl: string;
  summary: string;
}> {
  if (!input.confirm) {
    throw new Error('Live position close requires confirm=true.');
  }

  const networkId = input.network ?? 'deepx_devnet';
  const network = getNetworkConfig(networkId);
  const walletRecord = await readWalletRecord(networkId);
  if (!walletRecord) {
    throw new Error(`No local wallet found for ${networkId}.`);
  }

  const privateKey = decryptPrivateKey(walletRecord.crypto, input.passphrase);
  const provider = new JsonRpcProvider(network.rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const subaccountAddress = await resolvePrimarySubaccountAddress({
    walletAddress: walletRecord.address,
    provider,
  });
  const market = perpMarkets[input.pair];
  const contract = new Contract(PERP_CONTRACT_ADDRESS, PERP_ABI, signer);
  // biome-ignore lint/complexity/useDateNow: DeepX transaction nonces use Date valueOf for backend compatibility.
  const nonce = new Date().valueOf();

  const txRequest = await contract
    .getFunction('closePosition')
    .populateTransaction(
      subaccountAddress,
      market.marketId,
      parsePositiveDecimal(input.price, market.priceDecimals, 'price'),
      normalizeSlippage(input.slippage),
    );

  const signedTx = await signer.signTransaction({
    ...txRequest,
    nonce,
    chainId: network.chainId,
    gasLimit: 1000000n,
  });

  const txHash = await submitRpcTransaction({
    network,
    provider,
    signedTx,
  });

  return {
    status: 'submitted',
    network: network.id,
    pair: input.pair,
    txHash,
    explorerUrl: `${network.explorerUrl}/tx/${txHash}`,
    summary: `${network.shortLabel} close position on ${input.pair} @ ${input.price}`,
  };
}

export async function updatePerpPositionLive(
  input: UpdatePerpPositionInput,
): Promise<{
  status: 'submitted';
  network: RuntimeNetwork;
  pair: PerpPair;
  txHash: string;
  explorerUrl: string;
  summary: string;
}> {
  if (!input.confirm) {
    throw new Error('Live position update requires confirm=true.');
  }

  const networkId = input.network ?? 'deepx_devnet';
  const network = getNetworkConfig(networkId);
  const walletRecord = await readWalletRecord(networkId);
  if (!walletRecord) {
    throw new Error(`No local wallet found for ${networkId}.`);
  }

  const privateKey = decryptPrivateKey(walletRecord.crypto, input.passphrase);
  const provider = new JsonRpcProvider(network.rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const subaccountAddress = await resolvePrimarySubaccountAddress({
    walletAddress: walletRecord.address,
    provider,
  });
  const market = perpMarkets[input.pair];
  const contract = new Contract(PERP_CONTRACT_ADDRESS, PERP_ABI, signer);
  // biome-ignore lint/complexity/useDateNow: DeepX transaction nonces use Date valueOf for backend compatibility.
  const nonce = new Date().valueOf();

  const txRequest = await contract
    .getFunction('setProfitAndLossPoint')
    .populateTransaction(
      subaccountAddress,
      market.marketId,
      parseNonNegativeDecimal(
        input.takeProfit,
        market.priceDecimals,
        'takeProfit',
      ),
      parseNonNegativeDecimal(input.stopLoss, market.priceDecimals, 'stopLoss'),
    );

  const signedTx = await signer.signTransaction({
    ...txRequest,
    nonce,
    chainId: network.chainId,
    gasLimit: 1000000n,
  });

  const txHash = await submitRpcTransaction({
    network,
    provider,
    signedTx,
  });

  return {
    status: 'submitted',
    network: network.id,
    pair: input.pair,
    txHash,
    explorerUrl: `${network.explorerUrl}/tx/${txHash}`,
    summary: `${network.shortLabel} update position on ${input.pair} TP ${input.takeProfit} SL ${input.stopLoss}`,
  };
}

export function listLivePerpPairs(): PerpPair[] {
  return Object.keys(perpMarkets) as PerpPair[];
}

function normalizeLeverage(value?: number): number {
  const leverage = value ?? 10;
  if (!Number.isInteger(leverage) || leverage <= 0 || leverage > 100) {
    throw new Error('Invalid leverage. Expected an integer between 1 and 100.');
  }

  return leverage;
}

function normalizeSlippage(value?: string | number): bigint {
  if (value == null) {
    return 10n;
  }

  const normalized = String(value).replaceAll(',', '').trim();
  if (
    !normalized ||
    Number(normalized) < 0 ||
    !Number.isInteger(Number(normalized))
  ) {
    throw new Error('Invalid slippage. Expected a non-negative integer.');
  }

  return BigInt(normalized);
}

function parsePositiveDecimal(
  value: string | number | undefined,
  decimals: number,
  field: string,
): bigint {
  if (value == null) {
    throw new Error(`Missing ${field}.`);
  }

  const normalized = String(value).replaceAll(',', '').trim();
  if (!normalized || Number(normalized) <= 0) {
    throw new Error(`Invalid ${field}. Expected a positive number.`);
  }

  return parseUnits(normalized, decimals);
}

function parseNonNegativeDecimal(
  value: string | number | undefined,
  decimals: number,
  field: string,
): bigint {
  if (value == null) {
    throw new Error(`Missing ${field}.`);
  }

  const normalized = String(value).replaceAll(',', '').trim();
  if (!normalized || Number(normalized) < 0) {
    throw new Error(`Invalid ${field}. Expected a non-negative number.`);
  }

  return parseUnits(normalized, decimals);
}

async function submitRpcTransaction(input: {
  network: ReturnType<typeof getNetworkConfig>;
  provider: JsonRpcProvider;
  signedTx: string;
}) {
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
    logNetworkResponse({
      scope: 'rpc',
      method: 'POST',
      url: input.network.rpcUrl,
      status: 200,
      body: JSON.stringify({
        txHash: response.hash,
      }),
    });
    return response.hash;
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

export function getTransactionSubmissionRpcUrl(
  network: ReturnType<typeof getNetworkConfig>,
) {
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

function truncateTxHash(txHash: string) {
  if (txHash.length <= 13) {
    return txHash;
  }

  return `${txHash.slice(0, 8)}...${txHash.slice(-4)}`;
}
