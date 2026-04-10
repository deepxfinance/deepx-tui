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
- `--mode debug` enables an in-dashboard debug log panel
- the app checks for an encrypted wallet file for the selected network
- if a wallet already exists, it asks for the wallet passphrase before entering the dashboard
- if no wallet is found, it opens a simplified import flow with only private key and passphrase
- after unlock or import, it opens the fullscreen market dashboard
- the passphrase stays in process memory for the current session so later live order actions can reuse it
- the AI chat panel uses the Google GenAI SDK with `gemini-3-flash-preview`
- the chat agent can call the built-in DeepX tools directly for market lookup and order workflows
- the agent tool layer also exposes perp position-close and take-profit/stop-loss update actions
- while the agent is generating, the chat panel shows an animated `Thinking...` indicator in the transcript and status line
- simple chat orders like `buy 0.001 ETH` or `sell 2 SOL at 150` are parsed locally against the active pair, then sent as real transactions after you reply `confirm`
- those locally parsed chat orders reuse the unlocked session wallet and do not ask for the passphrase again
- AI chat still blocks live execution for agent-driven cancels, position closes, and TP/SL updates until a dedicated confirmation flow exists
- debug mode shows recent app logs plus HTTP/WebSocket request and response activity
- the dashboard shows open perp positions for the unlocked wallet in a dedicated lower panel
- when the debug panel is focused, type to search logs by scope, level, message, or details; `Backspace` edits and `Esc` clears the filter
- no MCP server is required for the dashboard chat flow

## Dashboard Keys

- `q` quit
- `tab` cycle focus
- `1` switch to perp pairs
- `2` switch to spot pairs
- left/right or `h`/`l` change pair when the market strip is focused
- `[` and `]` change chart resolution when the chart is focused
- type, `backspace`, `esc`, and `enter` control the chat panel when it is focused
- in debug mode, `tab` also reaches the debug panel and typing filters the log stream

## Current Dashboard Surface

- header market strip with network badge and wallet summary
- realtime candle chart with volume bars and stream status
- orderbook and recent trades panels
- AI chat panel for market and execution assistance
- live perp positions panel for the unlocked wallet
- bottom status panel with CLI version and websocket delay
- no direct order-entry form is implemented in the TUI yet
