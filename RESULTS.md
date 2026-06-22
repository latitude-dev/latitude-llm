# Telemetry Integrations — Verification Pass

> **Living document.** This file is the single source of truth for an exhaustive,
> one-by-one verification of every Latitude telemetry integration. It is written to
> survive context compaction — all the state needed to resume the work lives here.

---

## 0. Mission & operating context (read this first after any compaction)

**Goal:** Test every telemetry integration Latitude ships (TypeScript SDK, Python SDK,
and the agent integrations) end-to-end: emit a trace from each integration into a local
Latitude instance, then confirm Latitude **collects, parses, and displays** the trace
correctly. Capture per-integration status, bugs, and fixes in the tables below.

**Local Latitude instance (export target):**
- Ingest/OTLP base URL: `http://localhost:3002` → exporter POSTs to `http://localhost:3002/v1/traces`
- Project slug: `saloon` (id `jo0lh6cyi2us05ymev221jn9`)
- API key: `lat_seed_default_api_key_token`
- Dashboard / MCP for inspection: `latitude-local` MCP server (already connected). Verified reachable: `POST /v1/traces` → 401 without key (endpoint exists & enforces auth).

**Env wiring for examples** (both SDKs read `LATITUDE_TELEMETRY_URL`):
```
LATITUDE_API_KEY=lat_seed_default_api_key_token
LATITUDE_PROJECT_SLUG=saloon
LATITUDE_TELEMETRY_URL=http://localhost:3002
```

> **⛔ CRITICAL GOTCHA (cost ~1h of confusion — do NOT forget):** the user's shell exports
> **staging** telemetry vars (`LATITUDE_TELEMETRY_URL=https://staging-ingest.latitude.so`,
> `LATITUDE_API_KEY=15eef48a-…`, `LATITUDE_PROJECT_SLUG=saloon`). Node's `--env-file` and a
> committed `.env` **do NOT override already-set process env** → every run silently shipped traces
> to **staging**, so nothing showed locally. **Fix: set the three vars INLINE on the run command**
> (highest precedence, beats both `.env` and the shell). Use this exact prefix for every TS/Python run:
> ```
> LATITUDE_API_KEY=lat_seed_default_api_key_token LATITUDE_PROJECT_SLUG=saloon LATITUDE_TELEMETRY_URL=http://localhost:3002 <run cmd>
> ```
> Verify routing per run by checking the trace lands via the `latitude-local` MCP `listTraces`.

- **Provider keys that live only in `~/.zshrc` (ANTHROPIC_API_KEY, MISTRAL_API_KEY) are NOT in the
  non-interactive Bash env** — extract inline per run: `AKEY="$(zsh -ic 'echo $ANTHROPIC_API_KEY')"` then
  pass `ANTHROPIC_API_KEY="$AKEY"` on the command. (OpenAI/Google keys ARE already in the Bash env.)
- `curl` in this shell defaults to POST (a `.curlrc`/alias) — use `-X GET` when probing provider model lists.
- TS: `packages/telemetry/typescript/examples/` — `LATITUDE_…=… npx tsx test_<x>.ts` (inline vars, no `--env-file` needed)
- Python: `packages/telemetry/python/examples/` — run with the uv venv (`packages/telemetry/python/.venv`), inline vars
- Ingestion is async (ingest:3002 → BullMQ redis:6380 → workers → ClickHouse); traces appear within ~1–2s.

**Test case every trace must contain (the scenario we are validating):**
A short conversation with **at least one tool call + its tool result**, followed by a
**final assistant response**. Most examples already have a `toolConversation()` /
`tool_conversation()` function — reuse it; if an example lacks one, add/improve it.

**Per-trace conventions (so each trace is findable & attributable):**
- Unique `sessionId` per integration run (existing examples use `"<provider>-<rand8>"`).
- A tag naming the provider/integration **and language**, e.g. `openai-ts`, `langchain-py`.
  (Existing examples tag `["example", "<provider>", ...]` — extend with a language-qualified
  tag so traces are filterable per integration. Add the language tag as we touch each one.)
- Keep `userId` and a `metadata.scenario` for context (examples already do this).

**⬆️ DEPENDENCY-UPDATE POLICY (user requirement): this e2e pass is ALSO an update pass.**
Before testing each provider/integration, **update its third-party instrumentation library to the
latest version** (both TS and Python — e.g. `@traceloop/instrumentation-*`, `openinference-instrumentation-*`,
`opentelemetry-instrumentation-*`). **Also update the provider SDK** used in the example (e.g. `openai`,
`@anthropic-ai/sdk`, in deps/devDeps) to latest, so we exercise the instrumentation against the newest
provider SDK. Record version bumps per row. Respect the repo's `minimum-release-age` (npm) / `exclude-newer`
(uv, 7d) guards — if "latest" is <7 days old it won't resolve; note that and use the newest eligible.

**⚠️ MODEL POLICY (user requirement): always use the provider's LATEST model in every example.**
Do NOT use old models. Update each example's `MODEL` constant before running. Latest IDs to target:
- Anthropic API: `claude-sonnet-4-6` / `claude-opus-4-8` (NOT claude-3-*).
- Bedrock: `anthropic.claude-sonnet-4-6` / `anthropic.claude-opus-4-8` — resolve on-demand vs
  cross-region inference-profile id (e.g. `eu.anthropic.claude-sonnet-4-6`) at run time for `eu-central-1`.
- OpenAI: newest available (examples currently pin `gpt-4o-mini` — bump to latest before running).
- Gemini: newest available (e.g. latest `gemini-2.x`/flash). Bump from whatever the example pins.

**How we inspect a trace (both sides):**
- User reviews in the dashboard.
- Claude reviews via `latitude-local` MCP: `listTraces` (filter by tag / recent `startTime`),
  then `getTrace` / `listTraceSpans` / `getTraceSpan` for the full conversation, checking:
  input messages, the tool call (name + args), the tool result, the final assistant message,
  model name, token usage, cost, span tree shape, tags, sessionId.

**Workflow rules (agreed with the user — DO NOT skip ahead):**
1. Build/improve the example for ONE integration.
2. Run it against the local instance (build first if required).
3. Inspect the trace via MCP exhaustively; note findings in the table.
4. **Wait for the user's verdict** (correct / incorrect + what to fix).
5. Fix bugs, re-run, re-review until the user confirms it's correct.
6. **On approval, BEFORE advancing: commit all changes and push to the working branch.**
7. Only then advance to the next integration.

**Working branch:** `telemetry/integration-verification-fixes` (off `development`, PR target
`development`). Commit per approved integration (conventional-commit messages), push each time.
First push landed #1–#3 + the two fixes (3 commits). NOTE: an unrelated WIP edit to
`apps/web/.../spans-tab/span-filters-bar.tsx` is in the working tree — left untouched, NOT ours,
do not commit it into this branch.

**Available provider API keys in this environment** (gates what we can actually run):
| Provider | Key present? | Notes |
|---|---|---|
| OpenAI (`OPENAI_API_KEY`) | ✅ | Also backs LangChain, LlamaIndex, OpenAI Agents, Vercel AI, Haystack, DSPy, CrewAI, LiteLLM, composable examples |
| Google AI Studio (`GOOGLE_API_KEY`, `GEMINI_API_KEY`) | ✅ | Backs Gemini (`google_generativeai`) and Google ADK |
| Anthropic | ✅ | **Not in this shell's env** — set in `~/.zshrc` (len 108, `sk-ant-…`). Source it / extract from `zsh -ic 'echo $ANTHROPIC_API_KEY'` when running. |
| Mistral (`MISTRAL_API_KEY`) | ✅ | **Not in this shell's env** — set in `~/.zshrc` (len 32). Source it. Use latest model (`mistral-large-latest`). |
| AWS Bedrock | ✅ | **No `AWS_*` envars** — resolved via the default credential chain (`aws sts get-caller-identity` → account `442420265876`, user `Alex`). Region `eu-central-1`. Latest Claude present: `anthropic.claude-opus-4-8`, `anthropic.claude-sonnet-4-6` (use latest; may need an `eu.` inference-profile id). Same way Latitude itself picks up creds. |
| AWS SageMaker | ❌ | Creds OK but no deployed SageMaker endpoint to invoke. |
| Azure OpenAI | ❌ | No Azure endpoint/key |
| Cohere / Together / Groq / Mistral / Replicate / WatsonX / Aleph Alpha | ❌ | No keys |
| Google Vertex AI (service account) | ❌ | `GOOGLE_APPLICATION_CREDENTIALS` not set (distinct from AI Studio key) |
| Ollama / Transformers | local | No key, but need a local server / model download |

**Coverage strategy for "blocked" providers (no native key):**
Each provider's instrumentation patches *that provider's own SDK package* (`groq`, `together`, …),
NOT the `openai` package — so to test it we must use the real SDK. But we can point that SDK's
`base_url`/`server_url` at `https://api.openai.com/v1` with our OpenAI key **iff the SDK speaks
OpenAI's wire format**. That still exercises the real instrumentation + Latitude's parse/display;
the only caveat is the span's provider label (`gen_ai.system`) and model id won't reflect a real
call to that provider (structurally valid, just mislabeled backend).
- 🅾️ **Fakeable via OpenAI endpoint:** Groq (Py), Together (TS+Py). (Mistral now has a native key.)
  Azure (TS+Py) is the OpenAI instrumentation itself → **redundant**, covered by #1/#23.
- 🖥️ **Local infra (no key):** Ollama (Py, run `ollama serve` + small model), Transformers (Py, HF download).
- 🚫 **Genuinely un-testable here** (proprietary wire/auth): Cohere, Replicate, WatsonX, Aleph Alpha,
  SageMaker (needs deployed endpoint), Vertex AI/aiplatform (Vertex protocol + GCP SA; Google is
  partially covered via Gemini/`google_genai`, but the Vertex instrumentation stays uncovered).

**DECISION (agreed): the 🚫 set is SKIPPED for this pass — do not attempt.** Revisit only when the
user supplies credentials. Deferred rows: Cohere (#5 TS, #29 Py), Vertex AI (#9 TS, #33 Py),
Vertex aiplatform (#10 TS), Aleph Alpha (#38 Py), Replicate (#39 Py), WatsonX (#40 Py),
SageMaker (#28 Py). Unlock paths when ready: Cohere/Replicate free keys, `gcloud auth
application-default login` for Vertex, deployed endpoint for SageMaker.

**⚠️ KNOWN CROSS-CUTTING ISSUE — tool DEFINITIONS not captured (varies by instrumentation):**
Latitude parses `gen_ai.tool.definitions` → its `toolDefinitions` field correctly (proven by OpenAI #1,
which shows the full `get_weather` schema). But:
- **OpenAI Agents #2** (Latitude's OWN `openai-agents` adapter): **✅ FIXED.** The agent span only carries
  tool *names*, BUT the Responses API echoes full schemas on `_response.tools` — the adapter's `response`
  case now forwards them as `gen_ai.tool.definitions`. Verified: trace `5a3667f0…` response span now has
  `toolDefinitions` populated (get_weather schema). Fix in `…/openai-agents/instrumentation.ts` + unit test.
- **Anthropic #3** (`@traceloop/instrumentation-anthropic@0.27.0`): emits NO tool-def attribute →
  `toolDefinitions:[]`. **Upstream Traceloop instrumentor limitation — WON'T-FIX for this pass** (per user).
- **OpenAI #1** (`@traceloop/instrumentation-openai`): ✅ emits full schemas.
- **TODO (after user reviews the tool-pairing fix):** fix our OWN `openai-agents` adapter to export tool definitions.
Check `toolDefinitions` on every integration going forward; expect it empty wherever the instrumentor
doesn't emit `gen_ai.tool.definitions`.

**✅ FIXED — tool_call ↔ tool_result not tied (was Anthropic-specific, NOT all providers):**
OpenAI #1/#2 DO pair (tool result arrives as `role:"tool"`). Anthropic emitted the tool result as
`role:"user"` (its native shape — tool_result nested in a user turn), and Latitude's timeline/conversation
view key off `role==="tool"`, so it never paired. **Fix: `packages/domain/spans/src/otlp/content/genai.ts`
`hoistToolResults()` — splits the `tool_call_response` parts out into their OWN `role:"tool"` message and
leaves any sibling parts (e.g. text in the same turn) under the original role.** (Safer than relabeling
the whole turn, which would mislabel sibling text — per review feedback.) 2 unit tests in `genai.test.ts`
(pure hoist + mixed split); 851 pass, typecheck clean. Verified e2e: re-ingested Anthropic trace
`b08a62b1…` (session `anthropic-62d8f44a`) shows the tool result as a separate `role:"tool"` message with
matching id → pairs. Ingest hot-reloaded via tsx watch (`@domain/spans` exports `src/*.ts`).

**⚠️ KNOWN CROSS-CUTTING BUG — streaming token usage on Traceloop instrumentations:** the Traceloop
instrumentations (openai, and likely anthropic/bedrock/etc.) with `enrichTokens` run `js-tiktoken`
on the **streaming** path and throw `Unknown model` for model names tiktoken doesn't know (all the
latest models, e.g. `gpt-5.5`) → streaming spans get **0 tokens** even when the provider returns
usage via `include_usage`. Non-streaming is unaffected (reads API usage directly). **CONFIRMED STILL
PRESENT in the latest `@traceloop/instrumentation-openai@0.27.0`** (updating did not fix it; `js-tiktoken`
still `^1.0.20`). **Also tried `@arizeai/openinference-instrumentation-openai@4.1.3` (composable mode):
it ALSO returns 0 streaming tokens** (different cause — no tiktoken error, it simply doesn't read the
final `usage` chunk; it does capture the streaming messages). → **UNSOLVABLE at the instrumentor layer
for this pass = WON'T-FIX.** Both instrumentors capture streaming *messages* fine; only streaming
*token usage* is lost for latest models. Decision: stay on `@traceloop/instrumentation-openai` (updated
0.27.0). Non-streaming + tool-call traces (the actual test case) are unaffected. Expect 0 streaming
tokens on every latest-model streaming scenario; do not re-investigate per-integration.

**🐛 PRODUCT BUG FOUND (trace-detail panel) — FIXED, awaiting user verify:** the **Trace tab** always
showed empty System Instructions / Input / Output, while the Conversation tab + Session tab were fine.
Root cause: NOT the user's CH rollup migration — the write side is correct (verified: `traces` rollup
has `input_messages`/`output_messages` populated). The web `getTraceDetail` called the metadata-only
`findMetadataByTraceId` (LIST_SELECT, no messages) → `serializeTraceMetadataDetail` hardcoded the
messages to `[]`. Sessions used the with-messages path (`findBySessionId` → real fields), hence the
asymmetry. **Final fix (per user, avoids the heavy `last_input_messages`/`allMessages`):**
- `findMetadataByTraceId` now selects `input_messages` + `output_messages` + `system_instructions`
  (NEW `METADATA_DETAIL_SELECT`, **no `last_input_messages`**) and returns a NEW `TraceMetadataDetail`
  entity (Trace + 3 fields, no `allMessages`). `getTraceDetail` stays on `findMetadataByTraceId`;
  `serializeTraceDetail` maps the 3 fields; `TraceDetailRecord` drops `allMessages`.
- The ONLY `traceDetail.allMessages` consumer was the **Signals "examples"** page; migrated it to the
  chunked conversation loader (`useTraceConversationMessages`) with anchor auto-load + a `ready`-gated
  scroll — same chunked model as the Conversation tab (`findConversationChunk` shares the exact
  `[system?, …last_input, …output]` index space, so `anchor.messageIndex` stays valid; verified in SQL).
Files: `entities/trace.ts`, `spans/index.ts`, `ports/trace-repository.ts`, db-clickhouse `trace-repository.ts`,
web `traces.functions.ts` + `conversation-tab.tsx` (type ref) + `signal-examples.tsx`. Typecheck clean
(@domain/spans, @platform/db-clickhouse, @app/web); 320 db-clickhouse tests pass; SQL-verified the new
metadata query returns input/output. (System Instructions stay empty for our examples — no system prompt; expected.)
**⚠️ Could NOT visually verify the Signals examples page locally (no occurrences seeded) — user to verify anchor scroll/highlight.**

**Status legend:**
- ⬜ Not started
- 🔄 In progress (running / inspecting / awaiting user verdict)
- ✅ Verified correct by user
- ❌ Bug found — needs fix (see Notes)
- 🔧 Fixed, awaiting re-review
- 🚫 Blocked (missing API key or infra) — cannot run with current environment
- 🅾️ Testable by pointing the provider SDK at OpenAI's endpoint (OpenAI-wire-compatible)
- 🖥️ Testable via local infra (no key) — local server / model download
- ⚠️ Maybe — needs a compatibility probe before counting
- ➖ Redundant — same instrumentation already covered by another row

---

## 1. TypeScript SDK — auto-instrumentations

Package: `packages/telemetry/typescript`. Registry: `src/sdk/instrumentations.ts`.

| # | Integration | Example file | Backend key | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 1 | OpenAI (`openai`) | `test_openai.ts` | OpenAI | ✅ | ✅ | **DONE — tool trace user-approved; streaming-usage bug documented WON'T-FIX (instrumentor limitation).** **Updated (per dep policy): `@traceloop/instrumentation-openai` 0.25.0→0.27.0, `openai` SDK 6.36.0→6.42.0** (6.43/6.44 blocked by 7-day guard). Tool trace correct (`756dcb77…`, re-runs `974e57ca…`, `8387d75f…`). Fixes: model→`gpt-5.5` (`max_completion_tokens`), tag `openai-ts`, dropped junk bare call, **`MAX_TOKENS=2000`** (gpt-5.5 reasoning model ate a 100 budget → empty content/`finish:length`; that was the "no assistant message" report → example bug, fixed: chat trace `be9fe645…`/`6d9da450…` shows assistant text). **STREAMING USAGE BUG (instrumentor limitation, WON'T-FIX):** `enrichTokens:true` runs `js-tiktoken` → `Unknown model` on `gpt-5.5` → 0 streaming tokens; still broken in latest 0.27.0. Tried `@arizeai/openinference-instrumentation-openai@4.1.3` → ALSO 0 streaming tokens (no tiktoken error; just doesn't read final usage chunk) → reverted to traceloop 0.27.0. Streaming *messages* captured by both; only streaming token *usage* lost. Documented as unsolvable. Tool-count enhancement → issue **#3646**. **Final deps: traceloop-openai 0.27.0, openai SDK 6.42.0.** |
| 2 | OpenAI Agents (`openai-agents`) | `test_openai_agents.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved.** Follow-up FIX applied: adapter now forwards `_response.tools` → `gen_ai.tool.definitions` so `toolDefinitions` populates (verified trace `5a3667f0…`, session `openai-agents-eac639dd`); +unit test, 124 telemetry tests pass. Updated `@openai/agents` 0.8.5→**0.11.6** (0.11.7/0.11.8 <7d blocked); model→`gpt-5.5`; tag `openai-agents-ts`; dropped junk bare call. Custom `latitude.openai-agents` adapter works on 0.11.6. Tool trace `7733a9b0…` (session `openai-agents-d12e3fa2`) is rich + correct: capture root → Agent workflow → agent → [gen_ai.response (finish tool_call) → **function get_weather (`execute_tool` span ✅)** → gen_ai.response (finish stop)]. Full convo (user→tool_call→tool result→final), tokens 232 + cost + model. Non-streaming (Responses API) so streaming bug N/A. Note: this integration DOES emit a tool-exec span (relevant to #3646). |
| 3 | Anthropic (`anthropic`) | `test_anthropic.ts` | Anthropic | ✅ | ✅ | **DONE — user-approved after tool-pairing fix.** Updated `@anthropic-ai/sdk` 0.91.1→**0.104.1**, `@traceloop/instrumentation-anthropic` 0.26.0→**0.27.0**; model→`claude-opus-4-8`; tag `anthropic-ts`; key inline from zsh. Tool trace `a526517c…` (session `anthropic-f25e2a95`): convo correct, 984 tok+cost+model; **✅ streaming usage works** (`7d902976…`, no tiktoken path). **BUG A (instrumentation, anthropic-specific): no tool definitions** — `@traceloop/instrumentation-anthropic@0.27.0` emits NO `gen_ai.tool.definitions` → Latitude `toolDefinitions:[]`. Proven by contrast: openai instrumentation DOES emit it → openai trace `toolDefinitions` populated. Latitude parse OK; anthropic instrumentor is the gap. **FIX B (✅ DONE, awaiting re-review): tool_call & tool_result now tied.** Was anthropic-specific (tool result emitted `role:"user"`); fixed in `genai.ts` `normalizeSemconvMessage` (relabel tool-result messages to `role:"tool"`) + unit test. Re-ingested trace `4e903f38…` (session `anthropic-5c2b106e`) shows tool result as `role:"tool"`. **Bug A (tool defs) = instrumentor limitation, won't-fix.** |
| 4 | AWS Bedrock (`bedrock`) | `test_bedrock.ts` | AWS | ✅ | ⬜ | Default cred chain, region `eu-central-1`; use latest Claude (`anthropic.claude-sonnet-4-6`, resolve `eu.` inference profile if needed). |
| 5 | Cohere (`cohere`) | `test_cohere.ts` | Cohere | 🚫 | 🚫 | No key. |
| 6 | LangChain (`langchain`) | `test_langchain.ts` | OpenAI | ✅ | ⬜ | `@langchain/openai`. |
| 7 | LlamaIndex (`llamaindex`) | `test_llamaindex.ts` | OpenAI | ✅ | ⬜ | |
| 8 | Together AI (`togetherai`) | `test_together.ts` | Together→OpenAI | 🅾️ | ⬜ | No key — point `together-ai` SDK `baseURL` at OpenAI (`/v1`) with OpenAI key + OpenAI model. |
| 9 | Google Vertex AI (`vertexai`) | `test_vertex.ts` | GCP SA | 🚫 | 🚫 | Needs service-account creds. |
| 10 | Vertex AI Platform (`aiplatform`) | `test_vertex.ts` | GCP SA | 🚫 | 🚫 | Shares vertex instrumentation. |

## 2. TypeScript SDK — other modes & helpers

| # | Integration | Example file | Backend key | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 11 | Azure OpenAI (via `openai`) | `test_azure.ts` | Azure | ➖ | ➖ | No Azure key. **Redundant** — uses the `openai` instrumentation, already covered by #1. |
| 12 | OpenAI Responses API | `test_openai_responses.ts` | OpenAI | ✅ | ⬜ | Responses API path of openai instrumentation. |
| 13 | Vercel AI SDK (v4/5) | `test_vercel_ai.ts` | OpenAI | ✅ | ⬜ | Uses `getLatitudeTracer("vercelai")` + `experimental_telemetry`. |
| 14 | Vercel AI SDK v7 | `test_vercel_ai_v7.ts` | OpenAI | ✅ | ⬜ | Newer AI SDK surface. |
| 15 | Manual instrumentation | `test_manual_instrumentation.ts` | none/OpenAI | ✅ | ⬜ | Manual span creation API. |
| 16 | Capture nesting | `test_capture_nesting.ts` | OpenAI | ✅ | ⬜ | Nested `capture()` segments. |
| 17 | Project scoping — single | `test_project_scoping_single.ts` | OpenAI | ✅ | ⬜ | Per-call project routing. |
| 18 | Project scoping — multi | `test_project_scoping_multi.ts` | OpenAI | ✅ | ⬜ | Multiple projects in one process. |
| 19 | Project scoping — env | `test_project_scoping_env.ts` | OpenAI | ✅ | ⬜ | Project from env var. |

## 3. TypeScript SDK — composable mode (run alongside other APMs)

| # | Integration | Example file | Backend key | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 20 | Datadog APM coexist | `test_datadog.ts` | OpenAI (+DD) | ⚠️ | ⬜ | Latitude span processor alongside Datadog; DD key optional for the LLM-span path. |
| 21 | Sentry coexist | `test_sentry.ts` | OpenAI (+Sentry) | ⚠️ | ⬜ | `SENTRY_DSN` optional for LLM-span path. |
| 22 | Existing OTel (Jaeger/Zipkin) | `test_existing_otel.ts` | OpenAI | ✅ | ⬜ | Attach `LatitudeSpanProcessor` to existing provider. |

## 3b. TypeScript — agent/workflow framework apps (standalone, OTLP-native)

These are standalone sub-projects (own `package.json`, excluded from the monorepo workspace).
Both emit OpenTelemetry spans natively and point an OTLP exporter at Latitude — Latitude is
expected to parse their framework-specific span attributes.

| # | Integration | Example dir | Backend key | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 57 | Eve (eve.dev) | `examples/eve-app` | OpenAI | ✅ | ⬜ | Agent framework on Vercel AI SDK; spans `ai.eve.turn` / `eve.*` via `@vercel/otel` exporter (no Latitude `instrumentations` entry). |
| 58 | Flue (flueframework.com) | `examples/flue-app` | OpenAI | ✅ | ⬜ | Workflow framework; spans via `@flue/opentelemetry` + Latitude SDK `createOpenTelemetryObserver()`. |

> **TODO when we reach Eve (#57) & Flue (#58):** Latitude currently has **no in-app onboarding
> instructions** for these two integrations. Action items: (1) author the in-app instructions
> docs for Eve and Flue (the connect/integration onboarding pages), and (2) source/add the
> corresponding **icons** (Eve + Flue logos) for the integration list. Confirm the missing-docs
> assumption against the codebase before writing.

---

## 4. Python SDK — auto-instrumentations

Package: `packages/telemetry/python`. Registry: `src/latitude_telemetry/sdk/instrumentations.py`.
Run via the uv venv at `packages/telemetry/python/.venv`.

| # | Integration | Example file | Backend key | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 23 | OpenAI (`openai`) | `test_openai.py` | OpenAI | ✅ | ⬜ | Has `tool_conversation()`. openinference instrumentor. |
| 24 | OpenAI Agents (`openai-agents`) | `test_openai_agents.py` | OpenAI | ✅ | ⬜ | openinference. |
| 25 | OpenAI Responses API | `test_openai_responses.py` | OpenAI | ✅ | ⬜ | |
| 26 | Anthropic (`anthropic`) | `test_anthropic.py` | Anthropic | ✅ | ⬜ | Key in `~/.zshrc` (source it). Note: pinned `anthropic==0.40.0` (≥0.41 prompt caching breaks instrumentation). |
| 27 | AWS Bedrock (`bedrock`) | `test_bedrock.py` | AWS | ✅ | ⬜ | Default cred chain, region `eu-central-1`; use latest Claude (`anthropic.claude-sonnet-4-6`, resolve `eu.` inference profile if needed). |
| 28 | AWS SageMaker (`sagemaker`) | `test_sagemaker.py` | AWS | 🚫 | 🚫 | Creds OK but no deployed endpoint. |
| 29 | Cohere (`cohere`) | `test_cohere.py` | Cohere | 🚫 | 🚫 | No key. |
| 30 | LangChain (`langchain`) | `test_langchain.py` | OpenAI | ✅ | ⬜ | |
| 31 | LlamaIndex (`llamaindex`) | `test_llamaindex.py` | OpenAI | ✅ | ⬜ | openinference. |
| 32 | Together AI (`togetherai`) | `test_together.py` | Together→OpenAI | 🅾️ | ⬜ | No key — point `together` SDK `base_url` at OpenAI (`/v1`) with OpenAI key + OpenAI model. |
| 33 | Google Vertex AI (`vertexai`) | `test_vertex.py` | GCP SA | 🚫 | 🚫 | Needs service-account creds. |
| 34 | Gemini / Google GenAI (`google_generativeai`) | `test_gemini.py` | Google AI Studio | ✅ | ⬜ | openinference google_genai. |
| 35 | Google ADK (`google_adk`) | `test_google_adk.py` | Google AI Studio | ✅ | ⬜ | openinference. |
| 36 | Groq (`groq`) | `test_groq.py` | Groq→OpenAI | 🅾️ | ⬜ | No key — `groq` SDK is OpenAI-shaped; point `base_url` at OpenAI (`/v1`) with OpenAI key + OpenAI model. |
| 37 | Mistral (`mistralai`) | `test_mistral.py` | Mistral | ✅ | ⬜ | Native key in `~/.zshrc` (source it). Use latest model (`mistral-large-latest`). |
| 38 | Cohere Aleph Alpha (`aleph_alpha`) | `test_aleph_alpha.py` | Aleph Alpha | 🚫 | 🚫 | No key. |
| 39 | Replicate (`replicate`) | `test_replicate.py` | Replicate | 🚫 | 🚫 | No key. |
| 40 | WatsonX (`watsonx`) | `test_watsonx.py` | IBM WatsonX | 🚫 | 🚫 | No key. |
| 41 | CrewAI (`crewai`) | `test_crewai.py` | OpenAI | ✅ | ⬜ | openinference; defaults to OpenAI. |
| 42 | Haystack (`haystack`) | `test_haystack.py` | OpenAI | ✅ | ⬜ | openinference. |
| 43 | LiteLLM (`litellm`) | `test_litellm.py` | OpenAI | ✅ | ⬜ | Native OTel callback (gen_ai semconv), not an instrumentor — special path. |
| 44 | Ollama (`ollama`) | `test_ollama.py` | local | 🖥️ | ⬜ | Run `ollama serve` + pull a small model (no key). |
| 45 | Transformers (`transformers`) | `test_transformers.py` | local | 🖥️ | ⬜ | Local HF model download; heavy (no key). |
| 46 | DSPy | `test_dspy.py` | OpenAI | ✅ | ⬜ | (No registry entry — example-only? confirm instrumentation path.) |

## 5. Python SDK — other modes & helpers

| # | Integration | Example file | Backend key | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 47 | Azure OpenAI | `test_azure.py` | Azure | ➖ | ➖ | No Azure key. **Redundant** — uses the `openai` instrumentation, already covered by #23. |
| 48 | Manual instrumentation | `test_manual_instrumentation.py` | none/OpenAI | ✅ | ⬜ | |
| 49 | Capture nesting | `test_capture_nesting.py` | OpenAI | ✅ | ⬜ | |
| 50 | Project scoping — single | `test_project_scoping_single.py` | OpenAI | ✅ | ⬜ | |
| 51 | Project scoping — multi | `test_project_scoping_multi.py` | OpenAI | ✅ | ⬜ | |
| 52 | Project scoping — env | `test_project_scoping_env.py` | OpenAI | ✅ | ⬜ | |

---

## 6. Agent integrations (non-SDK packages)

| # | Integration | Package | What it is | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 53 | Claude Code telemetry | `packages/telemetry/claude-code` | Claude Code `Stop` hook → streams session transcripts as OTLP traces | ✅ | ⬜ | Can drive with this very Claude Code session pointed at local instance. |
| 54 | OpenClaw plugin | `packages/telemetry/openclaw` | OpenClaw plugin → streams agent runs as OTLP traces | ⚠️ | ⬜ | Needs OpenClaw ≥ 2026.4.25 on PATH. |
| 55 | OpenClaw CLI installer | `packages/telemetry/openclaw-cli` | One-shot installer for the OpenClaw plugin | ⚠️ | ⬜ | Installer/config tool — verify wiring, not trace shape directly. |
| 56 | Pi agent telemetry | `packages/telemetry/pi` | Pi coding-agent extension → streams sessions as OTLP traces | ⚠️ | ⬜ | Needs the Pi agent installed. |

---

## 7. Run log (chronological — newest at bottom)

> One row per run attempt: timestamp, integration, sessionId, tags, trace id (from MCP),
> and the verdict. Lets us match a dashboard trace to the run that produced it after compaction.

| When (UTC) | Integration | sessionId | tags | Trace id | Verdict |
|---|---|---|---|---|---|
| 2026-06-22 10:54 | OpenAI / TS (#1) tools | `openai-8f57c897` | `example, openai-ts, tools, openai` | `756dcb774aa25f31152b8c80bc816ddc` | tool trace ✅ by user; flagged chat (no asst msg) + stream (no usage) |
| 2026-06-22 11:19 | OpenAI / TS (#1) re-run (MAX_TOKENS=2000) | `openai-2f550f79` | `example, openai-ts, …` | tools `974e57ca…`, chat `be9fe645…` (asst msg now OK), stream `d0c0bb73…` (usage still 0 = instrumentation bug) | chat fix confirmed |
| 2026-06-22 11:55 | OpenAI / TS (#1) re-run (instrumentation 0.27.0 + openai 6.42.0) | `openai-da4c4323` | `example, openai-ts, …` | tools `8387d75f…`, chat `6d9da450…`, stream `e781a249…` (usage STILL 0 → upstream bug confirmed in latest) | #1 ✅ DONE (streaming bug won't-fix) |
| 2026-06-22 12:10 | OpenAI Agents / TS (#2) | `openai-agents-d12e3fa2` | `example, openai-agents, openai-agents-ts, tools` | tools `7733a9b0d4926824fee2d1409119693d`, chat `12c417b6…` | ✅ user-approved |
| 2026-06-22 12:27 | Anthropic / TS (#3) | `anthropic-f25e2a95` | `example, anthropic, anthropic-ts, tools` | tools `a526517c95f947366f0458fbbf36e62b`, stream `7d902976…` (usage ✅ 48tok), chat `9a2b80f4…` | reviewed: tool-pairing + tool-defs flagged |
| 2026-06-22 12:44 | Anthropic / TS (#3) re-run after tool-pairing fix (v1 relabel) | `anthropic-5c2b106e` | `example, anthropic, anthropic-ts, tools` | tools `4e903f38…` | superseded by v2 |
| 2026-06-22 13:01 | Anthropic / TS (#3) re-run after tool-pairing fix (v2 hoist) | `anthropic-62d8f44a` | `example, anthropic, anthropic-ts, tools` | tools `b08a62b1115acb47bfcf46ba539640b6` (tool result hoisted to own `role:tool` msg) | awaiting user re-review |
