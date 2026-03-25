import { Contract, JsonRpcProvider, parseUnits, Wallet } from 'ethers';

import { getNetworkConfig, type RuntimeNetwork } from '../config/networks';
import { decryptPrivateKey, readWalletRecord } from './wallet-store';

const PERP_CONTRACT_ADDRESS = '0x000000000000000000000000000000000000044E';
const PERP_ABI = [
  'function placePerpOrder(address subaccount,uint256 marketId,bool isLong,uint256 size,uint256 price,uint8 orderType,uint16 leverage,uint256 takeProfit,uint256 stopLoss,bool reduceOnly,uint8 postOnly)',
  'function cancelOrder(address subaccount,uint256 marketId,uint256 orderId)',
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
  const nonce = await signer.getNonce('pending');

  const txRequest = await contract
    .getFunction('placePerpOrder')
    .populateTransaction(
      walletRecord.address,
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

  const relay = await submitRelayTransaction({
    network,
    action: 'PlaceOrder',
    signedTx,
    signer: signer.address,
  });

  return {
    status: 'submitted',
    network: network.id,
    pair: input.pair,
    txHash: relay.tx_hash,
    orderId: relay.order_id,
    explorerUrl: `${network.explorerUrl}/tx/${relay.tx_hash}`,
    summary: `${network.shortLabel} ${input.side} ${input.size} ${input.pair} ${input.type}`,
  };
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
  const market = perpMarkets[input.pair];
  const contract = new Contract(PERP_CONTRACT_ADDRESS, PERP_ABI, signer);
  const nonce = await signer.getNonce('pending');

  const txRequest = await contract
    .getFunction('cancelOrder')
    .populateTransaction(walletRecord.address, market.marketId, input.orderId);

  const signedTx = await signer.signTransaction({
    ...txRequest,
    nonce,
    chainId: network.chainId,
    gasLimit: 1000000n,
  });

  const relay = await submitRelayTransaction({
    network,
    action: 'CancelOrder',
    signedTx,
    signer: signer.address,
  });

  return {
    status: 'submitted',
    network: network.id,
    pair: input.pair,
    txHash: relay.tx_hash,
    explorerUrl: `${network.explorerUrl}/tx/${relay.tx_hash}`,
    summary: `${network.shortLabel} cancel order ${input.orderId} on ${input.pair}`,
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

async function submitRelayTransaction(input: {
  network: ReturnType<typeof getNetworkConfig>;
  action: 'PlaceOrder' | 'CancelOrder';
  signedTx: string;
  signer: string;
}) {
  const response = await fetch(`${input.network.appUrl}/v2/chain/tx/transact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: '*/*',
    },
    body: JSON.stringify({
      action: input.action,
      marketType: 'Perp',
      signedTx: input.signedTx,
      signer: input.signer,
    }),
  });

  if (!response.ok) {
    throw new Error(`Relay request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    code?: number;
    msg?: string;
    data?: { tx_hash: string; order_id?: string };
  };

  if (!payload.data?.tx_hash) {
    throw new Error(payload.msg ?? 'Relay response did not include tx_hash.');
  }

  return payload.data;
}
