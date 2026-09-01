# Changelog

All notable changes to the Claude Code Telemetry hook will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.15] - 2026-09-01

### Fixed

- **Headless runs (`claude -p`) emitted nothing at all.** The hook was registered only on `Stop` with `async: true`, and Claude Code registers an async Stop hook but exits before spawning it in headless mode — verified with a probe hook that never executed once, while the same hook registered synchronously ran and received its full payload. Since headless is how another harness drives Claude Code, every non-interactive session was invisible. The installer now also registers a **synchronous `SessionEnd`** hook, which does fire there. `Stop` stays `async`, so interactive turns are unaffected. `SessionEnd` additionally fires on interactive quit and on Ctrl-C, so it catches a final turn whose async `Stop` hook died with the process; only `SIGKILL` escapes both. The two never double-count — emission is incremental behind a byte offset and a state lock. Both hand their work to a detached worker (`detached: true`, so `setsid` moves it out of the session's process group), which keeps the synchronous `SessionEnd` from delaying session teardown: 0.03s rather than the 0.32s an `npx`-resolved inline run costs. `LATITUDE_CLAUDE_CODE_DETACH=0` forces the inline path. The `SessionEnd` entry carries an explicit `timeout`, because Claude Code kills those hooks on a shared ~1.5s budget that a cold `npx` resolve can exceed on its own. Existing installs need `install` re-run to pick up the `SessionEnd` entry.

### Added

- **Cross-harness trace correlation.** When another harness launches Claude Code — a Hermes tool call, a CI job, a subprocess agent — it can hand over its active span through the standard `TRACEPARENT` variable. The hook then joins that trace instead of deriving one from `sessionId:turnNumber`, and parents its turns on the supplied span, so a Claude Code session appears nested under the tool call that launched it rather than beside it. `LATITUDE_SESSION_ID` joins the parent's Latitude session and `LATITUDE_PROJECT` keeps both halves in one project (ingest is project-scoped, so a mismatch would split the trace with no error). `LATITUDE_TRACEPARENT` takes precedence for setups where `TRACEPARENT` already belongs to something else, and `LATITUDE_CLAUDE_CODE_INHERIT_CONTEXT=0` opts out. A session launched on its own is unaffected: with no valid header the hook generates ids exactly as before, and a malformed header is ignored rather than failing the turn. Claude's own session id stays available as `claude_code.session.id`. Joining is capped per session so one long-lived session cannot grow a trace it does not own without bound. Contract: [`dev-docs/trace-correlation.md`](../../../dev-docs/trace-correlation.md).

## [0.0.14] - 2026-07-22

### Fixed

- **Memory spans now emit from git worktrees.** The hook derived the auto-memory directory as the transcript's sibling (`dirname(transcript)/memory`), but Claude Code keeps one memory store per repository under the **main worktree**, while a linked worktree's session transcript lives under that worktree's own project directory. The two paths differ, so every memory operation from a worktree session was silently skipped. The classifier now recognizes any `~/.claude/projects/<store>/memory/<record>` path under the shared projects root, setting `gen_ai.memory.store.id` to the owning `<store>` slug — so a worktree session writing the repo's main-worktree store is captured. Sessions run directly in the repo root are unaffected.

## [0.0.13] - 2026-07-21

### Added

- **Memory observability for Claude Code auto memory.** Claude Code writes its own persistent [auto memory](https://code.claude.com/docs/en/memory) (per-repository markdown under `~/.claude/projects/<project>/memory/`) through ordinary `Read`/`Write`/`Edit` tools. The hook now emits a child memory-operation span under the `tool_execution` span whenever such a tool targets a file inside that directory, using the OpenTelemetry `gen_ai.memory.*` conventions — so auto memory shows up on Latitude's Memory page with per-record change history and diffs. `Write` → `upsert_memory`, `Edit`/`MultiEdit` → `update_memory`, `Read` → `search_memory`; `gen_ai.memory.store.id` is the `<project>` slug and `gen_ai.memory.record.id` is the file path within the memory dir. Edit bodies are read from disk at hook time (the tool call carries only a diff); subagent auto memory is covered via the same path.
- `LATITUDE_CLAUDE_CODE_MEMORY` (default `1`) emits memory-operation spans; set it to `0` to disable them. `LATITUDE_CLAUDE_CODE_MEMORY_CONTENT` (default `1`) includes record bodies; set it to `0` to emit structure and counts only. Bodies also honor `LATITUDE_REDACT_ATTRIBUTES` via the `gen_ai.memory.records` key.

## [0.0.12] - 2026-07-21

### Fixed

- **Oversized tool-definition lists no longer drop tool names.** When an `llm_request` span exceeded the byte budget, tool schemas were capped by keeping only the leading full entries (often just `Agent` / `Artifact` on real Claude Code sessions). Session `definedTools` then missed names like `WebSearch`, and the undeclared-tool flagger false-positived on successful calls. Capping now keeps every tool name (full schema when it fits, name-only stub otherwise).

## [0.0.11] - 2026-07-16

### Changed

- The installer now writes the Stop-hook command with the `@latest` tag (`npx -y @latitude-data/claude-code-telemetry@latest`) instead of a bare package name. A bare `npx <pkg>` reuses whatever version the npx cache first fetched and never updates, so users could silently stay on an old build; `@latest` re-resolves the newest published version each run (a cheap etag-revalidated check, off the critical path thanks to `async: true`), so fixes ship without a re-install. Docs updated to match.
- Re-running `install` now **upgrades** an existing Latitude Stop hook to the current command (and forces `async: true`) instead of no-opping when any hook is already present. Previously the installer left older hooks — the exact bare-`npx` installs this release targets — untouched, so `install` prints "Stop hook updated" and rewrites them in place.

## [0.0.10] - 2026-07-14

### Fixed

- **Parallel subagents now each get their own trace subtree.** When one turn spawned several `Agent` subagents at once, only one `tool:Agent` span received a nested `interaction` — the others showed no children. The stitcher matched subagents to their parent `Agent` call by `promptId`, which parallel calls share, so they collapsed onto a single call. Subagents are now matched by the `toolUseId` recorded in each subagent's `.meta.json` (unique per invocation), with `promptId` kept as a fallback for older transcripts.
- **A subagent's final `llm_request` is no longer dropped.** A subagent's transcript usually finishes flushing after its parent turn was already shipped (the final synthesis lands last), and the one-shot incremental read froze each subagent's offset before that row arrived, with no way to re-attach it. Subagents now emit as a standalone pass keyed off the parent `Agent` call's persisted span link: each subagent file is re-read every Stop and its spans are emitted **incrementally, exactly once** — a call once a later call closes it, and the trailing call plus interaction span once the file stops growing. Emitting each span once (rather than re-sending the whole subtree) keeps the additive `traces` rollup correct, since that view has no per-span dedup unlike the raw `spans` table.

### Added

- `subagent.name` attribute (the agent type, e.g. `Explore`) on subagent spans, alongside the existing `subagent.id` and `subagent.type`.

## [0.0.9] - 2026-06-18

### Added

- Local custom attribute redaction before OTLP export. Configure exact names, regex source strings, or `/pattern/flags` strings via `LATITUDE_REDACT_ATTRIBUTES`, with an optional `LATITUDE_REDACT_MASK`, to mask selected span attributes while keeping content capture enabled.

## [0.0.8] - 2026-06-11

### Fixed

- **Long agentic turns are no longer silently lost.** A single long turn (hundreds of LLM calls) produced one OTLP POST of 130–340 MB — too big to upload inside the client timeout and over the ingest rate limit — and the hook recorded it as sent anyway. Three changes fix this:
  - The transcript offset only advances after the export is confirmed delivered (2xx on every chunk). Failed exports are retried on the next Stop; deterministic span IDs make re-sends idempotent server-side.
  - Exports are split into POSTs of at most 3 MB each. One trace may arrive across several POSTs; the server already assembles spans by `trace_id`.
  - Spans over 128 KB get their bulkiest attributes truncated (repeated tool definitions, then system prompt, oldest input messages, tool results — in that order), always keeping valid JSON and the most recent context. A `latitude.truncation` attribute records what was cut. Spans under the budget are byte-identical to before. This also removes a `JSON.stringify` RangeError crash on very large sessions.
- **State lock handling.** A hook run that failed to acquire the state lock no longer deletes the lock file owned by a concurrent run; locks abandoned by killed hooks are broken after 10 minutes.
- Installer links now point to the current Latitude docs and API key settings URLs.

### Changed

- Per-POST client timeout raised from 10 s to 30 s (each POST is now bounded at 3 MB).

## [0.0.7] - 2026-04-24

### Changed

- **`fetch` intercept no longer does sync I/O on the response hot path.** Replaced `writeFileSync` with `fs/promises.writeFile` so writing the captured request file never blocks the event loop at `message_start`. The scan branch of the tee'd response now cancels itself right after writing the request file instead of draining the stream to EOF, removing any backpressure coupling between the scan branch and the caller's branch for the rest of the response. Request body extraction now runs concurrently with the outbound fetch rather than gating it. The wrapped `Response` also strips the upstream `content-length` header to avoid runtimes/proxies second-guessing the re-wrapped stream. Hygiene changes — no behavior change and none of these were shown to cause user-perceptible latency, but sync I/O inside a `fetch` interceptor is a footgun worth removing.

## [0.0.6] - 2026-04-21

### Fixed

- **Fixed URL domain** from `app.latitude.so` to `console.latitude.so`.

## [0.0.5] - 2026-04-20

### Changed

- **Install UX rewritten with [`@clack/prompts`](https://www.npmjs.com/package/@clack/prompts)** — the interactive wizard now opens with a proper welcome banner, renders each prompt inside a gutter with a description line explaining the field + the relevant Latitude URL to fetch it from, masks the API key input with `•` as you type, and ends with a "Next step" panel plus a direct link to your project's trace view. Spinners stream in as each install step completes.
- **README restructured around `install` / `uninstall`** — the one-liner setup is now the first thing users see. The "paste this JSON into settings.json" walkthrough is pushed into a secondary "Configuration reference" section for users who don't want the wizard.

### Added

- **`--staging` and `--dev` environment flags** replace `--base-url`. They target:
  - `--staging` → `https://staging.latitude.so` / `https://staging-ingest.latitude.so`
  - `--dev` → `http://localhost:3000` / `http://localhost:3002`
  - no flag → `https://console.latitude.so` / `https://ingest.latitude.so` (production default)
  Every URL shown or written during install (API-keys link, project-creation link, ingest endpoint, trace-view link, About banner) is derived from the selected environment. The two environments are mutually exclusive; passing both errors out.
- **Per-prompt inline help** — the API key prompt's description line tells you where to generate one (with the env-correct URL); the project slug prompt tells you where to create a project. Both include the current value as "(Enter to keep …)" hints when re-running.
- **`picocolors` dependency** for minimal ANSI styling (cyan links, dim hints, yellow warnings for non-production envs).

### Removed

- **`--base-url` flag.** Replaced by the `--staging` / `--dev` flags above. Self-hosted users can still hand-edit `settings.json` / pass `LATITUDE_BASE_URL` via env.
- **`LATITUDE_BASE_URL` interactive prompt.** It was flag-only in `0.0.4`; now the concept is subsumed entirely by the environment flags.
- **Default-value placeholder on the project slug prompt** — the input now starts empty when there's no existing value, so nothing looks pre-filled.

### Fixed

- **No more auto-detection of environment from existing settings.** `install` with no env flag always targets production. Previously, an existing `LATITUDE_BASE_URL` pointing at staging would cause a flagless re-run to silently stay on staging; surprising.

## [0.0.4] - 2026-04-20

### Added

- **Interactive `install` wizard** — `npx -y @latitude-data/claude-code-telemetry install` now prompts for `LATITUDE_API_KEY` and `LATITUDE_PROJECT`, merges them into `~/.claude/settings.json` under `env`, and installs the Stop-hook entry if missing. On macOS it also offers to set `BUN_OPTIONS` via `launchctl` and persist it with a `~/Library/LaunchAgents/so.latitude.claude-code-telemetry.plist`. Existing values are shown as defaults (API keys masked); a backup of `settings.json` is always written to `settings.json.latitude-bak` before any change.
- **Flag-driven install** for CI / automation: `--api-key=…`, `--project=…`, `--base-url=…` (flag-only — no prompt), `--no-launchctl`, `--no-prompt` / `--yes`. Snake_case aliases also accepted (`--api_key`, `--base_url`, etc.).
- **`uninstall` subcommand** — `npx -y @latitude-data/claude-code-telemetry uninstall` shows a plan and asks for confirmation, then reverses only what this package installed: removes `LATITUDE_*` / `BUN_OPTIONS` from `settings.json.env`, removes our Stop-hook entry (leaves other hooks alone), clears `launchctl` `BUN_OPTIONS` only when it points at our preload, unloads and removes the LaunchAgents plist, and deletes `~/.claude/state/latitude/` (preload, state, captured requests).
- **Idempotent settings merge** — rerunning install with the same inputs is a no-op. The hook-detection regex matches both the published npm command and dev-checkout `dist/index.js` paths.

### Changed

- **Non-interactive `install`** (no TTY, no flags) now just copies the preload file, unchanged from before. Any flag or TTY opts into the wizard.

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
