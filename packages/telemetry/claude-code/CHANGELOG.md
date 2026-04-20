# Changelog

All notable changes to the Claude Code Telemetry hook will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Race between the intercept preload and the Stop hook** — the preload used to buffer the whole response in the background and only write the request file after `.text()` resolved. If Claude Code fired `Stop` before that write completed, the hook saw an empty dir and spans didn't get enriched. The preload now tees the response stream and writes the file the moment `message_start` arrives (the first SSE event), guaranteeing the file is on disk well before any hook can run.
- **250ms flush delay at Stop-hook startup** — Claude Code could fire Stop before the transcript writer had flushed the final assistant row, so the last text-only `llm_request` span was occasionally missing and some turns weren't captured. The hook now waits briefly for disk flushes before reading.

### Added

- **Diagnostic span attributes** for the capture pipeline (`latitude.debug.message_ids`, `latitude.debug.captured_message_ids`, `latitude.debug.captured_count`, `latitude.debug.lookup_message_id`, `latitude.debug.request_file_found`) so the Latitude UI exposes exactly what the hook saw when a span isn't enriched.

### Docs

- **Claude Desktop setup correction** — `BUN_OPTIONS` in `~/.claude/settings.json`'s `env` does **NOT** reach the claude runtime; that field is only applied to hook subprocesses. README and `install` subcommand output now direct users to `launchctl setenv` for macOS Claude Desktop (followed by a full quit/relaunch) and to shell rc exports for terminal `claude`. A LaunchAgents plist template is included for persistence across reboots.

## [0.0.3] - 2026-04-20

### Added

- **Full LLM request capture via Bun preload (opt-in)** — a new `intercept.js` preload wraps `globalThis.fetch` inside the `claude` process and writes every Anthropic `/v1/messages` request body to `~/.claude/state/latitude/requests/<message_id>.json`. The Stop hook reads these files and enriches each `llm_request` span with the exact payload that reached the model:
  - `gen_ai.system_instructions` — the real system prompt (base + CLAUDE.md + billing blocks)
  - `gen_ai.tool.definitions` — every tool schema offered to the model
  - `gen_ai.request.model` / `max_tokens` / `temperature` / `top_p` / `stream`
  - `gen_ai.input.messages` rebuilt from the actual request (including `tool_use` / `tool_result` blocks), overriding the transcript reconstruction
  - `llm_request.captured = "true"` marker for filtering enriched spans
- **`install` subcommand** — `npx @latitude-data/claude-code-telemetry install` copies `intercept.js` to a stable path (`~/.claude/state/latitude/intercept.js`) and prints the `BUN_OPTIONS=--preload=...` line to paste into `settings.json`. The Stop hook also refreshes the installed copy on every run so package upgrades propagate.
- **Anthropic → Latitude message format converter** — handles `text`, `tool_use`, `tool_result`, `thinking` (→ `reasoning`), and `image` blocks; falls back to stringified JSON for unknown types.
- **Stale request-file sweep** — on every hook run, consumed request files are deleted and anything older than 24h is pruned.

### Notes

- The preload is fully optional. Without it, spans still work exactly as before (reconstructed from the transcript). With it, spans carry the ground truth.
- If `BUN_OPTIONS` points to a missing preload file, `claude` itself will refuse to start — keep the path in place or remove the env var.

## [0.0.2] - 2026-04-20

### Added

- **Workspace and git context on every span** — the hook now reads the Claude Code session's `cwd` and derives `workspace.name` / `workspace.path`, `git.branch` / `git.commit` / `git.repo`, `claude_code.version`, `host.user`, and `hook.event`. The workspace name is attached as a span tag (`latitude.tags`); the full set is attached as shared trace metadata (`latitude.metadata`) on every emitted span so traces can be sliced by repo, branch, or CLI version in the Latitude UI.
- **Full conversation history on `llm_request` input messages** — `gen_ai.input.messages` on the first LLM call of each turn now contains every prior user/assistant turn plus the current user prompt, matching the context actually sent to the model. Subagent turns accumulate their own isolated history from prior turns within the same Agent invocation.
- **Tool calls embedded in the conversation** — assistant messages now carry `{type: "tool_call"}` parts inline alongside text, and tool results are emitted as `{role: "tool"}` messages with `tool_call_response` parts. Matches the OpenTelemetry GenAI semantic conventions, so the Latitude UI can render tool invocations in-context instead of only as disconnected tool spans.

### Changed

- **One `llm_request` span per model call (tool-loop aware)** — a single user turn that triggers a tool loop now emits N `llm_request` spans as siblings under the interaction span, one per distinct assistant `message.id`. Tool executions are siblings of the `llm_request` spans (also parented to the interaction), reflecting that generation and tool execution are sequential, not nested. Previously a tool loop collapsed into a single `llm_request` with tools as children, which hid the request/response structure and double-counted input tokens across calls.
- **Full accumulated conversation on every `llm_request` input** — each `llm_request` now carries the full conversation that reached the model on that step (session history + current user prompt + every prior call's assistant message with tool_calls + tool responses), not just the delta since the previous call. Matches the billed `input_tokens` and lets the UI read each span standalone.
- **Proper waterfall timing per call and per tool** — each `llm_request` span now runs from the prior phase boundary (user prompt or preceding tool result) to its last-flushed transcript row, and each tool span runs from its emitting call's end to the tool_result row. Single-row calls (typical for the final assistant text) are floored to a 1ms minimum duration so they always render.
- **Per-call token attribution** — `input_tokens` / `output_tokens` / cache counters are now reported per `llm_request` span instead of summed across all calls in a turn. Fixes inflated totals for multi-call tool loops (e.g. a 3-call turn no longer triple-counts the base context).
- **Canonical tool-span attributes** — tool spans now emit `gen_ai.operation.name="execute_tool"`, `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments`, and `gen_ai.tool.call.result`, replacing the non-standard `tool.name` / `tool.input` / `tool.output` keys. Tool failures additionally set `error.type="tool_error"` and OTel status code 2.
- **Tool span timestamps are per-call** — tool spans now run from the emitting assistant row's timestamp to the tool_result row's timestamp, instead of inheriting the whole turn's bounds. The waterfall now reflects actual tool latency.
