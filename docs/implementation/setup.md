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
- When a wallet file already exists, the TUI asks for the passphrase before entering the dashboard
- Successful unlock keeps the passphrase in process memory for explicit execution workflows in the same session
- The AI chat panel uses `@google/genai` directly and accepts either `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- The current agent model target is `gemini-3-flash-preview`
- DeepX tool calls now stay in-process instead of routing through MCP
- AI chat can submit live perp orders through `deepx_place_order` when `confirm=true` and the same active session has already unlocked the wallet, or when a wallet `passphrase` is provided explicitly
- AI chat still blocks live order cancellation
- simple trade commands such as `buy 0.001 ETH` are parsed locally and staged for `confirm`, bypassing the LLM for deterministic order entry
- `--mode debug` renders a live debug panel sourced from the shared in-process logger
- debug mode captures HTTP market requests, RPC transaction submissions, websocket events, and wallet/chat lifecycle events in the shared logger
- default mode keeps the shared logger at warn/error level to avoid constant websocket logging overhead
- sensitive fields such as `signedTx`, `passphrase`, and `privateKey` are redacted before entering the logger
- `deepx_place_order` and `deepx_cancel_order` can submit live perp transactions when `confirm=true` and a wallet `passphrase` are provided, or when the same active session has already unlocked the wallet
- The current build uses a real wallet import flow and a live market dashboard fed by DeepX HTTP and websocket data
- The repository is intentionally small so feature work can be added incrementally
