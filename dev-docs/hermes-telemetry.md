# Hermes Agent telemetry

`packages/telemetry/hermes` (pip: `latitude-telemetry-hermes`) is a [Hermes Agent](https://github.com/NousResearch/hermes-agent) plugin that streams sessions to Latitude as OTLP/HTTP JSON. Hermes is a Python harness, so this connector ships as a pip package rather than npm — the counterpart to `packages/telemetry/{claude-code,pi,openclaw}`.

Sibling docs: [`pi-telemetry.md`](pi-telemetry.md), [`claude-code-telemetry.md`](claude-code-telemetry.md), [`spans.md`](spans.md) (attribute resolution, trace/session conversation assembly), [`memory-observability`](../specs/memory-observability.md) (the `gen_ai.memory.*` contract). Public page: [`docs/telemetry/hermes.md`](../docs/telemetry/hermes.md).

## User install model

Hermes discovers pip plugins through the `hermes_agent.plugins` entry point and calls the module's `register(ctx)`. Two traps worth knowing before debugging anyone's install:

- The plugin must land in **Hermes's own venv** (`~/.hermes/hermes-agent/venv`), not the shell's Python. The official installer isolates Hermes, so a plain `pip install` from another interpreter is never discovered.
- `hermes plugins list/enable/disable` only scans bundled and `~/.hermes/plugins/` directory plugins, so it reports a working pip plugin as "not installed or bundled" ([hermes-agent#23802](https://github.com/NousResearch/hermes-agent/issues/23802)). Enablement is the `plugins.enabled` list in `config.yaml`; verification is `LATITUDE_DEBUG=true`.

Both `config.yaml` and `.env` are **profile-scoped** (`~/.hermes/profiles/<name>/`), which is what makes "one profile per agent" the recommended multi-agent layout: credentials, tags, metadata, sessions and memory are all already isolated.

## Re-deriving the ground truth

Everything below was verified against the Hermes source, not its docs. **PyPI lags the tree** (0.19.0 there against 0.20.5 running), so read the repo:

```bash
cd /tmp && rm -rf hermes-src && mkdir hermes-src && cd hermes-src
curl -sSL "https://codeload.github.com/NousResearch/hermes-agent/tar.gz/refs/heads/main" -o main.tar.gz
tar xzf main.tar.gz    # → hermes-agent-main
```

Where the answers live, when a hook's real payload is in doubt:

| Question | File |
| --- | --- |
| Which hooks exist | `hermes_cli/plugins.py` → `VALID_HOOKS` |
| A hook's authoritative kwargs | its fire site, never the docs: `agent/conversation_loop.py` (`pre`/`post_api_request`), `run_agent.py` (`api_request_error`, stream hooks), `agent/turn_context.py` (`pre_llm_call`), `agent/turn_finalizer.py` (`post_llm_call`, `on_session_end`), `model_tools.py` (`post_tool_call`), `tools/delegate_tool.py` (subagents) |
| Sample payloads for every hook | `hermes_cli/hooks.py` |
| Payload sanitizing and truncation | `run_agent.py` `_api_request_payload_for_hook`, `_sanitize_hook_payload` |
| Usage and cost | `agent/usage_pricing.py` (`CanonicalUsage`, `estimate_usage_cost`, `resolve_billing_route`) |
| The ledger's schema | `hermes_state_common.py` → `session_model_usage` |
| The plugin facade | `hermes_cli/plugins.py` `PluginContext` |
| Memory stores | `tools/memory_tool.py` (`get_memory_dir`, `ENTRY_DELIMITER`, `_success_response`) |
| Background-review fork | `run_agent.py` `_spawn_background_review`, `agent/background_review.py` |

## Hook contract

Hermes dispatches with `invoke_hook(name, **kwargs)`: keyword arguments only, exceptions swallowed per callback, and `telemetry_schema_version="hermes.observer.v1"` added to every payload. The registered set (`hooks.py`):

| Hook | What we take from it |
| --- | --- |
| `pre_api_request` | Opens the `llm_request` span. `system_prompt` (resolved by Hermes across all three dialects), `request_messages`, `request.body.tools`, `retry_count`, `tool_count`, `approx_input_tokens`, `message_count`, `max_tokens` |
| `post_api_request` | Closes it: `response_model` (the real model, not the requested one), `usage`, `assistant_message`, `finish_reason`, `api_duration` |
| `api_request_error` | A genuinely failed attempt: `status_code`, `retryable`, `reason`, `max_retries`, `error` |
| `pre_llm_call` | Turn framing plus identity: `sender_id` is the platform user id, `parent_session_id` the delegating session |
| `post_llm_call` | Ships a turn that ended on a tool call or was cut short |
| `pre_tool_call` / `post_tool_call` | Tool spans. `status`, `error_type`, `error_message`, `duration_ms` — Hermes measures the duration for us |
| `on_stream_start` / `on_stream_delta` / `on_stream_end` | `gen_ai.request.stream`, TTFT, stream-level failure |
| `on_session_start` / `on_session_reset` | Re-read config; release the once-per-session memory-read latch |
| `on_session_end` | Per **turn** finalization: `completed` / `failed` / `interrupted` / `turn_exit_reason` |
| `on_session_finalize` | Teardown: auxiliary-usage reconciliation, then the long flush |
| `subagent_start` / `subagent_stop` | The delegation graph |

`transform_*` hooks must never be registered — a non-`None` return mutates the agent's behaviour.

### Traps in the payloads

1. **`request` is aggressively truncated.** `_api_request_payload_for_hook` caps strings at 8 000 chars and sequences at 200 items, retries at 1 000/50, then collapses the whole payload to `{"_truncated": true, "preview": …}` above `HERMES_PLUGIN_PAYLOAD_MAX_CHARS` (50 000). So `request.body.tools` is intact early in a session and useless later — hence the in-process snapshot fallback in `tools.py`. `request_messages`, `conversation_history` and `user_message` are raw passthroughs and are neither truncated nor redacted.
2. **`system_prompt` is a `str` *or* a list of content blocks.** Codex/Responses puts it in `instructions`, Anthropic in `system`, Chat Completions in `messages[0]`; Hermes resolves all three into this kwarg, so never read it out of the messages.
3. **`usage` keys are `CanonicalUsage` fields**: `input_tokens` (additive, excludes cache), `output_tokens` (**inclusive** of reasoning), `cache_read_tokens`, `cache_write_tokens`, `reasoning_tokens`. There is no `completion_tokens`. Sending `total_tokens` is load-bearing: it is the arithmetic Latitude's `resolveTokens` uses to infer additive-input/inclusive-output.
4. **`api_request_id` is stable across retries** (`{turn_id}:api:{api_call_count}`), so generation spans are keyed `(api_call_count, retry_count)`. `post_api_request` and `api_request_error` do not always report the same `retry_count` as the `pre_api_request` that opened the span, so there is a same-`api_call_count` fallback.
5. **`on_session_end` fires per turn**, not per session, and it is on the user's critical path — hence the 2 s flush budget there against 10 s at finalize.
6. **Stream hooks are delivered off the token path** through a bounded queue that drops its oldest events under back-pressure, so a first delta can be missed and delivery is slightly late. TTFT is an upper bound, and a value past the span's own duration is dropped.
7. **`on_stream_delta` does not fire for every streamed turn.** `on_stream_start` fires before the request on every streaming call, so `gen_ai.request.stream` is reliable — but the visible-text path for a turn that ends in tool calls streams through the scrubber-flush branch (`run_agent.py` ~6609), which calls the display callbacks directly without enqueuing the plugin hook, and reasoning deltas require `plugins.stream_reasoning_deltas: true` in Hermes's own config. In the reference dogfood session every assistant turn finished with `tool_calls`, so **no delta reached the plugin and TTFT was absent from every span**. Setting `plugins.stream_reasoning_deltas: true` in Hermes's own config is what makes TTFT land, and it is documented as a **required setup step** on the public page rather than an optional tweak — with it on, round 2 reported TTFT on 51 of 53 calls (1.2–13.1 s). Without it, treat TTFT as absent rather than sparse. Upstream issues were declined, so this constraint is permanent from our side.

## Trace shape

One trace per Hermes **turn**, keyed `(task_id|session_id, turn_id)`.

```
interaction                                    span.type=interaction     → invoke_agent
├── search_memory                              (once per session, per non-empty store)
├── llm_request  (call 1, attempt 1)           span.type=llm_request     → chat   [failed attempt]
├── llm_request  (call 1, attempt 2)
├── tool_call:terminal                         span.type=tool_execution  → execute_tool  (kind 3)
├── tool_call:memory
│   └── upsert_memory                          gen_ai.operation.name     → upsert_memory (kind 3)
├── llm_request  (call 2)
└── tool_call:delegate
    └── interaction  (subagent)                gen_ai.agent.name=<child_role>
        ├── llm_request …
        └── tool_call:… …
```

Tool spans are **siblings** of `llm_request` spans under the interaction (a tool runs after a model call returns, not during it — same rationale as `pi-telemetry.md`). Memory spans are **children of the tool span** that caused them (claude-code parity). A delegated subagent's `interaction` is a child of the parent's `delegate` tool span and reports the **parent's** session id, and inherits the parent's frozen `SessionContext` — minting one from the child's own `platform="subagent"` and session id made the whole session's tag and metadata rollups read as a subagent's, since both are argMax'd over every span.

**Accepted residual risk.** Latitude builds a session's conversation from the session's *latest* completion, so a subagent's turn wins it if a session ends while a background subagent is still running. The alternative — reporting the child's own session id — splits one user-visible task into two Latitude sessions and loses the complete per-session cost view, which is worse. Validated twice without hitting it (the parent's wrap-up came last both times), but it is a real ordering, not a theoretical one.

Auxiliary usage lands in its own trace per session: an `interaction` root with `interaction.kind=auxiliary` and one `aux:<task>` chat span per task.

## Shipping discipline

Spans are handed to the exporter **as they close**, and **every span id ships exactly once**. `spans` is a `ReplacingMergeTree` so a resend collapses there, but `traces_mv`/`sessions_mv` are plain per-insert `GROUP BY` rollups that would additively inflate span counts, tokens and cost. Two consequences:

- The `interaction` root is always the **last** span of its turn to ship, because its aggregates (`hermes.llm_calls`, `hermes.tool_calls`, the turn outcome) are only known at turn end. A hard `SIGKILL` mid-turn therefore leaves a rootless trace — strictly better than the previous behaviour, which lost the whole turn.
- Nothing is ever re-sent to "correct" a span. Late-arriving facts (a subagent's status, a tag discovered mid-turn) are written onto a span that has not shipped yet, or dropped.

## Attributes

Common to every span (`builder._context`):

| Attribute | Value |
| --- | --- |
| `session.id`, `gen_ai.session.id`, `service.instance.id` | The Hermes session id — the **parent's** for subagent spans |
| `user.id`, `user.email` | `sender_id` from `pre_llm_call`; the email is set only when the id is itself an address (some platforms use one). Hermes exposes **no** display name or email to plugins on any hook — `sender_id` is `agent._user_id` and nothing else — so a platform handle is all a Slack session can carry. Resolving one would mean calling the platform's API with its bot token from inside a telemetry plugin |
| `latitude.tags` | Derived tags plus the operator's own (see below) |
| `latitude.metadata` | Derived `hermes.*` keys plus the operator's own |
| `gen_ai.agent.name` | The configured agent name; the subagent role on subagent spans |
| `subagent.name` / `.type` / `.id` | Subagent spans only; `id` is `<role>:<subagent id>` |
| `hermes.thread.name`, `hermes.thread.is_main` | Fork provenance, with no interpretation |
| `latitude.captured.content`, `hermes.redaction.applied` | The privacy posture of this span |

`interaction` root: `span.type`, `interaction.kind` (`user` / `subagent` / `background` / `auxiliary`), `user_prompt:gated` (from `user_message`, never scanned out of history), `gen_ai.input.messages:gated`, `gen_ai.output.messages:gated`, `gen_ai.system_instructions:gated`, `hermes.llm_calls`, `hermes.tool_calls`, `hermes.llm_calls_unreported`, `hermes.unknown_items`, `hermes.turn.outcome`, `hermes.turn.exit_reason`, `interaction.duration_ms`.

`llm_request`: `gen_ai.operation.name=chat`, provider/model/`gen_ai.response.model`, `gen_ai.input.messages:gated`, `gen_ai.output.messages:gated`, `gen_ai.system_instructions:gated`, `gen_ai.tool.definitions:gated`, `gen_ai.request.max_tokens`, `gen_ai.request.stream`, `gen_ai.server.time_to_first_token`, the `gen_ai.usage.*` family, `gen_ai.response.finish_reasons`, `llm_request.call_index`, `llm_request.duration_ms`, `hermes.api_duration_s`, `hermes.retry_count`, `hermes.approx_input_tokens`, `hermes.message_count`, `hermes.tool_count`, `hermes.usage.state`, and on failure `error.type` / `error.message:gated` / `hermes.error.status_code` / `hermes.error.retryable` / `hermes.error.reason`.

Tool definitions are resolved **per call**, keeping the most trustworthy answer seen so far, and the span states which it is via `hermes.tool_definitions.source`:

1. `request.body.tools` — the per-call truth, but a toolset of any real size pushes the sanitized payload past Hermes's 50 000-char ceiling, so in practice this is only available on a short conversation.
2. The in-process `get_tool_definitions()` snapshot — the agent's **equipped** toolset. Hermes narrows the offered set per call (tool-search assembly), so `hermes.tool_count` can exceed or trail the snapshot's length; the snapshot is still the right answer to "what is this agent equipped with", which is the question `defined_tools` exists to answer.

An earlier revision accepted the snapshot only when `len(snapshot) == tool_count`. That gate was arbitrary — whether a call's dynamic toolset happens to equal the static default — and it failed silently: in the dogfood session the first call offered 22 tools against an 18-tool snapshot, so early spans carried no definitions at all until a later call happened to offer exactly 18. Never gate a best-effort attribute on an equality that has no reason to hold.

`tool_call:<name>` (kind 3): `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments:gated`, `gen_ai.tool.call.result:gated`, `tool.is_error`, `success`, `hermes.tool.duration_ms`, plus `error.*` from Hermes's own `status`/`error_type`/`error_message`.

### Message normalization

Three dialects reach the hooks and one replayed history can mix them, so `messages.py` dispatches **per item** on the item's own shape — never on `api_mode`, which would silently drop content the day a new mode ships:

| Dialect | Item | Emitted |
| --- | --- | --- |
| Responses / Codex | `{"type":"message","role","content":[{"type":"output_text"\|"input_text","text"}]}` | `text` parts |
| | `{"type":"function_call","call_id","name","arguments"}` | assistant `tool_call` |
| | `{"type":"function_call_output","call_id","output"}` | `role:"tool"` with `tool_call_response` |
| | `{"type":"reasoning","encrypted_content","summary"}` | `reasoning` from the summary; skipped without one. **`encrypted_content` is never exported** |
| Chat Completions | `{role, content, tool_calls}`, `{role:"tool", tool_call_id}` | as before |
| Anthropic | `text` / `thinking` / `tool_use` / `tool_result` blocks | as before |

Ingest normalizes the same vocabulary as of this change (`normalizeGenAIMessages`), so a Responses-dialect emitter renders correctly even without this pass — but the emitter still normalizes, because that is what keeps `hermes.unknown_items` meaningful and the exported payload conformant at the source. This is the whole fix for "the conversation is only the prompt and the final answer": Responses tool and reasoning items carry **no `role` key at all**, so the old role-first reading dropped them, and `output_text` blocks fell through to a JSON-dump branch that produced a part type Latitude does not know. Adjacent assistant-ish items (reasoning, text, tool calls) group into one message so the conversation reads like the transcript. Anything unrecognisable becomes one `text` part holding its JSON and increments `hermes.unknown_items`, so silent garbage is visible instead of invisible.

Latitude assembles a trace's conversation from the **last** `llm_request`'s `input_messages` plus its `output_messages` (`trace-repository.ts`), so fixing the normalizer fixes the aggregated view; no extra aggregate attribute on the root is needed, and the root's messages are ignored by that query anyway.

## Memory model

- **Store**: one per profile, `gen_ai.memory.store.id = "hermes/<profile>"`. The prefix keeps it distinct from a claude-code store in a shared project.
- **Records**: the two built-in store files, `MEMORY.md` and `USER.md` — **one record per file, body = the whole file**. That is the granularity Latitude's ledger is built for: a full new body per mutating span gives per-line diffs and per-entry blame for free. Per-entry records were rejected because `replace`/`remove` address entries by an `old_text` substring, so no stable per-entry id is derivable, and the OTEL model has no rename.
- **Reads**: Hermes injects memory into the system prompt as a **frozen snapshot at session start**, so it is read once per session — one `search_memory` span per non-empty store on the first `pre_api_request`, child of that turn's interaction. The latch is released on `on_session_start` / `on_session_reset`. No `gen_ai.memory.query.text`: an unconditional full-store snapshot is not a query.
- **Writes**: on `post_tool_call` for `tool_name == "memory"` with `status == "ok"`, the new body is read **back off disk** (the tool's success response deliberately omits the entry list, and replaying the operation against a replica could publish a body that never existed). `upsert_memory`, or `delete_memory` when the file is now empty. A batch (`operations[]`) still touches one record, so it is still one span. Failed writes emit nothing — nothing changed.
- **Never an empty `gen_ai.memory.record.id`**: an omitted record id is the OTEL signal for a whole-store wipe, which the ledger turns into a tombstone for every live record. Hermes only ever touches one named file.
- **Mismatch guard**: if the file's entry count disagrees with the tool result's `entry_count` (a sister session wrote in between), the span is kept and the body dropped.
- **Disabled when** `LATITUDE_HERMES_MEMORY=0`, content capture is off (structure-only spans still ship), the files are absent, or `memory.provider` in `config.yaml` selects an external provider — the built-in files are then not the live store.

Attribute names and span shape match `packages/telemetry/python/src/latitude_telemetry/sdk/memory.py` exactly (span name = the operation, kind 3, `record.count = len(records)`, `records` as a JSON string). The plugin cannot depend on `latitude-telemetry` — it is stdlib-only by design — so the parity is maintained by hand and by test.

## Usage accounting

Hermes's `/usage` and Latitude will not agree, and both are right. The reconciliation, verified against a 205-call dogfood session:

- **`/usage` reads one `Agent` object's counters.** A `background_review` fork runs a full conversation loop on its **own** `Agent` in a separate thread, so it fires the api hooks (we see it) but never touches the main agent's counters (`/usage` does not). In the reference session: `/usage` 205 calls, Latitude 236 = 205 main + 31 review, matching to the token on input, output, reasoning and cache read.
- **Hermes's "Output tokens" is inclusive of reasoning; Latitude's `tokensOutput` excludes it** with `tokensReasoning` beside it. `gen_ai.usage.output_tokens` must keep carrying the **inclusive** figure — the resolver subtracts reasoning itself, and sending the exclusive value would double-subtract.
- **Auxiliary calls** (`approval`, `compression`, `title_generation`) go through `agent/auxiliary_client.py`, which fires no hooks at all. They were 41 calls / ~72 k tokens in the reference session. `aux_usage.py` recovers them at `on_session_finalize` by reading `session_model_usage` from `<hermes_home>/state.db` **read-only**, emitting one `aux:<task>` span per row whose task is **not** hook-visible. Exactly two tasks are hook-visible — `''` (the main agent loop) and `background_review` (a real conversation loop of its own) — and their rows are already in Latitude, so re-emitting them invents tokens. The guard against that assumption going stale is a total-count comparison: if we exported more calls than the hook-visible rows account for, nothing is emitted at all. Each span is instantaneous and priced on the ledger row's own `billing_provider`, because it stands for N calls and a `first_seen..last_seen` window is not latency.
- **Cost on a subscription route is list-price.** Hermes reports `billing_mode=subscription_included`, `cost_status=included`, `$0`; Latitude prices the same session from its catalog. Neither is wrong, and a zero cost is treated as absent by ingest anyway, so `gen_ai.usage.cost` is only emitted when Hermes says `status == "actual"`. `hermes.cost.status`, `hermes.cost.label`, `hermes.billing.mode` and `hermes.provider.raw` are always recorded so a catalog figure on a subscription session is explainable rather than mysterious — `resolveProviderName` folds `openai-codex` into `openai`, which is right for pricing and erases exactly the distinction the cost depends on.
- **Per-task attribution is not derivable from the hooks.** The payloads carry no task label, and the obvious proxy — thread identity — is wrong: Hermes runs **every** turn on its own `Thread-N (run_agent)` worker, so "the first thread is the main loop" mislabels every later turn. The plugin therefore tracks only a session **total** of what it exported, and identifies a background review by its thread *name* (`bg-review`, from `_spawn_background_review`).
- **`hermes.usage.state = "unreported"`** marks a generation span closed without a `post_api_request` (a redirect that crossed the response, an interruption, a compression restart). The provider may well have billed it, so it reads as *unknown* rather than *free*, and the root counts them in `hermes.llm_calls_unreported`.

- **A subagent is a third bucket.** A delegated child records its usage under its **own** `session_id`, so `WHERE session_id = <parent>` misses it while Latitude counts it in the parent's session by design. Reconciling a session that delegated means summing the parent's rows *and* each child's. The child's auxiliary rows are only reachable from the parent's teardown, because a child session never gets an `on_session_finalize` of its own.
- **`/compress` is not the compaction that shows up as `aux:compression`.** The manual command does not route through `agent/auxiliary_client.py` — a session where `/usage` reported `Compressions: 1` produced no `compression` ledger row at all. Only automatic context-pressure compaction does. There is no way to force one, so `aux:compression` is exercised by unit-test fixtures rather than in production; likewise a retried API attempt, which needs a real rate limit or 5xx.
- **Two known platform-side gaps**, filed rather than worked around: a filtered `queryAnalytics` sum diverges from the same population reached by breakdown ([#4497](https://github.com/latitude-dev/latitude-llm/issues/4497)) — which is why the reconciliation above leans on counts and the session rollup, never on those sums — and an emitter still cannot report a route as subscription-included ([#4498](https://github.com/latitude-dev/latitude-llm/issues/4498)).

The arbiter for any dispute is `state_db`, read-only:

```bash
sqlite3 "file:$HOME/.hermes/state.db?mode=ro" \
  "SELECT task, api_call_count, input_tokens, output_tokens, cache_read_tokens, reasoning_tokens
     FROM session_model_usage WHERE session_id='<id>' ORDER BY (task<>''), api_call_count DESC;"
```

`<hermes_home>` is profile-scoped, and the DB is written by a background flusher, so read it after the turn finishes.

## Tags and metadata

One frozen `SessionContext` per session (`context.py`); per-turn fields merge on top at span build time. Tags matter because `tag` is one of the few breakdown dimensions `queryAnalytics` accepts for traces and sessions (`model, provider, service, tool, tag, name, userId, status`) **and** a session filter — which is what makes it usable as an experiment variant selector.

| Tag | Source |
| --- | --- |
| `hermes` | Constant; keeps Hermes traces identifiable in a project that also receives claude-code or pi traces |
| the platform | `platform` kwarg, `cli` when empty |
| the agent name | Configured `agent.name`, else the profile name when it is not `default` |
| the agent version | Configured `agent.version`, on its own — the agent name is already a tag, so `<agent>@<version>` only duplicated it |
| `cron:<job id>` | Only when the session id has Hermes's `cron_<job>_<YYYYmmdd_HHMMSS>` shape |
| `subagent:<role>` | On a trace that delegated |

Metadata is namespaced `hermes.*` for everything derived (`session.id`, `task_id`, `turn_id`, `platform`, `profile`, `version`, `plugin.version`, `api_mode`, `provider`, `base_url`, `finish_reason`, `agent.name`, `agent.version`, `parent_session_id`, `subagent.*`, `cron.job.id`). Operator keys stay **verbatim** so `metadata.deployment` works as a filter key; derived keys are applied **after** the operator's, so `hermes.version` cannot be overwritten with a fiction, and an operator key starting with `hermes.` is dropped with a one-time debug log.

Caps: a tag ≤ 64 chars, ≤ 32 tags (the rollup is a `groupUniqArrayArray` over every span of the session); a metadata value ≤ 1 024 chars, ≤ 64 keys. Over-cap entries are dropped, not silently truncated, and the drop is logged once.

**Comparing two agent versions** — the reason the version goes in both surfaces, deliberately: a tag gives `queryAnalytics { stream: sessions, metric: {kind:"avg", field:"cost"}, breakdown: "tag" }` one row per `2.1.0` / `2.2.0` in a single query (pair it with the agent-name tag when a project runs several agents whose version strings could collide), and an experiment variant is a session `filterSet`, so `tags contains alescript@2.2.0` versus the baseline is a two-variant experiment with score comparison. Metadata is the filter-only, higher-cardinality half: `metadata.hermes.agent.version` stays clean when there are dozens of versions and nobody wants dozens of tags.

The root span name stays `interaction` — it is the `name` breakdown dimension and the traces-list label, so renaming it per agent would fragment that dimension across deployments while the tag and `service.name` axes already answer the question.

## Export path

A single daemon thread drains a bounded `queue.Queue` of finished spans; `_ship` never blocks (drop-oldest with a debug log when full). The exporter encodes, coalesces queued spans into one request up to `EXPORT_MAX_PAYLOAD_BYTES` (4 MiB, well under the 32 MiB ingest cap — `apps/ingest` decodes no gzip on this path), and POSTs. `429`/`503`/`5xx`/network errors retry up to 3 times with jittered backoff honouring `Retry-After`; other `4xx` never retry, because a malformed payload will not become valid.

Encoding runs on the exporter thread, so the agent's turn pays for none of it. It is also the single choke point every attribute passes through — content gating, secret redaction, attribute redaction and the per-attribute size budget all live in `otlp._encode_attrs`.

Flush budgets follow the hook's meaning: `on_session_end` 2 s (per-turn, on the user's critical path), `on_session_finalize` 10 s (teardown), plus an `atexit` hook at 10 s so one-shot `hermes -z` runs still land. With incremental shipping the queue is normally empty at turn end, so the common case costs nothing.

## Privacy

Two independent controls, deliberately complementary:

- **Secret redaction** (default **on**) runs every gated string through Hermes's own `agent.redact.redact_sensitive_text` with `force=True` and `redact_url_credentials=True` — a telemetry egress is exactly the "safety boundary that must never return raw secrets" its docstring describes, so it does not depend on the user's `security.redact_secrets` logging preference. A bounded memo cache keeps re-exporting the same replayed history to one pass per unique string. If the guarded import fails, export continues unredacted, `hermes.redaction.applied=false` goes on the span and a one-time warning fires — visible degradation rather than a silent privacy claim.
- **Attribute redaction** blanks a whole attribute the operator never wants to leave the machine (`LATITUDE_HERMES_REDACT_ATTRIBUTES`, exact key or `/regex/flags`, ported from `packages/telemetry/openclaw/src/redaction.ts`). A redacted key is **kept**, never dropped, so the Attributes panel still shows what the emitter sent — the same reasoning as `spans.md`'s "redaction never deletes an attribute". An unparseable pattern degrades to an exact-key match rather than throwing away the request.

`LATITUDE_NO_CONTENT` remains the all-or-nothing switch: gated attributes are dropped entirely and `latitude.captured.content=false`.

## Hermes-internal imports

Hook kwargs are the primary source; internals cover only what no hook exposes. Each import is guarded with a working fallback and isolated in `hermes.py` / `redact.py`, so a Hermes refactor breaks one function rather than the plugin (the bundled `langfuse` plugin imports `agent.usage_pricing` on the same terms):

| Import | Used for | Fallback |
| --- | --- | --- |
| `tools.memory_tool.get_memory_dir` | Memory store paths. Deliberately a function upstream, so a profile switch after import is respected | `${HERMES_HOME:-~/.hermes}/memories` |
| `model_tools.get_tool_definitions` | Tool definitions whenever `request` was truncated, which is nearly always | Omit definitions, keep `hermes.tool_count` |
| `agent.redact.redact_sensitive_text` | Secret redaction | Export unredacted, mark `hermes.redaction.applied=false` |
| `agent.usage_pricing.estimate_usage_cost` / `resolve_billing_route` | Cost status, label and billing mode | Omit the cost attributes |
| `hermes_cli.config.load_config_readonly` | External `memory.provider` detection | Assume the built-in store |
| `hermes_cli.__version__` | `hermes.version` metadata | `importlib.metadata.version("hermes-agent")`, then absent |
| `hermes_constants.get_hermes_home` | `state.db` and memory paths | `$HERMES_HOME` or `~/.hermes` |
| `hermes_cli.profiles.get_active_profile_name` | Profile when `ctx` is unavailable | `default` |

The `ctx` facade supplies the rest: `ctx.get_config(key)` reads `plugins.entries.latitude.settings.<key>` (dotted, plugin-relative, raises `ValueError` on a rejected path — caught), and `ctx.profile_name` is a **property**, not a method.

## Package layout

```
src/latitude_telemetry_hermes/
  __init__.py    register() re-export — the entry point Hermes calls
  config.py      env → ctx.get_config → default; caps and constants; PKG_VERSION
  hooks.py       hook handlers (gated, fail-open) and register()
  builder.py     span lifecycle: runs, generations, tools, streams, subagents
  model.py       _Span / _Run / _Session / _StreamWatch / _Subagent
  messages.py    per-item dialect normalization; system-prompt resolution
  tools.py       gen_ai.tool.definitions resolution and byte budget
  memory.py      store/record resolution, read snapshots, write classification
  context.py     frozen per-session tags and metadata
  redact.py      secret redaction + attribute-key redaction
  aux_usage.py   session_model_usage reconciliation (read-only SQLite)
  hermes.py      guarded bridges to Hermes internals
  otlp.py        encoding: gating, redaction, size budget, payload assembly
  transport.py   daemon exporter, batching, retries, flush
  util.py        ids, timestamps, trace keys
```

Tests: `uv run pytest` (no network, no real home directory — `conftest.py` points `HERMES_HOME` at a tmp dir), `uv run ruff check .`.

**Publishing is automatic.** `.github/workflows/publish-packages.yml` runs on every push to `development` and calls `publish-hermes-telemetry.yml`, which publishes to PyPI whenever `pyproject.toml`'s version is not already there. There is no separate release step: merging *is* publishing, and a mistake can only be corrected by another version bump. `PKG_VERSION` and `pyproject.toml` must agree — a test asserts it.
