import { Box, Text, useApp, useInput } from 'ink';
import type { FC, ReactNode } from 'react';

type HelpScreenProps = {
  commandName: string;
};

export function buildHelpLines(commandName: string): string[] {
  return [
    `Usage: ${commandName} [--network devnet|testnet] [--mode default|debug]`,
    '',
    'Phase 1 behavior:',
    '- defaults to devnet',
    '- optional debug mode writes expanded logs to a local debug file',
    '- checks for a local encrypted wallet',
    '- prompts for passphrase if a wallet already exists',
    '- prompts for a simple private key import if missing',
    '- opens the fullscreen market dashboard',
    '',
    'Workspace commands:',
    '- /orderbook: open the live orderbook ladder for a selected pair',
    '- /help: show this help summary inside the dashboard',
    '- /new: clear the transcript and start a fresh chat thread',
    '',
    'Keys:',
    '- q or Esc: quit',
    '- [ / ]: change chart resolution while candle view is open',
    '- Up / Down: move through pair menus and partial slash-command matches; exact slash commands return Up / Down to history',
    '- PageUp / PageDown: scroll the chat transcript without snapping back',
    '- Enter: confirm the active command, pair, or chat input',
  ];
}

export const HelpContent: FC<{ lines: string[]; footer?: ReactNode }> = ({
  lines,
  footer,
}) => {
  const seenLines = new Map<string, number>();

  return (
    <Box flexDirection="column">
      {lines.map((line) => {
        const occurrence = seenLines.get(line) ?? 0;
        seenLines.set(line, occurrence + 1);
        const key = `help-line-${line || 'blank'}-${occurrence}`;

        return line ? <Text key={key}>{line}</Text> : <Text key={key}> </Text>;
      })}
      {footer ?? null}
    </Box>
  );
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
      <HelpContent
        lines={buildHelpLines(commandName)}
        footer={
          <>
            <Text> </Text>
            <Text color="gray">Press q or Esc to close this help screen.</Text>
          </>
        }
      />
    </Box>
  );
};
