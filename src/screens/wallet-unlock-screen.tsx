import { Box, Text, useInput } from 'ink';
import type { FC } from 'react';
import { useState } from 'react';

import type { NetworkConfig } from '../config/networks';
import {
  formatFocusedInputValue,
  maskValue,
  truncateMiddle,
} from '../lib/format';

type WalletUnlockScreenProps = {
  network: NetworkConfig;
  walletAddress: string;
  errorMessage?: string;
  isUnlocking: boolean;
  onSubmit: (input: { passphrase: string }) => Promise<void>;
};

export const WalletUnlockScreen: FC<WalletUnlockScreenProps> = ({
  network,
  walletAddress,
  errorMessage,
  isUnlocking,
  onSubmit,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [isSecretVisible, setIsSecretVisible] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string>();

  const effectiveError = validationMessage || errorMessage;

  useInput(async (input, key) => {
    if (isUnlocking) {
      return;
    }

    if (key.ctrl && input === 'r') {
      setIsSecretVisible((value) => !value);
      return;
    }

    if (key.return) {
      try {
        if (!passphrase.trim()) {
          throw new Error('Passphrase is required.');
        }

        setValidationMessage(undefined);
        await onSubmit({ passphrase: passphrase.trim() });
      } catch (error) {
        setValidationMessage((error as Error).message);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValidationMessage(undefined);
      setPassphrase((value) => value.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && input) {
      setValidationMessage(undefined);
      setPassphrase((value) => `${value}${input}`);
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
        width={82}
        borderStyle="round"
        borderColor="green"
        padding={1}
      >
        <Text color="green">DeepX Wallet Unlock</Text>
        <Text color="gray">
          Local wallet found for {network.label}:{' '}
          {truncateMiddle(walletAddress)}
        </Text>
        <Text>Enter the passphrase once for this session.</Text>
        <Text> </Text>
        <Box>
          <Text color="yellow">Passphrase: </Text>
          <Text>
            {formatFocusedInputValue(
              maskValue(passphrase, isSecretVisible),
              true,
            )}
          </Text>
        </Box>
        <Text> </Text>
        {effectiveError ? (
          <Text color="red">{effectiveError}</Text>
        ) : (
          <Text color="gray">
            Press Enter to unlock. Ctrl+R toggles passphrase visibility.
          </Text>
        )}
        <Text color="gray">
          The passphrase is kept in process memory only so later live order
          actions can reuse it during this session.
        </Text>
        {isUnlocking ? <Text color="yellow">Unlocking wallet...</Text> : null}
      </Box>
    </Box>
  );
};
