# Hermes telemetry fidelity

> **Documentation** — durable homes after this ships: a new `dev-docs/hermes-telemetry.md` (sibling of `dev-docs/claude-code-telemetry.md` and `dev-docs/pi-telemetry.md`), the public page `docs/telemetry/hermes.md`, and `packages/telemetry/hermes/README.md`. Related current docs: `dev-docs/spans.md` (OTLP attribute resolution, trace/session conversation assembly), `specs/memory-observability.md` (the `gen_ai.memory.*` contract this adopts), `specs/telemetry-qa.md` row **59** (Hermes QA status).
>
> **Scope**: one PR, on branch `hermes/telemetry-fidelity` (based on `development`). Milestones below are commit boundaries inside that single PR, not separate PRs.

---

## Contents

1. [Why](#1-why)
2. [How to re-derive the ground truth](#2-how-to-re-derive-the-ground-truth)
3. [What Hermes gives us: the hook contract](#3-what-hermes-gives-us-the-hook-contract)
4. [What Latitude accepts: the ingest contract](#4-what-latitude-accepts-the-ingest-contract)
5. [Evidence from the dogfood session](#5-evidence-from-the-dogfood-session)
6. [Findings](#6-findings)
7. [Target model](#7-target-model)
8. [Design, module by module](#8-design-module-by-module)
9. [Configuration surface](#9-configuration-surface)
10. [Non-goals](#10-non-goals)
11. [Decisions](#11-decisions)
12. [Risks](#12-risks)
13. [Verification plan](#13-verification-plan)
14. [Tasks](#tasks)
15. [Platform-side follow-ups (out of scope)](#platform-side-follow-ups-out-of-scope)

---

## 1. Why

`packages/telemetry/hermes` (pip: `latitude-telemetry-hermes`, currently **0.1.2**) streams [Hermes Agent](https://github.com/NousResearch/hermes-agent) sessions to Latitude as OTLP traces. A real dogfood session (project `alescript`, session `20260825_095742_7b42ec`, Hermes **0.20.5**, model `gpt-5.6-sol` over the OpenAI **Codex/Responses** api mode) shows the spans are structurally right but the *content* is largely lost:

- **no system instructions** on any span, so the trace conversation has no system message;
- **no tool definitions**, so the project's `definedTools` rollup is empty and the Tools page never learns what the agent was offered;
- **the conversation loses every tool call and tool result**, and every assistant turn in the replayed history renders as a JSON blob (`{"type": "output_text", "text": "…"}`) instead of text;
- **no memory telemetry at all**, so the Memory page, the per-session memory footprint, and the memory ledger see nothing even though Hermes has a first-class persistent-memory system;
- **no TTFT**, **no streaming flag**, **no failed-API-call detail** (retries and interruptions surface as opaque `abandoned` error spans), **no tool error status**, **no user identity**, **no subagent linkage**.

The root cause of the content loss is a single wrong assumption in `messages.py`: it normalizes only the **OpenAI Chat Completions** message shape (`{role, content, tool_calls}`). Hermes's Codex/Responses path sends **Responses API items** — `{"type":"message","role":"assistant","content":[{"type":"output_text","text":…}]}`, `{"type":"function_call",…}`, `{"type":"function_call_output",…}`, `{"type":"reasoning",…}` — where the tool items carry **no `role` key at all**, so they are dropped, and `output_text` blocks fall through to the JSON-dump branch. Everything else is a missed opportunity: the hooks already carry the data (including the system prompt, the tool definitions, tool error status and duration, stream deltas, subagent identity) and the plugin never reads it.

This spec fixes the fidelity gaps and closes the export path's scalability and reliability holes found on the way.

---

## 2. How to re-derive the ground truth

Everything in sections 3 and 6 was verified against the Hermes source at the exact version the dogfood VM runs (**0.20.5**). PyPI lags (latest wheel there is 0.19.0), so read the repo:

```bash
cd /tmp && rm -rf hermes-src && mkdir hermes-src && cd hermes-src
curl -sSL -X GET "https://codeload.github.com/NousResearch/hermes-agent/tar.gz/refs/heads/main" -o main.tar.gz
tar xzf main.tar.gz    # → /tmp/hermes-src/hermes-agent-main (pyproject.toml: version = "0.20.5")
```

Files that matter (paths relative to that tree):

| Question | File |
| --- | --- |
| Which hooks exist | `hermes_cli/plugins.py` → `VALID_HOOKS` (~line 161) |
| Documented payload of every hook | `website/docs/user-guide/features/hooks.md` → "Shipped plugin-hook catalog" (~line 434) |
| `pre_api_request` fire site (authoritative kwargs) | `agent/conversation_loop.py` ~3033–3090 |
| `post_api_request` fire site | `agent/conversation_loop.py` ~6789–6825 |
| `api_request_error` fire site | `run_agent.py` `_invoke_api_request_error_hook` (~3075) |
| System prompt passed to hooks | `agent/conversation_loop.py` `_system_prompt_for_hooks` (~627) |
| Sanitized `request` / `response` payloads + truncation | `run_agent.py` `_api_request_payload_for_hook`, `_api_response_payload_for_hook`, `_hook_jsonable`, `_sanitize_hook_payload` (~2862–3110) |
| Usage buckets | `agent/usage_pricing.py` `CanonicalUsage` (line 74); `run_agent.py` `_usage_summary_for_api_request_hook` (2862) |
| Cost | `agent/usage_pricing.py` `estimate_usage_cost` (1448), `resolve_billing_route` |
| `pre_llm_call` / `post_llm_call` / `on_session_end` fire sites | `agent/turn_context.py` ~1274; `agent/turn_finalizer.py` ~624 and ~823 |
| `post_tool_call` fire site + status derivation | `model_tools.py` `_tool_result_observer_fields` (1115), `_emit_post_tool_call_hook` (1136) |
| Stream hooks | `run_agent.py` `_stream_hook_base_payload` (6904), `_emit_stream_start` / `_emit_stream_end` / delta enqueues (6990–7030); `agent/plugin_stream_hooks.py` |
| Subagent hooks | `tools/delegate_tool.py` ~2084 (`subagent_start`), ~3483 (`subagent_stop`) |
| Turn/task/turn-id derivation | `agent/turn_context.py` ~580 (`effective_task_id = task_id or uuid4()`, `turn_id = f"{session}:{task}:{rand8}"`); `agent/conversation_loop.py` 2885 (`api_request_id = f"{turn_id}:api:{api_call_count}"`) |
| Responses-API item shapes | `agent/codex_responses_adapter.py` ~780–900 |
| Plugin facade (`ctx`) | `hermes_cli/plugins.py` `PluginContext` (1401+) — `profile_name`, `get_config`, `state`, `register_hook`, … |
| Built-in memory tool + stores | `tools/memory_tool.py` (`MEMORY_SCHEMA` 1263, `memory_tool` 1086, `_path_for` 340, `get_memory_dir` 65, `_success_response` 726) |
| Memory docs (stores, limits, frozen snapshot) | `website/docs/user-guide/features/memory.md` |
| Reference observability plugin | `plugins/observability/langfuse/__init__.py` (consumes `system_prompt`, imports `agent.usage_pricing` for cost) |
| Secret redaction | `agent/redact.py` `redact_sensitive_text` (774) |

**Precedent inside this repo**: `packages/telemetry/claude-code/src/memory.ts` + `otlp.ts` (`buildMemorySpan`) is the reference for emitting `gen_ai.memory.*` from a harness plugin, including reading a file off disk to recover the post-state body. `packages/telemetry/pi` is the reference for the `interaction`/`llm_request`/`tool_call:*` span tree and the `:gated` content mechanism.

---

## 3. What Hermes gives us: the hook contract

Hermes calls `register(ctx)` on the module named by the `hermes_agent.plugins` entry point, and dispatches with `invoke_hook(name, **kwargs)`. Callbacks get **keyword arguments only**, exceptions are swallowed per callback, and `PluginManager` adds `telemetry_schema_version="hermes.observer.v1"` to every payload. Correlation ids may be absent — treat them as opaque.

### 3.1 Hooks the plugin already uses

| Hook | Kwargs (verified at the fire site) |
| --- | --- |
| `pre_api_request` | `task_id`, `turn_id`, `api_request_id`, `session_id`, `user_message`, `conversation_history`, `platform`, `model`, `provider`, `base_url`, `api_mode`, `api_call_count`, `retry_count`, `request_messages`, **`system_prompt`**, `message_count`, `tool_count`, `approx_input_tokens`, `request_char_count`, `max_tokens`, `started_at`, `middleware_trace`, `request` |
| `post_api_request` | `task_id`, `turn_id`, `api_request_id`, `session_id`, `platform`, `model`, `provider`, `base_url`, `api_mode`, `api_call_count`, `api_duration`, `started_at`, `ended_at`, `finish_reason`, `message_count`, **`response_model`**, `response`, `usage`, `assistant_message`, `assistant_content_chars`, `assistant_tool_call_count`, `moa_references` |
| `pre_llm_call` | `session_id`, `task_id`, `turn_id`, `user_message`, `conversation_history`, `is_first_turn`, `model`, `platform`, **`parent_session_id`**, **`sender_id`** |
| `post_llm_call` | `session_id`, `task_id`, `turn_id`, `user_message`, `assistant_response`, `conversation_history`, `model`, `platform` |
| `pre_tool_call` | `tool_name`, `args`, `task_id`, `session_id`, `tool_call_id`, `turn_id`, `api_request_id`, `middleware_trace` |
| `post_tool_call` | `tool_name`, `args`, `result`, `task_id`, `session_id`, `tool_call_id`, `turn_id`, `api_request_id`, **`duration_ms`**, **`status`** (`"ok"`/`"error"`), **`error_type`**, **`error_message`**, `middleware_trace` |
| `on_session_end` | canonical (per **turn** finalization): `session_id`, `task_id`, `turn_id`, `completed`, `failed`, `interrupted`, `turn_exit_reason`, `model`, `platform`. Interrupt/exit paths fire a reduced shape: `session_id`, `completed=False`, `interrupted=True`, `reason`, sometimes `api_request_id`, and may omit `task_id`/`turn_id`. |
| `on_session_finalize` | surface-dependent: `session_id`, `platform`, optionally `reason`, `old_session_id`, `new_session_id` |

Bold entries are available today and **not read** by the plugin.

### 3.2 Hooks the plugin does not register yet

| Hook | Kwargs | What it buys us |
| --- | --- | --- |
| `api_request_error` | `task_id`, `turn_id`, `api_request_id`, `session_id`, `platform`, `model`, `provider`, `base_url`, `api_mode`, `api_call_count`, `api_duration`, `started_at`, `ended_at`, `status_code`, `retry_count`, `max_retries`, `retryable`, `reason`, `error`, `request` | Real failed-attempt spans (rate limits, 5xx, context overflow) instead of `abandoned` |
| `on_stream_start` | `turn_id`, `iteration`, `session_id`, `model`, `provider`, `surface` | `gen_ai.request.stream=true`. Fires **before** the request, so it is not TTFT |
| `on_stream_delta` | those plus `delta`, `kind` (`text`/`reasoning`) | TTFT = first delta observation minus span start. Reasoning deltas need `plugins.stream_reasoning_deltas: true` |
| `on_stream_end` | those plus `final_text`, `finished`, `error` | Stream-level failure detail |
| `on_session_start` | `session_id`, `model`, `platform` | Session boundary; the anchor for the one-shot memory read |
| `on_session_reset` | `session_id`, `platform`, `reason`, and on gateway `old_session_id`, `new_session_id` | `/reset` boundary; ends the memory-read scope |
| `subagent_start` | `parent_session_id`, `parent_turn_id`, `parent_subagent_id`, `child_session_id`, `child_subagent_id`, `child_role`, `child_goal` | Nest a delegated child under the parent's `delegate` tool span |
| `subagent_stop` | `parent_session_id`, `parent_turn_id`, `child_session_id`, `child_role`, `child_summary`, `child_status`, `tool_call_history`, `duration_ms` | Close the child, record status/summary |

`iteration` on the stream hooks **is** `api_call_count`, so `(turn_id, iteration)` addresses the `llm_request` span exactly.

### 3.3 Traps in the hook payloads

1. **`request` is aggressively truncated.** `_api_request_payload_for_hook` runs the whole `api_kwargs` through `_sanitize_hook_payload`: first pass caps strings at 8 000 chars and sequences at 200 items; if the JSON still exceeds `HERMES_PLUGIN_PAYLOAD_MAX_CHARS` (**50 000** default) it retries at 1 000/50; if it *still* exceeds, the entire payload collapses to `{"_truncated": true, "original_type": …, "preview": "<first 50k chars>"}`. On a long conversation `request` is therefore **useless** — including its `tools`. `request_messages`, `conversation_history` and `user_message` are raw passthroughs and are **not** truncated (and not redacted).
2. **`system_prompt` is a str *or* a list of content blocks** (Anthropic `system` blocks); Responses/Codex puts it in `instructions`, Chat Completions in `messages[0]`. `_system_prompt_for_hooks` already resolves all three, so read the kwarg, never the messages.
3. **`usage` keys** are `CanonicalUsage` fields: `input_tokens` (additive — excludes cache), `output_tokens` (inclusive — includes reasoning), `cache_read_tokens`, `cache_write_tokens`, `reasoning_tokens`, `request_count`, plus derived `prompt_tokens` (= input + cache read + cache write) and `total_tokens` (= prompt + output). There is **no** `completion_tokens`. Sending `total_tokens` is load-bearing: it is the arithmetic proof Latitude's `resolveTokens` uses to infer additive-input/inclusive-output.
4. **`api_request_id` is stable across retries** (`{turn_id}:api:{api_call_count}`); `retry_count` distinguishes attempts, and `pre_api_request` re-fires per attempt. Key open generation spans by `(api_call_count, retry_count)`.
5. **`on_session_end` fires per turn**, not per session. Blocking there costs the user's turn latency.
6. **Stream hooks are delivered off the token path** through a bounded per-callback queue that drops its oldest events under back-pressure, so a first delta can be missed and delivery is slightly late: TTFT is an upper bound.
7. **`transform_*` hooks must not be registered** by a telemetry plugin — a non-`None` return mutates the agent's behaviour.

---

## 4. What Latitude accepts: the ingest contract

Resolution lives in `packages/domain/spans/src/otlp/`. What matters here:

| Concern | Contract |
| --- | --- |
| Operation | `resolveOperation`: `gen_ai.operation.name` passes through (so `chat`, `execute_tool`, and the seven `*_memory*` ops all resolve); `span.type` maps `interaction`→`invoke_agent`, `llm_request`→`chat`, `tool_execution`/`tool`→`execute_tool` (`resolvers/operation.ts`). Unrecognised → `unspecified`, which drops the span out of the token gate and the conversation. |
| Conversation (trace) | `trace-repository.ts`: `allMessages = [system?] + argMaxIf(input_messages, end_time, output_messages != '' AND operation IN ('chat','text_completion','generate_content')) + that span's output_messages`. **The `interaction` root's messages are ignored** for the conversation; only `system_instructions` may come from it (`SYSTEM_INSTRUCTION_OPERATION_FILTER` additionally allows `invoke_agent`). So the *last* `llm_request` of a trace is what the conversation view renders. |
| Message parts | `rosetta-ai` `GenAIPart`: `text` (`content`), `reasoning` (`content`), `tool_call` (`id`, `name`, `arguments`), `tool_call_response` (`id`, `response`), `blob`/`uri`/`file`. `normalizeGenAIMessages` rewrites `thinking`→`reasoning` and hoists `tool_call_response` parts into a `role: "tool"` message. Anything else is passed through and renders through the UI's unknown-part fallback — which is exactly what `output_text` does today. |
| Tool definitions | `gen_ai.tool.definitions`, JSON string or structured; accepted shapes are `{type:"function",function:{name,description,parameters}}`, `{type:"function",name,…}`, `{name,description,parameters|inputSchema|input_schema}`, or a request body holding `tools` (`helpers/resolve-tool-definitions.ts`). Feeds the `defined_tools` rollup on traces/sessions. |
| Tool execution | `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result` — resolved **only** when operation is `execute_tool`. |
| Tokens | `gen_ai.usage.input_tokens` / `output_tokens` / `cache_read.input_tokens` / `cache_creation.input_tokens` / `reasoning_tokens` / `total_tokens` (`resolvers/usage/tokens.ts`). Inclusive-vs-additive is inferred, preferentially by matching the reported total. |
| Cost | `gen_ai.usage.cost` / `total_cost` (and `input_cost` / `output_cost`), USD floats; **zero is treated as absent** and falls back to Latitude's catalog estimate. |
| TTFT / streaming | `gen_ai.server.time_to_first_token` (ns, span attr) is the highest-priority candidate; a TTFT longer than the span is discarded. `gen_ai.request.stream` (bool) sets `isStreaming`. |
| Identity | session: `session.id`, `gen_ai.session.id`; user: `user.id`, `enduser.id`; agent name: `gen_ai.agent.name`, `subagent.name`, `subagent.type`, `subagent.id` (first segment before `:`). |
| Enrichment | `latitude.tags` = JSON string array; `latitude.metadata` = JSON object string, flattened to a `Map(String,String)`. `latitude.captured.content` = bool. |
| Memory | `gen_ai.operation.name` ∈ {`create_memory`, `update_memory`, `upsert_memory`, `delete_memory`, `search_memory`, `create_memory_store`, `delete_memory_store`}, plus `gen_ai.memory.store.id`, `gen_ai.memory.record.id`, `gen_ai.memory.record.count`, `gen_ai.memory.query.text`, `gen_ai.memory.records` (JSON array of `{id?, content, score?, metadata?}`; `content` is the record's **full new body**). Ledger semantics (`specs/memory-observability.md`): `search_memory`→read, `create_memory`→add, `update_memory`→update, `upsert_memory`→add-if-first-else-update, `delete_memory` with a record id→remove. Ordering is by span **end time**, last writer wins. |
| Payload limits | `apps/ingest` caps a request at **32 MiB** (`LAT_INGEST_TRACE_MAX_PAYLOAD_BYTES`), holds a 64 MiB in-flight budget and 16 concurrent payloads per process; over-cap → `413`, admission exhaustion → `503 Retry-After: 1`, rate limit → `429`. **There is no gzip decode** at ingest, so the plugin must keep payloads small by construction. |
| Idempotency | `spans` is `ReplacingMergeTree(ingested_at)` (a re-sent span collapses) but `traces_mv`/`sessions_mv` are plain per-insert `GROUP BY` rollups that would **additively inflate** span counts, tokens and cost. **Every span id must be shipped exactly once.** |

---

## 5. Evidence from the dogfood session

Project `alescript`, session `20260825_095742_7b42ec`, 17 traces, `service.name=hermes-agent`, scope `latitude-telemetry-hermes` 0.1.2, model `gpt-5.6-sol`, provider `openai`, platform `cli`.

Span `9e1b96f61ab0f67a933b27a8ca05fb3a` / `d170280710796d89` (`llm_request`, `operation=chat`):

- `systemInstructions: []`, `toolDefinitions: []`.
- `inputMessages`: 63 messages — **only** `user` (`text`) and `assistant` (`output_text`) roles. No `system`, no `tool`, no `tool_call` part anywhere. Every assistant part is `{"type":"output_text","content":"{\"type\": \"output_text\", \"text\": \"…\"}"}` — the block JSON-dumped into a part whose type Latitude does not know.
- `outputMessages`: `[{role: assistant, parts: [reasoning, tool_call]}]` — the **output** path is correct, which is why the tool calls exist as spans while the replayed history has none.
- `attrInt`: `input_tokens 1356`, `output_tokens 634`, `cache_read 166528`, `reasoning 549`, `total 168518`. Latitude resolved `tokensInput 1356`, `tokensOutput 85` (634 − 549), `tokensCacheRead 166528` — the additive/inclusive inference is correct; **tokens are the one thing that already works**.
- `costIsEstimated: true` (Latitude priced it: 1356 × $5/M + 166528 × $0.50/M + output ⇒ 10 906 400 µ¢ ≈ $0.109, which matches Hermes's own `gpt-5.6-sol` entry). The run was on an OAuth Codex subscription, so Hermes's own verdict would have been `included` / $0.
- `timeToFirstTokenNs: 0`, `isStreaming: false`, `responseId: null` on every span.
- `latitude.metadata` = `{hermes.session.id, hermes.task_id}` only. `hermes.platform` present. `agentNames: []`, `definedTools: []`, `userId: null`.

Error spans in the session (7 rows, all `errorType: "abandoned"`, all with zero tokens):

| Status message | Count | What actually happened |
| --- | --- | --- |
| `llm_request superseded by retry` | 4 | The attempt **failed** and Hermes retried. `api_request_error` carried the status code and reason; the plugin never registered it. |
| `llm_request abandoned before post_api_request` | 3 | The user **interrupted** the turn (two `[response interrupted]` markers in the transcript). Not an error. |

Session `conversation` (`getSession`) is the last `llm_request`'s input plus its output, so it inherits exactly the defects above: no system message, no tool calls, JSON-blob assistant turns.

---

## 6. Findings

Ordered by user impact. Each maps to a milestone in [Tasks](#tasks).

**F1 — Responses-API items are dropped or mangled (`messages.py`).** `_normalize_message` requires a `role`; Responses items `function_call`, `function_call_output` and `reasoning` have none, so they become `role="user"` with `content=None` and are dropped. `_block` only knows `type in {text, thinking, reasoning, tool_use, tool_result}`, so `output_text`/`input_text` fall to the `{"type": btype, "content": _safe_json(block)}` catch-all. Net effect: the aggregated conversation loses every tool call and result and shows JSON blobs for assistant text. **This is the user's headline complaint.**

**F2 — System instructions never resolved.** `_system_prompt(messages)` only looks for a `role == "system"` message. Codex/Responses puts it in `instructions`, Anthropic in `system`; neither is in `messages`. Hermes hands us the resolved value as `pre_api_request(system_prompt=…)` and the plugin ignores the kwarg.

**F3 — Tool definitions never emitted.** No `gen_ai.tool.definitions` is written at all. They live in `request["body"]["tools"]`, which is only intact while the sanitized payload is under 50 000 chars — true on the first turns of a session, false later (see [3.3](#33-traps-in-the-hook-payloads)). `tool_count` is always available.

**F4 — No memory telemetry.** Hermes has two built-in memory stores (`MEMORY.md` ≤ 2 200 chars, `USER.md` ≤ 1 375 chars, under `get_memory_dir()` = `<hermes_home>/memories/`, profile-scoped), mutated through the `memory` tool (`add` / `replace` / `remove`, single or `operations[]` batch) and injected into the system prompt as a frozen snapshot at session start. The plugin emits none of the `gen_ai.memory.*` vocabulary, so the Memory page, the session memory footprint and the ledger are empty for Hermes.

**F5 — Tool errors are invisible.** `on_post_tool_call` reads `kw.get("is_error")`, which **does not exist** in the payload. The real fields are `status` (`"ok"`/`"error"`), `error_type`, `error_message`, and `duration_ms`. Every failed tool call is currently recorded as a success, and the plugin re-measures a duration Hermes already gave it.

**F6 — Failed API attempts are opaque.** `api_request_error` is not registered, so a retried attempt is closed by `_abandon` as `error.type=abandoned`, `"llm_request superseded by retry"`, with no status code, no reason, no retryability.

**F7 — Interruptions are reported as errors.** A turn the user cut short closes its open spans with `"llm_request abandoned before post_api_request"` and `status=error`. `on_session_end` carries `interrupted`, `failed`, `completed` and `turn_exit_reason`; an interrupted turn should read as cancelled, not failed.

**F8 — No TTFT, no streaming flag.** Every span reports `timeToFirstTokenNs: 0` and `isStreaming: false` although the CLI streams. The stream observer hooks are unused.

**F9 — No end-user identity.** `pre_llm_call.sender_id` is the platform user id (e.g. the Slack member id `U07UYTQP04Q` in this very session) and is never mapped to `user.id`, so Latitude's user pages and per-user analytics are blind for gateway sessions.

**F10 — No subagent/delegation graph.** `subagent_start`/`subagent_stop` are unused. A delegated child agent runs with its **own** `session_id`, so its spans land in a different Latitude session with no link to the `delegate` tool call that spawned it, and `gen_ai.agent.name` is never set (`agentNames: []`).

**F11 — Thin metadata.** `latitude.metadata` carries only the session and task ids. `platform`, `api_mode`, `base_url`, `profile`, Hermes version, `turn_id`, `retry_count`, `finish_reason`, `turn_exit_reason`, `approx_input_tokens`, `message_count` are all available and all useful as filters.

**F12 — Response model taken from the request.** `on_post_api_request` sets `gen_ai.response.model` from `kw["model"]` (the requested model) while Hermes passes the real `response_model`.

**F13 — Unbounded payloads, one POST per turn.** `_finish_locked` builds a single OTLP payload holding every span of the turn, and every `llm_request` span carries the full replayed history. The biggest trace in this session has **110 spans** (~55 model calls at ~95 k prompt tokens each): order of 20 MB in one request against a **32 MiB** ingest cap and a 10 s flush deadline, with **no retry** on failure (`_post_traces` swallows everything) and **no compression path** (ingest does not decode gzip). One thread is spawned per payload, and `_evict_locked` silently **drops** a run when more than 256 are live.

**F14 — `_flush()` blocks every turn.** `on_session_end` fires at each turn finalization and joins the exporter threads for up to 10 s, on the user's critical path.

**F15 — Content is exported with no secret redaction.** `request_messages`, `conversation_history`, tool args and tool results are raw passthroughs; Hermes redacts secrets in its own logs/transcripts (`agent/redact.py`) but not in hook payloads, so a token echoed by a terminal tool ships to Latitude verbatim. There is no per-attribute redaction option (claude-code has `LATITUDE_REDACT_ATTRIBUTES`).

**F16 — Config is env-only, and the plugin ignores `ctx`.** `register(ctx)` uses `ctx` only for `register_hook`, so the documented plugin config surface (`plugins.entries.latitude.settings.*` via `ctx.get_config`) and `ctx.profile_name` are unavailable. Config is also cached process-wide on first read, so a credential added to `~/.hermes/.env` after import never takes effect.

**F17 — Small correctness/parity nits.**
(a) `service.instance.id` is set on child spans but not on the root.
(b) The root's `user_prompt` is recovered by scanning history (`_last_user_text`) when `user_message` is handed to us directly.
(c) `_apply_usage` maps a non-existent `completion_tokens` key onto the same target as `output_tokens` (dead code with an overwrite hazard).
(d) `developer` (Responses' system role) is not in `_ROLES`, so such a message is relabelled `user`.
(e) `tests/test_plugin.py` asserts the registered hook set exactly, so it must move in lockstep with new registrations.
(f) Every span is exported as OTLP `kind: 1` (INTERNAL); tool and memory spans should be `kind: 3` (CLIENT) for parity with the claude-code emitter and the OTEL memory convention.

---

## 7. Target model

### 7.1 Trace shape

One trace per Hermes **turn**, keyed as today by `(task_id|session_id, turn_id)`.

```
interaction                                   span.type=interaction        → invoke_agent
├── search_memory                             (once per session, first turn only, one per store)
├── llm_request  (api_call_count=1, attempt 1) span.type=llm_request        → chat        [failed attempt]
├── llm_request  (api_call_count=1, attempt 2) span.type=llm_request        → chat
├── tool_call:terminal                        span.type=tool_execution     → execute_tool
├── tool_call:memory                          span.type=tool_execution     → execute_tool
│   └── upsert_memory                         gen_ai.operation.name         → upsert_memory
├── llm_request  (api_call_count=2)
└── tool_call:delegate                        span.type=tool_execution     → execute_tool
    └── interaction  (subagent)               gen_ai.agent.name=<child_role>
        ├── llm_request …
        └── tool_call:… …
```

Tool spans stay **siblings** of `llm_request` spans under the interaction (a tool runs after a model call returns, not during it — same rationale as `dev-docs/pi-telemetry.md`). Memory spans are **children of the tool span** that caused them (claude-code parity). A delegated subagent's `interaction` is a **child of the parent's `delegate` tool span** and shares the parent's trace and session ids.

### 7.2 Attributes

Common to every span (`_context`):

| Attribute | Value |
| --- | --- |
| `session.id`, `gen_ai.session.id` | Hermes session id (parent session id for subagent spans) |
| `service.instance.id` | session id (now on the root too) |
| `user.id` | `sender_id` when non-empty |
| `latitude.tags` | `["hermes"]`, plus the platform when it is not `cli` |
| `latitude.metadata` | JSON: `hermes.session.id`, `hermes.task_id`, `hermes.turn_id`, `hermes.platform`, `hermes.profile`, `hermes.version`, `hermes.api_mode`, `hermes.provider`, `hermes.base_url`, and where known `hermes.parent_session_id`, `hermes.subagent.id`, `hermes.subagent.role` |
| `latitude.captured.content` | bool, as today |

`interaction` root:

| Attribute | Value |
| --- | --- |
| `span.type` | `interaction` |
| `interaction.kind` | `user` (subagent roots: `subagent`) |
| `user_prompt:gated` | `kw["user_message"]` (no history scan) |
| `gen_ai.input.messages:gated` | one user message built from `user_message` |
| `gen_ai.output.messages:gated` | last assistant output of the turn |
| `gen_ai.system_instructions:gated` | resolved system prompt (also on the root, since `invoke_agent` is allowed to carry it) |
| `gen_ai.agent.name` | subagent role, subagent roots only |
| `hermes.llm_calls`, `hermes.tool_calls` | as today |
| `hermes.turn.exit_reason` | `turn_exit_reason` from `on_session_end` |
| `hermes.turn.outcome` | `completed` / `interrupted` / `failed` |
| `interaction.duration_ms` | root duration |

`llm_request`:

| Attribute | Value |
| --- | --- |
| `span.type`, `gen_ai.operation.name` | `llm_request`, `chat` |
| `gen_ai.provider.name`, `gen_ai.system`, `model`, `gen_ai.request.model` | as today |
| `gen_ai.response.model` | `response_model` (F12) |
| `gen_ai.input.messages:gated` | normalized `request_messages` (F1) |
| `gen_ai.output.messages:gated` | normalized `assistant_message` |
| `gen_ai.system_instructions:gated` | from `system_prompt` (F2) |
| `gen_ai.tool.definitions:gated` | session tool snapshot (F3) |
| `gen_ai.request.max_tokens` | as today |
| `gen_ai.request.stream` | true when a stream start/delta was observed |
| `gen_ai.server.time_to_first_token` | ns, from the first delta (F8) |
| `gen_ai.usage.*` | as today, minus the dead `completion_tokens` mapping |
| `gen_ai.usage.cost` | only when Hermes reports `status == "actual"` (see [D6](#11-decisions)) |
| `gen_ai.response.finish_reasons` | as today |
| `llm_request.call_index`, `llm_request.duration_ms`, `hermes.api_duration_s` | as today |
| `hermes.retry_count`, `hermes.approx_input_tokens`, `hermes.message_count`, `hermes.tool_count` | new, from the hook |
| `error.type`, `error.message:gated`, `hermes.error.status_code`, `hermes.error.retryable`, `hermes.error.reason` | failed attempts (F6) |

`tool_call:<name>`: as today plus `gen_ai.tool.call.result:gated` from the real result, `tool.is_error` / `success` / `error.type` / `error.message:gated` from `status`/`error_type`/`error_message`, and `hermes.tool.duration_ms` from `duration_ms` (F5). OTLP `kind: 3`.

Memory span (`kind: 3`, name = the operation):

| Attribute | Value |
| --- | --- |
| `gen_ai.operation.name` | `search_memory` (session-start read), `upsert_memory` (write), `delete_memory` (store emptied) |
| `gen_ai.memory.store.id` | `hermes/<profile>` |
| `gen_ai.memory.record.id` | `MEMORY.md` or `USER.md` |
| `gen_ai.memory.record.count` | 1 |
| `gen_ai.memory.records:gated` | `[{"id": <record id>, "content": <full post-state body>}]`, body capped |
| `hermes.memory.entry_count`, `hermes.memory.chars`, `hermes.memory.limit_chars` | from the tool result's `entry_count` / `usage`, or counted from the file |
| `hermes.memory.action` | `add` / `replace` / `remove` / `batch` |

### 7.3 Memory model in detail

- **Store**: one per Hermes profile, `gen_ai.memory.store.id = "hermes/<profile_name>"` (`ctx.profile_name`, `"default"` when unset). The `hermes/` prefix keeps it distinct from claude-code stores in a shared project.
- **Records**: the two store files, `MEMORY.md` and `USER.md` — **one record per file, body = the whole file**. This is the granularity Latitude's ledger is built for: each mutating span carries the record's full new body, so the platform derives per-line diffs and per-line blame (which entry was written by which span) for free, and the Memory page shows a readable two-file tree. Per-entry records were rejected — `replace`/`remove` identify entries by an `old_text` substring, so entry-level record ids could not be resolved, and a rename is not representable in the OTEL model anyway ([D3](#11-decisions)).
- **Reads**: memory is injected into the system prompt as a frozen snapshot at session start, so it is read **once per session**. Emit one `search_memory` span per non-empty store on the first `pre_api_request` of a session (child of that turn's interaction), body read from disk. Reset the once-per-session latch on `on_session_start` and `on_session_reset`.
- **Writes**: on `post_tool_call` with `tool_name == "memory"` and `status == "ok"`, read the file back off disk (the tool has already persisted it under its own file lock, and `_success_response` deliberately does **not** echo the body) and emit one span per touched record: `upsert_memory` with the new body, or `delete_memory` when the file is now empty. `args.target` selects the record; a batch (`operations[]`) still touches one record, so it is still one span. Failed writes (`status == "error"`) emit no memory span — nothing changed.
- **Skipped when**: content capture is off (structure-only spans are still emitted, without `records`), memory telemetry is disabled by env, the store files do not exist, or `memory.provider` in `config.yaml` selects an external provider (Mem0/Supermemory/Honcho/… — the built-in files are then not the live store; see [Non-goals](#10-non-goals)).

---

## 8. Design, module by module

Current layout (all under `packages/telemetry/hermes/src/latitude_telemetry_hermes/`): `__init__.py`, `config.py`, `hooks.py`, `builder.py`, `messages.py`, `model.py`, `otlp.py`, `transport.py`, `util.py`. Keep the shape; add `memory.py`, `tools.py`, `redact.py`, `hermes.py` (the guarded in-process bridge to Hermes internals).

### 8.1 `messages.py` — the normalizer rewrite (F1, F17d)

Three dialects reach us, sometimes mixed inside one list. Detect **per item**, never per session:

| Dialect | Item shape | Emit |
| --- | --- | --- |
| Responses / Codex | `{"type":"message","role":…,"content":[{"type":"input_text"\|"output_text","text":…}]}` | `{role, parts:[{type:"text",content}]}` |
| | `{"type":"function_call","call_id","name","arguments":"<json string>"}` | assistant message with `{type:"tool_call", id: call_id, name, arguments: parsed}` |
| | `{"type":"function_call_output","call_id","output": str \| [{"type":"input_text","text"},{"type":"input_image",…}]}` | `{role:"tool", parts:[{type:"tool_call_response", id: call_id, response}]}` |
| | `{"type":"reasoning","encrypted_content":…,"summary":[…]}` | `{type:"reasoning", content: summary text}` when a non-empty summary exists, else **skip** (never export `encrypted_content`) |
| Chat Completions | `{"role":"assistant","content":…,"tool_calls":[{id,function:{name,arguments}}]}`, `{"role":"tool","tool_call_id","content"}` | as today (already correct) |
| Anthropic | content blocks `text` / `thinking` / `tool_use` / `tool_result` | as today (already correct) |

Rules:

- Consecutive `function_call` items collapse into **one** assistant message carrying several `tool_call` parts when they are adjacent; a `function_call` adjacent to a preceding assistant `message` item attaches to it. (Latitude pairs calls to responses by id, so grouping is cosmetic — but it makes the conversation read like the transcript.)
- `role` normalization: `developer` → `system`; unknown → `user` (as today); an item with **no** role is dispatched on `type` and must never be relabelled.
- An item that matches nothing recognisable becomes a single `text` part holding its JSON — with an explicit `hermes.unknown_item` count on the span so we can see it happening instead of shipping silent garbage.
- Never emit a part whose `type` is outside the `rosetta-ai` vocabulary (`text`, `reasoning`, `tool_call`, `tool_call_response`, `blob`, `uri`, `file`).
- Empty/whitespace-only parts stay dropped (the 0.1.2 fix); a message left with no parts is dropped.
- `_normalize_assistant` keeps handling the `assistant_message` object (`content` str/list, `reasoning`, `tool_calls`) and additionally the Responses-shaped `content` list.

`_system_prompt(kwargs)` becomes `system_instructions_from(system_prompt)`: `str` → one text part; `list` of blocks → concatenated text parts; `None` → fall back to a `role in {"system","developer"}` message in `request_messages` (Chat Completions path).

### 8.2 `tools.py` — tool definitions (F3)

`resolve_tool_definitions(kw) -> list[dict] | None`, resolved **once per session** and cached on the run registry:

1. `kw["request"]["body"]["tools"]` when `request` is a dict, is not `{"_truncated": true}`, and yields a non-empty list. Accept OpenAI (`{type:"function",function:{…}}`), Responses (`{type:"function",name,description,parameters}`) and Anthropic (`{name,description,input_schema}`) shapes verbatim — Latitude's `toToolDefinition` reads all three.
2. Otherwise the in-process snapshot: `from model_tools import get_tool_definitions; get_tool_definitions(quiet_mode=True)`, accepted **only if** `len(snapshot) == kw["tool_count"]` (the guard against a profile-filtered toolset differing from the unfiltered default). Guarded import, memoized.
3. Otherwise nothing — but always emit `hermes.tool_count`.

Emit on every `llm_request` span (per-span resolution is what `defined_tools` rolls up), gated as content. Cap the serialized array at a byte budget and drop `parameters` sub-schemas before dropping tools, so the tool **names** always survive.

### 8.3 `memory.py` — memory operations (F4)

```
MemoryStores.resolve()            -> {record_id: path} for MEMORY.md / USER.md, or {} when unavailable
MemoryStores.store_id()           -> "hermes/<profile>"
read_snapshot(record_id)          -> (body, entry_count, chars) | None
classify_write(args, result)      -> {record_id, operation, action, entry_count, chars, limit} | None
```

- Paths from `tools.memory_tool.get_memory_dir()` (guarded import; deliberately a function, not a constant, so `HERMES_HOME` and profile switches after import are respected), falling back to `${HERMES_HOME:-~/.hermes}/memories`.
- `entry_count` = `len(body.split("\n§\n"))` on a non-empty body (`ENTRY_DELIMITER = "\n§\n"`, `tools/memory_tool.py:78` — inline the literal rather than importing it); `chars` = file length; `limit` from the tool result's `usage` string (`"67% — 1,474/2,200 chars"`) when present.
- `store_id` uses `ctx.profile_name`, which is a **property**, not a method (`hermes_cli/plugins.py:1621`); it returns `"default"`, the profile id under `~/.hermes/profiles/<name>`, or `"custom"` for an unrecognized `HERMES_HOME`. Fallback when `ctx` is unavailable: `hermes_cli.profiles.get_active_profile_name()`, then `"default"`.
- Bodies are capped (`MEMORY_RECORDS_MAX_CHARS`, default 32 768 — both stores are ≤ 2 200/1 375 chars, so the cap is pure insurance) and the cap is applied to the **body**, not the serialized array, so the attribute stays parseable JSON for the materializer.
- Disabled by `LATITUDE_HERMES_MEMORY=0`; bodies suppressed by `LATITUDE_HERMES_MEMORY_CONTENT=0` or by the global no-content switch.
- External provider check: `hermes_cli.config.load_config_readonly().get("memory", {}).get("provider")` — when set to anything other than the built-in default, skip.

### 8.4 `builder.py` — spans and lifecycle

- **Generation key** becomes `f"{api_call_count}:{retry_count}"` (F6). `api_request_error` closes the keyed span with the error attributes and leaves the run open for the retry; `pre_api_request` no longer needs `_abandon`-on-supersede.
- **Interruption vs failure** (F7): `on_session_end` passes `completed`/`failed`/`interrupted`/`turn_exit_reason` into `finish_scoped`. An interrupted turn closes open spans with `status = OK`, `hermes.turn.outcome = interrupted`, `hermes.span.closed_reason = turn_interrupted` — no `error.type`. A failed turn keeps `status = error` with `error.type = turn_failed`. Only a genuinely unexplained leftover keeps `abandoned`.
- **TTFT** (F8): a `StreamWatch` keyed `(turn_id, iteration)` records `stream_started_at` on `on_stream_start` and the first delta timestamp on `on_stream_delta`. When the generation span closes, `gen_ai.server.time_to_first_token = max(0, first_delta_ms - span.start_ms) * 1e6` and `gen_ai.request.stream = true`. Drop the value when it exceeds the span duration (Latitude would discard it anyway) and expire watches with the run.
- **Identity** (F9): `sender_id` and `parent_session_id` captured at `pre_llm_call`, stored per session, applied by `_context`.
- **Subagents** (F10): a registry keyed by `child_session_id` holds `{parent_session_id, parent_turn_id, child_role, child_subagent_id, trace_id, parent_span_id}` where the parent span is the open `delegate`-family tool span of the parent run at `subagent_start` (fall back to the parent's interaction root). A run started for a session present in that registry inherits the parent's `trace_id`, parents its interaction root at the recorded span, sets `interaction.kind = subagent`, `gen_ai.agent.name = child_role`, `subagent.id = f"{child_role}:{child_subagent_id}"`, `subagent.name`/`subagent.type = child_role`, and reports `session.id` as the **parent** session so the delegation reads as one Latitude session. `subagent_stop` records `hermes.subagent.status`, `hermes.subagent.summary:gated`, `hermes.subagent.duration_ms` on the child's root and clears the registry entry.
- **Eviction never drops data** (F13): `_evict_locked` finalizes and ships the evicted run instead of popping it.
- **Root prompt** from `user_message` (F17b); `service.instance.id` on the root (F17a); `kind: 3` for tool and memory spans (F17f).

### 8.5 `transport.py` — export path (F13, F14)

Replace thread-per-payload with a single daemon exporter:

- `queue.Queue(maxsize=EXPORT_QUEUE_MAX)` of **span batches**; `_ship` enqueues and never blocks (drop-oldest with a debug log when full).
- The exporter drains the queue, coalescing queued spans into one OTLP request up to `EXPORT_MAX_PAYLOAD_BYTES` (default **4 MiB**, well under the 32 MiB ingest cap), then POSTs. Idle → immediate send; busy → natural batching.
- Retries: `429`, `503`, `5xx` and network errors retry up to 3 times with jittered backoff, honouring `Retry-After`; then drop with a debug log. `4xx` other than 429 never retries.
- Spans are shipped **as they close**, and each span id exactly once ([D5](#11-decisions) — `traces_mv` would double-count a resend). The `interaction` root is the last span of its turn to ship.
- Per-span content budget `LATITUDE_HERMES_MAX_CONTENT_CHARS` (default **262 144** per attribute): middle-out truncation of the message array with an explicit omission marker message, so a pathological turn cannot produce an unshippable span.
- `_flush(timeout)` waits for an empty queue and no in-flight request. `on_session_end` → 2 s (off the turn's critical path), `on_session_finalize` → 10 s, plus an `atexit` hook at 10 s so one-shot `hermes -z` runs still land ([D7](#11-decisions)).

### 8.6 `redact.py` — secret redaction (F15)

`redact(text) -> str` wrapping `agent.redact.redact_sensitive_text(text, force=True, redact_url_credentials=True)`, applied to every gated string on the way into the span (messages, system instructions, tool args/results, memory bodies, subagent summaries).

- `force=True` because a telemetry egress is exactly the "safety boundary that must never return raw secrets" the Hermes docstring describes — it must not depend on the user's `security.redact_secrets` logging preference.
- Bounded memo dict keyed by string hash (`REDACT_CACHE_MAX`, default 4 096) so re-exporting the same replayed history on every span costs one pass, not one per span.
- Default **on** (`LATITUDE_HERMES_REDACT_SECRETS=0` to disable). If the guarded import fails (Hermes internals moved), export continues unredacted, `hermes.redaction.applied=false` goes on the span, and a one-time `logger.warning` fires — visible degradation rather than a silent privacy claim.

### 8.7 `config.py` — configuration (F16)

- Resolution order per key: env var → `ctx.get_config(key)` (i.e. `plugins.entries.latitude.settings.<key>` in `config.yaml`) → default. `register(ctx)` stashes the accessor and `ctx.profile_name` before any hook can fire.
- Re-read the config on `on_session_start` instead of caching forever, so credentials added after import take effect on the next session.
- `PKG_VERSION` stays the single source of the exported `service.version` / scope version and must match `pyproject.toml`; add a test asserting they agree.

### 8.8 `hooks.py` — registrations

Registered set becomes: `pre_api_request`, `post_api_request`, `api_request_error`, `pre_llm_call`, `post_llm_call`, `pre_tool_call`, `post_tool_call`, `on_stream_start`, `on_stream_delta`, `on_stream_end`, `on_session_start`, `on_session_end`, `on_session_finalize`, `on_session_reset`, `subagent_start`, `subagent_stop`. Every handler stays gated on config and fail-open. `on_stream_delta` must return in O(1) — a lock, a dict probe and possibly one timestamp write — because Hermes builds and enqueues a payload per delta once any callback is registered; `LATITUDE_HERMES_STREAM_TTFT=0` skips the delta registration entirely for users who would rather not pay it.

---

## 9. Configuration surface

Existing (unchanged): `LATITUDE_API_KEY`, `LATITUDE_PROJECT` / `LATITUDE_PROJECT_SLUG`, `LATITUDE_BASE_URL`, `LATITUDE_HERMES_TELEMETRY_ENABLED` / `LATITUDE_TELEMETRY_ENABLED`, `LATITUDE_HERMES_NO_CONTENT` / `LATITUDE_NO_CONTENT`, `LATITUDE_DEBUG`.

New:

| Env | Default | Meaning |
| --- | --- | --- |
| `LATITUDE_HERMES_MEMORY` | `1` | Emit `gen_ai.memory.*` spans for the built-in stores |
| `LATITUDE_HERMES_MEMORY_CONTENT` | `1` | Include record bodies (`gen_ai.memory.records`) |
| `LATITUDE_HERMES_REDACT_SECRETS` | `1` | Run exported content through Hermes's secret redactor |
| `LATITUDE_HERMES_STREAM_TTFT` | `1` | Subscribe to stream deltas to measure TTFT |
| `LATITUDE_HERMES_MAX_CONTENT_CHARS` | `262144` | Per-attribute content budget before middle-out truncation |
| `LATITUDE_HERMES_TOOL_DEFINITIONS` | `1` | Emit `gen_ai.tool.definitions` |

Every key is also readable from `config.yaml` under `plugins.entries.latitude.settings.<snake_case_key>` (`api_key`, `project`, `base_url`, `no_content`, `memory`, `redact_secrets`, …), env taking precedence.

---

## 10. Non-goals

- **External memory providers** (Mem0, Supermemory, Honcho, ByteRover, …). They have no plugin hook and their own read/write semantics; the built-in-store telemetry disables itself when one is active. A provider adapter is future work.
- **`session_search`, skills, kanban, gateway platform events, slash commands, approvals.** Interesting, none of it maps to a Latitude entity today. (Approval waits on a tool span are the most tempting; deliberately deferred.)
- **Emitting cost for subscription-included routes.** Hermes reports `status="included"` / `$0` for OAuth Codex; a zero is treated as absent by Latitude anyway, and the catalog estimate is the more useful number. See [D6](#11-decisions).
- **Gzip / protobuf OTLP.** `apps/ingest` decodes neither for this path; payload control is by construction.
- **Per-attribute redaction allowlists** (claude-code's `LATITUDE_REDACT_ATTRIBUTES`). The secret redactor plus the no-content switch cover the dogfood need; revisit if asked.
- **Changing Latitude's ingest, resolvers or schema.** This PR is emitter-side only. Platform gaps found on the way are listed in [Platform-side follow-ups](#platform-side-follow-ups-out-of-scope).

---

## 11. Decisions

**D1 — Normalize per item, not per api_mode.** `api_mode` is available on the hooks, but a single `request_messages` list can hold both plain dicts and adapter-normalized items, and Hermes adds api modes over time. Dispatching on the item's own shape degrades gracefully; branching on `api_mode` would silently drop content the day a new mode ships.

**D2 — The last `llm_request` of a turn is the conversation.** Latitude assembles the trace conversation from that span's `input_messages` plus its `output_messages`, so fixing the normalizer is the whole fix for the user's "the conversation is only the prompt and the final answer" report. No extra aggregate attribute on the root is needed (and the root's messages are ignored by the conversation query anyway).

**D3 — One memory record per store file, body = whole file.** Rejected: one record per `§` entry. `replace`/`remove` address entries by an `old_text` substring, so a stable per-entry record id is not derivable from the hook payload, and the OTEL model has no rename. Whole-file records give Latitude exactly what its git-style ledger wants (a full new body per mutating span) and yield per-entry blame for free from the line diff.

**D4 — Read the post-state body off disk.** `_success_response` deliberately omits the entry list, so the tool result cannot supply the new body; replaying the operation against a local replica would risk publishing a body that never existed. Reading the file after a successful write is exact, and it is the technique `packages/telemetry/claude-code/src/memory.ts` already uses. Mismatch guard: compare the file's entry count against the result's `entry_count` and, when they disagree (concurrent sister-session write), emit the span **without** `records`.

**D5 — Every span id is shipped exactly once.** `spans` is a `ReplacingMergeTree` but `traces_mv`/`sessions_mv` are additive per-insert rollups, so a resent span inflates span counts, tokens and cost. Consequence: the root's aggregate attributes are only known at turn end, so the root always ships last, and a hard `SIGKILL` mid-turn leaves a rootless trace (strictly better than today, where it loses the whole turn).

**D6 — Emit `gen_ai.usage.cost` only for `status == "actual"`.** Hermes's `estimate_usage_cost` returns `actual` (provider-reported), `estimated` (its own catalog), `included` (subscription) or `unknown`. Only `actual` beats Latitude's catalog; `estimated` would present one estimate as authoritative and flip `costIsEstimated` to false, and `included`/`unknown` are zero/absent. Record `hermes.cost.status` and `hermes.cost.label` on the span regardless, so a `$83` catalog estimate on a subscription session is explainable in the UI rather than mysterious.

**D7 — Flush budget follows the hook's meaning.** `on_session_end` is a per-turn event on the user's critical path → 2 s. `on_session_finalize` is teardown → 10 s. `atexit` is the one-shot safety net → 10 s. With incremental shipping the queue is normally empty at turn end, so the common case costs nothing.

**D8 — Importing Hermes internals is allowed, always guarded.** The bundled `langfuse` plugin imports `agent.usage_pricing`; the claude-code emitter reads the filesystem. We import `tools.memory_tool.get_memory_dir`, `model_tools.get_tool_definitions`, `hermes_cli.config.load_config_readonly` and `agent.redact.redact_sensitive_text` — each behind `try/except` with a working fallback, each isolated in `hermes.py`/`redact.py` so a Hermes refactor breaks one function, not the plugin. Hook kwargs remain the primary source; internals are only for what no hook exposes.

**D9 — Subagent spans join the parent session.** A delegated child has its own Hermes `session_id`; reporting that as `session.id` splits one user-visible task into two Latitude sessions with no link. Reporting the parent's session id (and keeping the child's own id in metadata as `hermes.subagent.session_id`) makes the delegation one session and one trace tree, which is what `buildAgentGraph` and the agent-name rollup expect.

---

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| `on_stream_delta` costs the agent a payload build per token | O(1) callback; `LATITUDE_HERMES_STREAM_TTFT=0` opt-out; documented |
| TTFT is measured on the observer thread, so it is an upper bound | Documented; values above the span duration are dropped (Latitude discards them anyway) |
| Guarded Hermes-internal imports break on a Hermes upgrade | One helper per import, each with a fallback; `hermes.redaction.applied` / absent tool definitions make the degradation visible; a Hermes-version attribute on every span makes it diagnosable |
| Reading memory files touches the user's disk on the hot path | Two files ≤ 2 200 chars, read once per session plus once per memory write; failures are swallowed |
| Middle-out truncation could hide the tail of a huge conversation | Budget is per attribute and generous (256 KB); the omission marker is explicit in the exported messages |
| Redaction changes exported content, so a user searching for a literal secret-shaped string in Latitude finds a mask | Documented in the README/docs privacy section; `LATITUDE_HERMES_REDACT_SECRETS=0` opts out |
| The hook set assertion in `tests/test_plugin.py` fails loudly on every new registration | Intentional; update it in the same commit as the registration |

---

## 13. Verification plan

**Unit (pytest, `uv run pytest` in `packages/telemetry/hermes`)** — every milestone lands its own tests. Fixtures must include a **real Responses-API item list** (message + `function_call` + `function_call_output` + `reasoning`), a Chat Completions list, and an Anthropic block list, all through one normalizer.

**Live dogfood** on the Hermes VM (Hermes 0.20.5, project `alescript`):

1. Build and install the branch into Hermes's venv:
   `~/.hermes/bin/uv pip install --python ~/.hermes/hermes-agent/venv/bin/python <path-or-wheel>`
2. Run a session that exercises: several tool calls, one tool **failure**, one memory write (`memory` tool), one interruption, one API retry if one can be provoked, and one `delegate` call.
3. Confirm through the Latitude MCP (`latitude-production`, project `alescript`):

| Check | Query | Expected |
| --- | --- | --- |
| System instructions | `getSession` / `getTrace` | first message is `role: "system"` with real prompt text |
| Tool calls in the conversation | `getTrace` | `assistant` messages carry `tool_call` parts, `tool` messages carry `tool_call_response`; **no** `output_text` part anywhere |
| Tool definitions | `listSessions` / `listTools` | `definedTools` non-empty; the Tools page lists offered-but-uncalled tools |
| Tool errors | `querySpans` `{toolName, status: error}` | the failed tool call is `statusCode: error` with `errorType`/message |
| TTFT + streaming | `listTraceSpans` | `timeToFirstTokenNs > 0`, `isStreaming: true` on `llm_request` spans |
| Failed attempts | `querySpans` `{status: error}` | `errorType` is a real classification, never `abandoned`; interrupted turns are **not** errors |
| Memory | `listMemoryStores`, `getSessionMemory`, `getMemoryStoreDiff` | store `hermes/<profile>` with records `MEMORY.md`/`USER.md`; session footprint shows read tokens and a write diff; the diff view shows the entry added |
| Identity | `listSessions` | `userId` set for a gateway/Slack session |
| Subagent | `listTraceSpans` on the delegating trace | the child's `interaction` is nested under `tool_call:delegate`; `agentNames` non-empty |
| Payload health | `LATITUDE_DEBUG=1` stderr | every POST logs `HTTP 202`; no `413`/`429` retries exhausted; no dropped batches |

**Regression guard**: re-run the largest turn shape from the evidence session (110 spans) and confirm no single request exceeds 4 MiB and the turn ships completely.

---

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`
>
> One PR, `hermes/telemetry-fidelity` → `development`. Each milestone is a commit. `pnpm` is not involved; the package is Python: `cd packages/telemetry/hermes && uv sync && uv run pytest && uv run ruff check .`

### Milestone 1 — Conversation fidelity (F1, F2, F17d)

- [ ] **M1-1**: Add `tests/test_messages.py` cases for a Responses-API item list (`message`/`output_text`, `function_call`, `function_call_output` as string **and** as content array, `reasoning` with and without a summary), asserting parts land as `text` / `tool_call` / `tool_call_response` / `reasoning` and that no `output_text` part is ever emitted. Write them **before** the rewrite so the current failure is recorded.
- [ ] **M1-2**: Rewrite `messages.py` per [8.1](#81-messagespy--the-normalizer-rewrite-f1-f17d): per-item dialect dispatch, `role`-less item handling, `developer`→`system`, adjacent `function_call` grouping, `encrypted_content` never exported, unknown items as JSON text plus a counter.
- [ ] **M1-3**: Replace `_system_prompt(messages)` with `system_instructions_from(system_prompt)` handling `str` / block list / `None` (+ Chat-Completions fallback); read `kw["system_prompt"]` in `on_pre_api_request` and set `gen_ai.system_instructions:gated` on the `llm_request` span **and** the interaction root.
- [ ] **M1-4**: Use `kw["user_message"]` for the root's `user_prompt` / input message; delete `_last_user_text`.
- [ ] **M1-5**: Keep the Chat-Completions and Anthropic paths green (existing tests must pass unchanged).

**Exit gate**: a fixture Responses-API turn round-trips into `[system, user, assistant(text), assistant(tool_call), tool(tool_call_response), assistant(text)]`; no part type outside the `rosetta-ai` vocabulary is emitted; `uv run pytest` green.

### Milestone 2 — Tool fidelity (F3, F5, F17f)

- [ ] **M2-1**: `tools.py` with `resolve_tool_definitions` (sanitized-`request` path, `_truncated` detection, in-process snapshot gated on `tool_count`, byte budget that sheds `parameters` before tools), memoized per session.
- [ ] **M2-2**: Emit `gen_ai.tool.definitions:gated` on every `llm_request` span, plus `hermes.tool_count`.
- [ ] **M2-3**: Fix `on_post_tool_call` to read `status` / `error_type` / `error_message` / `duration_ms`; set `tool.is_error`, `success`, `error.type`, `error.message:gated`, `hermes.tool.duration_ms`; drop the `is_error` kwarg and the recomputed duration.
- [ ] **M2-4**: Export tool spans (and later memory spans) as OTLP `kind: 3`.
- [ ] **M2-5**: Tests: definitions resolved from an untruncated `request`; skipped on `{"_truncated": true}`; snapshot accepted only on a `tool_count` match; error status mapped from `status="error"`.

**Exit gate**: a fixture turn yields non-empty `gen_ai.tool.definitions` and a failed tool call exports `status=error` with the message.

### Milestone 3 — Error, interruption and retry semantics (F6, F7, F12, F17c)

- [ ] **M3-1**: Key generation spans by `(api_call_count, retry_count)`.
- [ ] **M3-2**: Register `api_request_error`; close the keyed span with `error.type` from `reason`/`error`, `hermes.error.status_code`, `hermes.error.retryable`, `hermes.error.reason`, `error.message:gated`.
- [ ] **M3-3**: Thread `completed` / `failed` / `interrupted` / `turn_exit_reason` from `on_session_end` into `finish_scoped`; close interrupted turns as OK with `hermes.turn.outcome=interrupted` and `hermes.span.closed_reason`; keep `abandoned` only for genuinely unexplained leftovers.
- [ ] **M3-4**: `gen_ai.response.model` from `response_model`; drop the dead `completion_tokens` mapping; add `hermes.retry_count`, `hermes.approx_input_tokens`, `hermes.message_count`.
- [ ] **M3-5**: Register `on_stream_end` and attach `hermes.stream.error` when a stream ends unfinished.
- [ ] **M3-6**: Tests: a retried attempt produces two spans, the first with a real error type; an interrupted turn produces no error span.

**Exit gate**: no span exports `error.type=abandoned` for a retry or an interruption.

### Milestone 4 — Performance and identity signals (F8, F9, F11, F17a)

- [ ] **M4-1**: `StreamWatch` + `on_stream_start` / `on_stream_delta` registrations behind `LATITUDE_HERMES_STREAM_TTFT`; emit `gen_ai.server.time_to_first_token` (ns) and `gen_ai.request.stream`; discard TTFT above the span duration.
- [ ] **M4-2**: Capture `sender_id` / `parent_session_id` at `pre_llm_call`; emit `user.id`; add `hermes.parent_session_id` to metadata.
- [ ] **M4-3**: Enrich `latitude.metadata` per [7.2](#72-attributes) (platform, profile, Hermes version, api_mode, provider, base_url, turn id, finish/exit reasons) and add the platform tag when it is not `cli`.
- [ ] **M4-4**: `service.instance.id` on the interaction root; `interaction.duration_ms`.
- [ ] **M4-5**: Optional cost: guarded `agent.usage_pricing.estimate_usage_cost`; emit `gen_ai.usage.cost` only when `status == "actual"`; always record `hermes.cost.status` / `hermes.cost.label`.
- [ ] **M4-6**: Tests: TTFT computed from a synthetic delta; TTFT dropped when implausible; `user.id` present when `sender_id` is set; cost emitted only for `actual`.

**Exit gate**: a fixture streaming turn reports a positive TTFT and `isStreaming`; metadata carries platform/profile/version.

### Milestone 5 — Memory telemetry (F4)

- [ ] **M5-1**: `memory.py`: store/record resolution via guarded `get_memory_dir()` with an env fallback, `store_id = "hermes/<profile>"`, `§`-entry counting, body cap, external-provider detection.
- [ ] **M5-2**: Session-start read: one `search_memory` span per non-empty store on the first `pre_api_request` of a session, child of the interaction root, `records` from disk; latch reset on `on_session_start` / `on_session_reset`.
- [ ] **M5-3**: Writes: on `post_tool_call` for `tool_name == "memory"` with `status == "ok"`, emit `upsert_memory` (or `delete_memory` when the store is now empty) as a **child of the tool span**, body read back from disk, with `hermes.memory.*` counters and the entry-count mismatch guard from [D4](#11-decisions).
- [ ] **M5-4**: Honour `LATITUDE_HERMES_MEMORY` / `LATITUDE_HERMES_MEMORY_CONTENT` and the global no-content switch (structure-only spans keep `store.id`/`record.id`/`record.count`).
- [ ] **M5-5**: Tests with a temp `HERMES_HOME`: read span on first request only; add/replace/remove classification; empty store → `delete_memory`; failed tool call → no span; mismatch guard drops `records`; provider set → nothing emitted.

**Exit gate**: a fixture session with one memory write emits exactly one `search_memory` and one `upsert_memory` span carrying the file's post-state body.

### Milestone 6 — Subagent graph (F10)

- [ ] **M6-1**: Subagent registry fed by `subagent_start`, resolving the parent's open `delegate`-family tool span (fallback: the parent's interaction root).
- [ ] **M6-2**: A run whose `session_id` is a registered child inherits the parent's `trace_id`, parents its root at the recorded span, reports the **parent** `session.id`, and sets `gen_ai.agent.name` / `subagent.*` / `interaction.kind=subagent`.
- [ ] **M6-3**: `subagent_stop` writes status, gated summary and duration onto the child's root and clears the entry (with a bound on registry size so a leaked child cannot grow it forever).
- [ ] **M6-4**: Tests: child spans share the parent trace id and parent session id; `gen_ai.agent.name` set; registry cleared on stop.

**Exit gate**: a fixture delegation produces one trace whose tree contains the child interaction under `tool_call:delegate`.

### Milestone 7 — Export path hardening (F13, F14)

- [ ] **M7-1**: Single daemon exporter thread + bounded queue; drop-oldest with a debug log; `_ship` never blocks.
- [ ] **M7-2**: Batch coalescing under `EXPORT_MAX_PAYLOAD_BYTES` (4 MiB); ship spans as they close; root last; every span id exactly once.
- [ ] **M7-3**: Retry with jittered backoff on 429/503/5xx/network, honouring `Retry-After`; never retry other 4xx.
- [ ] **M7-4**: Per-attribute content budget with middle-out truncation and an explicit omission marker.
- [ ] **M7-5**: Flush budgets per [D7](#11-decisions) (2 s / 10 s / `atexit`).
- [ ] **M7-6**: `_evict_locked` finalizes and ships instead of dropping.
- [ ] **M7-7**: Tests: a 200-span turn splits into several sub-4-MiB payloads with no duplicate span ids; a 503 then 202 lands the batch; queue-full drops are logged; truncation marker present and the attribute stays valid JSON.

**Exit gate**: the replayed 110-span turn ships completely, no request over 4 MiB, no duplicate span ids.

### Milestone 8 — Privacy and configuration (F15, F16)

- [ ] **M8-1**: `redact.py` with `force=True`, URL-credential redaction, bounded memo cache, `hermes.redaction.applied` attribute and the one-time warning on import failure.
- [ ] **M8-2**: Apply redaction to every gated string (messages, system instructions, tool args/results, memory bodies, subagent summaries).
- [ ] **M8-3**: `config.py`: env → `ctx.get_config` → default; capture `ctx.profile_name`; re-read config on `on_session_start`; test that `PKG_VERSION` matches `pyproject.toml`.
- [ ] **M8-4**: Register the full hook set in `hooks.py` and update the exact-set assertion in `tests/test_plugin.py`.
- [ ] **M8-5**: Tests: a secret-shaped token in a tool result is masked in the exported span; redaction disabled by env leaves it; `config.yaml` settings are read when the env is empty.

**Exit gate**: a fixture turn containing an `sk-`-shaped token exports it masked; the registered hook set matches [8.8](#88-hookspy--registrations).

### Milestone 9 — Docs, version, QA (repo hygiene)

- [ ] **M9-1**: New `dev-docs/hermes-telemetry.md`: hook contract table, trace shape, attribute tables, memory model, export path, config surface, privacy, package layout — written as the final intended system (sibling in depth to `dev-docs/pi-telemetry.md`).
- [ ] **M9-2**: Update `packages/telemetry/hermes/README.md` and `docs/telemetry/hermes.md`: new env vars, memory section, privacy section (secret redaction on by default, what is still exported), trace-shape diagram, subagent nesting.
- [ ] **M9-3**: Bump `pyproject.toml` + `PKG_VERSION` to **0.2.0** and write the `CHANGELOG.md` entry (Added / Fixed / Changed) — required for any published `packages/telemetry/*` change.
- [ ] **M9-4**: Refresh the `hermes` entry in `apps/web/.../onboarding-integration-snippets.ts` only if the install/enable steps changed (they should not).
- [ ] **M9-5**: Update `specs/telemetry-qa.md` row **59** with what was verified live, and flip the status to ✅ **only after the user approves the dogfood run**.
- [ ] **M9-6**: File the platform-side follow-ups below as GitHub issues; do not fix them here.

**Exit gate**: `uv run pytest` and `uv run ruff check .` green; docs describe the shipped behaviour; version and changelog bumped; QA row updated.

---

## Platform-side follow-ups (out of scope)

Found while investigating; **not** emitter bugs, do not fix in this PR.

1. **Session rollup lags behind its traces.** For session `20260825_095742_7b42ec`, `listSessions`/`getSession` report `traceCount: 12`, `spanCount: 234`, `endTime: 11:07:06`, while `listSessionTraces` returns **17** traces summing **356** spans and running to `11:21:58`. The five missing traces (`33a95fe2…`, `1fe1f5df…`, `04145812…`, `35eee3bc…`, `88fce1eb…`) all carry the same `session_id` in their own rows, so `sessions_mv` stopped absorbing that session's later inserts. Worth a look at the session materialization; it makes session-level cost and token numbers under-report.
2. **Unknown message part types render raw.** An `output_text` part reached storage and the conversation UI showed the JSON blob. `normalizeGenAIMessages` already rewrites vendor spellings (`thinking`, `binary`, `result`); adding the Responses vocabulary (`output_text` / `input_text` → `text`, `function_call` → `tool_call`, `function_call_output` → `tool_call_response`) would make **any** Responses-dialect emitter render correctly, not just this plugin. Emitter-side normalization (M1) is still the right fix for us; this is defence in depth.
3. **Cost on subscription-included routes.** Latitude priced this session at ≈ $83 of catalog value although the user paid nothing (OAuth Codex subscription). The number is defensible as list-price equivalent, but there is no way for an emitter to say "this route is included". A `gen_ai.usage.cost.status`-style hint (or accepting an explicit zero as authoritative) would let harnesses report reality.
