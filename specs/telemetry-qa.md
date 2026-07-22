# Telemetry Integration QA

> **Living document (IN PROGRESS).** Single source of truth for an exhaustive, one-by-one
> verification of every Latitude telemetry integration — and the fixes QA surfaces. Written to
> survive context compaction: all the state needed to resume the work lives here.
> **Status: partial** — not all integrations are verified and not all bugs are fixed yet; this is
> merged incrementally and QA continues across sessions. See the status table + run log for exactly
> what's done.

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

**⚙️ SYSTEM-INSTRUCTIONS RULE (user requirement — applies to EVERY example, new and revisited):**
Each example MUST set a **system prompt / system instructions** so we verify Latitude captures them
into the span's `systemInstructions` field. This matters because many providers deliver system
instructions **out-of-band** — NOT as a `role:"system"` entry inside the messages list, but as a
**separate top-level field** (Anthropic/Bedrock `system`, OpenAI Responses `instructions`, agent
frameworks' `instructions`), and we need to confirm those separate-field paths land in
`systemInstructions` rather than being dropped or mislabeled. **Retroactive pass:** before moving past
Bedrock, go back through the already-verified integrations **#1 OpenAI → #2 OpenAI Agents → #3 Anthropic
→ #4 Bedrock**, add a system instruction to each example, re-run, and check ONLY that
`systemInstructions` is populated correctly (everything else is already verified). Going forward every
new example includes a system instruction from the start.

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
`development`) — **PR: https://github.com/latitude-dev/latitude-llm/pull/3655** (open, merged
incrementally; QA resumes here next session — next up: #4 Bedrock/TS).
Commit per approved integration (conventional-commit messages), push each time.
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
- **Bedrock #4** (`@traceloop/instrumentation-bedrock@0.27.0`): same as Anthropic — emits NO
  `gen_ai.tool.definitions` → `toolDefinitions:[]`. **WON'T-FIX (upstream instrumentor limitation).**
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

**⚠️ KNOWN CROSS-CUTTING BUG — Bedrock streaming loses the assistant message TEXT (inverse of OpenAI):**
`@traceloop/instrumentation-bedrock@0.27.0`'s Anthropic messages-API streaming path
(`InvokeModelWithResponseStream`) emits only `gen_ai.response.finish_reasons` from the streamed
events and **never accumulates the `content_block_delta` text** into `gen_ai.output.messages` → the
output assistant message arrives with `parts:[]`. Token *usage* IS captured (read separately from the
`amazon-bedrock-invocationMetrics` event), so streaming spans are priced correctly — only the streamed
*text content* is lost. Mirror image of the OpenAI streaming case (which keeps text, loses usage).
**UNSOLVABLE at the instrumentor layer = WON'T-FIX.** Non-streaming Bedrock is unaffected (full text + usage).

**🐛 PRODUCT BUG FOUND (cost) — FIXED: Bedrock spans always cost $0.** Bedrock instrumentations report
the **bare** foundation model id (`claude-opus-4-8`) with no `<vendor>.` prefix, but models.dev keys
Bedrock entries WITH it (`anthropic.claude-opus-4-8`, `eu.anthropic.claude-opus-4-8`). `getModelForProvider`
(`packages/domain/models/src/registry.ts`) only stripped a *region* prefix (`eu.`/`us.`/`apac.`), so the
bare id missed every entry → `costImplemented:false` → 0. **Fix: `findBedrockModelByBareId` suffix-matches
`<vendor>.<modelId>` and prefers the non-regional base entry** (canonical pricing; the region is
unrecoverable once the instrumentor strips it). +unit test; 60 model-registry tests pass, typecheck clean.
Verified e2e: bedrock chat/stream/tools traces now priced. **Benefits Python Bedrock #27 too** (same registry).

**✅ SYSTEM-INSTRUCTIONS QA PASS (#1–#4) — done, 2 fixes applied.** Added a system prompt to every TS
example and re-ran to confirm `systemInstructions` capture. Results:
- **#3 Anthropic, #4 Bedrock (separate top-level `system` field):** ✅ already correct — traceloop emits
  `gen_ai.system_instructions`, Latitude lands it in the dedicated field. (This was the case the user
  worried about; it works.)
- **#1 OpenAI (system as inline `role:"system"` message):** was captured only inside `inputMessages`,
  `systemInstructions` empty. **FIX (Latitude, `genai.ts`): rosetta reconciliation pass** — for BOTH
  directions, run `safeTranslate(msgs, {from: Provider.GenAI, direction, system: systemInstructions})`
  passing the already-parsed `gen_ai.system_instructions` in alongside the messages, so rosetta lifts
  leading inline system turns into `systemInstructions`, merges them with any separated field, and keeps
  mid-conversation system inline. Ungated (always runs when there are messages) — rosetta is in charge of
  the system/messages split. Verified it preserves tool_call↔tool_result pairing + multimodal/reasoning/
  unknown parts verbatim. +2 unit tests. Note: rosetta tags the extracted system parts with
  `_provider_metadata: {_known_fields:{messageIndex}}` (positional round-trip bookkeeping; regular messages
  stay clean) — kept, not stripped, consistent with the other rosetta parsers (`json-value.ts`/`openinference.ts`).
- **#2 OpenAI Agents (agent `instructions`, separate field):** was DROPPED entirely. **FIX (our adapter,
  `openai-agents/instrumentation.ts`): forward `_response.instructions` → `gen_ai.system_instructions`**
  (`[{type:"text",content}]`), same pattern as the tool-definitions forward. +unit test. Folded into
  the **TS SDK 3.4.0** release (one version bump for the whole PR). Verified e2e: OpenAI `6ccce0da…` +
  Agents `30f96d87…` now show systemInstructions.

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
| 4 | AWS Bedrock (`bedrock`) | `test_bedrock.ts` | AWS | ✅ | ✅ | **DONE — user-approved (cost fix + system instructions), committed+pushed.** Updated (dep policy): `@traceloop/instrumentation-bedrock` 0.26.0→**0.27.0**, `@aws-sdk/client-bedrock-runtime` 3.1036.0→**3.1069.0** (3.1070+ <7d blocked). Model→`eu.anthropic.claude-opus-4-8` (cross-region profile; instrumentor's `_extractVendorAndModel` strips `eu.`→vendor `anthropic`, model `claude-opus-4-8`). Added stream + **tool conversation** (InvokeModel + Anthropic messages API w/ tools), tag `bedrock-ts`, region default `eu-central-1`, dropped junk bare call. **✅ Tool trace `584f5765…` (re-run after fix) fully correct:** user→assistant(text+tool_call get_weather)→**tool(result PAIRED by id)**→final answer; the `hoistToolResults` fix (from Anthropic #3) also covers Bedrock-Claude (`role:user` tool_result → hoisted to `role:tool`). Chat asst text OK; tokens on all 3 incl. **streaming usage ✅** (32/16). **🐛 BUG 1 — FIXED (Latitude registry): cost was 0 on ALL bedrock spans.** Instrumentor emits bare model `claude-opus-4-8`; models.dev keys bedrock models WITH vendor prefix (`anthropic.claude-opus-4-8` ✅, bare MISSING). `getModelForProvider` stripped only the *region* prefix → `costImplemented:false`. Fix: `findBedrockModelByBareId` in `registry.ts` suffix-matches `<vendor>.<model>` (prefers non-regional base) + unit test; 60 model tests pass, typecheck clean. Re-run: tools `$0.00673`, chat `$0.00050`, stream `$0.00056` (base `anthropic.claude-opus-4-8` $5/$25 — region price unrecoverable once instrumentor strips `eu.`, base is the defensible default). **Same fix benefits Python Bedrock #27.** **⚠️ BUG 2 (instrumentor limitation, WON'T-FIX): streaming asst content empty** (`parts:[]`) — 0.27.0's Anthropic messages-API streaming path returns only `finish_reason`, never accumulates `content_block_delta` text (usage comes from `invocationMetrics`). Analogous to OpenAI streaming-usage gap; non-streaming unaffected. **BUG 3 (WON'T-FIX): `toolDefinitions:[]`** — instrumentor emits no `gen_ai.tool.definitions` (same as Anthropic #3). |
| 5 | Cohere (`cohere`) | `test_cohere.ts` | Cohere | 🚫 | 🚫 | No key. |
| 6 | LangChain (`langchain`) | `test_langchain.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved, committed+pushed (2ed93df3a). Switched Traceloop → OpenInference.** Traceloop 0.27.0 had 3 real gaps (first call dropped via async-ESM-patch race; tool_call lost in convo; tool result as plain text, no pairing; `toolDefinitions:[]`). **Switched langchain to `@arizeai/openinference-instrumentation-langchain@4.0.12`** (runtime dep; removed `@traceloop/instrumentation-langchain`). User passes `@langchain/core/callbacks/manager` (openinference's `manuallyInstrument` patches it **synchronously** → no first-call race). `@langchain/openai` 1.4.4→**1.4.7**, `@langchain/core` 1.1.41→**1.1.49**. Model `gpt-5.5`, system prompt, tag `langchain-ts`. **Verified e2e (session `langchain-2d948c68`):** chat `ff4c3cbc…` now has the LLM span (first-call fixed ✅); tools `e75474b0…` shows full convo — `assistant(tool_call get_weather,id)`→`tool(tool_call_response,paired)`→answer, **toolDefinitions populated** ✅; reasoning tokens captured ✅. **Latitude parser fix:** openinference-langchain nests the provider in `metadata.ls_provider` (LangSmith) → added `providerFromOpenInferenceMetadata` candidate in `identity.ts` so provider=`openai` + **cost now computes** ✅ (+resolver test). Minor remaining: `finish_reason` not parsed from openinference `generationInfo` (cosmetic). |
| 7 | LlamaIndex (`llamaindex`) | `test_llamaindex.ts` | OpenAI | ✅ | ❌ | **BROKEN by upstream instrumentor — WON'T-FIX this pass (documented per user; our-own-instrumentor planned).** No OpenInference JS pkg for llamaindex (404) → traceloop only, and `@traceloop/instrumentation-llamaindex@0.27.0` is **OpenAI-only and broken in our setup:** its sole patch method is `patchOpenAI` and `init()` hooks only `llamaindex` + `@llamaindex/openai` (no anthropic/bedrock/etc.). It instruments the LLM **only** when `@llamaindex/openai` is passed as the **2nd `manuallyInstrument` arg**; the SDK passes one module → **LLM never patched → every trace is 1-span (captures nothing).** A spike SDK fix (auto-pass `@llamaindex/openai`) DID make chat work (`473f2dcc…`: sys instructions+tokens+cost ✅) but the user **rejected the band-aid** (don't contort the SDK for one shitty openai-only instrumentor) — **SDK change reverted.** Even when patched, agent tool-calls are lost (empty assistant turn), the tool result is a malformed `role:"user"` text blob (`{\city\:…}`) with no `tool_call_response`/pairing, `toolDefinitions:[]`, 0 tokens on agent spans, no execute_tool span; streaming = 0 tokens. KEPT: dep bump to 0.27.0, example refreshed (gpt-5.5 + `temperature:1` since openai() defaults 0.1 → gpt-5.5 400; system prompt; tag `llamaindex-ts`) with a header note. Revisit when we ship our own instrumentor. |
| 8 | Together AI (`togetherai`) | `test_together.ts` | Together→OpenAI | 🅾️ | ✅ | **DONE — user-approved. Faked via OpenAI endpoint (no openinference-together pkg — 404). Updated `@traceloop/instrumentation-together` 0.25.0→**0.27.0**, added `together-ai` **0.40.0** devDep. Setup fixes: pass the **`Together` class** not the module namespace (instrumentor wants `Together.Chat.Completions`/`Together.Completions` statics; namespace has no `.Chat` → was throwing "Cannot read 'Completions'"); `baseURL`→`https://api.openai.com/v1` + `OPENAI_API_KEY`; model `gpt-5.5` + `temperature:1` (reasoning-model req). Session `togetherai-3dc8c6e0`. **✅ chat `118d59d1…` (content), stream `d075acf4…` (usage 87 ✅), system instructions ✅, tool DEFINITIONS ✅, provider `togetherai`+model gpt-5.5.** **Provider IS resolved** (`gen_ai.system:"TogetherAI"` → `togetherai`) — NOT a missing-provider problem. **cost=0 is purely a faked-backend artifact:** we point the SDK at OpenAI's endpoint with `gpt-5.5`, which Together doesn't offer (Together only serves open-source models), so `getCostSpec("togetherai","gpt-5.5")` misses. models.dev HAS the `togetherai` provider with 31 priced models (e.g. `meta-llama/Llama-3.3-70B-Instruct-Turbo` $0.88/$0.88), so with a **real** Together key + model the cost WOULD compute. Not a Latitude bug. **🐛 Tool-call parsing — FIXED (Latitude deprecated parser).** togetherai instrumentor emits the OLD traceloop format with **id-less** tool_calls (`gen_ai.completion.0.tool_calls.0.{name,arguments}`, no `.id`); rosetta only renders a tool_call that has an id (else it dumps it to `_provider_metadata` → assistant showed `{text:"null"}`). Fix: `linkToolCalls` in `genai_deprecated.ts` mints `call_<i>_<j>` ids for id-less tool_calls + back-fills the matching tool result's `tool_call_id` (mirrors the openinference parser), and drops the redundant legacy `function_call` when `tool_calls` is present. +2 unit tests; 856 pass, typecheck clean. **Verified (session `togetherai-4c62a842`):** first-call output `ce725a94…` now renders `tool_call` (id `call_0_0`, get_weather) ✅. **⚠️ Residual (upstream instrumentor, WON'T-FIX):** in the 2-call agent flow the togetherai instrumentor does NOT serialize the assistant tool_call into the NEXT call's prompt (stringifies its null content as `"null"`, drops `tool_calls` + `tool_call_id`), so the trace **conversation view** (built from the last completion span = 2nd call) still shows `assistant{text:"null"}` + an unpaired tool result. The parser fix is general (helps any deprecated-format emitter that DOES carry the data). |
| 9 | Google Vertex AI (`vertexai`) | `test_vertex.ts` | GCP SA | 🚫 | 🚫 | Needs service-account creds. |
| 10 | Vertex AI Platform (`aiplatform`) | `test_vertex.ts` | GCP SA | 🚫 | 🚫 | Shares vertex instrumentation. |

## 2. TypeScript SDK — other modes & helpers

| # | Integration | Example file | Backend key | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 11 | Azure OpenAI (via `openai`) | `test_azure.ts` | Azure | ➖ | ➖ | No Azure key. **Redundant** — uses the `openai` instrumentation, already covered by #1. |
| 12 | OpenAI Responses API | `test_openai_responses.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved.** Responses API path of the openai instrumentation, served by **our own** `OpenAIInstrumentationWithResponses` wrapper (traceloop JS doesn't patch `responses.create`). Updated shared `openai` SDK **6.42.0→6.44.0** (6.45.0 <7d blocked); also runs #1's example — behavior unchanged. Example refreshed: model `gpt-5.5`, **system prompt via the separate top-level `instructions` field**, tag `openai-responses-ts`, `MAX_TOKENS=2000`, dropped junk bare call. Session `openai-responses-77ee26f7`. **✅ systemInstructions** — the out-of-band `instructions` field lands in `systemInstructions` (wrapper folds it → inline `role:"system"`; Latitude's rosetta hoist (from #1) lifts it). **✅ conversation** user→assistant(tool_call)→tool(result PAIRED by `call_id`)→final answer. **✅ streaming both text AND usage** (wrapper reads the final `response.completed` event → dodges the chat-completions tiktoken streaming-usage bug). **3 FIXES (our wrapper, +4 unit tests, 129 pass):** **(1) toolDefinitions was `[]`** → `buildRequestAttributes` now emits `gen_ai.tool.definitions` from `params.tools` (parser's flat-shape branch handles the Responses tool shape) — verified `get_weather` full schema. **(2) reasoning tokens were `0`** → `applyResponseAttributes` reads `usage.output_tokens_details.reasoning_tokens` → `gen_ai.usage.reasoning_tokens` (openai = inclusive output, resolver subtracts so no double-count) — verified stream 106 / chat 86, cost still correct. **(3) `isStreaming:false`** → emits `gen_ai.request.stream` — verified `isStreaming:true`. No Latitude parser changes needed (all 3 attrs already resolved). Cost ✅ all priced; `costIsEstimated:true` is normal (token-count × rate). |
| 13 | Vercel AI SDK (v4/5/6) | `test_vercel_ai.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved.** `experimental_telemetry` path; the `ai.*` span surface is shared across v4/5/6, so this one row covers all three. Example runs against **`ai` 6.0.208** (the "v4/5" label was stale → relabeled). Updated deps: `ai` 6.0.168→**6.0.208**, `@ai-sdk/openai` 3.0.53→**3.0.73** (6.0.209 / 3.0.74 <7d blocked). Example refreshed: model `gpt-5.5`, out-of-band **`system`** prompt, tag `vercel-ai-ts`, `MAX_TOKENS=2000`, dropped junk bare call. Session `vercel-ai-98d34fed`. **✅ systemInstructions** — the AI SDK `system` field lands via `ai.prompt.system` (clean). **✅ full conversation** `getTrace.allMessages` = system→user→assistant(tool_call)→tool(result PAIRED by id)→final answer. **✅ execute_tool span** (`ai.toolCall`). **✅ rich span tree** capture root → `ai.generateText` (`invoke_agent`) → [doGenerate `tool-calls` → toolCall → doGenerate `stop`]. **✅ reasoning tokens** (chat 110, stream 91 — AI SDK emits the breakdown). **✅ streaming** text + TTFT (~406ms). **✅ cost/provider/model** — @ai-sdk/openai routes gpt-5.5 through the **Responses API**, so provider resolves `openai.responses`, all priced. **🐛 FIX (Latitude parser): tool DEFINITIONS lost their parameter schema.** AI SDK v5+ serialises `ai.prompt.tools` with **`inputSchema`** (the `LanguageModelV*FunctionTool` spec), but `toToolDefinition` (`content/utils.ts`) read only `parameters` → name+desc captured, params dropped. Fix: read `inputSchema` as a fallback for `parameters` (safe additive; OpenAI shapes use `parameters`, unaffected) + 1 test; 874 spans tests pass. Verified: `getWeather` toolDefinition now carries the full JSON schema. Note: toolDefinitions live on the call-level `doGenerate` spans (carry `ai.prompt.tools`), not the top-level aggregate span. |
| 14 | Vercel AI SDK v7 | `test_vercel_ai_v7.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved.** v7 beta via npm aliases (`ai7`→ai@7.0.0-beta.181, `@ai-sdk/openai7`→@ai-sdk/openai@4.0.0-beta.74, `@ai-sdk/otel` 1.0.0-beta.127 — all already latest *eligible*; beta.182/128 <7d blocked). Emits the **OTEL gen_ai semantic conventions** via `registerTelemetry(new OpenTelemetry())` (scope `gen_ai`): capture root → `invoke_agent` → `step N` (`agent_step`) → `chat` + `execute_tool` — different parser path (genai.ts) than v6's traceloop `ai.*`. Example fixed: **`system`→`instructions`** (v7 deprecated `system`), model `gpt-5.5`, tag `vercel-ai-v7-ts`, 2000-token budget, dropped bare call. Session `vercel-ai-v7-d8fad8dd`. **✅ toolDefinitions WITH parameter schema** (benefits from the #13 `inputSchema` fix — raw `gen_ai.tool.definitions` uses `inputSchema`). **✅ conversation** user→assistant(tool_call)→tool(result PAIRED by id)→final answer. **✅ execute_tool span. ✅ cost/model** (provider `openai` — v7 routes gpt-5.5 via chat completions, not Responses). **🐛 FIX (CH rollup migration `00043`): systemInstructions were dropped from the trace/session view.** @ai-sdk/otel emits `gen_ai.system_instructions` **only on the `invoke_agent` span**; the leaf `chat` spans never carry it (confirmed by probe: passing system inline in `messages` with `allowSystemInMessages:true` is DROPPED entirely; only the separate `instructions` field is captured, on the wrapper). Migration `00040` gated the system_instructions rollup to model-call leaves → `invoke_agent` excluded → trace systemInstructions `[]`. Fix: add `invoke_agent` to the **system_instructions gate only** (messages/usage stay leaf-only — wrapper is lossy there); `argMinIf` picks earliest non-empty so v6/single-call integrations are unaffected (verified e2e: v6 no regression). New migration (clustered+unclustered) + testkit `schema.sql` sync + `rollup-operation-gate.test.ts` case; 327 CH tests pass. Verified: trace systemInstructions now populated (tools + chat). **⚠️ Finding (upstream @ai-sdk/otel, WON'T-FIX): reasoning tokens not captured** — @ai-sdk/otel emits no reasoning-token attribute (only input/output/cache_read), so `tokensReasoning:0` (folded into output_tokens — total/cost correct). v6 (traceloop) DOES break it out. Minor: `responseModel` null (only request model emitted). |
| 15 | Manual instrumentation | `test_manual_instrumentation.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved.** Manual spans created via the raw OTel tracer (scope `custom.manual.instrumentation`, NOT an auto-instrumentor) inside a `capture()`. No dep bump (openai 6.45.0 <7d blocked → stays 6.44.0; manual instrumentation uses no third-party instrumentor). Example rewritten to QA standard: gpt-5.5 + 2000-tok budget, system prompt, real `get_weather` tool conversation, manual spans wrapping the LLM work (`pipeline.prepare` / `execute_tool get_weather` / `pipeline.format`), session `manual-<rand8>`, tag `manual-instrumentation-ts`. Session `manual-a00593ac`. **✅ manual spans inherit latitude.* context + pass smart filter:** all 3 land under the capture root carrying `latitude.capture.name`/`latitude.tags`/`latitude.metadata`/`session.id`/`user.id` **plus their own custom attrs** (`prepare.step`, `prepare.cache_hit`). **✅ systemInstructions + full convo** (system→user→assistant tool_call→tool result PAIRED by id→final answer); **toolDefinitions** on LLM span ✅; cost/model/tokens ✅. **🔧 Fix (example, NOT Latitude): the manual tool span wasn't a real tool span.** It set arbitrary `tool.*` attrs → `operation:unspecified`, empty toolName/Id/Input/Output. Rewrote it to the **OTEL GenAI semconv (v1.37+)**: `gen_ai.operation.name=execute_tool` + `gen_ai.tool.name`/`gen_ai.tool.call.id`(=LLM's tool_call id)/`gen_ai.tool.call.arguments`/`gen_ai.tool.call.result`, span named `execute_tool get_weather`. Re-verified (`9fd8021df18a934950e023fec55d3eb3`): `operation:execute_tool`, toolName `get_weather`, toolCallId `call_HvgYD…` (matches LLM tool_call → deterministic span↔msg map), toolInput/Output populated. Resolvers already supported it (`operation.ts`/`tool-execution.ts`) — no Latitude code change. |
| 16 | Capture nesting | `test_capture_nesting.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved.** Nested `capture()` context merging. No dep bump. Example rewritten to QA standard: gpt-5.5 + 2000-tok, system prompt, inner capture runs a `get_weather` tool conversation, run tag `capture-nesting-<rand8>` + lang tag `capture-nesting-ts`. **🔧 Example bug FIXED (NOT Latitude): used a REMOVED decorator-style API.** Old example called `capture(options, fn)` (returns a wrapped fn) — that signature no longer exists; current API is **call-style** `capture(name, fn, options)`, so the old calls executed immediately + returned Promises → `outerFunction is not a function`. Rewrote to call-style with lexical nesting. **✅ Merge semantics verified per-span (both scenarios):** (1) **tags** merge + **dedupe** (`shared-tag` once; deep scenario accumulates level-1→2→3 by depth); (2) **sessionId/userId** last-write-wins (inner overrides outer / each level overrides parent); (3) **metadata** shallow-merge child-override (inner span: `outer_key` kept, `shared_key`→`inner_shared`, `inner_key` added). **Structure:** nested captures **reuse the active trace/root span and merge context only** — NO span per level; all LLM spans parent to the root capture span. Tool convo pairs correctly under merged context (system→user→tool_call→tool result PAIRED→answer); systemInstructions/toolDefinitions/cost/model ✅. Traces: s1 `c3d958136f413ecdb38ba23045e5960c` (root `outer-capture`), s2 `a1bb20533127c0d3377cfaeb5b336876` (root `level-1`). **Observation (not a bug):** trace-*summary* metadata rolls up the root span's `shared_key:outer_shared` (earliest-per-key) while inner *spans* correctly show `inner_shared` — per-span merge is correct. |
| 17 | Project scoping — single | `test_project_scoping_single.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved.** Single-project default scoping: constructor `project` (sent as `X-Latitude-Project` header) inherited by all `capture()` spans. No dep bump, no Latitude change. Example refreshed to QA standard (gpt-5.5 + 2000-tok, system prompt, `greet` + a `get_weather` tool conversation, session `project-single-<rand8>`, tag `project-scoping-single-ts`). Session `project-single-6f3ca280`. **✅ both traces landed in the default project `saloon`** (`7299f9f7…` greet, `9c93043b…` summarize-weather). Tool convo pairs (system→user→tool_call→tool result PAIRED→answer); systemInstructions/cost/model ✅. |
| 18 | Project scoping — multi | `test_project_scoping_multi.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved.** Multi-project per-capture routing: `new Latitude({apiKey})` with **no default project**; each `capture()` declares its own `project` (routed via `latitude.project` span attr). No dep bump, no Latitude change. **Setup via MCP:** created 2 projects `qa-primary` (`aog3lb38…`) + `qa-secondary` (`g5l5kebj…`). Example refreshed to QA standard (gpt-5.5 + 2000-tok, system prompt, `get_weather` tool conversation in primary capture, session `project-multi-<rand8>`, tag `project-scoping-multi-ts`) + **closed a doc/code gap**: docstring promised `LATITUDE_PRIMARY/SECONDARY_PROJECT_SLUG` overrides but code hardcoded the slugs — now actually reads them (defaults `primary`/`secondary`). Session `project-multi-a257dc7c`. **✅ split verified:** `full-stack-agent-run` (3 spans, tool convo) landed in `qa-primary`; `call-summariser-run` (2 spans, chat) landed in `qa-secondary` — same process. Tool convo pairs (system→user→tool_call→tool result PAIRED→answer); systemInstructions/metadata/cost/model ✅. |
| 19 | Project scoping — env | `test_project_scoping_env.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved.** Env-driven default + per-capture override: ctor reads `project` from `LATITUDE_PROJECT_SLUG`, a `capture({project})` overrides it (precedence: capture > ctor/env default). No dep bump, no Latitude change. **Setup via MCP:** created project `evaluation-runs` (`phrwis9n8…`). Example refreshed to QA standard (gpt-5.5 + 2000-tok, system prompt, `get_weather` tool conversation in default-route, session `project-env-<rand8>`, tag `project-scoping-env-ts`) + made `OVERRIDE_SLUG` configurable via `LATITUDE_OVERRIDE_PROJECT_SLUG`. Session `project-env-4c78c286`. **✅ verified:** `default-route` (3 spans, tool convo) landed in env default `saloon`; `evaluation-batch` (2 spans, chat) landed in override `evaluation-runs`. Tool convo pairs (system→user→tool_call→tool result PAIRED→answer); systemInstructions/cost/model ✅. |

## 3. TypeScript SDK — composable mode (run alongside other APMs)

| # | Integration | Example file | Backend key | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 20 | Datadog APM coexist | `test_datadog.ts` | OpenAI (+DD) | ⚠️ | ✅ | **REVIEW-ONLY (user: don't run — no DD setup) — reviewed + fixed, user-approved.** Old example was **broken**: (1) added `LatitudeSpanProcessor` to dd-trace's provider but **never registered any LLM instrumentation** (no `registerLatitudeInstrumentations` / `instrumentations`) → OpenAI never patched → zero `gen_ai.*` spans; (2) called `provider.addSpanProcessor(...)` directly on dd-trace's `TracerProvider`, but Latitude's `init.ts` only reaches Datadog via the internal `_activeProcessor._processors` fallback → that public method likely doesn't exist → would throw. **Fix:** rewrote to the **documented Datadog pattern** (`docs/telemetry/otel-exporter.md:227`): `tracer.init()` then `new Latitude({instrumentations:{openai:OpenAI}})` — the coexistence-aware ctor discovers dd-trace's global provider and attaches (has the DD fallback). Brought to QA standard (gpt-5.5+2000-tok, system prompt, tag `datadog-ts`, sessionId, `disableBatch`, client created after `latitude.ready`, `latitude.flush()/shutdown()`). Not typechecked (tsconfig=`src/**` only) / not run (dd-trace not installed). No Latitude code change. |
| 21 | Sentry coexist | `test_sentry.ts` | OpenAI (+Sentry) | ⚠️ | ✅ | **REVIEW-ONLY (user: don't run — no Sentry setup) — reviewed + fixed, user-approved.** Coexistence approach was **structurally correct**: `Sentry.init()` then `new Latitude({instrumentations})` second matches the documented pattern + the SDK's provider discovery (`init.ts` explicitly supports Sentry's `_activeSpanProcessor._spanProcessors`). No structural bug. Modernized to QA standard (gpt-4→gpt-5.5+2000-tok, system prompt, tag `sentry-ts`, sessionId, metadata, `disableBatch`, client created after `latitude.ready`); kept the deliberate `invalid-model`→`Sentry.captureException` error-capture demo. Not run (sentry not installed). No Latitude code change. |
| 22 | Existing OTel (Jaeger/Zipkin) | `test_existing_otel.ts` | OpenAI | ✅ | ✅ | **DONE — user-approved.** `LatitudeSpanProcessor` attached to a **user-owned** `NodeTracerProvider` (alongside their `BatchSpanProcessor`) + `registerLatitudeInstrumentations` for the LLM auto-instrumentation. No dep bump, no Latitude change. Example refreshed to QA standard (gpt-5.5 + 2000-tok, system prompt, `get_weather` tool conversation, session `existing-otel-<rand8>`, tag `existing-otel-ts`) + made existing-backend URL configurable via `OTEL_EXISTING_BACKEND_URL` + `disableBatch:true` on the Latitude processor. Session `existing-otel-7938aaac`, trace `44db06bd1140d0cfeb902fbf5f151105`. **✅ verified:** spans carry the user's resource `serviceName:"my-existing-app"` (proves Latitude piggy-backed, didn't create its own provider); tool convo pairs (system→user→tool_call→tool result PAIRED→answer); systemInstructions/cost/model ✅. The existing exporter's `ECONNREFUSED` to localhost:4318 (no collector running) is expected + independent of Latitude's export. |

## 3b. TypeScript — agent/workflow framework apps (standalone, OTLP-native)

These are standalone sub-projects (own `package.json`, excluded from the monorepo workspace).
Both emit OpenTelemetry spans natively and point an OTLP exporter at Latitude — Latitude is
expected to parse their framework-specific span attributes.

| # | Integration | Example dir | Backend key | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 57 | Eve (eve.dev) | `examples/eve-app` | OpenAI | ✅ | ✅ | **DONE (review-only; coworker tested the integration — not re-run).** Agent framework on Vercel AI SDK; spans `ai.eve.turn` / `eve.*` via `@vercel/otel` exporter (no Latitude `instrumentations` entry). Example reviewed = correct (the `pnpm-workspace.yaml` `allowBuilds` is pnpm auto-managed, not a bug). Docs `eve.mdx` reviewed = good + nav-registered. **Icon:** wide wordmark didn't read at small sizes → **uses the Vercel icon** (`eve: VercelIcon` in provider-map; Eve is a Vercel framework). **In-app instructions ADDED** (`onboarding-integration-snippets.ts` + `telemetry-instructions.tsx`): TS-only, `registerOTel` instrumentation-file snippet, no Latitude-SDK install (uses `@vercel/otel`; `providerUsesLatitudeSdk` opt-out). |
| 58 | Flue (flueframework.com) | `examples/flue-app` | OpenAI | ✅ | ✅ | **DONE (review-only; coworker tested — not re-run).** Workflow framework; spans via `@flue/opentelemetry` + Latitude SDK `createOpenTelemetryObserver()`. Example reviewed = correct (matches docs: `new Latitude({serviceName})` + `observe(createOpenTelemetryObserver())`). Docs `flue.mdx` reviewed = good + nav-registered. **Icon:** custom `flue.tsx` (black tile, theme-aware). **In-app instructions ADDED:** TS-only, `@flue/opentelemetry @opentelemetry/api` packages + init/observe snippet. |

---

## 4. Python SDK — auto-instrumentations

Package: `packages/telemetry/python`. Registry: `src/latitude_telemetry/sdk/instrumentations.py`.
Run via the uv venv at `packages/telemetry/python/.venv`.

| # | Integration | Example file | Backend key | Testable now | Status | Notes / bugs / fixes |
|---|---|---|---|---|---|---|
| 23 | OpenAI (`openai`) | `test_openai.py` | OpenAI | ✅ | ✅ | **DONE — user-approved.** openinference instrumentor (`openinference.instrumentation.openai@0.1.52`, latest eligible). Synced the stale venv to pyproject (otel-* 0.50.1→0.61.0, openai 2.30→2.41.1) — venv-only, no pyproject/lock change → no pkg version bump. Example refreshed to QA standard (gpt-5.5 + `max_completion_tokens=2000`, system prompt, tag `openai-py`, dropped bare call). Session `openai-b1ef0f23`. **✅ all 3 traces** (chat `0685c11b…` reasoning 72; stream `d9712252…` reasoning 96 — **streaming usage captured** ✅ unlike TS traceloop tiktoken bug; tools `db1ce073…`). Tool convo pairs (tool_call↔tool_result by id), systemInstructions ✅, toolDefinitions full schema ✅, cost/model/tokens ✅. **🐛 FIX (Latitude resolver): `finishReasons` was `[]` for openinference spans** — openinference emits singular `llm.finish_reason` (snake_case), not the gen_ai array. Added it to `finishReasonsCandidates` (`resolvers/response.ts`) + unit test; 875 spans tests pass. Verified live: tool-call span `["tool_calls"]`, final `["stop"]`. **Benefits all openinference integrations** (langchain #6, etc.). Cosmetic (left as-is per user): empty `text` part alongside the assistant tool_call (not displayed by the UI). |
| 24 | OpenAI Agents (`openai-agents`) | `test_openai_agents.py` | OpenAI | ✅ | ⬜ | openinference. |
| 25 | OpenAI Responses API | `test_openai_responses.py` | OpenAI | ✅ | ✅ | **DONE — user-approved.** `openinference.instrumentation.openai@0.1.52` **patches the Responses API natively** (spans named `Response`) — NO custom wrapper needed (unlike TS #12 which needs `OpenAIInstrumentationWithResponses`). Model gpt-5.5, **`instructions` field** for system, `max_output_tokens=2000`, tag `openai-responses-py`, dropped bare call. Session `openai-responses-4921e155`. **✅ systemInstructions** (the out-of-band `instructions` field → captured as system), **✅ tool convo pairs** (tool_call↔tool_call_response by id), **✅ toolDefinitions** full schema, cost/model/reasoning (chat 99, stream 147)/streaming-usage all correct. No dep/Latitude changes. |
| 26 | Anthropic (`anthropic`) | `test_anthropic.py` | Anthropic | ✅ | ✅ | **DONE — user-approved.** `opentelemetry.instrumentation.anthropic@0.61.0` (latest eligible; modern gen_ai semconv format). `anthropic` SDK stays pinned **0.40.0** (≥0.41 prompt caching breaks the instrumentor). Key from `~/.zshrc`. Example refreshed to QA standard (model `claude-opus-4-8`, `max_tokens=1024`, **added top-level `system` param**, tag `anthropic-py`, dropped bare call). Session `anthropic-1512168c`. **✅ systemInstructions** — the out-of-band `system` param lands correctly (instrumentor emits `gen_ai.system_instructions`). **✅ tool convo pairs** (system→user→assistant[text+tool_call `toolu_…`]→tool[result PAIRED via `hoistToolResults`]→answer). **✅ finishReasons** (`["tool_call"]`/`["stop"]`), streaming usage, cost/model/tokens. **⚠️ toolDefinitions `[]` — WON'T-FIX (upstream instrumentor limitation):** `opentelemetry-instrumentation-anthropic@0.61.0` emits no `gen_ai.tool.definitions` attribute (confirmed in raw span attrs). Identical to TS Anthropic #3 & Bedrock #4 (same openllmetry family). No Latitude code change. |
| 27 | AWS Bedrock (`bedrock`) | `test_bedrock.py` | AWS | ✅ | ✅ | **DONE — user-approved.** `opentelemetry.instrumentation.bedrock@0.61.0` via the **Converse** API. Default cred chain, region `eu-central-1`, model `eu.anthropic.claude-opus-4-8` (instrumentor strips `eu.`). Example rewritten to QA standard: chat + stream (converse_stream) + tool conversation (toolConfig), out-of-band `system` param, tag `bedrock-py`, dropped bare call. Local run needs `botocore[crt]` for the SSO/login cred provider (this machine's AWS auth only — NOT added to pyproject). Session `bedrock-a7cf3487`. **✅ chat/stream**: full convo + systemInstructions + usage; **streaming captures BOTH text AND usage** (better than TS Bedrock #4 which lost streaming text). **✅ cost computed** — the TS #4 registry fix (`findBedrockModelByBareId` strips `eu.` → `anthropic.claude-opus-4-8`) confirmed benefits Python Bedrock. **🐛 BIG FIX (dep bump): Bedrock Converse tool calls captured NOTHING** (empty messages/usage/cost) — verified NOT the example: instrumentor crashed in `set_converse_model_span_attributes` accessing `GenAIAttributes.GEN_AI_TOOL_DEFINITIONS`, which is absent from semconv 0.59b0 (bundled with the pinned opentelemetry 1.38.0); the `AttributeError` was swallowed by the instrumentor's `@dont_throw`, aborting all message/usage capture for any toolConfig converse turn. **Fix: bumped opentelemetry core 1.38.0 → 1.42.1** (api/sdk/exporter + `opentelemetry-instrumentation-threading` 0.59b0→0.63b1 → semconv 0.63b1); pkg version 3.3.0→**3.4.0** + CHANGELOG; 60 py tests pass; OpenAI #23 + Anthropic #26 re-verified unaffected. After the bump the tools trace `00389878…` captures the full convo (system→user→assistant[text+tool_call]→tool[result PAIRED]→answer), usage, cost, **and toolDefinitions** (bonus — Bedrock converse emits `gen_ai.tool.definitions`, unlike TS Bedrock #4 / Python Anthropic #26). |
| 28 | AWS SageMaker (`sagemaker`) | `test_sagemaker.py` | AWS | 🚫 | 🚫 | Creds OK but no deployed endpoint. |
| 29 | Cohere (`cohere`) | `test_cohere.py` | Cohere | 🚫 | 🚫 | No key. |
| 30 | LangChain (`langchain`) | `test_langchain.py` | OpenAI | ✅ | ⬜ | |
| 31 | LlamaIndex (`llamaindex`) | `test_llamaindex.py` | OpenAI | ✅ | ⬜ | openinference. |
| 32 | Together AI (`togetherai`) | `test_together.py` | Together→OpenAI | 🅾️ | ⬜ | No key — point `together` SDK `base_url` at OpenAI (`/v1`) with OpenAI key + OpenAI model. |
| 33 | Google Vertex AI (`vertexai`) | `test_vertex.py` | GCP SA | 🚫 | 🚫 | Needs service-account creds. |
| 34 | Gemini / Google GenAI (`google_generativeai`) | `test_gemini.py` | Google AI Studio | ✅ | ✅ | **DONE — user-approved.** `openinference.instrumentation.google_genai@1.1.0`. Model `gemini-3.5-flash` (latest), `system_instruction` config → systemInstructions ✅, toolDefinitions ✅, cost/reasoning/streaming-usage ✅, provider `google`. Tag `gemini-py`. Session `gemini-87a99f0b`. **🐛 DEP FIX: instrumentor needs `google.genai._interactions`, which google-genai REMOVED in 2.9.0** (present in ≤2.8.0; absent in 2.9.0/2.10.0). Without it the instrumentor hard-fails to register (`Could not import google-genai`) → no LLM spans. Pinned devDep **`google-genai==2.8.0`** (newest eligible that still has `_interactions`); instrumentor stays 1.1.0. **🐛 TOOL-PAIRING FIX (2 parts): Gemini function responses didn't pair.** (1) The instrumentor only emits `message.tool_call_id` when `function_response.id` is set → example now echoes `function_call.id` via `types.Part(function_response=types.FunctionResponse(id=…))`. (2) Gemini has no "tool" role — the result rides a `role:"user"` turn; extended the **openinference parser** (`openinference.ts`) to **extract** such a turn (non-tool role + `tool_call_id` + single `message.content`) into its OWN `role:"tool"` message (mirrors `hoistToolResults`; does NOT relabel the turn — leaves multi-part turns intact). +`resolvePendingToolCallId` helper + unit test; 876 spans tests pass. Verified (`6bf1e3b4…`): result now a separate `role:"tool"` message paired by id. |
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
| 54 | OpenClaw plugin | `packages/telemetry/openclaw` | OpenClaw plugin → streams agent runs as OTLP traces | ⚠️ | ⬜ | Needs OpenClaw ≥ 2026.4.25 on PATH. **NOTE (dev change #3668, now on this branch via rebase):** OpenClaw also ships a **native OpenTelemetry exporter** that Latitude now ingests directly — ingest drops the redundant unparented `openclaw.model.usage` span (`otlp/dropped-spans.ts`) and adds openclaw-specific resolvers (`resolvers/status.ts`, usage-from-`model.call`-spans in `usage.ts`, `operation.ts`); covered by `otlp/tests/openclaw.test.ts` + `docs/telemetry/openclaw.md`. So OpenClaw has TWO ingestion paths to QA: (a) this Latitude plugin (streams OTLP), and (b) openclaw's native OTel exporter. Verify both when reached. |
| 55 | OpenClaw CLI installer | `packages/telemetry/openclaw-cli` | One-shot installer for the OpenClaw plugin | ⚠️ | ⬜ | Installer/config tool — verify wiring, not trace shape directly. |
| 56 | Pi agent telemetry | `packages/telemetry/pi` | Pi coding-agent extension → streams sessions as OTLP traces | ⚠️ | ⬜ | Needs the Pi agent installed. |
| 59 | Hermes telemetry | `packages/telemetry/hermes` | **pip** plugin for Nous Research's **Hermes Agent** harness → streams sessions as OTLP traces (user prompts, model turns, tool calls/results, token usage, real system prompt). Same family as claude-code/pi/openclaw. | ⚠️ | ⬜ | **NEW (merged to development, picked up via the 2026-06-26 rebase; PRs incl. #3681).** Python pkg `latitude-telemetry-hermes` v0.1.0, entry point `hermes_agent.plugins` → `latitude`. Needs Hermes Agent installed in the **same** venv (official installer uses `~/.hermes/hermes-agent/venv`); enable via `~/.hermes/config.yaml` (**not** `hermes plugins enable` — hermes-agent#23802 reports pip plugins as "not installed" to the CLI). Has `tests/test_plugin.py`. Verify OTLP trace shape like the other harness integrations when reached. |
| 61 | Verifiers (Prime Intellect) telemetry | `packages/telemetry/verifiers` | **pip** library/CLI for Prime Intellect **Verifiers** eval rollouts → OTLP traces + optional custom scores from rewards/metrics. Same family as hermes/claude-code/pi. | ⚠️ | ⬜ | Python pkg `latitude-telemetry-verifiers` v0.1.0. No host plugin entry point — call `export_episodes` / `make_on_complete` from eval scripts, or `latitude-verifiers-export export <results_dir>` post-hoc. Docs: `docs/telemetry/verifiers.md`. Has `tests/test_mapper.py` + `tests/test_export.py`. |
| 60 | ElevenLabs Agents | `docs/telemetry/frameworks/elevenlabs.mdx` (docs-only) | Hosted voice-agent platform; observed via ElevenLabs **Custom LLM** → point the agent at a self-run OpenAI-compatible proxy instrumented with Latitude. | ⚠️ | ✅ | **DONE (review-only).** Not a Latitude package — the actual telemetry is the **OpenAI instrumentation** (#1) running on your proxy, so span parsing is already covered. Docs `elevenlabs.mdx` reviewed = good + nav-registered. **Icon:** custom `elevenlabs.tsx` (theme-aware bars). **In-app instructions ADDED:** TS+Py, custom-LLM proxy snippets (express / fastapi) with `instrumentations:{openai}`, packages `openai express` / `openai fastapi uvicorn`. |

> **Eve/Flue/ElevenLabs polish (this PR, 2026-06-26):** added provider icons as `.tsx` (`elevenlabs.tsx`, `flue.tsx`; Eve reuses `VercelIcon`), wired into `provider-map.ts` + barrel; added **in-app onboarding instructions** for all three to `onboarding-integration-snippets.ts` + `telemetry-instructions.tsx`. Docs pages + examples reviewed (no code bugs). Remaining non-SDK integrations (#54 OpenClaw paths, #55, #56 Pi, #59 Hermes) deferred to a follow-up PR.

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
| 2026-06-22 13:01 | Anthropic / TS (#3) re-run after tool-pairing fix (v2 hoist) | `anthropic-62d8f44a` | `example, anthropic, anthropic-ts, tools` | tools `b08a62b1115acb47bfcf46ba539640b6` (tool result hoisted to own `role:tool` msg) | ✅ approved (merged in #3655) |
| 2026-06-23 08:43 | Bedrock / TS (#4) | `bedrock-a5d9da0c` | `example, bedrock, bedrock-ts, [stream\|tools]` | tools `c63aef09e10056703ad00c3f32992d52`, chat `60e91e9be44a6b911335cc5f09623597`, stream `4382e06522755cf8360b18d174631445` | reviewed (user-confirmed): tool convo ✅; cost=0 (Latitude registry bug → fix); streaming asst text empty + tool defs empty (instrumentor, won't-fix) |
| 2026-06-23 09:04 | Bedrock / TS (#4) re-run after cost fix | `bedrock-4b52434d` | `example, bedrock, bedrock-ts, [stream\|tools]` | tools `584f5765752f354ddc31dc7f48cc9dbc` ($0.00673), chat `198281aa10f4b1b0cd6e281ced6a6ca1` ($0.00050), stream `d2e03323276ba52cbfc7bb4a91535a0d` ($0.00056) | cost now populated ✅ committed+pushed |
| 2026-06-23 09:16 | System-instructions pass #1–#4 (initial check) | `openai-8ddcc2ec`, `openai-agents-1c199904`, `anthropic-0cdc9998`, `bedrock-ff1e5594` | `…-ts, tools` | openai `2fd85f78…`, agents `5c72715f…`, anthropic `081a7b02…`, bedrock `3ffa25f7…` | Anthropic/Bedrock ✅; OpenAI sys only in messages; Agents sys DROPPED |
| 2026-06-23 09:33 | System-instructions pass re-run after fixes (#1 rosetta hoist, #2 adapter) | `openai-1c3c551d`, `openai-agents-92e0d386` | `…-ts, tools` | openai `6ccce0da235b2433a14c6097c029d374`, agents `30f96d871254d71ab4bd9295c73e466a` | both systemInstructions ✅ — committed+pushed (5d6e31e1c) |
| 2026-06-23 10:26 | LangChain / TS (#6) traceloop 0.27.0 | `langchain-fa7872af` | `example, langchain, langchain-ts, [stream\|tools]` | tools `4cda3ad2689c243c8505becac65664d4`, chat `be2c6e00d4a0a7e4250fd232a6f8cde2` (1 span — first-call gap) | traceloop: first-call dropped + tool-calls lost → switch to openinference |
| 2026-06-23 10:39 | LangChain / TS (#6) openinference 4.0.12 (composable spike) | `langchain-oi-cc1bb6c9` | `example, langchain, langchain-oi-ts, …` | tools `a663fd7d58bd93dcd68dd737f6caf4e9` | openinference WAY better — tool_call+result paired, toolDefinitions ✅, first-call ✅, reasoning ✅; only provider/cost missing |
| 2026-06-23 10:47 | LangChain / TS (#6) openinference via SDK + provider fix | `langchain-2d948c68` | `example, langchain, langchain-ts, [stream\|tools]` | tools `e75474b0a0f591a79f4992b35fa65dc2`, stream `9fd3de8e05bad7113b56b04c378549fb`, chat `ff4c3cbc5bf23ceaa38ec0918f86cf6f` | ✅ committed+pushed (2ed93df3a) |
| 2026-06-23 11:01 | LlamaIndex / TS (#7) — SDK-fix spike (pass @llamaindex/openai) | `llamaindex-cca3bdb7` | `example, llamaindex, llamaindex-ts, [stream\|tools]` | chat `473f2dcc482c8fa37aa0142c8f96e4a5` (✅ full), tools `ff35ed53ca63a2e9eeeff1c8d7a4e759` (tool_call lost), stream `bcc849c6e12beb2dc28f54ca1c080088` (0 tok) | spike worked for chat but user rejected the SDK band-aid → reverted; #7 documented as upstream-broken (openai-only instrumentor) |
| 2026-06-23 14:05 | Together AI / TS (#8) faked via OpenAI endpoint | `togetherai-3dc8c6e0` | `example, togetherai, togetherai-ts, [stream\|tools]` | chat `118d59d167af4e9dc7d613e3b87b692f`, stream `d075acf440986a6c1af598a59104548e`, tools `41d37996ec27c1d32dda830988edb18e` | chat/stream/sys-instructions/tool-defs ✅; tool_call in _provider_metadata (deprecated-format parser gap) → fix parser |
| 2026-06-25 06:06 | Together AI / TS (#8) after deprecated-parser tool_call fix | `togetherai-4c62a842` | `example, togetherai, togetherai-ts, [stream\|tools]` | tools `cfd3603a114681742eed025ab811670a` (first-call output `ce725a94…` now renders tool_call id `call_0_0`) | tool_call now rendered ✅; 2nd-call conversation view still upstream-limited; committed (187b29811) |
| 2026-06-25 08:30 | Branch maintenance — squashed 7 commits → 1, rebased onto `origin/development` (now incl. OpenClaw native-OTel #3668 + models.dev update #3632) | — | — | — | clean rebase (no conflicts; resolvers.test.ts 3-way auto-merged). Post-rebase: @domain/models 60, @domain/spans 873, @latitude-data/telemetry 125 — all pass; typechecks clean; lockfile `--frozen-lockfile` OK |
| 2026-06-25 07:00 | OpenAI Responses API / TS (#12) initial | `openai-responses-eb6e9824` | `example, openai-responses, openai-responses-ts, [stream\|tools]` | tools `6f62e3a38fea783ea92af5294f9b966b`, stream `061bcc0c…`, chat `21f68e40…` | reviewed: systemInstructions/convo/streaming-usage ✅; flagged toolDefinitions `[]`, reasoning `0`, isStreaming `false` |
| 2026-06-25 07:04 | OpenAI Responses API / TS (#12) after 3 wrapper fixes | `openai-responses-77ee26f7` | `example, openai-responses, openai-responses-ts, [stream\|tools]` | tools `3d4b9e6db82143a7c0d94a73e66ee94b` (toolDefinitions ✅), stream `d3c95c77…` (isStreaming ✅, reasoning 106), chat `2433e1ec…` (reasoning 86) | ✅ user-approved |
| 2026-06-25 07:17 | Vercel AI SDK v6 / TS (#13) initial | `vercel-ai-cf21ddb7` | `example, vercel-ai, vercel-ai-ts, [stream\|tools]` | tools `b33b58b2ab8cef362dd9ca661d9391d1`, stream `e89de3b7…` (reasoning 91, TTFT 406ms), chat `60de94a2…` (reasoning 110) | reviewed: systemInstructions/convo/pairing/execute_tool/reasoning ✅; flagged toolDefinitions missing `parameters` (v6 uses `inputSchema`) |
| 2026-06-25 07:31 | Vercel AI SDK v6 / TS (#13) after toToolDefinition inputSchema fix | `vercel-ai-98d34fed` | `example, vercel-ai, vercel-ai-ts, [stream\|tools]` | tools `27ed5252819ff8a1cfe29b0c2b280b45` (toolDefinitions now carry full JSON schema ✅) | ✅ user-approved |
| 2026-06-25 09:42 | Vercel AI SDK v7 / TS (#14) initial | `vercel-ai-v7-8635d9b1` | `example, vercel-ai-v7, vercel-ai-v7-ts, [stream\|tools]` | tools `c06c962b93b300a371ca2b7345c61b70`, stream `44dd90a7…`, chat `3e4f542b…` | reviewed: gen_ai conv shape, toolDefinitions ✅, convo/pairing ✅; flagged systemInstructions dropped (on invoke_agent span, gated out) + reasoning 0 (upstream) |
| 2026-06-25 15:59 | Vercel AI v7 system-routing probe (in-messages vs both) | `vercel-ai-v7-sysprobe-1de78973` | `example, vercel-ai-v7-sysprobe, [in-messages\|both]` | in-messages `53ed0d29…`, both `a24a3e3a…` | confirmed: inline system DROPPED by @ai-sdk/otel; separate `instructions` only, on invoke_agent span → rollup gate fix is the only path |
| 2026-06-25 16:06 | Vercel AI SDK v7 / TS (#14) after rollup migration 00043 (instructions field) | `vercel-ai-v7-d8fad8dd` | `example, vercel-ai-v7, vercel-ai-v7-ts, [stream\|tools]` | tools `8b13c9f58116d3381b93ef8be787fd64` (systemInstructions ✅), chat `7bb41b80…` (systemInstructions ✅); v6 regression re-run `vercel-ai-debbe2ae` chat `5e520948…` (still ✅) | ✅ user-approved |
| 2026-06-26 | Branch maintenance — squashed #12–#14 (4 commits) → 1, rebased onto `origin/development` (33 incoming commits incl. Hermes #3681 + ElevenLabs docs #3689 + v0.3.19 release) | — | — | — | one conflict (`pnpm-lock.yaml`, regenerated; package.json auto-merged incl. dev's `@opentelemetry/core` 2.8.0). Post-rebase: telemetry 129, models 60, spans 874, db-clickhouse 332 — all pass; typechecks clean; `--frozen-lockfile` OK. Added Hermes (#59) + ElevenLabs (#60) to the QA backlog. |
| 2026-06-26 10:06 | Manual instrumentation / TS (#15) initial | `manual-4afa84a6` | `example, manual-instrumentation-ts, tools, openai` | `060d97215101d83c32c530709bfb199c` | reviewed: manual spans inherit latitude.* + pass filter ✅, convo/sysInstr/toolDefs ✅; flagged manual tool span not classified as a tool span (`operation:unspecified`) |
| 2026-06-26 10:23 | Manual instrumentation / TS (#15) after execute_tool semconv fix | `manual-a00593ac` | `example, manual-instrumentation-ts, tools, openai` | `9fd8021df18a934950e023fec55d3eb3` (`execute_tool get_weather` now `operation:execute_tool` + toolName/Id/Input/Output ✅) | ✅ user-approved |
| 2026-06-26 10:28 | Capture nesting / TS (#16) — rewrote removed decorator API → call-style | run tag `capture-nesting-dcdd3339` (sessions outer/inner + level-1/2/3) | `capture-nesting-ts, …` | s1 `c3d958136f413ecdb38ba23045e5960c` (outer-capture), s2 `a1bb20533127c0d3377cfaeb5b336876` (level-1) | ✅ user-approved — tag dedupe/merge, session/user override, metadata shallow-merge all verified per-span |
| 2026-06-26 10:34 | Project scoping single / TS (#17) | `project-single-6f3ca280` | `example, project-scoping-single-ts, [tools]` | greet `7299f9f77ac43003ce44566bdffa9b24`, tools `9c93043b6522f202083b7780fce3d353` | ✅ user-approved — both traces in default project `saloon` |
| 2026-06-26 10:38 | Project scoping multi / TS (#18) — created `qa-primary`/`qa-secondary` via MCP | `project-multi-a257dc7c` | `example, project-scoping-multi-ts, …` | primary `20eb626f69fe92c824d991b82bce2121` (full-stack-agent-run, tools), secondary `b402fcb88355099b75cbb144920190c1` (call-summariser-run, chat) | ✅ user-approved — per-capture project split verified across qa-primary/qa-secondary |
| 2026-06-26 12:41 | Project scoping env / TS (#19) — created `evaluation-runs` via MCP | `project-env-4c78c286` | `example, project-scoping-env-ts, [tools]` | default `99c7895be7effb7721e565b879c77d78` (in env-default `saloon`), override `d2aa2feb18fe968063b1ba39271679b8` (in `evaluation-runs`) | ✅ user-approved — env-default + per-capture override precedence verified |
| 2026-06-26 12:48 | Datadog (#20) + Sentry (#21) coexist — REVIEW-ONLY (not run) | — | `datadog-ts` / `sentry-ts` | — | ✅ user-approved — Datadog rewritten to documented `new Latitude()` coexist pattern (was missing instrumentation registration); Sentry already correct, modernized |
| 2026-06-26 12:51 | Existing OTel / TS (#22) | `existing-otel-7938aaac` | `example, existing-otel-ts, tools` | `44db06bd1140d0cfeb902fbf5f151105` (serviceName `my-existing-app` ✅) | ✅ user-approved — LatitudeSpanProcessor piggy-backs on user-owned provider; tool convo + cost + systemInstructions all correct |
| 2026-06-26 15:20 | OpenAI / Py (#23) — after finish_reason resolver fix | `openai-b1ef0f23` | `example, openai-py, [stream\|tools]` | chat `0685c11bf7eb5a35e88dd0f47c824bc0`, stream `d9712252a6ee3d5c6c93df4aea5da11e`, tools `db1ce0733b4c617d86f3c0b72a8332c8` (finishReasons now `[tool_calls]`/`[stop]` ✅) | ✅ user-approved |
| 2026-06-26 15:24 | Anthropic / Py (#26) | `anthropic-1512168c` | `example, anthropic-py, [stream\|tools]` | chat `0f708a029f167aaea33aa5c06643e39c`, stream `2f470abada6df9d6a8c3a9421b27d8d9`, tools `d68ab434ae242d38c242c096b361ea34` | ✅ user-approved — systemInstructions (separate `system` field) + tool pairing ✅; toolDefinitions `[]` WON'T-FIX (upstream) |
| 2026-06-26 17:47 | Bedrock / Py (#27) — after opentelemetry 1.38→1.42.1 bump | `bedrock-a7cf3487` | `example, bedrock-py, [stream\|tools]` | chat `adc3c8b911245475e9f86fc1f3dd01a4`, stream `6161234792e23914a7d3633d0b9cf69b`, tools `00389878dc3f3b026867f413d65d70aa` (now full convo+usage+cost+toolDefinitions) | ✅ user-approved — converse-tools crash root-caused (missing semconv GEN_AI_TOOL_DEFINITIONS, swallowed by @dont_throw) + fixed via core bump; OpenAI/Anthropic re-verified |
| 2026-06-26 18:24 | Gemini / Py (#34) — google-genai pin 2.8.0 + tool-pairing extract fix | `gemini-87a99f0b` | `example, gemini-py, [stream\|tools]` | tools `6bf1e3b4065884fdbcd2e65a77586766` (function response extracted to role:tool, paired by id) | ✅ user-approved |
| 2026-06-26 18:29 | OpenAI Responses / Py (#25) | `openai-responses-4921e155` | `example, openai-responses-py, [stream\|tools]` | chat `f586fb34d173fea1d26f2be541107f7e`, stream `8d6daf7797d456d89d622a7e613133ed`, tools `c1c243747fefe3aebb86523b28c81523` | ✅ user-approved — openinference patches Responses natively; systemInstructions/pairing/toolDefinitions all ✅ |
