export type ParsedChatTradeIntent = {
  pair: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  size: string;
  price?: string;
  baseAsset: string;
};

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

export function isTradeCancellationMessage(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === 'cancel' ||
    normalized === 'no' ||
    normalized === 'stop' ||
    normalized === 'do not submit' ||
    normalized === 'do not place order'
  );
}
