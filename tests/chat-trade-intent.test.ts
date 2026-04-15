import { describe, expect, test } from 'bun:test';

import {
  buildTradeIntentConfirmationMessage,
  isTradeConfirmationMessage,
  parseChatTradeIntent,
} from '../src/services/chat-trade-intent';

describe('chat trade intent', () => {
  test('parses market buy intents for the current pair', () => {
    expect(
      parseChatTradeIntent({
        message: 'buy 0.001 ETH',
        currentPair: 'ETH-USDC',
      }),
    ).toEqual({
      pair: 'ETH-USDC',
      side: 'BUY',
      type: 'MARKET',
      size: '0.001',
      price: undefined,
      baseAsset: 'ETH',
    });
  });

  test('parses limit sell intents for the current pair', () => {
    expect(
      parseChatTradeIntent({
        message: 'sell 2 SOL at 150',
        currentPair: 'SOL-USDC',
      }),
    ).toEqual({
      pair: 'SOL-USDC',
      side: 'SELL',
      type: 'LIMIT',
      size: '2',
      price: '150',
      baseAsset: 'SOL',
    });
  });

  test('ignores intents for a different asset than the current pair', () => {
    expect(
      parseChatTradeIntent({
        message: 'buy 1 BTC',
        currentPair: 'ETH-USDC',
      }),
    ).toBeUndefined();
  });

  test('recognizes short confirmation messages', () => {
    expect(isTradeConfirmationMessage('confirm')).toBe(true);
    expect(isTradeConfirmationMessage('submit order')).toBe(true);
    expect(isTradeConfirmationMessage('try again')).toBe(false);
  });

  test('builds a confirmation prompt for staged orders', () => {
    expect(
      buildTradeIntentConfirmationMessage({
        intent: {
          pair: 'ETH-USDC',
          side: 'BUY',
          type: 'MARKET',
          size: '0.001',
          baseAsset: 'ETH',
        },
        networkLabel: 'DeepX Devnet',
        priceLabel: '2151.29',
      }),
    ).toContain('Reply `confirm` to send the real transaction.');
  });
});
