# Changelog

All notable changes to the Latitude Hermes telemetry plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0]

### Added

- **Memory telemetry.** Reads and writes of Hermes's built-in memory stores now appear as `gen_ai.memory.*` operations, so the Memory page, the per-session memory footprint and the memory ledger work for Hermes. The store is `hermes/<profile>` with one record per store file (`MEMORY.md`, `USER.md`); the frozen snapshot Hermes injects at session start is recorded as one read per session, and a write is recorded after the `memory` tool call succeeds by reading the file back off disk, so the recorded body is exactly what landed. Switches: `LATITUDE_HERMES_MEMORY`, `LATITUDE_HERMES_MEMORY_CONTENT`. Disables itself when an external `memory.provider` is configured.
- **Tool definitions.** `gen_ai.tool.definitions` is now exported, so a project's tool rollup and the Tools page learn what the agent is equipped with — including tools it never called. Resolved per call from the request payload, falling back to the in-process toolset snapshot when Hermes truncated the payload (which it does for any toolset of real size), with `hermes.tool_definitions.source` stating which. `LATITUDE_HERMES_TOOL_DEFINITIONS=0` opts out.
- **Failed API attempts** are real spans. Registering `api_request_error` gives a retried attempt its status code, reason, retryability and attempt number instead of an opaque `abandoned` marker.
- **The streaming flag and time to first token**, from the stream observer hooks. `isStreaming` is reliable. TTFT requires `plugins.stream_reasoning_deltas: true` in Hermes's own config — now a documented setup step — because Hermes streams a turn's visible text through a path that does not notify plugins when the turn ends in a tool call. With it on, TTFT landed on 51 of 53 calls in the validation session. `LATITUDE_HERMES_STREAM_TTFT=0` skips the per-delta subscription.
- **End-user identity.** `sender_id` from `pre_llm_call` becomes `user.id`, so per-user analytics work for gateway (Slack, Discord, …) sessions, plus `user.email` when the platform's user id is itself an address.
- **The delegation graph.** `subagent_start` / `subagent_stop` nest a delegated child's `interaction` under the `delegate` tool call that spawned it, sharing the parent's trace, session and session-level identity so one delegation reads as one session, with the child's role as `gen_ai.agent.name` and its status, summary and duration recorded.
- **Derived tags and a user tag/metadata surface.** Every span now carries `hermes`, the platform, the agent name, the agent version, `cron:<job>` and `subagent:<role>` as appropriate, plus rich `hermes.*` metadata (profile, Hermes version, api mode, provider, turn and task ids, finish reason, …). Operators can add their own with `tags` / `metadata` / `agent.name` / `agent.version` / `service_name`, which makes several agents in one project distinguishable and comparing two versions of one agent a single analytics breakdown or a two-variant experiment.
- **Configuration from `config.yaml`.** Every setting is now readable from `plugins.entries.latitude.settings.*` in the active profile's config as well as from the environment, the environment winning. Since `config.yaml` and `.env` are profile-scoped, one profile per agent gives each agent its own credentials, tags and metadata.
- **Secret redaction, on by default.** Exported content passes through Hermes's own redactor (`force=True`, URL credentials included), so a token echoed by a terminal tool is masked before it leaves the machine. `LATITUDE_HERMES_REDACT_SECRETS=0` opts out; if the redactor cannot be loaded the span records `hermes.redaction.applied=false` rather than implying protection it did not apply.
- **Per-attribute redaction.** `LATITUDE_HERMES_REDACT_ATTRIBUTES` (exact key or `/regex/flags`) replaces the whole value of any attribute with `LATITUDE_HERMES_REDACT_MASK`, keeping the key so the Attributes panel still shows what was sent.
- **Auxiliary LLM accounting.** Approvals, context compaction and title generation fire no plugin hooks, so their tokens were invisible — roughly 7% of a session's non-cache tokens. Their usage is now recovered at session teardown from Hermes's own per-task ledger (read-only) and exported as instantaneous `aux:<task>` spans, priced on the ledger row's own billing route. Only tasks that cannot fire hooks are emitted, and the whole step is skipped if the exported call count no longer squares with the ledger. `LATITUDE_HERMES_AUX_USAGE=0` opts out.
- **Cost provenance.** `hermes.cost.status`, `hermes.cost.label`, `hermes.billing.mode` and `hermes.provider.raw` explain why a subscription-included session still shows a catalog cost.

### Fixed

- **The conversation no longer loses tool calls, tool results and assistant text.** Hermes's Codex/Responses path sends Responses API *items*, where `function_call`, `function_call_output` and `reasoning` carry no `role` key at all — so they were dropped — and assistant text arrives as an `output_text` block, which fell through to a JSON dump and rendered as a raw blob. The normalizer now dispatches per item on the item's own shape across all three dialects (Responses, Chat Completions, Anthropic), never emits a part type outside Latitude's vocabulary, groups a reasoning/text/tool-call run into one assistant turn, and never exports a reasoning item's `encrypted_content`. Unrecognised items are counted in `hermes.unknown_items` instead of shipping silent garbage.
- **System instructions are exported.** The resolved system prompt comes from the `pre_api_request` kwarg, which is the only place it exists for the Codex/Responses and Anthropic dialects.
- **Failed tool calls are reported as failures.** The handler read a non-existent `is_error` field, so every failed tool call recorded as a success. It now reads Hermes's `status` / `error_type` / `error_message`, and takes the duration Hermes already measured.
- **An interrupted turn is no longer an error.** A turn the user cut short closes as cancelled with `hermes.turn.outcome=interrupted`, not `error.type=abandoned`.
- **`gen_ai.response.model`** now carries the model that answered, not the model that was requested.
- **A call whose usage never arrives** is marked `hermes.usage.state=unreported` and counted on the root, so a token-less call reads as unknown rather than free.
- **A background review is identified by its thread name**, not by thread identity. Hermes runs every turn on its own worker thread, so treating the first thread as the main loop labelled ordinary user turns `background` and mis-attributed their tokens — which in turn produced a phantom auxiliary span for the main loop.
- **A subagent no longer overwrites its session's identity.** A delegated child reports `platform="subagent"` and its own session id; building a tag/metadata context from those polluted the parent session's rollups, which are argMax'd over every span, so the session read as a subagent's. The child now inherits the parent's session context and keeps its own id in `hermes.subagent.session_id`.
- **A subagent's auxiliary calls now reach the session.** A delegated child records its usage in Hermes's ledger under its own session id and never gets a session finalize, so its auxiliary rows reached nothing; the parent now reconciles the children it spawned at its own teardown, into the session their spans already belong to.
- **The route now reaches metadata.** `hermes.api_mode`, `hermes.provider` and `hermes.base_url` were absent from every span: a turn is framed by `pre_llm_call`, whose payload carries no route, and the run's metadata was built once at that point.
- **`hermes.parent_session_id`** is omitted when it equals the session's own id, which is what Hermes passes on several paths.
- **`service.instance.id`** is set on the interaction root, not just its children.
- Dropped a dead `completion_tokens` mapping that could overwrite `gen_ai.usage.output_tokens`.

### Changed

- **Export path.** One daemon exporter drains a bounded queue instead of spawning a thread per payload: spans ship as they close, coalesce into requests under a 4 MiB ceiling (the ingest cap is 32 MiB with no gzip decode), and retry on `429`/`503`/`5xx`/network errors with jittered backoff honouring `Retry-After`. Previously a large turn built one unbounded payload with no retry, and a run evicted at the liveness bound was silently dropped — it is now finalized and shipped. Every span id is shipped exactly once, because Latitude's trace and session rollups are additive per insert; the consequence is that the `interaction` root, whose aggregates are only known at turn end, is always the last span of its turn.
- **Flush budgets follow the hook's meaning**: 2 s at `on_session_end` (a per-turn event on the user's critical path, previously 10 s), 10 s at `on_session_finalize`, plus an `atexit` safety net. Encoding, redaction and serialization all moved to the exporter thread, so a turn pays for none of it.
- Tool and memory spans are exported as OTLP `kind: 3` (CLIENT), matching the claude-code emitter and the OTEL memory convention.
- A per-attribute content budget (`LATITUDE_HERMES_MAX_CONTENT_CHARS`, default 256 KiB) truncates an oversized conversation from the middle with the omission marked in the exported messages, so a pathological turn cannot produce an unshippable span.
- Config is re-read at session start, so a credential added to `~/.hermes/.env` after the process started takes effect on the next session instead of never.

## [0.1.2]

### Fixed

- Stop exporting empty conversation placeholders. Blank or whitespace-only user/assistant turns no longer become `{ type: "text", content: "" }` parts that render as empty bubbles in Latitude. Tool-only assistant turns still export as `tool_call` parts. Content-list `tool_use` blocks now count toward keeping the interaction open so following `tool_execution` spans are not dropped. The interaction root only attaches `user_prompt` / `gen_ai.input.messages` when the current turn has real user text (blank trailing user turns are omitted, not backfilled from an earlier prompt).

## [0.1.1]

### Fixed

- Flush telemetry on session end so short/one-shot runs (`hermes -z "…"`) no longer drop their trace. The plugin now registers `on_session_end` and `on_session_finalize`, ships the ending session's still-open run, and joins the export threads so the HTTP delivery completes before the process exits. Finalization is scoped to the ending session, so a gateway teardown of one session never disturbs runs still live in a concurrent session. Previously the background export thread was killed at interpreter exit before the request finished; only long-lived interactive sessions emitted.

### Changed

- Split the `pre_api_request`/`post_api_request` callbacks from `pre_llm_call`/`post_llm_call`. They fire at different times with different payloads, so binding one callback to both created duplicate/mislabeled spans. The `*_api_request` pair is now the LLM-call span boundary (request/response/usage/provider/model/api_request_id); the `*_llm_call` pair frames the turn. The exported OTLP span shape is unchanged.

## [0.1.0]

### Added

- Initial release of `latitude-telemetry-hermes`, a Hermes Agent plugin that streams sessions to Latitude as OTLP traces.
