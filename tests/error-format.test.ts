import { describe, expect, test } from 'bun:test';

import {
  formatErrorMessage,
  formatErrorWithStack,
} from '../src/lib/error-format';

describe('error format', () => {
  test('formats plain Error instances', () => {
    expect(formatErrorMessage(new Error('boom'))).toBe('boom');
  });

  test('includes nested error details and code', () => {
    expect(
      formatErrorMessage({
        message: 'An internal error occurred. Please try again later.',
        shortMessage: 'relay rejected transaction',
        code: 'SERVER_ERROR',
        cause: {
          message: 'execution reverted: insufficient margin',
        },
      }),
    ).toBe(
      'relay rejected transaction | An internal error occurred. Please try again later. | code=SERVER_ERROR | execution reverted: insufficient margin',
    );
  });

  test('includes stack only when it adds information', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom\n at x';

    expect(formatErrorWithStack(error)).toBe('boom');
  });
});
