# Setup

## Bootstrap

1. Install dependencies:

```bash
bun install
bun install -g .
```

2. Start the CLI:

```bash
export GEMINI_API_KEY=your_api_key
# or: export GOOGLE_API_KEY=your_api_key
bun run dev
bun run dev -- --network testnet
bun run dev -- --mode debug
```

3. Run checks:

```bash
bun run lint
bun test
```

## Notes

- The executable entrypoint is `bin/deepx`
- The wallet store is per-network and written to your local config directory
- When a wallet file already exists, the TUI asks for the passphrase before entering the shell
- Pressing `Esc` during wallet unlock or import opens the shell in read-only mode
- Successful unlock keeps the passphrase in process memory for explicit execution workflows in the same session
- The AI chat panel uses `@google/genai` directly and accepts either `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- The current agent model target is `gemini-3-flash-preview`
- The chat system instruction requires pure text replies with no Markdown formatting
- DeepX tool calls now stay in-process instead of routing through MCP
- The in-process market tool layer now includes `deepx_get_market_price_info` for latest price and 24h change lookups on supported pairs
- The in-process tool layer now includes a read-only wallet portfolio helper plus dedicated perp position close and TP/SL update helpers in addition to order placement and cancellation
- AI chat can prepare live perp and spot order details through `deepx_place_order`, but live submission pauses the agent loop and uses the local below-input Confirm/Cancel selector rather than agent-set `confirm=true`
- The tool layer can prepare Subaccount contract creation through `deepx_create_subaccount`; live submission uses the same local confirmation gate plus an unlocked session wallet or explicit passphrase prompt
- Live perp place, cancel, close, and TP/SL update transactions fetch the wallet's subaccount list over RPC, select the primary Subaccount contract address, and then populate perp contract calls
- Live spot place transactions fetch the wallet's subaccount list over RPC, select the primary Subaccount contract address, and then populate spot contract calls
- Market ids are network-specific: perp ids come from `/v2/market/perp/markets`, while spot ids come from `/v2/market/spot/markets` and use the bytes32 `pair` value rather than the numeric perp market id
- The terminal now loads market metadata from the selected backend APIs on demand and caches it per network in-process for the current session
- The app now starts a shared market websocket session as soon as the selected network boots and reuses it for orderbook and position websocket consumers instead of opening duplicate sockets
- AI chat resumes after user confirmation or cancellation by sending the local action result back to the model as a tool response
- AI chat now routes live order cancellation, position close, TP/SL updates, and subaccount creation through the confirmation gate instead of leaving them permanently blocked
- trade commands entered in chat now go through the DeepX agent instead of a local parser shortcut
- the shell is chat-first and uses slash commands for market views
- `/candle` and `/orderbook` first require pair selection, then reuse live market data streams for the chosen pair
- debug mode captures HTTP market requests, RPC transaction submissions, websocket events, and wallet/chat lifecycle events in the shared logger
- debug mode also appends captured log entries to `~/.local/state/deepx/logs/debug.log` by default; set `DEEPX_DEBUG_LOG_FILE` to override the file path
- default mode keeps the shared logger at warn/error level to avoid constant websocket logging overhead
- sensitive fields such as `signedTx`, `passphrase`, and `privateKey` are redacted before entering the logger
- failed live transaction submissions now surface the RPC URL, request body, tx hash when available, and any RPC error/response body in the assistant-visible error text
- passphrase text entered for an agent action stays local and is not added to chat history or model contents
- `deepx_get_market_price_info`, `deepx_get_wallet_portfolio`, `deepx_list_subaccounts`, `deepx_create_subaccount`, `deepx_place_order`, `deepx_cancel_order`, `deepx_close_position`, and `deepx_update_position` are all available in the in-process tool registry
- The current build uses a real wallet import flow and a live market dashboard fed by DeepX HTTP and websocket data
- The repository is intentionally small so feature work can be added incrementally
