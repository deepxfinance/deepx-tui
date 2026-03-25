import { Box, Text } from 'ink';
import type { FC } from 'react';
import { useEffect, useState } from 'react';

import type { CliOptions } from './lib/parse-cli-args';
import { DashboardScreen } from './screens/dashboard-screen';
import { HelpScreen } from './screens/help-screen';
import { WalletImportScreen } from './screens/wallet-import-screen';
import { WalletUnlockScreen } from './screens/wallet-unlock-screen';
import { rememberWalletPassphrase } from './services/wallet-session';
import {
  readWalletRecord,
  type StoredWalletRecord,
  saveWalletRecord,
  verifyWalletPassphrase,
} from './services/wallet-store';

type AppProps = {
  cli: CliOptions;
  commandName: string;
};

type ViewState =
  | { kind: 'loading' }
  | { kind: 'wallet-unlock'; wallet: StoredWalletRecord }
  | { kind: 'wallet-import' }
  | { kind: 'dashboard'; wallet: StoredWalletRecord }
  | { kind: 'error'; message: string };

export const App: FC<AppProps> = ({ cli, commandName }) => {
  const [viewState, setViewState] = useState<ViewState>({ kind: 'loading' });
  const [walletStepError, setWalletStepError] = useState<string>();
  const [isSavingWallet, setIsSavingWallet] = useState(false);
  const [isUnlockingWallet, setIsUnlockingWallet] = useState(false);

  useEffect(() => {
    let isMounted = true;

    readWalletRecord(cli.network.id)
      .then((wallet) => {
        if (!isMounted) {
          return;
        }

        if (wallet) {
          setViewState({ kind: 'wallet-unlock', wallet });
          return;
        }

        setViewState({ kind: 'wallet-import' });
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setViewState({
          kind: 'error',
          message: (error as Error).message,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [cli.network.id]);

  async function handleWalletSubmit(input: {
    privateKey: string;
    passphrase: string;
  }) {
    try {
      setIsSavingWallet(true);
      setWalletStepError(undefined);
      const wallet = await saveWalletRecord({
        network: cli.network.id,
        privateKey: input.privateKey,
        passphrase: input.passphrase,
      });
      rememberWalletPassphrase(cli.network.id, input.passphrase);
      setViewState({ kind: 'dashboard', wallet });
    } catch (error) {
      setWalletStepError((error as Error).message);
    } finally {
      setIsSavingWallet(false);
    }
  }

  async function handleWalletUnlock(input: { passphrase: string }) {
    if (viewState.kind !== 'wallet-unlock') {
      return;
    }

    try {
      setIsUnlockingWallet(true);
      setWalletStepError(undefined);
      verifyWalletPassphrase(viewState.wallet, input.passphrase);
      rememberWalletPassphrase(cli.network.id, input.passphrase);
      setViewState({ kind: 'dashboard', wallet: viewState.wallet });
    } catch (error) {
      setWalletStepError((error as Error).message);
    } finally {
      setIsUnlockingWallet(false);
    }
  }

  if (cli.showHelp) {
    return <HelpScreen commandName={commandName} />;
  }

  if (viewState.kind === 'loading') {
    return (
      <CenterCard
        title="Booting DeepX TUI"
        subtitle={`Loading ${cli.network.label} session...`}
      />
    );
  }

  if (viewState.kind === 'wallet-import') {
    return (
      <WalletImportScreen
        commandName={commandName}
        errorMessage={walletStepError}
        isSaving={isSavingWallet}
        network={cli.network}
        onSubmit={handleWalletSubmit}
      />
    );
  }

  if (viewState.kind === 'wallet-unlock') {
    return (
      <WalletUnlockScreen
        errorMessage={walletStepError}
        isUnlocking={isUnlockingWallet}
        network={cli.network}
        walletAddress={viewState.wallet.address}
        onSubmit={handleWalletUnlock}
      />
    );
  }

  if (viewState.kind === 'error') {
    return (
      <CenterCard
        title="Startup Error"
        subtitle={viewState.message}
        tone="red"
      />
    );
  }

  return (
    <DashboardScreen
      network={cli.network}
      walletAddress={viewState.wallet.address}
    />
  );
};

type CenterCardProps = {
  title: string;
  subtitle: string;
  tone?: 'green' | 'red';
};

const CenterCard: FC<CenterCardProps> = ({
  title,
  subtitle,
  tone = 'green',
}) => {
  return (
    <Box width="100%" height="100%" justifyContent="center" alignItems="center">
      <Box
        borderStyle="round"
        borderColor={tone}
        padding={1}
        flexDirection="column"
        width={72}
      >
        <Text color={tone}>{title}</Text>
        <Text color="gray">{subtitle}</Text>
      </Box>
    </Box>
  );
};
