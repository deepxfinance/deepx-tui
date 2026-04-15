# Usage

## Local Development

Run the CLI with:

```bash
bun run dev
./bin/deepx --network devnet
./bin/deepx --network testnet
./bin/deepx --mode debug
```

Or invoke the executable directly:

```bash
./bin/deepx
```

Set `GEMINI_API_KEY` or `GOOGLE_API_KEY` before launch if you want live AI chat replies.

## Current Behavior

- `devnet` is the default network
- `--network testnet` switches to testnet
- `--mode debug` is preserved, but the primary shell remains chat-first
- the app checks for an encrypted wallet file for the selected network
- if a wallet already exists, it asks for the wallet passphrase before entering the shell
- if no wallet is found, it opens a simplified import flow with only private key and passphrase
- pressing `Esc` during wallet unlock or import opens the shell in read-only mode
- after unlock, import, or skip, it opens the fullscreen shell
- the passphrase stays in process memory for the current session so later live order actions can reuse it
- the AI chat panel uses the Google GenAI SDK with `gemini-3-flash-preview`
- the chat agent can call the built-in DeepX tools directly for market lookup and order workflows
- the chat agent can read the current local wallet balance, collateral, borrow totals, and perp exposure through a read-only balance tool
- the agent tool layer also exposes perp position-close and take-profit/stop-loss update actions
- while the agent is generating, the chat panel shows an animated `Thinking...` indicator in the transcript and status line
- simple chat orders like `buy 0.001 ETH` or `sell 2 SOL at 150` are parsed locally against the active pair, then sent as real transactions after you reply `confirm`
- those locally parsed chat orders reuse the unlocked session wallet and do not ask for the passphrase again
- AI chat still blocks live execution for agent-driven cancels, position closes, and TP/SL updates until a dedicated confirmation flow exists
- debug mode shows recent app logs plus HTTP/WebSocket request and response activity
- the dashboard shows open perp positions for the unlocked wallet in a dedicated lower panel
- when the debug panel is focused, type to search logs by scope, level, message, or details; `Backspace` edits and `Esc` clears the filter
- no MCP server is required for the dashboard chat flow
- typing `/` in the shell input opens a live command selector and filters matching slash commands as you type

## Shell Keys

- `q` quit
- type into the bottom input bar for chat or slash commands
- typing `/` opens the command selector immediately
- `/candle`, `/orderbook`, and `/help` are the supported commands
- `enter` submits input or confirms the selected pair
- `backspace` edits the input bar
- `esc` skips wallet boot, clears the slash selector, or exits pair selection back to the input bar
- `up` and `down` move through the pair picker after `/candle` or `/orderbook`
- `up` and `down` also move through the slash-command selector while it is open
- `[` and `]` change chart resolution while candle view is active

## Current Shell Surface

- welcome panel at the top of the shell
- AI transcript above the input bar
- workspace area for `/candle`, `/orderbook`, and `/help`
- pair picker after `/candle` and `/orderbook`
- command history line above the input bar
- persistent current network line below the input bar
