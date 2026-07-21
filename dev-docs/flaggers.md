# Flaggers

Flaggers are Latitude-authored automatic issue detectors. They inspect every settled **session** (after its conversation-intelligence analysis), write SYSTEM-authored annotation scores when they find a defect, and those scores flow into the same signal-discovery pipeline as human annotations (see [`./signals.md`](./signals.md)).

Domain code: `packages/domain/flaggers`. Orchestration: `apps/workflows/src/workflows/{flagger-screening-workflow,flagger-classification-workflow}.ts` + `activities/flagger-session-activities.ts`, started via the `flagger-screening` queue worker (`apps/workers/src/workers/flagger-screening.ts`). Offline harness: `tools/ai-benchmarks`.

Detection runs in two passes:

- **Screening** — deterministic, free, 100% of sessions. Gathers the session's *hints*, runs every strategy's deterministic detection, writes hard matches directly, and routes the rest to the LLM pass.
- **Classification** — the LLM pass for one session×flagger: classify → adversarial review → draft (billing) → save. Reached only through the hinted or sampled gates.

## What a flagger is

A **flagger** is a per-project configuration row that turns one detection *strategy* on or off and sets how aggressively it samples. The detection logic lives in code (the strategy registry); the row is just the switch.

Entity (`entities/flagger.ts`): `{ id, organizationId, projectId, slug, enabled, sampling }`. Defaults: `enabled = true`, `sampling = 10` (percent; affects only the LLM `unmatched` path). Postgres table `flaggers` with org RLS and a unique `(organization_id, project_id, slug)` constraint that backs idempotent provisioning (`provisionFlaggersUseCase`, run on `ProjectCreated`, by seeds, and by backfill migrations when new slugs ship). A 5-minute Redis cache (`org:${org}:flaggers:${project}`) serves the hot path; updates evict after commit.

The public API exposes flaggers only on `PATCH project` (`flaggers: partialRecord(slug, boolean)` — `enabled` only, no `sampling`). The web settings page renders a switch per row plus a sampling slider for LLM rows.

## The strategy registry

`FLAGGER_STRATEGY_SLUGS` / `STRATEGY_REGISTRY` (`flagger-strategies/`): **14 strategies** — 10 LLM-capable, 4 deterministic-only, of which `trashing` is a hybrid. The slug `trashing` is a **frozen historical typo** (persisted in DB, ClickHouse, and the public API); the display name is "Thrashing" — never rename the slug.

| Slug | Display | Judges | Mode | Deterministic outcome | `hintKinds` | `suppressedBy` |
|------|---------|--------|------|----------------------|-------------|----------------|
| `frustration` | Frustration | user wording | LLM | — | `pattern:frustration`, `moment:user_frustration`, `moment:escalation`, `moment:abandonment`, `tool:error`, `span:error` | — |
| `nsfw` | NSFW | user + assistant text | LLM | — | `pattern:nsfw` | — |
| `refusal` | Refusal | assistant response | LLM | — | `pattern:refusal`, `moment:policy_refusal` | `jailbreaking`, `nsfw` |
| `laziness` | Laziness | assistant response | LLM | — | `pattern:deferral`, `moment:stalling` | `trashing` |
| `jailbreaking` | Jailbreaking | user + injected/tool input | LLM | — | `pattern:injection` | — |
| `forgetting` | Forgetting | assistant vs earlier turns | LLM | — | `moment:clarification_loop`, `moment:user_frustration`, `moment:user_correction`, `pattern:frustration` | — |
| `trashing` | Thrashing | tool-call sequence | Hybrid | identical calls ≥3 → `matched` | `tool:loop`, `tool:error`, `outlier:tokens`, `outlier:duration`, `outlier:cost`, `moment:stalling` | — |
| `bluffing` | Bluffing | assistant after failed tool calls | LLM | — | `tool:error` | — |
| `pii-leakage` | PII leakage | assistant output | LLM | — | `pattern:pii` | — |
| `incompletion` | Incompletion | assistant response vs the user's follow-up | LLM | — | `moment:user_correction`, `pattern:frustration` | — |
| `tool-call-errors` | Tool call errors | tool responses + declared toolset | Det | malformed/duplicate/failed/undeclared-tool → `matched` | — | — |
| `output-schema-validation` | Output schema validation | assistant JSON text | Det | truncated/unparseable JSON → `matched` | — | — |
| `empty-response` | Empty response | last assistant turn | Det | empty/degenerate → `matched` | — | — |
| `low-cache-hit-rate` | Low cache hit rate | token aggregates | Det | hit-rate <30% on large multi-turn → `matched` | — | — |

### Strategy shape

Strategies consume a **`FlaggerConversation`** (`src/conversation.ts`): `allMessages`, `outputMessages`, `systemInstructions`, `tags`, token aggregates, optional `definedTools`. It is built from a `SessionDetail` by `buildFlaggerSessionContext` — system instructions + the latest responsive span's input window + output, via `sessionConversationMessages` (`@domain/spans`), the same list the session drawer renders and the conversation-intelligence analyzer segments, so **message indices align across all three**. `TraceDetail` satisfies the shape structurally (eval harness, regression tests).

Strategy modules embed multi-KB system prompts, so they are **server-only**: the package is marked `"sideEffects": false` and the registry validation runs from a test (`assertFlaggerRegistryValid`), not a module-load IIFE, so a client bundle that imports `@domain/flaggers` tree-shakes the strategies away. Web UI surfaces read the lightweight `FLAGGER_DISPLAY` table (`flagger-strategies/display.ts`, no strategy imports; kept in sync by `display-sync.test.ts`) instead of `getFlaggerStrategy`, and slug lists come from `types.ts` — never import the registry index into client-reachable code.

`FlaggerStrategy` (`flagger-strategies/types.ts`): `hasRequiredContext`, optional `detectDeterministically` (→ `matched | unmatched`), `buildSystemPrompt`/`buildPrompt`/`annotator` for LLM strategies, `details` for deterministic-only display, `classifiesAssistantResponseOnly` (default `true`; `false` for user/input-centric strategies — drives the targeting guidance in classifier and reviewer prompts), `suppressedBy`, `hintKinds`, optional `isHintedBy` override, and optional `validateMatch` — a code-level gate on LLM matches, enforced after classification and before the adversarial review.

`incompletion` judges **closed task episodes** only: an assistant response with a *later user reaction* evidencing whether the task was delivered. Session-end is arbitrary (the session may keep growing after a screen), so the latest assistant response is structurally unflaggable — its `validateMatch` rejects any match not citing a closed episode's assistant index, which also blocks the index-less anchor fallback (the last assistant message). A later re-screen judges that turn once the user has reacted, and the content-anchor dedup keeps repeat convictions single.

**Suppression** (`suppressedBy`): declared on the suppressed strategy; each entry is a suppressor slug or `{ slug, whenHintedBy }`. A suppressor triggers when it is `matched`, or `hinted` (started or rate-limited) — for qualified entries only when one of the edge's `whenHintedBy` kinds fired, so a weak escalation lead does not mute the suppressed strategy. Validated by `assertFlaggerRegistryValid` (run from tests, not at module load): one level deep (suppressors run in phase 1, suppressed strategies in phase 2) and `whenHintedBy` ⊆ the suppressor's `hintKinds`. Edges: `refusal` ← `jailbreaking`/`nsfw` (any hint — their single pattern hint is direct evidence of the ask being adversarial); `laziness` ← `trashing` `whenHintedBy: [tool:loop]` (a stuck loop is a different failure than punting work, but a lone `tool:error` or a `moment:stalling` — also laziness's own hint — is not loop evidence).

## Trigger chain

```
trace-end (90s debounce) ─► session-end (5-min session debounce)
   ─► analyzeSessionWorkflow (moments)
       └ persist activity ─► publish flagger-screening/start {org, project, sessionId, analysisHash}
   ─► flagger-screening worker ─► flaggerScreeningWorkflow
       └ per surviving request: detached child flaggerClassificationWorkflow
```

- The moments persist activity publishes for **every recorded generation, including `skipped_*`/`failed` analyses** — a session too short for moments still deserves tool-error/jailbreak/empty-response screening (hints degrade to none). It does not publish on `hash_current` (nothing changed) nor for `backfill`/`manual_reprocess` reasons. The publish is best-effort — a queue failure never fails the persist.
- The BullMQ dedupe key embeds the `analysisHash` (`org:${org}:flagger-screening:${project}:${session}:${hash}`): persist retries collapse while each new session generation screens again. A bare per-session jobId would shadow later generations after the first completes. Failed analyses persist a zeroed hash but publish with a per-trigger key (`failed-${triggeringTraceId}`) for the same reason — an all-zero key would shadow every later failed generation behind the first.
- The worker is a thin BullMQ→Temporal starter (retry isolation against Temporal outages); the screening workflow id is `flagger-screening:${sessionId}:${hash16}`.
- Sandbox traces never reach session-end; sessionless traces are materialized as single-trace sessions by the sessions MV, so every trace is reachable.

## The screening pass

`screenSessionFlaggersUseCase` (`use-cases/screen-session-flaggers.ts`), run by the `screenSessionFlaggers` activity:

1. `loadFlaggerSessionContextUseCase` loads the `SessionDetail` and resolves the session's **latest output trace** (`findLatestOutputTraceId`) — the single anchor every score row, billing event, and classification run keys to. Sessions that are missing or have no traces skip the pass (the scores ClickHouse sync stores `trace_id` as `FixedString(32)`, so a fabricated non-trace anchor would poison the write path).
2. **Reflag suppression**: `isReflagSuppressed(session.tags)` skips flagger-generated sessions (see below).
3. **Hints are gathered once** (`gatherSessionHintsUseCase`) and handed to all strategies.
4. Two-phase strategy fan-out (suppressors first), each strategy isolated by `Effect.catch`. Per strategy: gates (row exists / enabled / suppressor / `hasRequiredContext`) → `detectDeterministically`:

| Result | LLM-capable? | Hinted? | Action |
|--------|--------------|---------|--------|
| `matched` | any | — | write the score now (free, no LLM, anchored + `contentHash`) |
| `unmatched` | yes | yes | rate limit (hinted bucket) → start classification. **Never sampled.** |
| `unmatched` | yes | no | sample at `flagger.sampling` → rate limit (sampled bucket) → start classification |
| `unmatched` | no | — | dropped |

The activity logs one summary line per pass (decision counts, fired hint kinds, started classifications) — the hinted-vs-sampled match-rate comparison is readable off plain logs; there is no dedicated analytics pipeline.

### Sampling

Deterministic hash, not RNG (`@domain/shared/deterministic-sampling`): stable hash of `[org, project, slug, sessionId, analysisHash]` compared against the sampling %. Each session **generation** re-rolls once; re-published jobs for the same generation decide identically.

### Rate limiting

Three independent Redis fixed windows per org+slug (`org:${org}:ratelimit:flagger-llm:${bucket}:${slug}`, fail-open):

| Bucket | When | Limit |
|--------|------|-------|
| `hinted` | negative hints escalated the strategy | 30/60s (`FLAGGER_HINTED_RATE_LIMIT`) |
| `sampled` | sampled-in, no positive hints | 25/60s |
| `sampled-positive` | sampled-in, session carries positive hints | 5/60s |

## The hint catalog

Hints (`src/hints/`) are cheap, deterministic, session-scoped evidence — gathered once per screening pass, visible to **all** strategies and rendered into the classifier prompt. A gatherer may never call an LLM; embeddings only when already computed upstream (moment labels — the reason screening runs after moments). Kinds follow `<entity>:<hint>`; a `SessionHint` carries an optional anchor (`messageIndex`/range/`spanId`/`toolCallId`) and short `evidence`.

**Polarity**: negative hints (the default) mean "may have an issue" and trigger `hinted`; positive hints (`moment:user_satisfaction`, `moment:resolution` — `POSITIVE_SESSION_HINT_KINDS`) never trigger, they only shrink the sampled rate-limit bucket. Moment kinds added in conversation-intelligence join the union automatically (`moment:${MomentLabelKind}`) but default to negative — declare positive ones explicitly.

| Gatherer | Emits | Source |
|----------|-------|--------|
| span-errors | `span:error` | `session.errorCount > 0` |
| tool-errors | `tool:error` (≤10, anchored) | `collectToolCallErrorFindings` |
| tool-loop | `tool:loop` | one tool ≥60% of ≥5 calls (`findDominantToolUsage`) |
| analytical-outliers | `outlier:duration/ttft/tokens/cost` | session value ≥ project p90 (`getCohortBaseline`, gated ≥30 samples, Redis-cached 15 min per project) |
| moment-labels | `moment:<kind>` (10 kinds, anchored to the label range) | `SessionMomentLabelRepository`, pinned to the latest **analyzed** generation |
| frustration/refusal/deferral/injection/nsfw/pii patterns | `pattern:*` | strategy-tuned regex/scoring extractors (the pattern extractors used by jailbreaking/nsfw/pii prompts are shared with their strategies) — a regex miss drops the hint, so `jailbreaking`/`nsfw` evidence prompts fall back to the real conversation text rather than an empty block |

Per-gatherer failures are isolated to zero hints. The `pattern:*` gatherers are the old per-strategy `ambiguous` pre-filters relocated into the catalog, so their output is visible to every strategy — `forgetting`, which has no detector of its own, is hinted by clarification-loop/user-correction/frustration evidence.

## The classification pass

`flaggerClassificationWorkflow` runs as a detached child per session×slug (id `flagger-classification:${sessionId}:${slug}`, `ParentClosePolicy.ABANDON` — concurrent duplicates dedupe, a later generation re-runs after completion):

```
classifySessionFlagger ──(matched?)──► draftSessionFlaggerAnnotation ──► saveSessionFlaggerAnnotation
   │no                                  (anchor dedup → billing)          (write score)
   └► "not_matched"                     │duplicate anchor → "duplicate"
```

`classifySessionFlaggerUseCase` short-circuits before ClickHouse when the slug has no strategy, isn't LLM-capable, or the row is disabled; then loads the session context and delegates to `classifyConversationForFlaggerUseCase` (`use-cases/run-flagger.ts`):

- **Inspected-agent context**: the evaluated agent's system prompt is injected verbatim when ≤6,000 chars; longer prompts are summarized by the instruction-extractor LLM, aggressively cached (normalized-prompt SHA exact hits + a per-project SimHash near-duplicate index, Hamming ≤6). No system prompt at all ⇒ classification skipped.
- **Classify**: the classifier LLM receives the agent context, a `<session_hints>` block (every fired hint with anchors + evidence, capped at 20 hints × 256 chars, with explicit "leads, not proof — verify against the transcript" guidance), the strategy's evidence prompt in `<evaluated_trace_evidence>` tags, a targeting footer, and the structured-output contract. `messageIndex` is offered as a Zod enum of the conversation's real indices (strings, capped at 200) so Bedrock cannot run the field away to the token cap; indices land in the session drawer's index space. Unclassifiable model failures (no-object, schema mismatch, prompt-too-long) degrade to `matched: false`. The generation schema requires `matched` and a **nullable but required** `feedback` — constrained decoders omit optional fields (Bedrock Haiku at t0 did), and a matched output without feedback is discarded at parse, annotated `flagger.malformedClassifierOutput`.
- **Adversarial review**: a second classifier call approves or rejects the proposed annotation — the primary precision guard.
- On a confirmed match the use-case computes the **`contentHash`** (below) and returns it with the session metadata the draft/save steps need.

Models resolve per stage via `resolveGenerationConfig` (`LAT_AI_FLAGGER_{CLASSIFIER,EXTRACTOR,ANNOTATOR}_*` env overrides): classifier haiku t0/512, extractor + annotator minimax. The classifier's feedback is normally final; the annotator LLM only runs as a fallback for a match without feedback text.

## Scores, anchors, and dedup

Both the deterministic matched path and the LLM save path funnel through `upsertFlaggerAnnotationScore`: a row in the `scores` table with `sourceType: "annotation"`, `sourceId: "SYSTEM"`, `value: 0`, `passed: false`, `metadata: { rawFeedback, flaggerSlug, messageIndex?, contentHash? }`. The row's `sessionId` is the flagged session and its `traceId` is the session's latest output trace, so trace-level surfaces stay coherent.

Sessions re-screen on every settle and scores are never deleted, so dedup happens at write time in two layers:

1. **Exact feedback per trace** — catches deterministic strategies, whose feedback text is stable.
2. **Content anchor per session** — at most one published SYSTEM score per `(projectId, sessionId, flaggerSlug, contentHash)`, where `contentHash = sha256` of the anchored message's content (the `messageIndex` message; last assistant message when no index). Content survives compaction renumbering (indices don't) and LLM re-wording (feedback text doesn't), while one flagger can still flag several distinct parts of a long conversation.

The anchor dedup is a select-then-insert without a DB unique constraint: a narrow race across overlapping generations can double-publish an anchor. Accepted — signal clustering groups the duplicates; a partial unique index is the follow-up if it shows up in practice.

Context compaction mirrors the moments stance: the analyzed window is the last responsive span's input (post-compaction that is the summary + subsequent turns). Pre-compaction windows that settled earlier already got their own screening pass, and the anchor dedup makes passes additive.

`writeScoreUseCase` emits `ScoreCreated` → signal discovery clusters by feedback embedding (per project, not per slug — the annotator prompt is tuned to produce similar text for similar issues) → signals with `source: "flagger"` are auto-monitored → escalation → incidents. See [`./signals.md`](./signals.md).

## Billing

- Deterministic screening is free.
- LLM scans bill `flagger-scan = 30 credits` in `draftSessionFlaggerAnnotation`, **only after a confirmed match** — classify-only misses consume Latitude's model spend but are not billed. The anchor dedup runs **before** billing authorization, and the idempotency key is `flagger-scan:{org}:{slug}:{sessionId}:{contentHash}` — one charge per distinct flagged anchor. Out of credits ⇒ the scan is skipped (`NoCreditsRemainingError`).
- Spend governors on the LLM path: the sampling default (10%) and the three rate-limit buckets.

## Self-observability (reflag)

Every production flagger LLM call is traced into the `latitude-flaggers` dogfood project, and the flaggers run on that project too. To bound recursion to one level (`src/reflag.ts`): a flagger running on a flagger-generated session stamps its own LLM output with the no-reflag tag, and screening skips any session whose tags carry it. Session tags are the union of span tags, and flagger telemetry sessions are effectively per-trace, so the union semantics are safe.

Meta-flagger prompts also neutralize nested `<evaluated_trace_*>` markup inside embedded message JSON, and the classify path discards LLM matches when every assistant turn on a `flagger:classify` / `flagger:draft` conversation is already structured flagger JSON (`{matched, feedback}`). That stops dogfood strategies from re-scoring nested third-agent evidence inside a production classify prompt (e.g. bluffing excerpts) as if it were a defect of the flagger's own output.

## Quality tooling

- **Offline benchmark harness** (`tools/ai-benchmarks`): replays public datasets through the real classifier (no deterministic routing, no sampling, no hints) — measures classifier accuracy in isolation. Registered targets: `flaggers:jailbreaking` (JailbreakBench) and `flaggers:refusal` (XSTest) with committed baselines; the other strategies have none.
- **GEPA optimizer** (`benchmark:optimize`): treats the whole strategy `.ts` file as the optimization candidate, adopt-with-validation against the committed baseline.
- **Regression tests** (`use-cases/regression/`, gated by `RUN_FLAGGER_REGRESSION=true`): a curated false-positive dataset and a malformed-structured-output dataset replayed through the real classifier.
- Online measurement is the screening summary log: hinted-vs-sampled match rates, per-hint-kind lift, reviewer rejections, rate-limit drops, and dedup hits are all derivable from it. There are no benchmark datasets for most strategies by design.

## Constants

`packages/domain/flaggers/src/constants.ts` unless noted:

| Constant | Value | Meaning |
|----------|-------|---------|
| `FLAGGER_DEFAULT_SAMPLING` | `10` | default sampling % (LLM unmatched path) |
| `FLAGGER_HINTED_RATE_LIMIT` | 30/60s | hinted classification budget per org+slug |
| `FLAGGER_SAMPLED_RATE_LIMIT` | 25/60s | sampled budget |
| `FLAGGER_SAMPLED_POSITIVE_RATE_LIMIT` | 5/60s | sampled budget when positive hints present |
| `FLAGGER_PROMPT_MAX_HINTS` / `FLAGGER_HINT_EVIDENCE_MAX_CHARS` | 20 / 256 | classifier hint block caps |
| `FLAGGER_INSPECTED_AGENT_VERBATIM_MAX_CHARS` | 6,000 | verbatim vs extracted agent context |
| `SESSION_END_DEBOUNCE_MS` (`spans`) | 5 min | session settle window upstream |
| `flagger-scan` (`billing`) | 30 credits | LLM scan price |
