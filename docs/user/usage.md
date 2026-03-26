# Usage

## Local Development

Run the CLI with:

```bash
bun run dev
./bin/deepx --network devnet
./bin/deepx --network testnet
```

Or invoke the executable directly:

```bash
./bin/deepx
```

Set `GEMINI_API_KEY` or `GOOGLE_API_KEY` before launch if you want live AI chat replies.

## Current Behavior

- `devnet` is the default network
- `--network testnet` switches to testnet
- the app checks for an encrypted wallet file for the selected network
- if a wallet already exists, it asks for the wallet passphrase before entering the dashboard
- if no wallet is found, it opens a simplified import flow with only private key and passphrase
- after unlock or import, it opens the fullscreen market dashboard
- the passphrase stays in process memory for the current session so later live order actions can reuse it
- the AI chat panel uses the Google GenAI SDK with `gemini-3-flash-previous`
- the chat agent can call the built-in DeepX tools directly for market lookup and order workflows
- the chat agent is advisory-only for trading actions and blocks live submission or cancellation
- no MCP server is required for the dashboard chat flow

## Dashboard Keys

- `q` quit
- `tab` cycle focus
- `1` switch to perp pairs
- `2` switch to spot pairs
- left/right or `h`/`l` change pair when the market strip is focused
- `[` and `]` change chart resolution when the chart is focused
- type, `backspace`, `esc`, and `enter` control the chat panel when it is focused

## Current Dashboard Surface

- header market strip with network badge and wallet summary
- realtime candle chart with volume bars and stream status
- orderbook and recent trades panels
- AI chat panel for market and execution assistance
- no direct order-entry form is implemented in the TUI yet
