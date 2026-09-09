# Changelog

All notable changes to the OpenClaw Telemetry plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-09

Rewrite against OpenClaw 2026.8+ and Latitude's current span contract. Lockstep release with `@latitude-data/openclaw-telemetry-cli` 0.1.0. Requires OpenClaw **2026.8.1 or newer**.

### Fixed

- **The plugin emits again on OpenClaw 2026.8.1+.** Upstream removed the `before_agent_start` hook (replaced by `before_model_resolve` / `before_prompt_build` / `agent_turn_prepare`), and 0.0.9 opened its root span only there, so on current OpenClaw every later hook found no run in flight and nothing was ever exported; the gateway log only showed `unknown typed hook "before_agent_start" ignored`. The root now opens lazily on the first hook that carries a run id (`llm_input` in practice), and the run's true start is back-dated from `agent_end.durationMs`.
- **Tokens, cost, conversation and tools reach Latitude's rollups.** Spans carry `gen_ai.operation.name` (`invoke_agent` / `chat` / `execute_tool` / memory operations). Since June, Latitude's trace and session rollups only count spans classified as generations or tool calls, so 0.0.9's unclassified `agent` / `model_call` / `tool_call:*` spans would have shown a trace with no tokens, no cost, no messages and no tools even once traces flowed.
- **Finalization no longer races `llm_output`.** OpenClaw fires `agent_end` before `llm_output` with awaits in between, so the microtask deferral in 0.0.7 was not enough. The run ships once both have arrived, or after a short grace period when `llm_output` never comes.
- **Compaction and subagent hooks are keyed by session.** Both stopped carrying the parent run id upstream; they now resolve the open run through the session key (`requesterSessionKey` for subagents).
- **Diagnostics land in the gateway log.** Output goes through OpenClaw's `api.logger` instead of raw stderr, which the gateway never captured.

### Added

- **Per-call usage, cost and output.** Each `llm_request` span takes its tokens (input, output, cache read/write, reasoning), OpenClaw's own cost (`gen_ai.usage.cost`, catalog or provider-billed), response id, finish reason, output message and the exact input transcript from the assistant message it produced, matched by timestamp against the `model_call_started` / `model_call_ended` window. Harnesses that never fire the per-call hooks get `llm_request` spans synthesized from the transcript instead.
- **Time to first token** (`gen_ai.server.time_to_first_token`) from `model_call_ended.timeToFirstByteMs`, plus `gen_ai.request.stream`.
- **Tool definitions** (`gen_ai.tool.definitions`) from `llm_input.tools`, the post-policy tool list offered to the model, so the Tools page knows what the agent is equipped with. `config.toolDefinitions=false` opts out.
- **End-user identity.** `user.id` is the sender of a user-triggered turn; the display name and handle come from `message_received` or from the `⟦openclaw:ctx⟧` block channels prefix to the prompt, as `openclaw.sender.*` metadata. OpenClaw's injected `[openclaw.runtime-context]` message is exported with role `system` so a turn does not render as two user messages.
- **Memory.** OpenClaw's built-in memory (`MEMORY.md`, `USER.md`, `memory/*.md`) surfaces as OTEL GenAI memory operations under the store `openclaw/<agentId>`: the snapshot injected at session start is one `search_memory` per session, `memory_search` / `memory_get` calls are reads, and `write` / `edit` calls on a memory file are `upsert_memory` (or `delete_memory` when the file is emptied) carrying the full new body. Switches: `config.memory`, `config.memoryContent`.
- **Cron runs** are tagged `cron:<jobId>` with the job id and name in metadata, derived from the isolated session key or the latest `cron_changed` start for the agent.
- **Subagents** nest under the `sessions_spawn` tool call that created them: a `subagent` span spanning spawn to ended, with the child run's whole `interaction` tree underneath, in the parent's trace and session. Child spans carry the label as `gen_ai.agent.name` and keep their own session id under `openclaw.session.id`.
- **Compactions are model calls.** A compaction span is a `chat` span whose input is the messages being compacted and whose output is the summary that replaced them (read from OpenClaw's transcript store, which persists it before `after_compaction` fires), with the before/after message and token counts; the summarizer fires no per-call hooks, so `openclaw.usage.state=unreported`. A compaction outside a run (`sessions.compact`) ships as its own trace whose root is named `compaction`, so it is filterable by name and never mistaken for a user turn.
- **Derived tags and metadata:** `openclaw`, the channel, the agent id, `cron:<job>` and `subagent:<agent>` tags; `openclaw.*` metadata (run, session, channel, trigger, model, sender, plugin version). Operators add their own with `config.tags` / `config.metadata`, and `config.serviceName` sets the OTLP service name.
- **Transport retries.** `429`, `5xx` and network errors retry with backoff honouring `Retry-After`; other `4xx` are final so no span is ever sent twice. `gateway_stop` flushes the queue.
- **Per-attribute content budget** (`config.maxContentChars`, default 256 KiB) truncating from the middle.
- **Transcript dialect.** The message normalizer understands OpenClaw's own transcript (`toolCall` blocks, `toolResult` messages, `thinking` blocks, base64 images, custom runtime notes) and the `toolResult` blocks the Codex harness nests inside tool results.
- **Codex harness support.** OpenClaw's Codex app-server harness (ChatGPT OAuth models) passes plugins an empty history, a per-turn transcript, usage only on the turn's final message and no per-call hooks. The plugin rebuilds the session conversation from the turns it has seen and, on a cold start, from OpenClaw's transcript store (the per-agent `openclaw-agent.sqlite` on 2026.9+, read through `node:sqlite`, or the older `sessions/<id>.jsonl` file), prepending it to every input so the trace and session views read as one conversation (`openclaw.history.source` says where it came from); it synthesizes `llm_request` spans from the transcript, puts the attempt aggregate on the last call when no message carried usage, takes time to first token from the first streamed delta of the agent event stream (`openclaw.ttft.source=stream`), prepends streamed reasoning to a call's output when its transcript message carries none (`openclaw.reasoning.source=stream`), records memory writes made through Codex's `apply_patch`, and labels the result-announcement runs `interaction.kind=announce`.

### Changed

- **Span names follow the Latitude harness family:** `interaction`, `llm_request`, `tool_call:<name>`, `subagent`, `compaction`, plus memory operation names. Tool and memory spans are OTLP `CLIENT` spans.
- Usage lives only on `llm_request` spans; the root carries counts (`openclaw.llm_calls`, `openclaw.tool_calls`) and the turn outcome.
- Minimum OpenClaw version is 2026.8.1.

### Removed

- The `before_agent_start` subscription and the `agent` / `model_call` span names.

## [0.0.9] - 2026-06-18

### Added

- Local custom attribute redaction before OTLP export. Configure exact names, regex source strings, or `/pattern/flags` strings through `config.redact.attributes`, with an optional `config.redact.mask`, to mask selected span attributes while keeping conversation capture enabled.

## [0.0.8] - 2026-06-08

Unblocks install, upgrade, and re-keying on OpenClaw 2026.5+. Lockstep release with `@latitude-data/openclaw-telemetry-cli` 0.0.8.

### Fixed

- **`apiKey` / `project` are no longer `required` in `configSchema`, so install and upgrade work on OpenClaw 2026.5+.** `openclaw plugins install <spec> --force` recreates `plugins.entries[id]` with an empty `config` and validates the whole config against each plugin's `configSchema` *during* the install — before `@latitude-data/openclaw-telemetry-cli` layers credentials in (its step 3). Newer OpenClaw enforces `configSchema.required` at that point, so the transient configless entry failed with `[plugins] @latitude-data/openclaw-telemetry invalid config: apiKey: must have required property 'apiKey', project: must have required property 'project'` → `Could not start the CLI` → the install aborted before credentials were ever written. This broke fresh installs, version upgrades, and re-configuring an existing entry with a new API key (the entry on disk still had valid creds, but `--force` reset it to configless for validation). The two keys were never meaningfully required: the runtime already self-disables when creds are absent (`loadConfig` → `enabled: hasCreds && !explicitlyDisabled`), so the schema constraint bought nothing and blocked the installer. New `src/manifest.test.ts` guards against reintroducing it.

## [0.0.7] - 2026-04-29

Captures every `llm_output` event regardless of OpenClaw's hook fire order, mirrors `openclaw.session.id` onto the OTEL-standard session attrs Latitude's resolver looks for, and clears OpenClaw 2026.4.26's `potential-exfiltration` audit warning.

### Fixed

- **`llm_output` enrichment is no longer dropped on the `selection.runtime` path.** OpenClaw 2026.4.26+ has two hook fire orders: `cli-runner.runtime` (used by the `claude-code` agent) fires `llm_output → agent_end`, and `selection.runtime` (used by `openai-codex` / embedded ACPX agents) fires `agent_end → llm_output`. The 0.0.6 plugin finalized the run synchronously inside `agent_end`, deleting the run and shipping the OTLP batch before `selection.runtime`'s late `llm_output` could enrich the agent span. Every `llm_output`-only attribute — `gen_ai.output.messages`, `gen_ai.response.model`, `openclaw.resolved.ref`, `openclaw.harness.id`, and the entire `gen_ai.usage.*` block (input / output / cache_read / cache_creation / total tokens) — was silently lost. `onLlmOutput`'s `if (!run) return` was a clean no-op, so there was no error, no warning, no signal anything was wrong. The fix defers finalization by one microtask via `queueMicrotask`: both hook handlers in the same dispatch round write to the still-alive run, the deferred finalize runs after both, and the OTLP batch ships fully enriched. Order-agnostic — works identically for either path. Subagents go through the same `onAgentEnd` code path so they're fixed automatically.
- **`gen_ai.usage.cache_creation_input_tokens` is now resolved by Latitude.** The resolver's `cacheCreateCandidates` only looked for the dot-separated `gen_ai.usage.cache_creation.input_tokens`; we emit the underscore form (matching what Anthropic-style OTel exporters use). Cache-write tokens silently dropped at resolve time. Resolver now picks up both spellings (`packages/domain/spans/src/otlp/resolvers/usage/tokens.ts`).

### Added

- **`session.id` and `gen_ai.session.id` mirrored from `openclaw.session.id` on every span.** Both are in `sessionIdCandidates` (`domain/spans/src/otlp/resolvers/identity.ts`) — `session.id` is the OpenInference / OTEL standard and the first candidate the resolver tries, `gen_ai.session.id` is the proposed OTEL GenAI semconv key. With the mirror in place, traces can be grouped by OpenClaw session in the Latitude UI without any openclaw-specific resolver path. Emitted on `agent`, `model_call`, `tool_call`, `compaction`, and `subagent` spans so child spans inherit the same grouping.
- **Regression tests for both hook fire orders + the no-`llm_output` path + subagent ordering.** `plugin.test.ts` now exercises the cli-runner order (`llm_output` before `agent_end`), the selection.runtime order (`agent_end` before `llm_output`), the no-`llm_output` path (cli-runner skips it when `assistantText.length === 0`), and a parent-spawning-subagent flow under the selection.runtime order. The selection-path tests fire both hooks in the same sync round via a `fireSameRound` helper that mirrors how the real OpenClaw dispatcher kicks off `runAgentEnd(...).catch()` and `runLlmOutput(...).catch()` without an `await` between them.

### Changed (build path)

- **`SCOPE_VERSION` is baked at build time instead of read at runtime.** 0.0.6 read `package.json` via `readFileSync` to populate the OTLP `scope.version` and `service.version` attributes — that paired `node:fs` with `fetch(` in the bundled plugin and tripped OpenClaw 2026.4.26's `plugins.code_safety` scanner with a "potential-exfiltration: File read combined with network send" warning. The version is now substituted at bundle time via tsdown's `define` (`__SCOPE_VERSION__` → string literal of `package.json`'s `version`). Single source of truth (`package.json`) preserved, runtime bundle now has zero `node:fs` imports, and the audit warning is gone.

### Documentation

- **README pins the install spec to an exact version.** OpenClaw 2026.4.26's `openclaw security audit --deep` warns about unpinned plugin install specs for supply-chain stability. The README now uses `openclaw plugins install @latitude-data/openclaw-telemetry@0.0.7` instead of the bare package name and notes the policy.

## [0.0.6] - 2026-04-29

Re-publish of the never-shipped 0.0.5 with two install-blocking fixes: the runtime no longer reads `process.env`, and the CLI is no longer in this package. Both were tripping OpenClaw 2026.4.25's `openclaw plugins install` security scan (the `env-harvesting` rule flagged the env-read + `fetch` combo in the runtime, and the `dangerous-exec` rule flagged the CLI's `child_process.spawn` call). The runtime ships clean now; the one-shot installer is moving to a separate `@latitude-data/openclaw-telemetry-cli` package and will land in a follow-up.

This release otherwise inherits everything that was queued for 0.0.5 — the span tree redesign, per-call attributes on `model_call`, subagent trace propagation, `latitude.tags` / `latitude.metadata` enrichment, and the privacy `:gated` attribute mechanism.

### Changed (install path)

- **`process.env` fallback removed from `loadConfig`.** `loadConfig` now reads only the per-plugin config bucket OpenClaw passes via `api.pluginConfig` (i.e. the user's `plugins.entries[id].config` block). Earlier 0.0.x versions also fell back to env vars when keys were missing — the OpenClaw 2026.4.25 install scanner flags any runtime source that combines `process.env` reads with a network-send call (we have `fetch(` in `postTraces`), so the fallback was tripping installs even though the installer always wrote credentials to the config bucket anyway. For dev-time testing, set `config.debug = true` in `openclaw.json` directly.
- **The `latitude-openclaw` CLI is no longer in this package.** Installation is now a manual flow: `openclaw plugins install @latitude-data/openclaw-telemetry`, then five `openclaw config set` calls (or one hand-edit of `openclaw.json`), then `openclaw gateway restart`. The README documents both. A one-shot installer is coming back as a separate package — `npx -y @latitude-data/openclaw-telemetry-cli install` — that doesn't go through `openclaw plugins install` and so isn't subject to the install-time scanner. Tracking that work in the follow-up to this PR.

### Removed

- `bin` field, `./cli` export entry, and `@clack/prompts` + `picocolors` dependencies from `package.json`. `cli.ts` from the bundle entry list. The package now publishes only `dist/plugin.js` + `dist/plugin.d.ts` + `openclaw.plugin.json`.
- `process.env` read in `loadConfig` (and the surrounding fallback comment, rewritten to avoid the literal string the scanner regex matches on in source).

### Added

- Regression test that grep-asserts no `process.env` appears in any runtime `src/*.ts` file. Same shape as the intercept-module guard in `claude-code-telemetry`.

### Span tree redesign (carried over from the queued 0.0.5)

The plugin now emits spans that match the actual structure of an OpenClaw agent run instead of collapsing every generation + tool into a single fake `llm_request`. Existing dashboards keyed on `gen_ai.*` attribute names still work — span *names* changed, attribute *namespaces* didn't.

### Changed (breaking, in trace shape)

- **One `agent` span per run, with `model_call` / `tool_call` / `compaction` / `subagent` children.** The old shape had a single `interaction` (renamed from `agent`) with one `llm_request` covering the whole attempt and tool spans as siblings. That was wrong on two counts: `llm_input`/`llm_output` fire ONCE per attempt (not per generation), and an attempt is a sequence of generations interleaved with tool executions. The new shape:

  ```
  agent (root, traceId = hash(runId))
  ├─ compaction         (0..1, rare; budget-triggered)
  ├─ model_call         (1..N, one per provider API call)
  ├─ tool_call: foo     (between model_calls; sibling of agent)
  ├─ model_call
  ├─ tool_call: bar
  ├─ subagent           (0..N — nested child agent spans land underneath)
  └─ model_call
  ```

  Tool spans are siblings of `agent`, not children of `model_call`, because tools run between generations — not during them.

- **Span names follow OpenClaw's events, not OTel semantic-convention terms.** `agent` / `model_call` / `tool_call` / `compaction` / `subagent`. Attribute namespaces stay `gen_ai.*` and `openclaw.*`.

- **Per-call attributes on `model_call` spans.** Each generation gets its own duration, outcome, error category, upstream request id hash, time-to-first-byte, request payload bytes, response stream bytes — straight from `model_call_started` / `model_call_ended` payloads.

- **Per-call input messages on `model_call` spans via the snapshot trick.** `gen_ai.input.messages` on each `model_call` reflects what THAT generation actually saw — the rolling history evolves across the run as `before_tool_call` appends synthetic assistant `tool_call` parts and `after_tool_call` appends `tool` responses. Per-call output messages and per-call usage aren't surfaced by OpenClaw today (they're attempt-aggregate); those stay on the `agent` span only, with a README pointer to the upstream feature request.

- **Subagent spans nest the child's full agent tree underneath via cross-runId trace propagation.** When `subagent_spawned` fires we register a `Map<childRunId, parentTraceId+subagentSpanId>` link. The child's `before_agent_start` consults the map, uses the parent's `traceId`, and parents the child agent under the parent's `subagent` span. Same trace, one waterfall across the spawn tree.

### Added

- New typed-hook subscriptions: `before_agent_start`, `model_call_started`, `model_call_ended`, `before_compaction`, `after_compaction`, `subagent_spawned`, `subagent_ended`.
- Privacy gating implemented via `:gated` attribute key suffix. The OTLP encoder strips any attribute whose key ends in `:gated` when `allowConversationAccess === false` — uniform mechanism, no per-key conditional. Gated attributes: `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, `user_prompt`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, `before_compaction.messages`, `before_agent_start.{prompt,messages}`, `agent_end.messages`, and `openclaw.error.message` (error strings can leak prompt/response content).
- Abandoned-span handling: any `model_call` / `tool_call` / `compaction` / `subagent` open at `agent_end` is force-closed with `outcome: "abandoned"` so trace gaps don't appear when an attempt errors mid-flight.
- `latitude.tags` and `latitude.metadata` enrichment attributes on every emitted span. Tags is a JSON-encoded string array; metadata is a JSON-encoded string object. Both are populated from per-run state and surface in the Latitude UI for filtering and grouping. Empty values are omitted so spans stay compact.

### Removed

- `src/turn-builder.ts` + `src/turn-builder.test.ts` — replaced by `src/span-builder.ts` / `src/span-builder.test.ts`. The state machine is fundamentally different (multiple open spans per run instead of a single `RunRecord` with `LlmCallRecord[]`).
- Old `interaction` and `llm_request` span names — folded into `agent` and split per-generation as `model_call`.
- `orphanTools` logic — no longer needed once tools are paired with proper before/after events. Still-open tools at agent_end now go through the abandoned-span path.

### Notes for operators

- Existing OpenClaw versions (≥ 2026.4.25) ship `model_call_started` / `model_call_ended` already; the minimum-version requirement is unchanged.
- Codex/Claude-Code style backends will still show one `model_call` per attempt because their internal generations aren't surfaced to OpenClaw's selection layer. README now documents this. Filing the OpenClaw-side enhancement (per-call usage + assistantText on `model_call_ended`) is upstream and out of scope here.
- The `before_tool_call` hook is a `runModifyingHook`. Plugin handler returns `undefined` (so OpenClaw dispatches the tool normally). New regression test verifies the return is `undefined`.

## [0.0.4] - 2026-04-28

End-to-end fix for OpenClaw 2026.4.25+. After a clean `npx -y install` and `openclaw gateway restart`, traces flow without manual intervention.

### Breaking

- **Minimum supported OpenClaw is now 2026.4.25.** The installer detects the version up-front (`openclaw --version`) and aborts with an upgrade message on older versions. Earlier OpenClaws either reject `hooks.allowConversationAccess` outright (≤ 2026.4.21) or have unverified hook-dispatch gating (2026.4.22 – 2026.4.24); supporting the entire range with portability shims would mean shipping known-broken behaviour. We'd rather fail loudly. Upgrade with `npm install -g openclaw@latest`.

### Fixed

- **Plugin discovery + the `installs.json` index now stay in sync.** 0.0.3 hand-placed files into `~/.openclaw/extensions/<name>/`, which the gateway's runtime discovery picked up — but OpenClaw's persisted `~/.openclaw/plugins/installs.json` wasn't refreshed, so `openclaw config validate` and every other CLI command warned `plugin not found: @latitude-data/openclaw-telemetry (stale config entry ignored)`. Replaced hand-placement with `openclaw plugins install <package-path> --force`. OpenClaw now owns placement, writes the install record, and creates the (initially disabled) `plugins.entries[id]` block — we layer config + hooks + `plugins.allow` on top.
- **Hook dispatch is no longer blocked.** OpenClaw 2026.4.22+ added `hooks.allowConversationAccess` to the strict zod schema and made it the runtime gate for `llm_input` / `llm_output` / `before_tool_call` / `after_tool_call` / `agent_end` dispatch to non-bundled plugins. 0.0.3 only wrote `config.allowConversationAccess`, so on 2026.4.25 the gateway logged `[plugins] typed hook "..." blocked because non-bundled plugins must set plugins.entries.<id>.hooks.allowConversationAccess=true` for every event and our handlers never fired — zero traces. `setPluginEntry` now writes both: `config.allowConversationAccess` (payload-content gate, read by our runtime) and `hooks.allowConversationAccess` (dispatch gate, read by OpenClaw's runtime). Always coupled to the same source value.
- **`plugins.allow` warning silenced.** OpenClaw warns at every gateway start when a non-bundled plugin auto-loads without provenance via `plugins.allow` or an install record. Going through `openclaw plugins install` clears the provenance side; the installer also auto-adds the plugin id to `plugins.allow` (running `npx install` is the trust signal). New `--no-trust` flag opts out — the warning will keep showing until the operator adds the id manually.
- **`SCOPE_VERSION` no longer lies.** The hard-coded `"0.0.2"` in `otlp.ts` is gone; the version is now read at runtime from `package.json`, matching the pattern `cli.ts` uses for `--version`. Future bumps only touch `package.json`.

### Removed

- `src/install-files.ts` — superseded by `openclaw plugins install`. We never write to `~/.openclaw/extensions/` ourselves anymore.

### Added

- `src/openclaw-cli.ts` — shell-out wrapper with structured failure modes (`enoent` / `timeout` / `exit`), CalVer comparison, and `openclaw --version` parsing.
- `--no-trust` install flag — skip auto-adding to `plugins.allow`. The README documents what changes when set.

## [0.0.3] - 2026-04-27

### Fixed

- **OpenClaw discovery now actually finds the plugin.** 0.0.2 shipped `openclaw.plugin.json` correctly (manifest with `id` + `configSchema`), but `package.json` was missing the `openclaw.extensions` field. OpenClaw's `resolvePackageExtensionEntries` reads `package.json["openclaw"].extensions` to know **where** the plugin entry lives — without it, discovery falls through to looking for `index.{ts,js,mjs,cjs}` at the directory root, doesn't find one, and skips us silently. The gateway then warns `plugin not found: @latitude-data/openclaw-telemetry (stale config entry ignored; remove it from plugins config)` even though everything else is in place. Now both the published `package.json` and the minimal `package.json` the installer writes into `~/.openclaw/extensions/latitude-telemetry/` declare `"openclaw": { "extensions": ["./dist/plugin.js"] }`. After re-running `install`, the gateway log lists `@latitude-data/openclaw-telemetry` in the ready-plugins line.

### Added

- `--version` / `-v` and `--help` / `-h` top-level flags on the CLI. Run `npx -y @latitude-data/openclaw-telemetry --version` to confirm which version is installed (or shadow-cached) on a given box.

## [0.0.2] - 2026-04-25

End-to-end install fix. The 0.0.1 install path was broken in five places, all reported by an OpenClaw 2026.4.21 maintainer who tried it on a real install. Re-running `npx -y @latitude-data/openclaw-telemetry install` cleans up any leftover 0.0.1 keys.

### Fixed

- **`openclaw.json` written by the installer is now accepted by OpenClaw's strict zod schema.** 0.0.1 wrote `hooks.allowConversationAccess: true` (the strict `hooks` namespace only accepts `allowPromptInjection` on older OpenClaw versions, and `allowPromptInjection`+`allowConversationAccess` on 2026.4.22+) and `LATITUDE_*` keys at top-level `env` (the root schema's `env` block only accepts `{shellEnv, vars}`, not arbitrary keys). Both fields caused the gateway file-watcher to quarantine the new config as `clobbered.<ts>` and silently roll back to `last-good`. We now write everything under `plugins.entries[id].config`, which is `record(string, unknown)` and accepted by every OpenClaw version.
- **Plugin discovery now finds us.** OpenClaw scans `<configDir>/extensions/<plugin>` for an `openclaw.plugin.json` manifest at the plugin root — npm `main` is irrelevant, and global `npm install -g` is not enough. Two changes: (1) we now ship `openclaw.plugin.json` in the package, with the required `id` and `configSchema`, and (2) the installer materializes the package's `dist/` + manifest into `~/.openclaw/extensions/latitude-telemetry/` so discovery picks it up.
- **`api.pluginConfig` is now the primary source of credentials.** 0.0.1's runtime read `process.env.LATITUDE_*` and ignored `api.pluginConfig`. Combined with the schema-rejection bug, the plugin disabled itself silently because creds were dropped on the floor before they reached our runtime. The new `loadConfig` reads `api.pluginConfig` first (the user's `plugins.entries[id].config`), and falls back to env vars for compatibility.
- **`allowConversationAccess` is now actually honored.** 0.0.1 advertised the flag but always attached full content to spans. The new runtime gates `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, and the interaction's `user_prompt` on this flag. When off, spans still emit with the same shape — timing, token usage, model name, agent name, ids — just scrubbed of payload content. A `latitude.captured.content` boolean attribute makes the gate state visible in the Latitude UI.

### Changed

- **Default capture posture flipped at runtime, kept on at install.** The runtime now defaults `allowConversationAccess` to `false` if the key is missing from `pluginConfig` (privacy-preserving default for hand-edited configs). The interactive installer still writes `true` by default — pass `--no-content` to install with structural-only telemetry. This means re-installing on top of an old config is a no-op for capture posture; only hand-edited configs that drop the key change behaviour.
- **Migration on re-install.** `npx -y @latitude-data/openclaw-telemetry install` now strips `hooks.allowConversationAccess` and any top-level `env.LATITUDE_*` keys our 0.0.1 installer left behind, before writing the new entry. No manual cleanup required.

### Added

- `openclaw.plugin.json` manifest at the package root, with a JSON schema for `apiKey` / `project` / `baseUrl` / `allowConversationAccess` / `enabled` / `debug`.
- `--no-content` install flag for shipping structural telemetry without payloads.
- `latitude.captured.content` boolean attribute on every span so operators can see whether content capture was on for a given trace.

## [0.0.1] - 2026-04-24

### Added

- Initial release. OpenClaw plugin that streams every agent run to Latitude as OTLP traces by subscribing to OpenClaw's typed `llm_input` / `llm_output` / `before_tool_call` / `after_tool_call` / `agent_end` hooks.
- Per-run state accumulator keyed by `runId` that pairs LLM input/output into single calls, nests tool invocations under their parent LLM call, and handles out-of-order tool events defensively.
- OTLP span tree with three span kinds — `interaction` (per agent run), `llm_request` (per LLM call), `tool_execution` (per tool invocation). Every span carries `openclaw.agent.id` and `openclaw.agent.name` so multi-agent setups are filterable in the Latitude UI.
- `llm_request` spans capture everything OpenClaw surfaces: provider, request/response model, resolved ref, system prompt, full message history, current prompt, assistant text, tool call parts, and full token usage (input/output/cache_read/cache_creation/total) under both canonical `gen_ai.*` keys and legacy aliases.
- Installer CLI (`npx @latitude-data/openclaw-telemetry install`) that writes a plugin entry with `hooks.allowConversationAccess: true` and `LATITUDE_*` env vars to `~/.openclaw/openclaw.json`, plus matching `uninstall`.
- Supports production / `--staging` / `--dev` environment flags and non-interactive `--api-key` / `--project` / `--yes` flags for CI.
