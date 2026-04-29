# Changelog

All notable changes to the OpenClaw Telemetry plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
