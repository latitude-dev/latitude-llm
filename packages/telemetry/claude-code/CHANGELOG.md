# Changelog

All notable changes to the Claude Code Telemetry hook will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
