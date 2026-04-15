import {
  Contract,
  JsonRpcProvider,
  parseUnits,
  toBeHex,
  Wallet,
  zeroPadValue,
} from 'ethers';

import { getNetworkConfig, type RuntimeNetwork } from '../config/networks';
import { logNetworkRequest, logNetworkResponse } from './logger';
import { getMarketPairs, type MarketPair } from './market-catalog';
import { resolvePrimarySubaccountAddress } from './subaccount-contract';
import { decryptPrivateKey, readWalletRecord } from './wallet-store';

const SPOT_CONTRACT_ADDRESS = '0x000000000000000000000000000000000000044d';
const USDC_DECIMALS = 6;
const DEFAULT_SLIPPAGE = 10;

const SPOT_ABI = [
  'function getSpotMarketSpec(bytes32 pair) view returns ((uint128 min_order_size,uint128 tick_size,uint128 step_size))',
  'function subaccountPlaceOrderBuyB(address subaccount,bytes32 pair,uint256 quote_amount,uint256 base_amount,uint8 post_only,bool reduce_only) returns (uint256)',
  'function subaccountPlaceOrderSellB(address subaccount,bytes32 pair,uint256 quote_amount,uint256 base_amount,uint8 post_only,bool reduce_only) returns (uint256)',
  'function subaccountPlaceMarketOrderBuyBWithPrice(address subaccount,bytes32 pair,uint256 quote_amount,uint256 base_amount,uint8 slippage,bool auto_cancel,bool reduce_only) returns (uint256)',
  'function subaccountPlaceMarketOrderBuyBWithoutPrice(address subaccount,bytes32 pair,uint256 quote_amount,uint256 base_amount,bool auto_cancel,bool reduce_only) returns (uint256)',
  'function subaccountPlaceMarketOrderSellBWithPrice(address subaccount,bytes32 pair,uint256 quote_amount,uint256 base_amount,uint8 slippage,bool auto_cancel,bool reduce_only) returns (uint256)',
  'function subaccountPlaceMarketOrderSellBWithoutPrice(address subaccount,bytes32 pair,uint256 quote_amount,uint256 base_amount,bool auto_cancel,bool reduce_only) returns (uint256)',
] as const;
type SpotPair = 'ETH/USDC' | 'SOL/USDC';

type PlaceSpotOrderInput = {
  network?: RuntimeNetwork;
  pair: SpotPair;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  size: string | number;
  price?: string | number;
  slippage?: string | number;
  passphrase: string;
  confirm: boolean;
};

export async function placeSpotOrderLive(input: PlaceSpotOrderInput): Promise<{
  status: 'submitted';
  network: RuntimeNetwork;
  pair: SpotPair;
  txHash: string;
  explorerUrl: string;
  summary: string;
}> {
  if (!input.confirm) {
    throw new Error('Live spot order submission requires confirm=true.');
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
  const pair = findLiveSpotPair(networkId, input.pair);
  const order = buildSpotOrderCall({
    pair,
    side: input.side,
    type: input.type,
    size: input.size,
    price: input.price,
    slippage: input.slippage,
  });
  const contract = new Contract(SPOT_CONTRACT_ADDRESS, SPOT_ABI, signer);
  await validateSpotMarketSpec({
    contract,
    pairId: order.args[0],
    pairLabel: input.pair,
  });
  // biome-ignore lint/complexity/useDateNow: DeepX transaction nonces use Date valueOf for backend compatibility.
  const nonce = new Date().valueOf();
  const txRequest = await contract
    .getFunction(order.functionName)
    .populateTransaction(subaccountAddress, ...order.args);

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
    summary: buildSubmittedSpotOrderSummary({
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

export function listLiveSpotPairs(): SpotPair[] {
  return ['ETH/USDC', 'SOL/USDC'];
}

export function buildSpotOrderCall(input: {
  pair: MarketPair;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  size: string | number;
  price?: string | number;
  slippage?: string | number;
}) {
  const pairId = encodeSpotPairId(input.pair.pairId);
  const baseAmount = parsePositiveDecimal(
    input.size,
    input.pair.baseDecimals,
    'size',
  );
  const quoteAmount =
    input.price == null
      ? 0n
      : calculateQuoteAmount({
          baseAmount,
          baseDecimals: input.pair.baseDecimals,
          price: input.price,
        });

  if (input.type === 'LIMIT') {
    if (input.price == null) {
      throw new Error('Missing price.');
    }

    return {
      functionName:
        input.side === 'BUY'
          ? 'subaccountPlaceOrderBuyB'
          : 'subaccountPlaceOrderSellB',
      args: [pairId, quoteAmount, baseAmount, 0, false] as const,
    };
  }

  if (input.price == null) {
    return {
      functionName:
        input.side === 'BUY'
          ? 'subaccountPlaceMarketOrderBuyBWithoutPrice'
          : 'subaccountPlaceMarketOrderSellBWithoutPrice',
      args: [pairId, 0n, baseAmount, false, false] as const,
    };
  }

  return {
    functionName:
      input.side === 'BUY'
        ? 'subaccountPlaceMarketOrderBuyBWithPrice'
        : 'subaccountPlaceMarketOrderSellBWithPrice',
    args: [
      pairId,
      quoteAmount,
      baseAmount,
      normalizeSlippage(input.slippage),
      false,
      false,
    ] as const,
  };
}

export function calculateQuoteAmount(input: {
  baseAmount: bigint;
  baseDecimals: number;
  price: string | number;
}) {
  const price = parsePositiveDecimal(input.price, USDC_DECIMALS, 'price');
  return (input.baseAmount * price) / 10n ** BigInt(input.baseDecimals);
}

export function encodeSpotPairId(pairId: string) {
  const normalized = pairId.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    return normalized;
  }

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid spot pair id "${pairId}".`);
  }

  return zeroPadValue(toBeHex(BigInt(normalized)), 32);
}

function findLiveSpotPair(network: RuntimeNetwork, pairLabel: SpotPair) {
  const pair = getMarketPairs(getNetworkConfig(network)).find(
    (pair) => pair.kind === 'spot' && pair.label === pairLabel,
  );
  if (!pair) {
    throw new Error(
      `Unsupported live spot pair "${pairLabel}" for ${network}.`,
    );
  }

  return pair;
}

async function validateSpotMarketSpec(input: {
  contract: Contract;
  pairId: string;
  pairLabel: string;
}) {
  const spec = (await input.contract.getSpotMarketSpec(input.pairId)) as {
    min_order_size?: bigint;
    tick_size?: bigint;
    step_size?: bigint;
  };

  if (
    (spec.min_order_size ?? 0n) <= 0n ||
    (spec.tick_size ?? 0n) <= 0n ||
    (spec.step_size ?? 0n) <= 0n
  ) {
    throw new Error(
      `Invalid spot market spec for ${input.pairLabel}. Check the configured spot pair id.`,
    );
  }
}

function parsePositiveDecimal(
  value: string | number | undefined,
  decimals: number,
  field: string,
) {
  if (value == null) {
    throw new Error(`Missing ${field}.`);
  }

  const normalized = String(value).replaceAll(',', '').trim();
  if (!normalized || Number(normalized) <= 0) {
    throw new Error(`Invalid ${field}. Expected a positive number.`);
  }

  return parseUnits(normalized, decimals);
}

function normalizeSlippage(value?: string | number) {
  if (value == null) {
    return DEFAULT_SLIPPAGE;
  }

  const normalized = String(value).replaceAll(',', '').trim();
  if (
    !normalized ||
    Number(normalized) < 0 ||
    !Number.isInteger(Number(normalized)) ||
    Number(normalized) > 255
  ) {
    throw new Error('Invalid slippage. Expected an integer between 0 and 255.');
  }

  return Number(normalized);
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
    const message =
      error instanceof Error && error.message.trim()
        ? `RPC transaction submission failed: ${error.message.trim()}`
        : 'RPC transaction submission failed.';
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

function buildSubmittedSpotOrderSummary(input: {
  networkLabel: string;
  pair: SpotPair;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  size: string;
  price?: string;
  txHash: string;
  explorerUrl: string;
}) {
  return [
    'Spot order submitted',
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

function truncateTxHash(txHash: string) {
  if (txHash.length <= 13) {
    return txHash;
  }

  return `${txHash.slice(0, 8)}...${txHash.slice(-4)}`;
}
