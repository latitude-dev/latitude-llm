# Annotation Queues

Annotation queues are the managed workflow surface for fast human review over traces.

They exist to aggregate telemetry into a focused annotation UX with as little distraction as possible.

## Queue Types

Queue concepts:

- a queue is conceptually `manual` when it has no filter configured and queue membership is created by explicit insertion rather than by stored filter materialization, always materialized as a trace id
- a queue is conceptually `live` when it has a filter configured and is populated incrementally over time from that filter plus optional sampling

The filter field reuses the shared `FilterSet` described in `./filters.md`, applied against the shared trace field registry also used by evaluation triggers.

## System Queue Scaffolding

System annotation queues are provisioned automatically for every project. This section describes the infrastructure that makes that possible, from project creation through trace assignment.

### Project Provisioning

When a project is created:

1. **Domain Event**: `createProjectUseCase` emits a `ProjectCreated` domain event to the Outbox table
2. **Event Routing**: The `domain-events` worker observes the event and enqueues a `project-provisioning:provision-system-queues` task
3. **Queue-Based Provisioning**: The `project-provisioning` worker handles idempotent queue creation via BullMQ (not Temporal—provisioning must complete before traces arrive)
4. **Idempotency**: Uses `ON CONFLICT (organization_id, project_id, slug) DO NOTHING` to handle replays safely
5. **Soft-Delete Aware**: Excludes trashed queues (`deleted_at IS NULL`) when checking existence
6. **Cache Eviction**: After provisioning, evicts the Redis cache entry for the project's system queues

The system queues are created with fixed slugs (`jailbreaking`, `refusal`, `frustration`, `forgetting`, `laziness`, `nsfw`, `trashing`) derived from their names, enabling slug-based routing throughout the pipeline. Deterministic telemetry signals (`tool-call-errors`, `output-schema-validation`, `empty-response`) do **not** create annotation queues; they share the unified `QueueStrategy` registry as deterministic-only strategies and publish SYSTEM-authored annotation scores directly from the deterministic-flagger worker — see [Direct Deterministic System Signals](#direct-deterministic-system-signals).

### Caching

Project system queue state is cached in Redis with a read-through pattern:

- **Key**: `org:{organizationId}:projects:{projectId}:system-queues`
- **TTL**: 5 minutes
- **Invalidation**: Triggered after provisioning, manual queue edits, or deletions
- **Cache Miss**: Falls back to repository query and repopulates the cache

The cache stores the full list of system queues for a project, making fan-out operations fast and reducing database load.

### Trace Routing: Trace-End → Deterministic-Flagger Worker → Workflow Start

Trace-end no longer fans out per-queue workflows directly. Instead, every trace-end enqueues a single `deterministic-flaggers:run` job. That job runs **every** registered flagger strategy's deterministic phase, then routes the per-strategy outcome — only `no-match` (sampled-in) and `ambiguous` (rate-limited) outcomes ever reach the LLM workflow.

**Step 1 — `trace-end:run`**:

1. Triggered by debounced `SpanIngested`
2. Loads the trace and runs live-evaluation + live-queue selection (unchanged)
3. Enqueues a single `deterministic-flaggers:run` job for the trace, deduped on `deterministic-flaggers:{traceId}`. No system-queue sampling happens here.

**Step 2 — `deterministic-flaggers:run`** (new worker; high-throughput, fault-isolated):

1. Loads `TraceDetail` once
2. Loads provisioned system queues for the project (cached)
3. Fans out across the strategy registry in **two phases** to honor the suppression dependency graph:
   - **Phase 1**: strategies with no `suppressedBy` run in parallel; their `matched` decisions form a `phase1MatchedSlugs` set.
   - **Phase 2**: strategies with `suppressedBy` short-circuit before any detection work if any listed suppressor is in that set, emitting `{ action: "suppressed", suppressedBy }`.
4. Routes each per-strategy `DetectionResult`:
   - **`matched`** → write a `SYSTEM`-authored score directly using the strategy-supplied `feedback` string. No queue item, no draft, no LLM call. (Issues clustering picks it up via `ScoreCreated` like the other direct-deterministic signals.)
   - **`no-match`** (LLM-capable strategy + provisioned system queue) → apply per-queue `settings.sampling`. Sampled-in traces enqueue `start-flagger-workflow` with `reason: "sampled"`. Otherwise dropped (`sampled-out`).
   - **`ambiguous`** (LLM-capable strategy + provisioned system queue) → check per-`{org, slug}` Redis rate limit (`AMBIGUOUS_FLAGGER_DEFAULT_RATE_LIMIT`, default 30 req / 60 s, fail-open). Under the limit → enqueue `start-flagger-workflow` with `reason: "ambiguous"`. Otherwise dropped (`rate-limited`).
5. Per-strategy errors are caught at the slug boundary and recorded as `action: "failed"` with a strategy-scoped log; one broken detector cannot break the rest of the fan-out.

The rate limit prevents a hot trace pattern (e.g., a jailbreak signature firing on every request from one org) from stampeding the LLM workflow queue with thousands of calls per minute. The Redis key shape is `org:{organizationId}:ratelimit:flagger-ambiguous:{queueSlug}`.

**Step 3 — `start-flagger-workflow:start`** (thin worker):

1. Calls `workflowStarter.start("systemQueueFlaggerWorkflow", { organizationId, projectId, traceId, queueSlug }, { workflowId: "system-queue-flagger:{traceId}:{queueSlug}" })`
2. BullMQ-level retry policy (`attempts: 4`, exponential 2 s base, ~14 s total) absorbs short Temporal outages without re-running the deterministic fan-out
3. Exhausted attempts log + drop (TODO: DLQ + alert)

**Cross-strategy suppression** (initial wiring):

| Phase-2 strategy | `suppressedBy` | Reasoning |
| --- | --- | --- |
| `refusal` | `jailbreaking`, `nsfw` | A justified refusal of a jailbreak / NSFW prompt is correct behavior, not a defect |
| `laziness` | `trashing` | An identical-tool-call loop is a different failure mode than punting / deferring work |

Only `matched` (not `ambiguous`) suppresses, so suppression stays high-precision. The registry validates the dependency graph at module load — every suppressor must exist and itself be in phase 1 (no transitive suppression).

**Sampling and rate limiting**:

```typescript
// Per-strategy sampling (no-match path, LLM-capable strategies)
hash(`${organizationId}:${projectId}:${queueSlug}:${traceId}`) % 100 < sampling

// Per-{org, slug} ambiguous rate limit (ambiguous path)
INCR org:{organizationId}:ratelimit:flagger-ambiguous:{queueSlug} ≤ 30 per 60s
```

- **Queues with `sampling = 0%`**: skip the no-match → LLM path entirely (deterministic-only for that queue)
- **Provisioned default**: `SYSTEM_QUEUE_DEFAULT_SAMPLING = 10`
- **Editing**: users may later tune `settings.sampling` per system queue
- The `ambiguous` path is gated by the rate limit, not by sampling — every `ambiguous` outcome under the limit reaches the LLM

### System Queue Flagger Workflow

The Temporal workflow is now **LLM-only**. The deterministic phase moved out into the `deterministic-flaggers` worker (above); the workflow only runs when the deterministic phase produced `no-match` (sampled-in) or `ambiguous` (under the rate limit) for an LLM-capable strategy.

**Workflow**: `systemQueueFlaggerWorkflow`
- Input: `(organizationId, projectId, traceId, queueSlug)`
- Output: Flag decision per queue with optional annotation

**Activities**:

1. **`runFlagger`**:
   - delegates to `runSystemQueueFlaggerUseCase` in `@domain/annotation-queues`
   - loads trace analytics context from the shared trace repository path
   - resolves the queue slug through the strategy registry, builds queue-specific prompts, and calls the flagger LLM
   - returns `{ matched }`

2. **`draftAnnotate`** (only when `matched: true`):
   - delegates to `draftSystemQueueAnnotationUseCase` in `@domain/annotation-queues`
   - generates feedback using the annotator LLM with full conversation context
   - non-transactional operation that can be retried independently
   - returns `{ queueId, traceId, feedback }`

3. **`persistAnnotation`** (only when draft succeeds):
   - delegates to `persistSystemQueueAnnotationUseCase` in `@domain/annotation-queues`
   - creates queue item and draft annotation transactionally
   - handles idempotency (checks for existing drafts)
   - returns `{ queueId, draftAnnotationId, wasCreated }`

**Queue-Specific Strategy Architecture**:

A single registry (`packages/domain/annotation-queues/src/flagger-strategies`) holds **all** strategies — both LLM-capable and deterministic-only. Each strategy implements:

1. **`hasRequiredContext(trace)`** — quick guard against running detection when the trace cannot be evaluated
2. **`detectDeterministically(trace)`** (optional) — returns `{ kind: "matched", feedback }`, `{ kind: "no-match" }`, or `{ kind: "ambiguous" }`. Missing implementation defaults to `no-match`.
3. **`buildSystemPrompt(trace)` + `buildPrompt(trace)`** (optional) — only LLM-capable strategies provide both. `isLlmCapableStrategy()` distinguishes them; deterministic-only strategies never reach the workflow.
4. **`suppressedBy?: readonly string[]`** (optional) — list of slugs whose `matched` outcome makes this strategy non-applicable for the same trace (see suppression matrix above).

`DetectionResult.matched` carries a `feedback: string`. The deterministic worker writes that exact string into the score row's `feedback` column and `metadata.rawFeedback`, so `issues:discovery` can cluster identical signals — matched-deterministic does not need a draft annotation step; the deterministic detector is authoritative for both the decision and the human-readable explanation.

**Strategy Registry**:

| Queue | Detection Type | Deterministic `matched` | Deterministic `ambiguous` | LLM context |
|-------|---------------|------------------------|---------------------------|-------------|
| `jailbreaking` | LLM-capable + deterministic | High-precision bypass patterns (DAN mode, direct injection) | Suspicious snippets (override/extraction phrases, indirect-injection markers) | Suspicious snippets |
| `nsfw` | LLM-capable + deterministic | High-precision workplace-inappropriate patterns | Borderline signals | Text-only excerpts |
| `trashing` | LLM-capable + deterministic | Identical tool+args invocation ≥ 3× (LoopGuard) | ≥ 5 calls with one tool ≥ 60% share | Tool-call sequence |
| `refusal` | LLM-capable, ambiguous-only | — | Explicit refusal phrases (score ≥ 2) | Top 3 conversation stages |
| `laziness` | LLM-capable, ambiguous-only | — | Deferral / punting phrases | Top 3 stages + work signals |
| `frustration` | LLM-capable, ambiguous-only | — | Conservative pre-filter on user messages | User messages only |
| `forgetting` | LLM-capable (default) | — | Defaults to `no-match` (placeholder) | Conversation excerpt |
| `tool-call-errors` | Deterministic-only | Per-match: malformed tool call, duplicate id, tool-returned-error | — | n/a |
| `output-schema-validation` | Deterministic-only | Per-match: trailing comma, unclosed JSON string, parse failure | — | n/a |
| `empty-response` | Deterministic-only | Empty / whitespace-only / degenerate single-character output | — | n/a |

`refusal`, `laziness`, and `frustration` are deliberately ambiguous-only — their deterministic signals are conservative pre-filters that route to the LLM rather than write a score directly. `forgetting`'s deterministic phase is a placeholder until a concrete classifier is added.

**Retry Policy**:
- Workflow start: bounded BullMQ retries at the `start-flagger-workflow` worker (`attempts: 4`, exponential 2 s base) absorb short Temporal outages without re-running the deterministic fan-out
- Inside the workflow: Temporal activity retry policy (initial interval 1 s, max attempts 3) covers transient activity failures
- Unknown queue slugs return `matched: false` from the domain use case instead of throwing

### Trace Assignment Flow

Complete flow from trace ingestion to queue assignment:

```
SpanIngested (domain event, debounced)
    ↓
domain-events dispatcher
    ↓
trace-end:run (live evaluations, live-queue materialization, enqueue deterministic-flaggers)
    ↓
deterministic-flaggers:run (load trace once, fan out across all strategies in two phases)
    ↓
   ┌── matched ─────────→ writeScore(SYSTEM, draftedAt=null, feedback=<deterministic>)
   │                              ↓
   │                        ScoreCreated → issues:discovery
   │
   ├── no-match (sampled-in) ───┐
   │                            │
   ├── ambiguous (under limit) ─┤
   │                            ↓
   │                  start-flagger-workflow:start (BullMQ, attempts: 4)
   │                            ↓
   │                  systemQueueFlaggerWorkflow (Temporal, LLM-only)
   │                            ↓
   │                  runFlagger → matched? → draftAnnotate → persistAnnotation
   │                                                              ↓
   │                                            Queue item + draft annotation
   │
   ├── suppressed (phase-1 suppressor matched) → recorded, no further work
   ├── dropped   (sampled-out / rate-limited / no-llm-capability) → recorded
   └── failed    (per-strategy isolated error) → logged + recorded
```

The deterministic worker is the new authoritative entry point: every trace's flagger fan-out goes through it, and every strategy's per-trace decision is recorded for telemetry.

### Direct Deterministic System Signals

Whenever a strategy's `detectDeterministically` returns `matched`, the deterministic-flagger worker writes a `SYSTEM`-authored annotation score directly using the strategy-supplied `feedback` string and skips the queue + LLM workflow entirely. This applies to **every** matched-deterministic outcome, not only the deterministic-only strategies — `jailbreaking`, `nsfw`, `trashing`, and the three deterministic-only signals all hit this path when their high-precision deterministic predicates fire.

The reasoning: matched-deterministic decisions are code-driven and have low enough false-positive rates that human pre-review adds no value. Routing them straight into `issues:discovery` keeps the LLM workflow focused on the genuinely ambiguous cases.

**Strategies that write a score on matched-deterministic** (no queue, no Temporal workflow, no LLM annotator):

LLM-capable strategies (matched bypasses the workflow that exists for their `ambiguous` / `no-match` paths):

- `jailbreaking`: high-precision bypass patterns (DAN mode, system prompt override, role-tag injection). Feedback: `"Jailbreak attempt: matched a high-precision bypass pattern (prompt injection / instruction override)"`.
- `nsfw`: high-precision workplace-inappropriate pattern. Feedback: `"NSFW content: matched a high-precision workplace-inappropriate pattern"`.
- `trashing`: identical tool+args invocation repeated ≥ 3× (LoopGuard). Feedback: `"Trashing: identical tool+args invocation repeated N times"`.

Deterministic-only strategies (no LLM prompts, only ever produce `matched` or `no-match`):

- `tool-call-errors`: inspects conversation history for malformed tool interactions or failed tool responses, and writes a score with feedback like `Tool "<name>" returned error: <snippet>`.
- `output-schema-validation`: inspects assistant output text for malformed or truncated structured-output JSON, and writes a score with feedback like `Assistant output failed JSON parse (malformed or truncated structured output)`.
- `empty-response`: detects empty, whitespace-only, or single-character degenerate assistant responses, and writes a score with feedback like `Assistant response was empty or whitespace only`. Intentional tool-call-only delegations are skipped.

**Score shape** for each match:

- `source = "annotation"`, `sourceId = "SYSTEM"` (sentinel alongside `UI`/`API`)
- `draftedAt = null` (published immediately — not a draft)
- `annotatorId = null` (system-authored)
- `passed = false`, `value = 0`, `feedback = <strategy-supplied>`
- `metadata.rawFeedback = feedback`

Published scores emit `ScoreCreated`, so `issues:discovery` picks them up and clusters them by feedback text similarity — identical signals collapse into one issue, while meaningfully different ones (different tool names, different error classes) form distinct issues.

Because the deterministic phase is not gated by a queue sampling setting, every trace runs every strategy's deterministic check. Sampling and rate limiting only gate the LLM workflow path.

### Key Infrastructure Files

- **Domain**: `packages/domain/annotation-queues/src/`
  - `flagger-strategies/` — unified strategy registry (`index.ts`) plus per-slug detectors. Module load validates the `suppressedBy` graph (suppressors must exist and live in phase 1)
  - `use-cases/process-deterministic-flaggers.ts` - Two-phase fan-out across the strategy registry; routes matched / no-match / ambiguous outcomes
  - `use-cases/provision-system-queues.ts` - Idempotent queue creation
  - `use-cases/get-project-system-queues.ts` - Cached queue listing
  - `use-cases/materialize-live-queue-items.ts` - Batch insert pending live-queue rows after the shared trace-end selection pass
  - `use-cases/build-trace-end-queue-selection.ts` - Build `TraceEndSelectionSpec` maps and stable keys for live and system queues
  - `use-cases/orchestrate-trace-end-annotation-queue-effects.ts` - Run live-queue materialization in the trace-end pass
  - `use-cases/run-system-queue-flagger.ts` - LLM-only flagger evaluation invoked from the Temporal workflow
  - `use-cases/draft-system-queue-annotation.ts` - LLM feedback generation
  - `use-cases/persist-system-queue-annotation.ts` - Transactional queue item + draft creation

- **Platform**: `packages/platform/cache-redis/src/rate-limiter.ts` — generic `checkRedisRateLimit` (atomic INCR + TTL pipeline, fail-open on Redis error)

- **Workers**: `apps/workers/src/workers/`
  - `project-provisioning.ts` - BullMQ-based provisioning
  - `trace-end.ts` - `trace-end` topic worker: live evaluations, live-queue materialization, and a single `deterministic-flaggers:run` enqueue per trace
  - `deterministic-flaggers.ts` - `deterministic-flaggers:run` worker: wires the rate-limiter and the `start-flagger-workflow` publisher into `processDeterministicFlaggersUseCase`. Logs and propagates publish failures so per-strategy failures surface as `action: "failed"` decisions
  - `start-flagger-workflow.ts` - thin worker calling `workflowStarter.start("systemQueueFlaggerWorkflow", …)` with bounded BullMQ retries (`attempts: 4`, exponential 2 s)
  - `domain-events.ts` - Event dispatch

- **Workflows**: `apps/workflows/src/workflows/`
  - `system-queue-flagger-workflow.ts` - Temporal workflow with flagger, draft, and persist activities (LLM-only after this refactor)
  - `activities/index.ts` - `runFlagger`, `draftAnnotate`, and `persistAnnotation` activities

- **Repository**: `packages/platform/db-postgres/src/repositories/annotation-queue-repository.ts`
  - `findSystemQueueBySlugInProject` - Slug-based lookup
  - `listSystemQueuesByProject` - System queue listing

### Routing Identities

All routing uses slugs rather than IDs:

- Provisioning creates queues with fixed canonical slugs
- Trace-end runtime and workflow start use `queueSlug` in task/workflow payloads
- Repository methods support `findBySlugInProject` for lookups
- This enables durable routing even if queue rows are replaced

## System-Created Default Queues

Every project starts with these system-created manual queues:

### Jailbreaking

- description: attempts to bypass system or safety constraints
- instructions: use this queue for prompt injection, instruction hierarchy attacks, policy-evasion attempts, tool abuse intended to bypass guardrails, role or identity escape attempts, or assistant behavior that actually follows those bypass attempts. Do not use it for harmless roleplay or ordinary unsafe requests that the assistant correctly refuses.

### Refusal

- description: the assistant refuses a request it should handle
- instructions: use this queue when the assistant declines, deflects, or over-restricts even though the request is allowed and answerable within product policy and system capabilities. Do not use it when the refusal is correct because the request is unsafe, unsupported, or missing required context or permissions.

### Frustration

- description: the conversation shows clear user frustration or dissatisfaction
- instructions: use this queue when the user expresses annoyance, disappointment, repeated dissatisfaction, loss of trust, or has to restate/correct themselves because the assistant is not helping. Do not use it for neutral clarifications or isolated terse replies without real evidence of frustration.

### Forgetting

- description: the assistant forgets earlier conversation context or instructions
- instructions: use this queue when the assistant loses relevant session memory, repeats already-settled questions, contradicts previously established facts, or ignores earlier constraints/preferences from the same conversation. Do not use it for ambiguity that was never resolved or context that the user never provided.

### Laziness

- description: the assistant avoids doing the requested work
- instructions: use this queue when the assistant gives a shallow partial answer, stops early without justification, refuses to inspect provided context, or pushes work back onto the user that the assistant should have done itself. Do not use it when the task is genuinely blocked by missing access, missing context, or policy constraints.

### NSFW

- description: workplace-inappropriate or toxic content appears
- instructions: use this queue when the trace contains explicit profanity, sexual content, abusive harassment, hate speech, identity-based slurs, or graphic violent language. Do not use it for benign anatomy or health discussion, mild romance, neutral policy/safety discussion about unsafe content, or non-abusive colloquial language without clear toxicity.

### Trashing

- description: the agent cycles between tools without making progress
- instructions: use this queue when the agent repeatedly invokes the same tools or tool sequences, oscillates between states, or accumulates tool calls without advancing toward the goal. Do not use this queue for legitimate retries after transient errors or for iterative refinement that is visibly converging.


## Population Flows

### User-Managed Manual Queues

- manual queues are populated from the trace dashboard table and the sessions dashboard table
- the trace dashboard table exposes row checkboxes plus a bulk action to add selected traces to an annotation queue
- that trace bulk action creates one `annotation_queue_items` row per selected `(queue_id, trace_id)` pair
- the sessions dashboard table exposes row checkboxes plus a bulk action to add selected sessions to an annotation queue
- that session bulk action resolves each selected session to its newest trace and creates one `annotation_queue_items` row per `(queue_id, latest_trace_id)` pair
- new manual queue items are created with `completedAt = null`
- if the same trace is added to the same queue again, the unique `(organization_id, project_id, queue_id, trace_id)` constraint turns that pair into a no-op rather than duplicating it

### System-Created Manual Queues

- system-created queues are still manual queues: they have no `settings.filter`, they are marked with `system = true`, and their membership is inserted explicitly by the system rather than by live filter materialization
- whenever a `SpanIngested` domain event is observed for a project, the `domain-events` dispatcher debounces and publishes `trace-end:run` for that trace
- `trace-end:run` enqueues a single `deterministic-flaggers:run` job for the trace; it does **not** sample queues or start workflows itself
- the `deterministic-flaggers` worker fans out across every registered strategy in two phases (suppressors first, then suppressedBy strategies) and routes per-strategy outcomes:
  - `matched` → write a `SYSTEM`-authored score directly with the strategy-supplied `feedback` (no queue item, no draft, no LLM)
  - `no-match` (LLM-capable + provisioned queue) → apply per-queue `settings.sampling`; sampled-in traces enqueue `start-flagger-workflow` (`reason: "sampled"`)
  - `ambiguous` (LLM-capable + provisioned queue) → check the per-`{org, slug}` Redis rate limit; under-limit traces enqueue `start-flagger-workflow` (`reason: "ambiguous"`)
- `start-flagger-workflow` is a thin worker that calls `workflowStarter.start("systemQueueFlaggerWorkflow", …)` with bounded BullMQ retries so short Temporal outages don't replay the whole deterministic fan-out
- the Temporal workflow is now LLM-only: `runFlagger` invokes the queue-specific LLM, then `draftAnnotate` + `persistAnnotation` create the queue item + draft annotation transactionally
- per-strategy errors in the deterministic worker are caught at the slug boundary and recorded as `action: "failed"`; one broken detector cannot break the rest of the fan-out
- system-created queue sampling is stored in `annotation_queues.settings.sampling`, seeded from a named default constant when the queue is provisioned, and can later be edited by the user; setting `sampling = 0` disables only the no-match → LLM path (matched-deterministic still writes a score)

### Live Queues

- a queue becomes live when `settings.filter` is present
- live queues are incremental: they grow as new matching traces arrive
- whenever a `SpanIngested` domain event is observed for a project, the `domain-events` dispatcher debounces and publishes `trace-end:run` for that trace
- `trace-end:run` lists all non-deleted live queues in that project together with active evaluations
- queue selection order is `settings.sampling` first, then shared batched `settings.filter`
- live-queue filters are deduped and evaluated in the same trace query as live-evaluation filters
- if both pass, `trace-end:run` batch inserts the matching `annotation_queue_items` rows for that `(queue_id, trace_id)` pair with `completedAt = null`
- `trace-end:run` does not fan out per-queue execution tasks for live queues; it materializes membership directly after the shared selection pass
- when a live queue is created with `settings.filter` and no explicit sampling, `settings.sampling` is initialized from a named constant in `packages/domain/annotation-queues`; the initial default is `10`
- live queues do not need a full historical rescan on every read; they materialize queue items incrementally as traces arrive

## Canonical Model

```typescript
import type { FilterSet } from "@domain/shared"

type AnnotationQueueSettings = {
  filter?: FilterSet // shared trace filter set; omit when the queue is manual
  sampling?: number // optional percentage [0, 100], used by live queues and by system queues, with defaults seeded on queue creation/provisioning
}
```

The main queue row stores:

- `system`
- `name`
- `description`
- `instructions`
- `settings`
- `assignees`
- `totalItems`
- `completedItems`
- `deletedAt`

The queue model is backed by two Postgres tables:

- `annotation_queues`: queue definition and review instructions
- `annotation_queue_items`: materialized queue membership plus completion state

### Queue Definition

`annotation_queues` fields:

- `system`: boolean marker for system-created queues
- `name`: unique within the project among non-deleted queues
- `description`: short summary for the queue list
- `instructions`: reviewer guidance shown in the focused annotation screen and reused as classifier/validator context for system-created queues
- `settings.filter`: shared `FilterSet` over the trace field registry for live queues; it stays absent and read-only for system queues
- `settings.sampling`: optional queue sampling percentage `[0, 100]`; live queues use it after filter matching, and system queues use it before any deterministic or LLM flagging work. When omitted on queue creation/provisioning, initialize it from named constants with initial defaults of `10`
- `assignees`: array of existing Latitude user ids from the same organization
- `totalItems`: denormalized count of queue items; maintained by item insert/delete operations
- `completedItems`: denormalized count of completed queue items; maintained by item complete/uncomplete/delete operations
- `deletedAt`: soft delete marker

Required Postgres indexes:

- soft-delete-aware unique btree on `(organization_id, project_id, name, deleted_at)` with nulls-not-distinct semantics
- btree on `(organization_id, project_id, deleted_at, created_at)` for project-scoped queue listing
- do not add GIN/array indexes on `assignees`, do not add GIN/JSONB indexes on `settings`, and do not add text indexes on `description` or `instructions` until queue filtering/search workloads are clearer

### Queue Items

`annotation_queue_items` materialize the actual review backlog for both manual and live queues.

Fields:

- `queue_id`
- `trace_id`: queued trace id; when a session is manually queued, store the newest trace id of that session
- `completedAt`: set when the reviewer marks the item as fully annotated

Creation rules:

- manual queue insertion creates the row from the trace dashboard bulk action
- manual session insertion creates the row from the sessions dashboard bulk action after resolving the session to its newest trace
- system-created queue insertion happens automatically via `systemQueueFlaggerWorkflow` (LLM path only) when a `no-match`/`ambiguous` deterministic outcome reaches the workflow and the LLM matches, creating both the queue item and the draft annotation; a `matched` deterministic outcome writes a published score directly without creating a queue item
- live queue insertion creates the row when a new trace passes the queue filter and then the queue sampling check
- all paths create queue items with `completedAt = null`

Required Postgres indexes:

- btree on `(organization_id, project_id, queue_id, completed_at, created_at, trace_id)` for progress queries, pending-item navigation, and deterministic review order
- unique btree on `(organization_id, project_id, queue_id, trace_id)` to avoid duplicate queue membership for the same trace

## Queue Invariants

- queues always work with traces; when session context matters, it is derived from related traces sharing the current trace's `session_id`
- when a user manually adds a session to a queue, resolve that session to its newest trace and store only that `trace_id`
- a queue is conceptually `manual` when `settings.filter` is absent
- a queue is conceptually `live` when `settings.filter` is present
- empty filter sets should be normalized to absent `settings.filter` so manual/live queue semantics stay unambiguous
- every project has a default set of system-created manual queues from the start
- system-created default queues are manual queues with `system = true` even though the system inserts their members automatically
- `system = true` queues keep their canonical `name`, `description`, `instructions`, and `settings.filter` non-editable, but they may still be deleted and their `settings.sampling` may still be edited
- `settings.filter` is only editable for `system = false` queues
- `settings.sampling` is valid for live queues and for `system = true` queues
- when a live queue is created with no explicit sampling, `settings.sampling` is initialized from a named constant with initial default `10%`
- when a system queue is provisioned, `settings.sampling` is initialized from a named constant with initial default `10%`
- progress is derived from the denormalized `totalItems` and `completedItems` counters on the queue row, avoiding per-queue aggregation on list pages
- `totalItems` and `completedItems` are maintained by the use-cases that add, remove, or complete queue items; any code path that mutates `annotation_queue_items` must also update these counters on the parent queue
- completion is queue-item state, not annotation-row state
- `assignees` behaves as a set of unique same-organization user ids and is validated in application/domain logic
- `annotation_queue_items` stores `trace_id` only; it does not store `session_id`, because the newest trace of a session already contains the full incremental conversation context
- manual queue insertion, system-created queue insertion, and live queue materialization all create queue items with `completedAt = null`
- system-created queue insertion happens automatically via the `systemQueueFlaggerWorkflow` (LLM-only path) when a `no-match`/`ambiguous` deterministic outcome reaches the workflow and the LLM matches, creating both the queue item and the draft annotation transactionally
- a `matched` deterministic outcome bypasses the queue and the workflow entirely and writes a published `SYSTEM`-authored score (`draftedAt = null`) directly so `issues:discovery` can cluster it
- live queue materialization is incremental on debounced `SpanIngested` and evaluates `sampling` before the shared batched `filter` query
- queue review order is derived from deterministic query order (`created_at ASC`, then `trace_id ASC`), not from a persisted position column

## Project Page

Each project has an `Annotation Queues` page showing all non-deleted queues.

Table columns:

- `Name`: truncated, with a `system` tag when `system = true` and a `live` tag when `settings.filter` is configured
- `Description`: truncated to two lines
- `Progress`: percentage bar showing total queue items versus completed queue items
- `Assignees`: rounded profile pictures for assigned users
- `Created at`: queue creation timestamp
- `Quick actions`: edit and delete

Interactions:

- create button opens the queue creation modal
- edit opens the queue settings modal
- delete opens a confirmation modal
- row click navigates to the focused queue review screen
- the create modal edits `name`, `description`, `instructions`, `assignees`, and the optional `settings.filter` / `settings.sampling` fields for user-created queues, using the shared trace-filter builder rather than a free-form text field
- the edit modal keeps `name`, `description`, `instructions`, and `settings.filter` read-only for `system = true` queues while still allowing `assignees` and `settings.sampling` updates
- when a queue is created with `settings.filter` and no explicit sampling, the UI/server path initializes `settings.sampling` from the named default constant
- when a system queue is provisioned for a project, the UI/server path initializes `settings.sampling` from the named default constant and later lets users tune that sampling per queue
- manual queue insertion entry points live in both the trace dashboard table and the sessions dashboard table
- the list includes both user-created queues and the project's default system-created queues

Pagination:

- keyset pagination follow implementation details on dataset list.

## Focused Review Screen

The queue review screen is intentionally optimized for annotation speed.

The left sidebar stays collapsed.

The screen operates on one queued trace at a time.

### Bottom Bar

- add current trace to a dataset
- show current index position inside the queue, derived from the paginated query position rather than a persisted queue-item position field
- previous / next queue-item navigation
- mark current item as fully annotated

Every action must also have a visible hotkey label. Introduce hotkeys using
https://tanstack.com/hotkeys/latest initial hotkeys. Implement
`QUEUE_REVIEW_HOTKEYS`. After real hotkeys is done remove that constant.

### Main Layout

The screen has three vertical sections:

1. `Metadata`
   - timestamp
   - duration
   - tokens
   - cost
   - current related scores grouped by `source_id`, read from canonical Postgres scores so drafts on the current trace are visible immediately
2. `Conversation`
   - full message list for the current trace
   - message-level or text-range selection to create annotations
   - persisted highlights after annotation creation
   - clicking a persisted highlight focuses the matching annotation card
3. `Annotations`
   - queue name and instructions at the top
   - list of annotations for the current trace
   - button to create a conversation-level annotation

Conversation-level annotations omit the anchor coordinates entirely. Message/text selections persist `messageIndex`, `partIndex`, and text offsets against the raw `allMessages` / `parts[]` conversation structure rather than against any UI-only grouping.

Annotation cards show:

- linked issue name or pending-discovery state
- annotator name
- annotation feedback text
- green thumbs-up when `score.value >= 0.5`
- red thumbs-down when `score.value < 0.5`

If no queue items remain pending annotation, show a congratulations empty state.

## Relationship To Annotations

Queues do not replace the annotation model:

- annotations are still canonical scores
- queue provenance is carried through `source_id = <annotation-queue-cuid>` when the annotation came from a queue
- annotations created directly in managed UI or public API still use `source_id = "UI" | "API"`
- system-created queue hits create draft annotation scores with `draftedAt` set, so they remain excluded from issue discovery until a human reviews or finalizes them
- queue completion is tracked on `annotation_queue_items.completedAt`, not on the annotation score row

## Still Pending Precise Definition

- exact human approval/edit/replacement flow for system-created draft annotations after they appear in queue review
- moderation/approval flows beyond the core queue review workflow
