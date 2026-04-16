# deepx-tui

`deepx-tui` is a standalone terminal interface for DeepX trading workflows. It is adjacent to [`deepdex-web`](/home/stone/Web/deepdex-web), but built specifically for terminal-first usage with a fullscreen dashboard, per-network wallet bootstrap, and an in-process AI trading assistant.

## Requirements

- Bun `>=1.2.19`

## Install

Global package install:

```bash
npm install -g deepx-cli
```

Local development:

```bash
bun install
bun install -g .
```

## API Key Setup

Set one of the following environment variables before launching `deepx` if you want live AI chat replies:

```bash
export GEMINI_API_KEY=your_api_key
# or
export GOOGLE_API_KEY=your_api_key
```

## Run

Development:

```bash
bun run dev
bun run dev -- --network testnet
bun run dev -- --mode debug
```

Installed CLI:

```bash
deepx
deepx --network testnet
deepx --mode debug
```

Direct entrypoint:

```bash
./bin/deepx
./bin/deepx --network testnet
```

## Current Design

- `bin/deepx` is the stable user-facing entrypoint
- the app uses Bun, React, and Ink for a standalone terminal UI
- startup stays simple: parse CLI flags, resolve network, load wallet metadata, offer unlock or import, then enter the shell
- wallet storage is local and per-network
- successful unlock keeps the wallet passphrase in process memory for the active session
- the app opens into a chat-first fullscreen shell with a welcome panel, AI transcript, slash commands, pair picker, confirmation selector, bottom input bar, and persistent network line
- typing `/` in the input bar opens a live command selector so slash commands can be picked with the keyboard before submission
- `/candle` and `/orderbook` select a pair first, then render the requested market view in the workspace area
- sensitive values such as `privateKey`, `passphrase`, and `signedTx` are redacted before entering logs

## Current Workflow

1. `deepx` starts on `devnet` by default.
2. Use `--network testnet` to switch to testnet.
3. The app checks for an encrypted wallet file for the selected network.
4. If a wallet exists, it prompts for the wallet passphrase before entering the shell.
5. If no wallet exists, it opens a simplified import flow for private key and passphrase.
6. Press `Esc` in either wallet step to skip into a read-only shell.
7. After unlock, import, or skip, it opens the fullscreen shell.

## AI Chat And Execution

- the chat panel uses `@google/genai` with `gemini-3-flash-preview`
- the agent runs in-process and calls built-in DeepX market and order helpers directly
- the agent can fetch market price info for supported pairs, including latest price and 24h change
- the agent can also read the current local wallet portfolio, including balances, borrowing, and perp positions, through a read-only portfolio tool
- the agent can list Subaccount contract subaccounts for the local wallet and prepare new subaccount creation requests through `deepx_create_subaccount`
- trade prompts such as `buy 0.001 ETH` or `sell 2 SOL at 150` go through the AI agent instead of a local parser shortcut
- confirmed perp orders can be submitted as live transactions when the wallet is already unlocked for the session
- the agent tool layer also understands perp position-close and TP/SL update requests
- AI-driven live-capable tool calls pause for a below-input Confirm/Cancel selector, then resume the agent with the local execution or cancellation result
- if no wallet passphrase is remembered for the session, confirming an AI action opens a masked passphrase prompt before local execution

## Shell Keys

- `q` quit
- type into the bottom input bar for chat or slash commands
- typing `/` opens the command selector and filters commands as you keep typing
- `/candle`, `/orderbook`, and `/help` are the supported commands
- `enter` submits input, confirms the selected pair, activates the selected confirmation action, or submits a masked passphrase prompt
- `backspace` edits the input bar
- `esc` skips wallet boot, cancels a pending confirmation or passphrase prompt, or exits pair selection back to the input bar
- `up` and `down` move through the pair picker after `/candle` or `/orderbook`
- `left` and `right` move through the confirmation selector while a staged order or AI action is pending
- `[` and `]` change chart resolution while candle view is active

## Quality Checks

```bash
bun run lint
bun test
```

## Repository Layout

- `bin/` executable entrypoints
- `src/` Ink application code
- `tests/` deterministic automated tests
- `docs/` design, implementation, and user docs
- `scripts/` repeatable workflow helpers
