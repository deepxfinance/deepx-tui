import { Box, Text, useApp, useInput } from 'ink';
import type { FC } from 'react';

type HelpScreenProps = {
  commandName: string;
};

export const HelpScreen: FC<HelpScreenProps> = ({ commandName }) => {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      exit();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
      width={76}
    >
      <Text color="yellow">DeepX Terminal</Text>
      <Text>
        Usage: {commandName} [--network devnet|testnet] [--mode default|debug]
      </Text>
      <Text> </Text>
      <Text>Phase 1 behavior:</Text>
      <Text>- defaults to devnet</Text>
      <Text>- optional debug mode shows a live internal log panel</Text>
      <Text>- checks for a local encrypted wallet</Text>
      <Text>- prompts for passphrase if a wallet already exists</Text>
      <Text>- prompts for a simple private key import if missing</Text>
      <Text>- opens the fullscreen market dashboard</Text>
      <Text> </Text>
      <Text>Keys:</Text>
      <Text>- q or Esc: quit</Text>
      <Text>- Tab: cycle dashboard focus</Text>
      <Text>- 1 / 2: switch perp / spot group</Text>
      <Text>- Left / Right: change pair when the pair strip is focused</Text>
      <Text>- [ / ]: change chart resolution when the chart is focused</Text>
      <Text> </Text>
      <Text color="gray">Press q or Esc to close this help screen.</Text>
    </Box>
  );
};
