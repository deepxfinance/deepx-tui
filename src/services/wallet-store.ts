import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { Wallet } from 'ethers';

import type { RuntimeNetwork } from '../config/networks';

const WALLET_DIR = ['deepx', 'wallets'];
const ALGORITHM = 'aes-256-gcm';

export type StoredWalletRecord = {
  version: 1;
  network: RuntimeNetwork;
  address: string;
  createdAt: string;
  crypto: {
    algorithm: typeof ALGORITHM;
    kdf: 'scrypt';
    saltHex: string;
    ivHex: string;
    authTagHex: string;
    ciphertextHex: string;
  };
};

type EncryptOptions = {
  iv?: Buffer;
  salt?: Buffer;
};

export function normalizePrivateKeyInput(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return new Wallet(normalized).privateKey;
}

export function deriveAddress(privateKey: string): string {
  return new Wallet(privateKey).address;
}

export function resolveWalletFilePath(network: RuntimeNetwork): string {
  const configRoot = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(configRoot, ...WALLET_DIR, `${network}.json`);
}

export function encryptPrivateKey(
  privateKey: string,
  passphrase: string,
  options: EncryptOptions = {},
) {
  const salt = options.salt ?? randomBytes(16);
  const iv = options.iv ?? randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    saltHex: salt.toString('hex'),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ciphertextHex: ciphertext.toString('hex'),
  };
}

export function decryptPrivateKey(
  encrypted: StoredWalletRecord['crypto'],
  passphrase: string,
): string {
  const key = scryptSync(passphrase, Buffer.from(encrypted.saltHex, 'hex'), 32);
  const decipher = createDecipheriv(
    encrypted.algorithm,
    key,
    Buffer.from(encrypted.ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertextHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function verifyWalletPassphrase(
  record: StoredWalletRecord,
  passphrase: string,
): string {
  const normalizedPassphrase = passphrase.trim();
  if (!normalizedPassphrase) {
    throw new Error('Passphrase is required.');
  }

  let privateKey: string;
  try {
    privateKey = decryptPrivateKey(record.crypto, normalizedPassphrase);
  } catch {
    throw new Error('Incorrect passphrase.');
  }

  if (deriveAddress(privateKey) !== record.address) {
    throw new Error('Stored wallet does not match the decrypted private key.');
  }

  return privateKey;
}

export async function readWalletRecord(
  network: RuntimeNetwork,
): Promise<StoredWalletRecord | null> {
  try {
    const content = await readFile(resolveWalletFilePath(network), 'utf8');
    return JSON.parse(content) as StoredWalletRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function saveWalletRecord(input: {
  network: RuntimeNetwork;
  privateKey: string;
  passphrase: string;
}): Promise<StoredWalletRecord> {
  const normalizedPrivateKey = normalizePrivateKeyInput(input.privateKey);
  const record: StoredWalletRecord = {
    version: 1,
    network: input.network,
    address: deriveAddress(normalizedPrivateKey),
    createdAt: new Date().toISOString(),
    crypto: {
      algorithm: ALGORITHM,
      kdf: 'scrypt',
      ...encryptPrivateKey(normalizedPrivateKey, input.passphrase),
    },
  };

  const filePath = resolveWalletFilePath(input.network);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
  });

  return record;
}
