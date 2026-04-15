# Architecture

## Goal

`deepx-tui` is a standalone terminal interface for workflows that are adjacent to `deepdex-web`, but optimized for terminal usage rather than browser interaction.

## Initial Shape

- Standalone repository rather than a monorepo
- Bun as runtime, package manager, and test runner
- Ink + React for terminal rendering
- `bin/deepx` as the user-facing command entrypoint
- per-network wallet bootstrap before shell entry
- fullscreen shell layout with a welcome panel, AI transcript, slash-command workspace, bottom input bar, and persistent network line

## Structure Rationale

- `bin/` keeps the executable contract stable even if internal source files move
- `src/` holds UI and pure logic, with reusable formatting helpers in `src/lib/`
- `tests/` focuses on deterministic units first so the project can grow safely
- `docs/` exists from day one so feature work has somewhere to record decisions

## Relationship To deepdex-web

- `deepdex-web` is the upstream product reference, not a dependency of this repo
- shared concepts can be ported intentionally later
- web-specific presentation and framework choices should not leak into the TUI without justification

## Agent Tooling

- the AI chat panel uses an in-process DeepX agent backed by the Google GenAI SDK
- the agent exposes the existing DeepX order and market helpers as direct function tools instead of routing through MCP
- the chat tool layer includes read-only wallet helpers that fetch local subaccount collateral, borrow totals, perp exposure, and the wallet's contract subaccount list over RPC
- the chat tool layer can submit live perp and spot orders through `deepx_place_order` when the model sets `confirm=true` and a wallet passphrase is available, either explicitly or from the active unlocked session
- the agent tool registry also exposes dedicated perp position helpers for `deepx_close_position` and `deepx_update_position`
- AI-driven order cancellation remains blocked until a dedicated confirmation workflow exists
- AI-driven position close and TP/SL updates remain blocked until a dedicated confirmation workflow exists
- simple imperative trade messages such as `buy 0.001 ETH` are parsed locally in the dashboard and converted into a staged order flow before confirmation, instead of routing those trivial intents through the LLM
- live perp `place`, `cancel`, `close`, and TP/SL update flows sign locally, then broadcast the raw transaction directly through the selected network RPC
- live spot `place` flows use the Subaccount Spot contract order functions, sign locally, then broadcast the raw transaction directly through the selected network RPC
- live order transaction payloads resolve the wallet's primary Subaccount contract address and pass that subaccount to the trade contract; the local wallet address is only used for signing
- live execution requires the local encrypted wallet plus an explicit passphrase and confirmation flag at tool-call time
- spot token approval and transfer workflows remain out of scope

## Observability

- a shared in-process logger records structured application events
- default mode captures warnings and errors only to avoid continuous runtime overhead
- `--mode debug` enables low-level HTTP, RPC, and websocket request/response logging plus an in-dashboard debug panel
- sensitive payload fields such as `signedTx`, `passphrase`, and `privateKey` are redacted before they enter the logger

## Phase 1 Runtime Flow

- Parse CLI options, including `--network`
- Normalize to `deepx_devnet` or `deepx_testnet`
- Read local wallet metadata for the selected network
- If missing, render the simplified encrypted wallet import flow
- If present, prompt for the wallet passphrase and keep it in process memory for the session
- Allow `Esc` on wallet bootstrap to open the shell in read-only mode
- After unlock, import, or skip, enter the fullscreen shell
