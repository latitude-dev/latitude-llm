# OpenClaw telemetry

`packages/telemetry/openclaw` (npm: `@latitude-data/openclaw-telemetry`) is an [OpenClaw](https://github.com/openclaw/openclaw) plugin that streams agent runs to Latitude as OTLP/HTTP JSON, and `packages/telemetry/openclaw-cli` (npm: `@latitude-data/openclaw-telemetry-cli`) is its one-shot installer. They are the OpenClaw counterpart to `packages/telemetry/{hermes,claude-code,pi}`.

Sibling docs: [`hermes-telemetry.md`](hermes-telemetry.md), [`pi-telemetry.md`](pi-telemetry.md), [`claude-code-telemetry.md`](claude-code-telemetry.md), [`spans.md`](spans.md) (attribute resolution, trace/session conversation assembly), [`memory-observability`](../specs/memory-observability.md) (the `gen_ai.memory.*` contract). Public page: [`docs/telemetry/openclaw.md`](../docs/telemetry/openclaw.md).

## Two packages, one plugin

The runtime is loaded by OpenClaw's gateway from `~/.openclaw/npm/projects/<hash>/node_modules/@latitude-data/openclaw-telemetry`; OpenClaw discovers it through `package.json`'s `openclaw.extensions` and the `openclaw.plugin.json` manifest. The installer is a separate npm package because it spawns `openclaw` (a `dangerous-exec` pattern for OpenClaw's plugin scanner) and because it must run before the plugin exists. The two are released in lockstep: `RUNTIME_VERSION` in `openclaw-cli/src/setup.ts` pins the exact runtime the CLI installs, and both `CHANGELOG.md`s move together.

Install facts that keep biting:

- **Capability consent.** Since OpenClaw 2026.8 every non-bundled plugin needs `openclaw plugins install <spec> --accept-capabilities` (or `plugins enable --accept-capabilities`); without it the install aborts with `requires capability consent`. The CLI passes the flag; running it is the consent.
- **Two `allowConversationAccess` flags.** `plugins.entries[id].hooks.allowConversationAccess` is OpenClaw's registration gate for the conversation hooks (`llm_input`, `llm_output`, `agent_end`, `before_agent_run`, ...): a non-bundled plugin without it never gets those hooks registered (`registry-registrars-tools-hooks.ts`), so no traces. `plugins.entries[id].config.allowConversationAccess` is the plugin's own content gate. The CLI writes both from one value.
- **No environment fallback in the runtime.** Credentials come only from `api.pluginConfig`; a runtime that combined `process.env` reads with `fetch` used to trip the install scanner, and there is no reason to reintroduce it (`config.test.ts` grep-asserts it).
- **Local builds** install with `openclaw plugins install npm-pack:<path.tgz> --accept-capabilities --force`, which reproduces the registry install shape. The CLI's `--runtime-spec` does the same through the installer.
- **Diagnostics** must go through `api.logger`; raw stderr never reaches the gateway log file (`/tmp/openclaw/openclaw-<date>.log`), which is where operators look.

## Re-deriving the ground truth

OpenClaw moves fast and its hook set changes between monthly releases (the whole 0.0.x line died silently when `before_agent_start` was removed in 2026.8.1). Read the source, not the docs:

```bash
cd /tmp && rm -rf openclaw-src && mkdir openclaw-src && cd openclaw-src
gh api repos/openclaw/openclaw/tarball/main > main.tar.gz && tar xzf main.tar.gz
```

| Question | File |
| --- | --- |
| Which typed hooks exist and their payloads | `src/plugins/hook-types.ts` (`PluginHookName`, `PluginHookHandlerMap`) |
| The agent hook context | `src/plugins/hook-types.ts` (`PluginHookAgentContext`), built in `src/plugins/hook-agent-context.ts` |
| Fire order and awaiting | `src/plugins/hooks.ts` (`runVoidHook` / `runModifyingHook`), `src/agents/embedded-agent-runner/run/attempt-settle.ts` |
| `llm_input` payload | `src/agents/embedded-agent-runner/run/attempt-prompt-support.ts` |
| `agent_end` payload (the transcript) | `src/agents/embedded-agent-runner/run/attempt-finalize.ts` |
| Transcript message and usage types | `packages/llm-core/src/types.ts` (`AssistantMessage`, `Usage`, `ToolResultMessage`) |
| Tool hooks | `src/agents/agent-tools.before-tool-call.policy.ts`, `src/agents/embedded-agent-subscribe.handlers.tools.completion.ts` |
| Subagent hooks | `src/agents/subagents/spawn/subagent-spawn-lifecycle.ts`, `src/agents/subagents/registry/subagent-registry-completion.ts` |
| Compaction hooks | `src/agents/embedded-agent-subscribe.handlers.compaction.ts` |
| Cron hook | `src/cron/service/ops-run.ts` |
| Consent and registration gating | `src/plugins/capability-consent.ts`, `src/plugins/hook-policy-decisions.ts` |
| Memory tools | `extensions/memory-core/src/memory-tool-contract.ts` |
| The file tools' parameters | `src/agents/sessions/tools/{write,edit}.ts` |

## Hook contract

Everything the plugin knows arrives through `api.on(<hook>, handler)`. Handlers return `undefined` without exception: several of these are modifying hooks (`before_tool_call` can block a tool), and the plugin must never alter a run.

| Hook | What we take from it |
| --- | --- |
| `llm_input` | Opens the run. `runId`, `systemPrompt`, `prompt`, `historyMessages`, `tools` (the post-policy tool list), `imagesCount`; ctx carries `sessionKey`, `sessionId`, `agentId`, `workspaceDir`, `channel`, `channelId`, `trigger`, `senderId` |
| `model_call_started` / `model_call_ended` | One `llm_request` per provider call: timing, outcome, error category, `timeToFirstByteMs`, byte counts. Ctx is minimal (no agent id) |
| `before_tool_call` / `after_tool_call` | `tool_call:<name>` spans: params, result, error, duration. Memory classification happens on the `after` |
| `agent_end` | Closes the run: `success`, `error`, `durationMs` and `messages`, the **whole session transcript** including this run's assistant messages with per-call `usage` and `cost` |
| `llm_output` | Attempt aggregate `usage`, `resolvedRef`, `harnessId`, `reasoningEffort`. Fires **after** `agent_end` |
| `before_compaction` / `after_compaction` | Counts and the compacted messages. Ctx has only `sessionKey` |
| `subagent_spawned` / `subagent_ended` | The delegation graph. Ctx `runId` is the **child's**; `requesterSessionKey` names the parent session |
| `session_start` / `session_end` | Session rotation (`/new`, reset, compaction, idle): releases the memory-snapshot latch |
| `message_received` | Sender display name and handle (`metadata.senderName`, `senderUsername`), cached per session and sender id |
| `cron_changed` | `started` / `finished` with `jobId`, `job.name`, `sessionKey` |
| `gateway_stop` | Flush the export queue |

### Traps in the payloads

1. **No hook announces a run before `llm_input`.** `before_agent_start` is gone; `before_model_resolve` fires earlier but its ctx carries no run id. The root therefore opens lazily on the first event with a run id and its start is back-dated from `agent_end.durationMs`, which is measured from the prompt's arrival.
2. **`agent_end` precedes `llm_output`, with awaits between them** (`attempt-settle.ts`: `completeEmbeddedAttemptAfterTurn` is awaited before `completeEmbeddedAttemptResult`). A microtask deferral does not cover it. Finalization waits for both, or a 1.5 s grace when `llm_output` never comes (aborts, some harnesses).
3. **`agent_end.messages` is the whole transcript**, not the run's delta. This run's assistant messages are those with `timestamp >= runStart - 5 s`; each is one provider response and carries `usage` (with `reasoningTokens` spread in at runtime even though `llm-core`'s `Usage` type omits it), `cost`, `stopReason`, `responseId`, `responseModel`. They are matched to `llm_request` spans by timestamp window, then by order when the counts agree; a run with assistant messages but no `model_call_*` hooks (a harness that observes only at attempt level) gets `llm_request` spans synthesized from them.
4. **`senderId` is stripped unless `trigger === "user"`** (`hook-agent-context.ts`), so cron and heartbeat runs have no `user.id` by design.
5. **`jobId` is never on the embedded runner's ctx.** The cron job comes from the isolated session key (`agent:<agent>:cron:<jobId>[:run:<id>]`) or, for main-session jobs, the latest unfinished `cron_changed` `started` for that agent.
6. **`model_call_*` ctx has no agent id, channel or sender.** Every run merges ctx fields from every hook it sees (`mergeCtx`, first non-empty wins); tags and metadata are computed once at finalize.
7. **The child's first hook can precede `subagent_spawned`.** Span ids derive from the run id, not the trace id, so a child run is re-parented into the parent's trace whenever the link appears, including at finalize.
8. **`llm_input.tools` are pi-ai `Tool` objects** with an `execute` function and TypeBox symbol keys on `parameters`; a JSON round trip drops both.
9. **`allowConversationAccess` only gates the conversation hooks.** `model_call_*`, tool, session, message and cron hooks always dispatch, so a `hooks: false` misconfiguration produces tool spans with no root, which is the diagnostic signature to look for.

## The two harnesses

OpenClaw runs a turn on one of two runtimes, and the plugin sees very different things from each. `openclaw.harness.id` (from `llm_output`) and `openclaw.history.source` on the root say which one produced a trace.

| | Embedded runner (API-key providers, pi-ai) | Codex app-server harness (ChatGPT OAuth, `codex-native`) |
| --- | --- | --- |
| `llm_input.historyMessages` | the whole session | **empty** (`codexModelInputHistoryMessages` is `[]`; Codex owns the thread) |
| `agent_end.messages` | the whole session | **this turn only** (`buildCodexMessagesSnapshot`) |
| `model_call_started` / `_ended` | one per provider call, with TTFB | **never fired**; only trusted diagnostics |
| usage | per assistant message | on the turn's **final** message only; a turn ending in a tool call (`sessions_yield`) has none |
| tools | OpenClaw's (`exec`, `write`, `edit`, `sessions_spawn`) | Codex-native relayed through `before_tool_call` / `after_tool_call` (`bash` shows as `exec`, `apply_patch`, `view_image`, `collaborationspawn_agent`); some native completions never relay and close as abandoned |
| subagents | `subagent_spawned` / `subagent_ended` | Codex collaboration agents, invisible except for the `announce:codex-native:…` run that delivers their result |
| compaction | `before_compaction` / `after_compaction` | native; `sessions.compact` refuses with "already has an active writer" |

What the plugin does about the Codex gaps:

- **History** is rebuilt per session id: every finalized run appends its turn (`SessionHistoryStore`, 400 messages per session, 24 h idle TTL), and a session first seen after a gateway restart is read from OpenClaw's transcript store. Since 2026.9 that is the per-agent SQLite database `<stateDir>/agents/<agentId>/agent/openclaw-agent.sqlite` (`transcript_events` joined through `session_transcript_active_events` for the active branch; opened read-only through `node:sqlite`, loaded lazily so a host without it just has no cold-start history); older installs keep `<stateDir>/agents/<agentId>/sessions/<sessionId>.jsonl`. Both hold the same entry shape: the visible conversation is the parent chain of the last `message` entry, stopping at a `compaction` entry whose summary becomes the first message, and the already-persisted current prompt is dropped. The state dir comes from `api.runtime.state.resolveStateDir()` when the host exposes it, else from the default `<stateDir>/workspace` layout. The rebuilt history is prepended to the root's input and to every `llm_request` input, so Latitude's session conversation (built from the last completion) shows the whole session. When the harness supplies history the remembered copy is replaced by its transcript instead.
- **Calls** are synthesized from the transcript's assistant messages, each spanning from the previous message's timestamp to its own (`openclaw.call.source=transcript`). When no message carries usage, the `llm_output` aggregate lands on the last call (`openclaw.usage.scope=attempt`).
- **TTFT** comes from the agent event stream (`api.runtime.events.onAgentEvent`): the first `assistant` / `thinking` delta inside a call's window (`openclaw.ttft.source=stream`). The same stream's `lifecycle` start event opens the run at its true start time on both harnesses, and its `thinking` deltas become a `reasoning` part on the call whose transcript message has none (`openclaw.reasoning.source=stream`; the embedded runner always emits them, the Codex harness only when Codex returns reasoning summaries).
- **Memory writes** through `apply_patch` are parsed from the patch text (`*** Update File:` / `*** Add File:` / `*** Delete File:`) and read back from disk, one event per memory-scoped file.
- **Announce runs** (`runId` starting with `announce:`) carry `interaction.kind=announce`; the spawn tool that started the collaboration matches `/spawn/`.

The embedded runner is the surface that exercises everything (per-call spans, TTFB, `sessions_spawn` nesting, compaction spans); validate changes there as well as on Codex. **An API key does not by itself leave the Codex harness**: OpenClaw routes any `openai/*` model on the official Responses endpoint through Codex unless the provider or model carries `agentRuntime.id: "openclaw"` (`openclaw config set 'models.providers.openai.agentRuntime' '{"id":"openclaw"}'`). Read `openclaw.harness.id` on the root before trusting a trace's shape.

Two channel-envelope facts that apply to both harnesses:

- The prompt a channel hands the plugin is wrapped: a `⟦openclaw:ctx⟧` JSON block (chat id, sender id and name, timestamp), `System:` lines, then the user's text. `user_prompt` carries the whole envelope, since that is what the model saw; the sender's display name is parsed out of that block when `message_received` did not supply one.
- OpenClaw injects a `[openclaw.runtime-context]` user message right before the prompt (`runtimeContext` on the transcript message). It is instructions, not the user's words, so the normalizer emits it with role `system`; otherwise every turn shows two user bubbles.

## Trace shape

One trace per run, `traceId = sha256(runId)[0:32]`; OpenClaw's own diagnostic trace id is recorded as `openclaw.trace.id` metadata rather than adopted, so running the native exporter alongside never merges two accountings of the same call into one trace.

```
interaction                                span kind 1   gen_ai.operation.name=invoke_agent
├── search_memory                          kind 3        once per session (the injected snapshot)
├── llm_request                            kind 1        chat
├── tool_call:exec                         kind 3        execute_tool
│   └── upsert_memory                      kind 3        when the tool wrote a memory file
├── tool_call:sessions_spawn
│   └── subagent                                         spawn → ended
│       └── interaction (child run)                      gen_ai.agent.name=<label or agent id>
├── compaction
└── llm_request
```

Tool spans are siblings of `llm_request` (a tool runs after a response, not during it). Memory spans are children of the tool span that caused them, except the session snapshot, which hangs off the root. A subagent's whole tree lives in the parent's trace and reports the **parent's** session id on `session.id`, keeping its own under `openclaw.session.id`, so the session rollup includes the delegated work. A `subagent` span that ends after its parent shipped is exported on its own; one that never ends is exported as abandoned after an hour.

A compaction is exported as a `chat` span named `compaction`: `gen_ai.input.messages` is the set of messages being compacted (from `before_compaction`), `gen_ai.output.messages` is the summary that replaced them, read from the latest `compaction` entry in the transcript store (SQLite or JSONL; OpenClaw persists it before `after_compaction` fires), and the model is the session's last known one. The summarizer fires no `model_call_*` hooks, so the span carries `openclaw.usage.state=unreported` and no tokens. A compaction triggered outside a run (`sessions.compact`) ships as its own trace whose root is also named `compaction` (`interaction.kind=compaction`): the root name is the trace list label and the `name` filter, and a compaction is not a run, unlike cron or heartbeat turns, which keep the `interaction` root. The session's conversation view then shows what was summarized until the next turn.

## Attributes

Common to every span (`SpanBuilder.commonAttrs`): `session.id` / `gen_ai.session.id`, `user.id` (user turns only), `gen_ai.agent.name`, `openclaw.session.id`, `openclaw.session.key`, `openclaw.run.id`, `openclaw.agent.id`, `openclaw.channel`, `openclaw.channel.id`, `openclaw.trigger`, `openclaw.cron.job.id`, `openclaw.parent.run.id`, `latitude.tags`, `latitude.metadata`, `latitude.captured.content`.

`interaction`: `user_prompt:gated`, `gen_ai.input.messages:gated` (history plus the prompt, as offered to the first call), `gen_ai.output.messages:gated` (the final assistant message), `gen_ai.system_instructions:gated`, `openclaw.run.success`, `openclaw.outcome` (`completed` / `error` / `abandoned`), `interaction.kind` (`user` / `cron` / `heartbeat` / `subagent` / ...), `interaction.duration_ms`, `openclaw.llm_calls`, `openclaw.tool_calls`, `openclaw.images.count`, `openclaw.tool_count`, `gen_ai.request.model`, `gen_ai.response.model`, `openclaw.resolved.ref`, `openclaw.harness.id`, `openclaw.reasoning.effort`, and `error.type` / `error.message:gated` on failure. No usage: the rollup sums `chat` spans only, and the root duplicating them would only confuse the span view.

`llm_request`: `gen_ai.operation.name=chat`, `gen_ai.provider.name` / `gen_ai.system`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.response.id`, `gen_ai.response.finish_reasons` (a native OTLP string array; `toolUse` → `tool_calls`, `aborted` → `cancelled`), `gen_ai.request.stream=true`, `gen_ai.server.time_to_first_token` (ns), `gen_ai.input.messages:gated` (the transcript before this response), `gen_ai.output.messages:gated`, `gen_ai.system_instructions:gated`, `gen_ai.tool.definitions:gated`, the `gen_ai.usage.*` family including `reasoning_tokens` and `cache_read.input_tokens` / `cache_creation.input_tokens`, `gen_ai.usage.cost` / `input_cost` / `output_cost` with `openclaw.cost.origin` (`catalog` or `provider-billed`), `llm_request.call_index`, `openclaw.call.id`, `openclaw.api`, `openclaw.transport`, `openclaw.duration_ms`, `openclaw.ttfb_ms`, `openclaw.outcome`, `openclaw.stop_reason`, `openclaw.request.payload_bytes`, `openclaw.response.stream_bytes`, `openclaw.upstream.request_id_hash`, and on failure `error.type` (`errorCategory`) / `openclaw.failure.kind`. `openclaw.usage.scope=attempt` marks the fallback where no transcript message matched and the attempt aggregate landed on the last call; `openclaw.call.source=transcript` marks a synthesized call.

`tool_call:<name>` (kind 3): `gen_ai.operation.name=execute_tool`, `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments:gated`, `gen_ai.tool.call.result:gated`, `tool.is_error`, `error.type=tool_error` / `error.message:gated`, `openclaw.duration_ms`.

`subagent`: `gen_ai.agent.name`, `subagent.name` / `subagent.type` / `subagent.id`, `openclaw.subagent.*` (child session key, agent id, label, mode, resolved model and provider, requester, target, reason, outcome, farewell).

`compaction` (chat): `gen_ai.input.messages:gated` (the compacted messages), `gen_ai.output.messages:gated` (the summary), `openclaw.usage.state=unreported`, `openclaw.compaction.message_count.before` / `.after`, `.compacting_count`, `.compacted_count`, `.token_count.before` / `.after`, `.summary_chars`, `.previous_session_id`, `.session_file`.

### Message normalization

`messages.ts` dispatches per item on the item's own shape. OpenClaw's transcript is pi-ai's: `{role:"user", content: string | (text|image)[]}`, `{role:"assistant", content: (text|thinking|toolCall)[]}`, `{role:"toolResult", toolCallId, toolName, content, isError}` and `{role:"custom", customType, content}` runtime notes. Those become `text`, `reasoning` (`[redacted]` for redacted thinking), `tool_call`, `tool_call_response` (with the tool name and `is_error`) and `uri` parts (base64 images as data URIs, like `pi-telemetry`). Anthropic content blocks and OpenAI Chat Completions shapes still normalize, since `historyMessages` may hold replayed provider-native messages. Unknown shapes become a JSON text part rather than disappearing.

## Usage accounting

- `Usage.input` is **additive** (excludes cache reads) and `totalTokens = input + output + cacheRead + cacheWrite`; `gen_ai.usage.total_tokens` is sent so Latitude's `resolveTokens` infers that. `output` is inclusive of reasoning and `reasoning_tokens` is sent beside it; the resolver subtracts.
- **Cost is OpenClaw's own.** `AssistantMessage.usage.cost` is computed from OpenClaw's model catalog (or the provider's bill, `totalOrigin: "provider-billed"`). A positive total is reported as `gen_ai.usage.cost` and Latitude records it as `provider_reported`, which is what makes a model absent from Latitude's catalog (or a subscription-routed one) still carry a price that matches OpenClaw's `/usage`. Zero cost is omitted so Latitude's catalog estimate applies.
- **Per-call attribution comes from the transcript**, never from `llm_output`, whose `usage` is the attempt aggregate. The aggregate is the fallback of last resort (`openclaw.usage.scope=attempt`).
- **`/usage` in OpenClaw and Latitude should agree** per session once subagents are included: a delegated child's calls are its own run in the parent's trace and session.

## Memory model

- **Store**: `openclaw/<agentId>`. **Records**: one per file (`MEMORY.md`, `USER.md`, `memory/<date>.md`), body = the whole file, the granularity the ledger diffs and blames per line.
- **Reads**: the session snapshot, once per `sessionKey` on the first `llm_input` (latch released by `session_start`), read from `workspaceDir`; `memory_search` (`gen_ai.memory.query.text`, results with `path#line`, snippet and score from `result.details.results`) and `memory_get` (one record, `result.details.text`). `memory_recall` from memory-lancedb is treated like `memory_search`.
- **Writes**: `write` carries the whole body in `params.content`; `edit` is read back from disk after the call succeeds, and `openclaw.memory.body_unavailable=true` marks a read that failed. An emptied file is `delete_memory`. Writes outside the memory scope, failed calls and unrelated tools emit nothing.
- **Never an empty `gen_ai.memory.record.id` on a mutation**: the OTEL signal for a whole-store wipe.
- **Switches**: `config.memory=false` drops memory spans; `config.memoryContent=false` keeps the spans and drops bodies and queries; `config.allowConversationAccess=false` drops them too (they are `:gated`).

## Tags and metadata

Derived tags: `openclaw`, the channel (`slack`, `telegram`, ...), the agent id, `cron:<jobId>` (bare `cron` when the job is unknown), any other non-user trigger (`heartbeat`), and `subagent:<agentId>` on a run that spawned one. Operator tags from `config.tags` are appended. Caps: 64 chars per tag, 32 tags, 1024 chars per metadata value, 64 keys; over-cap entries are dropped.

Metadata is namespaced `openclaw.*` (`run.id`, `session.id`, `session.key`, `agent.id`, `workspace.dir`, `channel`, `channel.id`, `account.id`, `message.provider`, `trigger`, `model.provider.id`, `model.id`, `cron.job.id`, `cron.job.name`, `sender.id`, `sender.name`, `sender.username`, `trace.id`, `plugin.version`). Operator keys from `config.metadata` stay verbatim and are applied first, so a derived key always wins; an operator key starting with `openclaw.` is dropped.

## Export path

The builder emits one batch per finished run (plus standalone batches for late `subagent` spans and out-of-run compactions). `Transport` serializes them into one POST each, sequentially, with up to three attempts on `429` / `5xx` / network errors (jittered backoff, `Retry-After` honoured up to 30 s) and no retry on any other `4xx`. A span accepted once is never resent: `traces_mv` / `sessions_mv` add per insert. `gateway_stop` flushes for up to 4 s. Content gating, the per-attribute budget and attribute redaction all happen in `otlp.ts` at encode time. The budget keeps structured attributes parseable, since ingest drops a `gen_ai.*` JSON attribute it cannot parse: strings are middle-truncated (never through a surrogate pair), and an array over budget first has the strings inside its items truncated to a quarter of the budget, then sheds whole items alternately from the middle, head and tail kept; a message list gets a `system` marker with the omitted count, other arrays are shed silently. Slicing serialized JSON is the last resort, for a lone oversized object.

## Package layout

```
openclaw/src/
  plugin.ts        register(): hook subscriptions, logger, transport wiring
  config.ts        pluginConfig → Config
  types.ts         OTLP wire types + mirrored OpenClaw hook payloads
  span-builder.ts  run lifecycle, calls, tools, memory, compaction, subagents, cron, senders, finalize
  messages.ts      per-item dialect normalization
  usage.ts         transcript usage/cost → gen_ai.usage.*, finish reasons
  tools.ts         llm_input.tools → gen_ai.tool.definitions
  memory.ts        store/record ids, tool classification, disk read-back, session snapshot
  history.ts       per-session history for harnesses that withhold it, transcript mirror reader
  context.ts       derived tags and metadata, cron session-key parsing
  otlp.ts          encoding: gating, budget, redaction, resource
  transport.ts     sequential export with retries and flush
  redaction.ts     attribute redaction (shared design with hermes)
  logger.ts        api.logger adapter
openclaw-cli/src/
  setup.ts         install/uninstall flows, flag parsing, RUNTIME_VERSION
  openclaw-cli.ts  spawning openclaw, CalVer compare, MIN_OPENCLAW_VERSION
```

Tests: `pnpm --filter @latitude-data/openclaw-telemetry test` (unit tests only, no network, no real workspace: file and database reads are injected). The ingest-side contract is `packages/domain/spans/src/otlp/tests/openclaw-plugin.test.ts`, which runs a payload captured from the plugin (`fixtures/openclaw-plugin.json`) through `transformOtlpToSpans` and asserts operations, usage, cost, TTFT, conversation, tools, memory, session and user resolve; regenerate the fixture by driving `registerLatitudePlugin` with a fake transport whenever the emitted shape changes.

Publishing: `.github/workflows/publish-packages.yml` publishes both npm packages when their `package.json` version is new. Bump both together.
