# Changelog

All notable changes to the OpenClaw Telemetry plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2026-04-24

### Added

- Initial release. OpenClaw plugin that streams every agent run to Latitude as OTLP traces by subscribing to OpenClaw's typed `llm_input` / `llm_output` / `before_tool_call` / `after_tool_call` / `agent_end` hooks.
- Per-run state accumulator keyed by `runId` that pairs LLM input/output into single calls, nests tool invocations under their parent LLM call, and handles out-of-order tool events defensively.
- OTLP span tree with three span kinds — `interaction` (per agent run), `llm_request` (per LLM call), `tool_execution` (per tool invocation). Every span carries `openclaw.agent.id` and `openclaw.agent.name` so multi-agent setups are filterable in the Latitude UI.
- `llm_request` spans capture everything OpenClaw surfaces: provider, request/response model, resolved ref, system prompt, full message history, current prompt, assistant text, tool call parts, and full token usage (input/output/cache_read/cache_creation/total) under both canonical `gen_ai.*` keys and legacy aliases.
- Installer CLI (`npx @latitude-data/openclaw-telemetry install`) that writes a plugin entry with `hooks.allowConversationAccess: true` and `LATITUDE_*` env vars to `~/.openclaw/openclaw.json`, plus matching `uninstall`.
- Supports production / `--staging` / `--dev` environment flags and non-interactive `--api-key` / `--project` / `--yes` flags for CI.
