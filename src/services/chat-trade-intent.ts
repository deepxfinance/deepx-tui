export type ParsedChatTradeIntent = {
  pair: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  size: string;
  price?: string;
  baseAsset: string;
};

export function parseChatTradeIntent(input: {
  message: string;
  currentPair: string;
}): ParsedChatTradeIntent | undefined {
  const match = input.message.match(
    /^\s*(buy|sell)\s+(\d+(?:\.\d+)?)\s+([A-Za-z]+)(?:\s+at\s+(\d+(?:\.\d+)?))?\s*$/i,
  );
  if (!match) {
    return undefined;
  }

  const [, rawSide, rawSize, rawAsset, rawPrice] = match;
  const baseAsset = getPairBaseAsset(input.currentPair);
  if (rawAsset.toUpperCase() !== baseAsset) {
    return undefined;
  }

  return {
    pair: input.currentPair,
    side: rawSide.toUpperCase() as 'BUY' | 'SELL',
    type: rawPrice ? 'LIMIT' : 'MARKET',
    size: rawSize,
    price: rawPrice,
    baseAsset,
  };
}

export function isTradeConfirmationMessage(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === 'confirm' ||
    normalized === 'yes' ||
    normalized === 'proceed' ||
    normalized === 'place order' ||
    normalized === 'submit order'
  );
}

export function buildTradeIntentConfirmationMessage(input: {
  intent: ParsedChatTradeIntent;
  networkLabel: string;
  priceLabel: string;
}) {
  const limitSuffix = input.intent.price
    ? ` at ${input.intent.price}`
    : ` at market. Current ${input.intent.pair} price: ${input.priceLabel}.`;

  return [
    `Ready to submit ${input.intent.side} ${input.intent.size} ${input.intent.baseAsset} on ${input.intent.pair}${limitSuffix}`,
    `Network: ${input.networkLabel}.`,
    'Reply `confirm` to send the real transaction.',
  ].join(' ');
}

function getPairBaseAsset(pair: string) {
  return pair.split(/[-/]/)[0]?.trim().toUpperCase() ?? '';
}
