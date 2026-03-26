# Changelog

## Unreleased

- replaced the dashboard AI chat integration from local Gemini CLI plus MCP to an in-process DeepX agent backed by `@google/genai`
- exposed the existing DeepX market and order helpers as direct agent tools
- removed the repository MCP server and `deepx-mcp` executable
- hardened the chat tool layer so AI chat remains advisory-only and blocks live order submission and cancellation
- added GenAI agent and tool execution tests, and aligned docs with the new runtime flow
