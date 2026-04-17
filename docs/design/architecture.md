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
- assistant text responses stream into the transcript when the model API returns chunked output
- the chat tool layer includes read-only wallet helpers that fetch local subaccount collateral, borrow totals, perp exposure, and the wallet's contract subaccount list over RPC
- wallet portfolio and position snapshots read perp positions from the Perp contract over RPC using the selected Subaccount contract address as the `userPerpPositions` input
- market metadata is fetched from the selected network backend APIs rather than kept as a static in-repo catalog
- the chat tool layer can prepare new Subaccount contract creation through `deepx_create_subaccount`; live submission is paused for a below-input user confirmation selector before any local execution
- AI chat can prepare live perp and spot order details through `deepx_place_order`, but model-supplied `confirm=true` is never trusted; the agent loop pauses and resumes only after the terminal user confirms or cancels
- the agent tool registry also exposes dedicated perp position helpers for `deepx_close_position` and `deepx_update_position`
- AI-driven order cancellation, position close, TP/SL updates, and subaccount creation use the same human-in-the-loop confirmation path before live execution
- trade requests entered in chat are routed through the DeepX agent so the model can decide whether to answer directly or stage a tool-driven action for local confirmation
- the app now starts a shared market websocket session for the selected network during process boot and reuses that transport across market consumers
- live perp `place`, `cancel`, `close`, and TP/SL update flows sign locally, then broadcast the raw transaction directly through the selected network RPC
- live spot `place` flows use the Subaccount Spot contract order functions, sign locally, then broadcast the raw transaction directly through the selected network RPC
- live order transaction payloads fetch the wallet's Subaccount contract list over RPC, select the primary subaccount address, and pass that subaccount to the trade contract; the local wallet address is only used for signing
- live execution requires the local encrypted wallet plus local user confirmation; the remembered session passphrase is reused when available, otherwise the shell prompts for a passphrase below the input bar
- spot token approval and transfer workflows remain out of scope

## Observability

- a shared in-process logger records structured application events
- default mode captures warnings and errors only to avoid continuous runtime overhead
- `--mode debug` enables low-level HTTP, RPC, and websocket request/response logging and persists those logs to disk
- sensitive payload fields such as `signedTx`, `passphrase`, and `privateKey` are redacted before they enter the logger

## Phase 1 Runtime Flow

- Parse CLI options, including `--network`
- Normalize to `deepx_devnet` or `deepx_testnet`
- Start the shared market websocket session for the selected network
- Read local wallet metadata for the selected network
- If missing, render the simplified encrypted wallet import flow
- If present, prompt for the wallet passphrase and keep it in process memory for the session
- Allow `Esc` on wallet bootstrap to open the shell in read-only mode
- After unlock, import, or skip, enter the fullscreen shell
