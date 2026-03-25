import process from 'node:process';
import { render } from 'ink';

import { App } from './app';
import { parseCliArgs } from './lib/parse-cli-args';

const cli = parseCliArgs(process.argv.slice(2));

if (cli.showHelp && !process.stdin.isTTY) {
  process.stdout.write(`DeepX Terminal
Usage: deepx [--network devnet|testnet]

Phase 1 behavior:
- defaults to devnet
- checks for a local encrypted wallet
- prompts for passphrase if a wallet already exists
- prompts for private key import if missing
- opens the fullscreen market dashboard

Keys:
- q or Esc: quit
- Tab: cycle dashboard focus
- 1 / 2: switch perp / spot group
- Left / Right: change pair when the pair strip is focused
- [ / ]: change chart resolution when the chart is focused
`);
  process.exit(0);
}

render(<App cli={cli} commandName="deepx" />);
