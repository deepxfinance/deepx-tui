# Changelog

## 0.2.0 - 2026-03-26

- replaced the dashboard AI chat integration from local Gemini CLI plus MCP to an in-process DeepX agent backed by `@google/genai`
- exposed the existing DeepX market and order helpers as direct agent tools
- removed the repository MCP server and `deepx-mcp` executable
- enabled explicitly confirmed live perp order submission from chat while keeping AI-driven cancels blocked
- added deterministic local parsing for simple chat order commands such as `buy 0.001 ETH`
- added a shared structured logger plus `--mode debug` dashboard panel with searchable logs
- gated verbose logging behind debug mode and redacted sensitive payload fields before logging
- added GenAI agent, logger, dashboard, and tool execution tests, and aligned docs with the new runtime flow
