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
- the chat agent can fetch market price info for supported pairs, including latest price and 24h change
- the chat agent can read the current local wallet portfolio, including balances, borrowing, and perp positions, through a read-only portfolio tool
- the chat agent can list all Subaccount contract subaccounts attached to the local wallet
- the chat agent can prepare a new Subaccount contract creation request; live creation pauses for the below-input confirmation selector
- the agent tool layer also exposes perp position-close and take-profit/stop-loss update actions
- while the agent is generating, the chat panel streams assistant text into the transcript when chunked output is available; otherwise it falls back to the animated `Thinking...` indicator
- trade prompts such as `buy 0.001 ETH` or `sell 2 SOL at 150` go through the AI agent, which can answer in natural language and stage a live action when appropriate
- when the agent stages an order, you still confirm or cancel it in the selector below the input bar; if the session wallet is already unlocked, submission reuses that passphrase
- when the AI calls a live-capable order, cancel, position, TP/SL, or subaccount tool, the agent pauses until you choose `Confirm` or `Cancel` below the input bar
- if no wallet passphrase is remembered for the session, confirming an AI action opens a masked passphrase prompt below the input bar before execution
- if a live transaction submission fails, the assistant error now includes the RPC URL, request body, tx hash when available, and any RPC error body to speed up debugging
- debug mode increases logger capture for HTTP/WebSocket request and response activity
- debug mode also writes captured logs to `~/.local/state/deepx/logs/debug.log`; set `DEEPX_DEBUG_LOG_FILE` if you want a different file
- debug mode does not open a dedicated in-app debug panel; logs stay in the local file instead
- the dashboard shows open perp positions for the unlocked wallet in a dedicated lower panel
- the `/orderbook` workspace now shows the live ladder, latest trades, and compact 1h/24h price and volume stats in the header
- pressing `Esc` with an empty composer while `/orderbook` is active closes the live workspace and appends a frozen `Snapshot HH:MM:SS` card to the transcript
- no MCP server is required for the dashboard chat flow
- typing `/` in the shell input opens a live command selector and filters matching slash commands as you type

## Shell Keys

- `q` quit
- type into the bottom input bar for chat or slash commands
- typing `/` opens the command selector immediately
- `/candle`, `/orderbook`, and `/help` are the supported commands
- `enter` submits input, confirms the selected pair, activates a confirmation selector action, or submits a masked passphrase prompt
- `up` and `down` recall recent input unless the pair picker or a partial slash-command selector is active
- `left` and `right` move the input cursor; use `ctrl` or `meta` with arrows to jump by word
- `ctrl+a` and `ctrl+e` jump to the start or end of the current input
- `backspace` deletes before the cursor and `delete` deletes at the cursor
- `ctrl+w` deletes the previous word, `ctrl+u` clears before the cursor, and `ctrl+k` clears after it
- `esc` skips wallet boot, clears the slash selector, cancels a pending confirmation or passphrase prompt, exits pair selection back to the input bar, or closes an active `/orderbook` workspace into a transcript snapshot when the composer is empty
- `up` and `down` move through the pair picker after `/candle` or `/orderbook`
- `up` and `down` move through the slash-command selector while it is filtering partial matches; once the input is an exact slash command such as `/orderbook`, `up` and `down` return to history recall
- `pageup` and `pagedown` scroll the chat transcript without snapping back to the newest reply
- `left` and `right` move through the confirmation selector while a staged local order or AI tool action is pending
- `[` and `]` change chart resolution while candle view is active

## Current Shell Surface

- welcome panel at the top of the shell
- AI transcript above the input bar
- workspace area for `/candle`, `/orderbook`, and `/help`
- pair picker after `/candle` and `/orderbook`
- confirmation selector below the input bar for staged chat orders and AI tool actions
- masked passphrase prompt below the input bar when a confirmed AI action needs a wallet passphrase
- persistent current network line below the input bar
