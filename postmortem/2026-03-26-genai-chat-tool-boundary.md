# GenAI Chat Tool Boundary Hardening

Date: 2026-03-26

## What Happened

The first pass of the GenAI chat refactor moved tool calls in-process, but the chat layer still inherited enough authority to reach live order paths when a wallet was already unlocked.

## Root Cause

- The original MCP model assumed explicit operator intent at the client boundary.
- After moving tool invocation into the TUI process, the chat agent became that boundary, but there was no dedicated confirmation workflow around live order placement or cancellation.
- The initial SDK integration also relied on a handwritten request shape that passed tests but did not satisfy the SDK's real TypeScript tool contract.

## Fix

- Reworked the GenAI integration to align with the SDK's actual `GenerateContent` types.
- Added a chat-specific safety boundary that keeps order tools advisory-only and blocks live submission or cancellation from AI chat.
- Returned structured tool errors back into the model loop instead of aborting the whole chat turn.

## Prevention

- Treat agent migrations as authority-boundary changes, not just transport changes.
- Require an explicit product confirmation path before enabling any live execution from an LLM surface.
- Run `bun x tsc --noEmit` in addition to tests and lint whenever integrating third-party SDK types.
