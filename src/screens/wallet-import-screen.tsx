import { Box, Text, useInput } from 'ink';
import type { FC } from 'react';
import { useState } from 'react';

import type { NetworkConfig } from '../config/networks';
import { formatFocusedInputValue, maskValue } from '../lib/format';
import { normalizePrivateKeyInput } from '../services/wallet-store';

type WalletImportScreenProps = {
  network: NetworkConfig;
  commandName: string;
  errorMessage?: string;
  isSaving: boolean;
  onSubmit: (input: {
    privateKey: string;
    passphrase: string;
  }) => Promise<void>;
  onSkip: () => void;
};

type FieldKey = 'privateKey' | 'passphrase';

const fieldOrder: FieldKey[] = ['privateKey', 'passphrase'];

export const WalletImportScreen: FC<WalletImportScreenProps> = ({
  network,
  commandName,
  errorMessage,
  isSaving,
  onSubmit,
  onSkip,
}) => {
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [focusedField, setFocusedField] = useState<FieldKey>('privateKey');
  const [isSecretVisible, setIsSecretVisible] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string>();

  const effectiveError = validationMessage || errorMessage;

  useInput(async (input, key) => {
    if (isSaving) {
      return;
    }

    if (key.ctrl && input === 'r') {
      setIsSecretVisible((value) => !value);
      return;
    }

    if (key.escape) {
      onSkip();
      return;
    }

    if (key.tab) {
      const currentIndex = fieldOrder.indexOf(focusedField);
      setFocusedField(
        fieldOrder[(currentIndex + 1) % fieldOrder.length] ?? 'privateKey',
      );
      return;
    }

    if (key.return) {
      if (focusedField !== 'passphrase') {
        const currentIndex = fieldOrder.indexOf(focusedField);
        setFocusedField(fieldOrder[currentIndex + 1] ?? 'passphrase');
        return;
      }

      try {
        const normalizedPrivateKey = normalizePrivateKeyInput(privateKey);
        if (passphrase.length < 8) {
          throw new Error('Passphrase must be at least 8 characters.');
        }

        setValidationMessage(undefined);
        await onSubmit({
          privateKey: normalizedPrivateKey,
          passphrase,
        });
      } catch (error) {
        setValidationMessage((error as Error).message);
      }

      return;
    }

    if (key.backspace || key.delete) {
      setValidationMessage(undefined);
      if (focusedField === 'privateKey') {
        setPrivateKey((value) => value.slice(0, -1));
      } else {
        setPassphrase((value) => value.slice(0, -1));
      }
      return;
    }

    if (!key.ctrl && !key.meta && input) {
      setValidationMessage(undefined);
      if (focusedField === 'privateKey') {
        setPrivateKey((value) => `${value}${input}`);
      } else {
        setPassphrase((value) => `${value}${input}`);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      width="100%"
      height="100%"
      justifyContent="center"
      paddingX={2}
    >
      <Box
        flexDirection="column"
        width={94}
        borderStyle="round"
        borderColor="green"
        padding={1}
      >
        <Text color="green">DeepX Wallet Import</Text>
        <Text color="gray">
          {commandName} is running on {network.label}. No local wallet exists
          for this network yet, so import one to continue.
        </Text>
        <Text>
          Paste your private key, choose one passphrase, and press Enter.
        </Text>
        <Text> </Text>
        <InlineFieldRow
          isFocused={focusedField === 'privateKey'}
          label="Private key"
          value={maskValue(privateKey, isSecretVisible)}
        />
        <InlineFieldRow
          isFocused={focusedField === 'passphrase'}
          label="Passphrase"
          value={maskValue(passphrase, isSecretVisible)}
        />
        <Text> </Text>
        {effectiveError ? (
          <Text color="red">{effectiveError}</Text>
        ) : (
          <Text color="gray">
            Tab switches fields. Enter advances or saves. Ctrl+R toggles secret
            visibility. Esc skips.
          </Text>
        )}
        <Text color="gray">
          Wallet file will be encrypted locally and stored under your user
          config directory. The passphrase is kept in memory for this session
          after import.
        </Text>
        {isSaving ? (
          <Text color="yellow">Saving encrypted wallet...</Text>
        ) : null}
      </Box>
    </Box>
  );
};

type FieldRowProps = {
  label: string;
  value: string;
  isFocused: boolean;
};

const InlineFieldRow: FC<FieldRowProps> = ({ label, value, isFocused }) => {
  return (
    <Box marginBottom={1}>
      <Text color={isFocused ? 'yellow' : 'gray'}>{label}: </Text>
      <Text>{formatFocusedInputValue(value, isFocused)}</Text>
    </Box>
  );
};
