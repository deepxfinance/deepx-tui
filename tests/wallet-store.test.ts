import { describe, expect, test } from 'bun:test';

import {
  decryptPrivateKey,
  deriveAddress,
  encryptPrivateKey,
  normalizePrivateKeyInput,
  verifyWalletPassphrase,
} from '../src/services/wallet-store';

const samplePrivateKey =
  '0x59c6995e998f97a5a0044966f0945382d7e89fdf1d7cc031ee332ed9f2e2a4b8';

describe('wallet-store', () => {
  test('normalizes private key input', () => {
    expect(normalizePrivateKeyInput(samplePrivateKey.slice(2))).toBe(
      samplePrivateKey,
    );
  });

  test('derives a checksum address', () => {
    expect(deriveAddress(samplePrivateKey)).toBe(
      '0x4c5Dee9E1facE608ccC0af8E8C47b3308AD495eC',
    );
  });

  test('encrypts and decrypts a private key', () => {
    const encrypted = encryptPrivateKey(samplePrivateKey, 'passphrase-123', {
      salt: Buffer.alloc(16, 3),
      iv: Buffer.alloc(12, 9),
    });

    expect(
      decryptPrivateKey(
        {
          algorithm: 'aes-256-gcm',
          kdf: 'scrypt',
          ...encrypted,
        },
        'passphrase-123',
      ),
    ).toBe(samplePrivateKey);
  });

  test('verifies a correct wallet passphrase', () => {
    const encrypted = encryptPrivateKey(samplePrivateKey, 'passphrase-123', {
      salt: Buffer.alloc(16, 3),
      iv: Buffer.alloc(12, 9),
    });

    expect(
      verifyWalletPassphrase(
        {
          version: 1,
          network: 'deepx_devnet',
          address: deriveAddress(samplePrivateKey),
          createdAt: '2026-03-25T00:00:00.000Z',
          crypto: {
            algorithm: 'aes-256-gcm',
            kdf: 'scrypt',
            ...encrypted,
          },
        },
        'passphrase-123',
      ),
    ).toBe(samplePrivateKey);
  });

  test('rejects an incorrect wallet passphrase', () => {
    const encrypted = encryptPrivateKey(samplePrivateKey, 'passphrase-123', {
      salt: Buffer.alloc(16, 3),
      iv: Buffer.alloc(12, 9),
    });

    expect(() =>
      verifyWalletPassphrase(
        {
          version: 1,
          network: 'deepx_devnet',
          address: deriveAddress(samplePrivateKey),
          createdAt: '2026-03-25T00:00:00.000Z',
          crypto: {
            algorithm: 'aes-256-gcm',
            kdf: 'scrypt',
            ...encrypted,
          },
        },
        'wrong-passphrase',
      ),
    ).toThrow('Incorrect passphrase.');
  });
});
