import { describe, expect, test } from 'bun:test';

import {
  isTradeCancellationMessage,
  isTradeConfirmationMessage,
} from '../src/services/chat-trade-intent';

describe('chat trade intent', () => {
  test('recognizes short confirmation messages', () => {
    expect(isTradeConfirmationMessage('confirm')).toBe(true);
    expect(isTradeConfirmationMessage('submit order')).toBe(true);
    expect(isTradeConfirmationMessage('try again')).toBe(false);
  });

  test('recognizes short cancellation messages', () => {
    expect(isTradeCancellationMessage('cancel')).toBe(true);
    expect(isTradeCancellationMessage('do not submit')).toBe(true);
    expect(isTradeCancellationMessage('confirm')).toBe(false);
  });
});
