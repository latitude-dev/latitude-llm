# Remove System Annotation Queues

> **Documentation**: `docs/annotation-queues.md`, `docs/issues.md`, `docs/scores.md`, `docs/annotations.md`, `docs/reliability.md`

## Spec Contract

This spec defines exactly what to build, how it should be built, and why the design is shaped this way.

The spec describes the intended end state after the migration. Where overlap exists with the future-state docs above, the docs are the durable home; this spec is removed once the work lands.

## Motivation

System annotation queues exist today as the storage for LLM-flagger drafts: the `provisionSystemQueuesUseCase` provisions seven hard-coded queues per project (`jailbreaking`, `refusal`, `frustration`, `forgetting`, `laziness`, `nsfw`, `trashing`); LLM flaggers write a draft annotation into one of those queues so a human can later approve it.

This indirection has three problems:

1. The queue is a UI concept (a list of items a human reviews), not a flagger concept. Using it as a flagger inbox conflates two responsibilities.
2. LLM-flagger drafts never reach the issue-discovery pipeline today (drafts are filtered out by `check-eligibility.ts`), so flagger output cannot turn into issues until a human publishes the draft.
3. The seven definitions are hard-coded — there is no per-project enable/disable for flaggers.

The new model:

- LLM flaggers produce **draft** annotations directly (no queue association). Those drafts flow through issue discovery and create or attach to issues.
- Deterministic flaggers continue producing **published** annotations directly, unchanged in behavior.
- A new per-project `Flagger` config row replaces the system-queue row as the source of truth for "is this flagger enabled? what is its sampling %?".
- All flagger-authored scores (deterministic published or LLM draft) carry `source = "flagger"` and `sourceId = <flagger.id>`, replacing today's `source = "annotation", sourceId = "SYSTEM"` shape. The `"SYSTEM"` sentinel is removed.

A follow-up PR will introduce the **potential issue** concept — an issue created from a draft flagger annotation that materializes once the human confirms the underlying behavior. This spec is the plumbing PR for that work.

## Scope

In scope:

- New `Flagger` domain entity, table, repository, port, and provisioning.
- New `"flagger"` literal added to the score `source` enum; all flagger-authored scores adopt it.
- Per-strategy annotator-context block (`name` / `description` / `instructions`) colocated on the strategy registry, replacing `SYSTEM_QUEUE_DEFINITIONS`.
- LLM flagger workflow rewrite to drop the queue dependency.
- Deterministic-flaggers processing rewrite to read flagger config and write `source = "flagger"` with `sourceId = <flagger.id>`.
- Issue-discovery eligibility rule change to admit `source = "flagger"` drafts.
- Issue-source mapping change to derive `issue.source = "flagger"` from `score.source = "flagger"` (instead of from the `sourceId === "SYSTEM"` sentinel).
- File and symbol renames from `system queue …` → `flagger …` across `@domain/annotation-queues`, `apps/workflows`, and `apps/workers`.
- Removal of dead system-queue code (`SYSTEM_QUEUE_DEFINITIONS`, `provisionSystemQueuesUseCase`, `findSystemQueueBySlugInProject`, the system-queue cache use-case, the dead index, the `"SYSTEM"` sentinel).
- Single Drizzle structural migration creating `latitude.flaggers` and dropping the now-dead `annotation_queues_project_system_slug_idx`. Single Drizzle backfill migration creating one flagger row per existing `(project, strategy slug)`.
- Tests, fixtures, seeds, live-seeds, and AI-benchmarks references updated.
- TODO comment in the `annotation_queues` schema noting that the `system` column is dormant and slated for a follow-up cleanup PR.

Out of scope (explicitly):

- Web UI for enabling/disabling flaggers or tuning sampling. The DB plumbing lands here; management surfaces ship in a separate PR.
- The "potential issue" concept itself — issues created from flagger drafts in this PR look like any other `flagger`-source issue.
- Backfill / cleanup of existing system-queue rows, queue items, or draft scores. Existing data stays in place and becomes dormant. New writes use the new path.
- Dropping the `annotation_queues.system` column or deleting dormant `system: true` rows.
- Extracting a separate `@domain/flaggers` package. Strategies and flagger config remain inside `@domain/annotation-queues` as a transitional state.
- Backfilling historical `score.source = "annotation", sourceId = "SYSTEM"` rows to the new `source = "flagger"` shape. Old rows stay readable; only new writes use the new shape. (Existing `Issue.source = "flagger"` rows already exist from the prior commit `ef9f182df` and continue to work.)

## Design

### Score source enum

`Score.source` gains a new literal: `"flagger"`. The full set becomes `"annotation" | "evaluation" | "custom" | "flagger"`. Semantics:

- `"annotation"` — human-authored score (UI annotation tool).
- `"evaluation"` — programmatic evaluation run.
- `"custom"` — user-defined score from API ingestion.
- `"flagger"` — system flagger output (deterministic published or LLM draft). `sourceId` references the per-project `Flagger` row id.

Touch points:

- `score.source` Zod schema and all derived types.
- Centroid weights (`CENTROID_SOURCE_WEIGHTS`) gain a `flagger` entry — initial weight `1.0` (treated as a first-class signal alongside `annotation`).
- ClickHouse score-row mapper accepts the new value (no schema change — the column already stores arbitrary text).
- `discover-issue.ts:resolveLinkedIssueId` short-circuits on `source !== "evaluation"`; that path is unchanged. The flagger source skips the linked-issue lookup and goes straight to `discoveryWorkflow` / `assignScoreToKnownIssueWorkflow`.

### Flagger entity

A `Flagger` is a per-project configuration row, one per registered strategy slug.

```ts
interface Flagger {
  id: string                 // cuid
  organizationId: string
  projectId: string
  slug: string               // strategy slug from listQueueStrategySlugs()
  enabled: boolean           // gates BOTH deterministic match and LLM enqueue
  sampling: number           // 0–100; only consulted by LLM-capable strategies on no-match
  createdAt: Date
  updatedAt: Date
}
```

Invariants:

- `(organizationId, projectId, slug)` is unique.
- `sampling` is an integer in `[0, 100]`. Default `10` (carried over from `SYSTEM_QUEUE_DEFAULT_SAMPLING`).
- `enabled` defaults to `true` at provisioning time.
- A flagger row exists for **every** registered strategy slug — including deterministic-only strategies (`tool-call-errors`, `output-schema-validation`, `empty-response`). Sampling is irrelevant for those rows; the field stays for uniformity.

### Postgres table

`latitude.flaggers` follows the standard repo conventions:

- `cuid("id")` primary key.
- `organizationId` + `projectId` cuids; no foreign keys.
- `slug` `varchar(64)`.
- `enabled` `boolean notNull default true`.
- `sampling` `integer notNull default 10`.
- `...timestamps()` for `createdAt` / `updatedAt`.
- `organizationRLSPolicy("flaggers")`.
- Unique `(organization_id, project_id, slug)` (`flaggers_unique_slug_per_project_idx`, `nullsNotDistinct`).
- Index `(organization_id, project_id)` for the per-project list lookup (`flaggers_project_list_idx`).

The same migration drops `annotation_queues_project_system_slug_idx` since nothing reads it post-change.

### Repository port

`FlaggerRepository` lives in `@domain/annotation-queues` (alongside `AnnotationQueueRepository`):

```ts
interface FlaggerRepositoryShape {
  listByProject(input: { projectId: ProjectId }): Effect<readonly Flagger[], RepositoryError, SqlClient>
  findByProjectAndSlug(input: { projectId: ProjectId; slug: string }): Effect<Flagger | null, RepositoryError, SqlClient>
  provisionForProject(input: { organizationId: string; projectId: ProjectId; slugs: readonly string[] }): Effect<readonly Flagger[], RepositoryError, SqlClient>
}
```

`provisionForProject` performs an idempotent upsert: `INSERT ... ON CONFLICT (organization_id, project_id, slug) DO NOTHING`, then re-selects the rows for the given slugs and returns them. Default values come from constants: `enabled = true`, `sampling = SYSTEM_QUEUE_DEFAULT_SAMPLING` (renamed to `FLAGGER_DEFAULT_SAMPLING` in this PR).

Mutation methods (`setEnabled`, `setSampling`) are **not** added in this PR — they belong with the management-UI PR. Keeping the repository read-mostly here avoids leaving unused code paths.

### Cache layer

`getProjectSystemQueuesUseCase` (Redis-cached, key `org:${orgId}:annotation-queues:system:${projectId}`) becomes `getProjectFlaggersUseCase` with key `org:${orgId}:flaggers:${projectId}`. Cache entries expose `{ slug, enabled, sampling }` per flagger. The eviction port (`evictProjectFlaggersUseCase`) stays so the management PR can wire it; this PR has no eviction caller.

### Provisioning

`provisionFlaggersUseCase(input: { organizationId, projectId })` calls `repo.provisionForProject({ organizationId, projectId, slugs: listQueueStrategySlugs() })`. Idempotent — safe to run on every `ProjectCreated`.

`apps/workers/src/services/provisioning.ts` swaps `provisionSystemQueues` for `provisionFlaggers`. The `projects:provision` worker step in `apps/workers/src/workers/projects.ts` remains, only its body changes. The `ProjectCreated → projects:provision` publish in `domain-events.ts` is unchanged.

### LLM flagger workflow

`apps/workflows/src/workflows/system-queue-flagger-workflow.ts` is renamed to `flagger-workflow.ts`. The exported workflow becomes `flaggerWorkflow`. The three-step shape is preserved but every step drops its queue dependency.

Workflow input: `{ organizationId, projectId, traceId, flaggerId, flaggerSlug }`. The producing call site (`processFlaggersUseCase`) already has the flagger row in hand, so passing both fields avoids an extra DB lookup inside the workflow. The slug drives the prompt template; the id is the foreign key the persisted score points at.

1. `runFlagger({ organizationId, projectId, traceId, flaggerSlug })` — unchanged behavior, the `queueSlug` parameter is renamed `flaggerSlug` for consistency.
2. `draftAnnotate({ organizationId, projectId, traceId, flaggerSlug })` — drops `findSystemQueueBySlugInProject`. Returns `{ scoreId, feedback, traceCreatedAt }` (no `queueId`).
3. `persistAnnotation({ organizationId, projectId, traceId, flaggerId, flaggerSlug, feedback, traceCreatedAt, scoreId })` — writes a single draft score, no queue item, no `incrementTotalItems`.

The persisted draft has:

- `source: "flagger"`
- `sourceId: <flaggerId>` (cuid of the project's flagger row)
- `draftedAt: now`
- `passed: false`, `value: 0`, no anchor (carried over from `SYSTEM_QUEUE_DRAFT_DEFAULTS`, renamed `FLAGGER_DRAFT_DEFAULTS`)

Idempotency: the existing implementation looks up an existing draft by `(queueId, traceId)` outside the transaction, then re-checks inside. The replacement uses an explicit `(traceId, source="flagger", sourceId=flaggerId)` lookup via a new repository method `findFlaggerDraftByTraceAndFlaggerId({ projectId, traceId, flaggerId })`. The query is served by an existing `(traceId)` index plus an equality filter on `(source, sourceId)` — both are existing columns. No new index is required.

Workflow ID stays `flagger:${traceId}:${flaggerSlug}` (renamed from `system-queue-flagger:${traceId}:${queueSlug}`). Slug — not flagger id — is used in the workflow ID so the same trace cannot be processed twice for the same strategy across re-provisioning of the flagger row.

### Deterministic-flaggers processing

`processDeterministicFlaggersUseCase` is renamed `processFlaggersUseCase` (the name was already a misnomer — it dispatches both deterministic and LLM-bound work). It now:

1. Loads flaggers via `getProjectFlaggersUseCase`. Map `{ slug → flagger }`.
2. For each strategy:
   - If `flagger.enabled === false` → drop with `reason: "disabled"` (new `DroppedReason`).
   - If no flagger row for the slug → log a warning and drop with `reason: "missing-flagger"` (defensive — this should not happen post-provisioning).
   - Otherwise, run the strategy's deterministic detector.
3. `handleMatched` — writes a published score with `source: "flagger"`, `sourceId: flagger.id`, `draftedAt: null`. Triggers issue discovery via the existing `ScoreCreated` fan-out.
4. `handleNoMatch` — sampling % comes from `flagger.sampling` (instead of the system-queue row). Sampled-in → enqueue `start-flagger-workflow`, payload includes `flaggerId` and `flaggerSlug`.
5. `handleAmbiguous` — unchanged rate-limit logic; still requires the strategy to be LLM-capable. Payload includes `flaggerId` and `flaggerSlug`.

The `StrategyDecision` union grows by `"disabled"`. Existing `"no-llm-capability"` keeps its meaning.

### Issue-discovery eligibility

`packages/domain/issues/src/use-cases/check-eligibility.ts:45-47` changes from:

```ts
if (score.draftedAt !== null) {
  return yield* new DraftScoreNotEligibleForDiscoveryError({ scoreId: input.scoreId })
}
```

to:

```ts
if (score.draftedAt !== null && score.source !== "flagger") {
  return yield* new DraftScoreNotEligibleForDiscoveryError({ scoreId: input.scoreId })
}
```

Human-authored drafts (`source = "annotation"`) stay rejected. Flagger drafts (`source = "flagger"`) proceed. The check stays inside `@domain/issues` and does not need to know about the `Flagger` table — the score's `source` discriminator is enough.

### Issue-source mapping

`create-issue-from-score.ts:91-96` currently derives `issue.source` like this:

```ts
const issueSource = score.source === "annotation" && score.sourceId === "SYSTEM"
  ? "flagger"
  : score.source === "annotation"
    ? "annotation"
    : "custom"
```

Under the new shape this collapses to a direct mapping by `score.source`:

```ts
const issueSource =
  score.source === "flagger" ? "flagger"
  : score.source === "annotation" ? "annotation"
  : "custom"
```

The `"SYSTEM"` sentinel comparison is removed. The `Issue.source` enum (`"annotation" | "custom" | "flagger"`) is unchanged.

`apps/workers/src/workers/domain-events.ts` already publishes both draft and published `ScoreCreated` payloads to `issues:discovery` (the dedupe key keys on `payload.status`). No change required.

### Renames

Files in `packages/domain/annotation-queues/src/`:

- `use-cases/run-system-queue-flagger.ts` → `use-cases/run-flagger.ts`
- `use-cases/run-system-queue-annotator.ts` → `use-cases/run-flagger-annotator.ts`
- `use-cases/draft-system-queue-annotation.ts` → `use-cases/draft-flagger-annotation.ts`
- `use-cases/persist-system-queue-annotation.ts` → `use-cases/persist-flagger-annotation.ts`
- `use-cases/system-queue-annotator-contracts.ts` → `use-cases/flagger-annotator-contracts.ts`
- `use-cases/get-project-system-queues.ts` → `use-cases/get-project-flaggers.ts`
- `use-cases/provision-system-queues.ts` → `use-cases/provision-flaggers.ts`
- `use-cases/process-deterministic-flaggers.ts` → `use-cases/process-flaggers.ts`

Symbol renames inside (representative):

- `SYSTEM_QUEUE_FLAGGER_MODEL` → `FLAGGER_MODEL`
- `SYSTEM_QUEUE_FLAGGER_MAX_TOKENS` → `FLAGGER_MAX_TOKENS`
- `SYSTEM_QUEUE_ANNOTATOR_MODEL` → `FLAGGER_ANNOTATOR_MODEL`
- `SYSTEM_QUEUE_ANNOTATOR_MAX_TOKENS` → `FLAGGER_ANNOTATOR_MAX_TOKENS`
- `SYSTEM_QUEUE_DRAFT_DEFAULTS` → `FLAGGER_DRAFT_DEFAULTS`
- `SYSTEM_QUEUE_DEFAULT_SAMPLING` → `FLAGGER_DEFAULT_SAMPLING`
- `SYSTEM_QUEUE_FLAGGER_CONTEXT_WINDOW` → `FLAGGER_CONTEXT_WINDOW`
- `runSystemQueueFlaggerUseCase` → `runFlaggerUseCase`
- `runSystemQueueAnnotatorUseCase` → `runFlaggerAnnotatorUseCase`
- `draftSystemQueueAnnotationUseCase` → `draftFlaggerAnnotationUseCase`
- `persistSystemQueueAnnotationUseCase` → `persistFlaggerAnnotationUseCase`
- `provisionSystemQueuesUseCase` → `provisionFlaggersUseCase`
- `getProjectSystemQueuesUseCase` → `getProjectFlaggersUseCase`
- `evictProjectSystemQueuesUseCase` → `evictProjectFlaggersUseCase`
- `processDeterministicFlaggersUseCase` → `processFlaggersUseCase`
- `systemQueueAnnotateInputSchema` → `flaggerAnnotateInputSchema` (and the matching `Output`/`AnnotatorOutput` schemas)
- `classifyTraceForQueueUseCase` → `classifyTraceForFlaggerUseCase`
- `annotateTraceForQueueUseCase` → `annotateTraceForFlaggerUseCase`

Workflow / activity files:

- `apps/workflows/src/workflows/system-queue-flagger-workflow.ts` → `apps/workflows/src/workflows/flagger-workflow.ts`
- `apps/workflows/src/workflows/system-queue-flagger-workflow.test.ts` → `apps/workflows/src/workflows/flagger-workflow.test.ts`
- `flagger-activities.ts` keeps its name; `runFlagger` / `draftAnnotate` / `persistAnnotation` keep their names but their input shapes drop `queueSlug` → `flaggerSlug` and drop `queueId`.

The package directory name `@domain/annotation-queues` is unchanged. Package rename is a follow-up.

### Annotator context on the strategy registry

Today the LLM annotator pulls per-strategy `name` / `description` / `instructions` from `SYSTEM_QUEUE_DEFINITIONS` to build its prompt. With the definitions removed, that text moves onto the strategy itself.

Each strategy export gains an `annotator` block:

```ts
interface QueueStrategy {
  // ...existing fields...
  readonly annotator: {
    readonly name: string
    readonly description: string
    readonly instructions: string
  }
}
```

Only LLM-capable strategies need the block (deterministic-only strategies — `tool-call-errors`, `output-schema-validation`, `empty-response` — never invoke the annotator). The field is required on LLM-capable strategies and optional on deterministic-only ones, enforced by the `isLlmCapableStrategy` discriminator.

`buildAnnotatorSystemPrompt(slug)` in `run-flagger-annotator.ts` reads from the strategy export instead of `SYSTEM_QUEUE_DEFINITIONS`. The text content for the seven existing strategies is copied verbatim from today's `SYSTEM_QUEUE_DEFINITIONS` block.

### Removed code

- `SYSTEM_QUEUE_DEFINITIONS` (the seven hard-coded definitions). Annotator copy migrates onto each strategy's `annotator` block.
- `provisionSystemQueuesUseCase` (replaced by `provisionFlaggersUseCase`).
- `findSystemQueueBySlugInProject` on `AnnotationQueueRepository` and its `Live` impl.
- The system-queue branch inside `persist-flagger-annotation.ts` that creates queue items / increments `totalItems`. The `incrementTotalItems` method itself stays — manual queues still use it.
- `provisionSystemQueues` service in `apps/workers/src/services/provisioning.ts`.
- The annotation-queues seed in `packages/platform/db-postgres/src/seeds/annotation-queues/index.ts` is rewired to seed flagger rows for the seeded projects.
- The dead `annotation_queues_project_system_slug_idx`.
- The `"SYSTEM"` sourceId sentinel — no code path writes or reads it after this PR.

The `annotation_queues.system` boolean column **stays** for now per the "leave existing data in place" decision. It is no longer written to by any code path; existing rows remain dormant. A `// TODO(remove-sys-annot-queues): drop this column once dormant rows are confirmed safe to delete` comment is added to `schema/annotation-queues.ts:11` so the cleanup is discoverable.

### Migration & backfill

A single Drizzle migration generated via `pg:generate "add flaggers table"`:

- `CREATE TABLE latitude.flaggers (...)` with the columns and indexes described above.
- `DROP INDEX latitude.annotation_queues_project_system_slug_idx`.

Backfill ships as a Node-side one-shot script, not as a SQL migration. Reason: the row id is a real CUID2 (length 24, base36, generated by `@paralleldrive/cuid2`'s `createId()`). Postgres has no native CUID2 generator and approximations (UUID slices, hex hashes) violate the format — the format matters because every other id in the system is a real CUID2 and ad-hoc IDs would surface as exceptions in audit / support tooling. Drizzle migrations are SQL-only, so the backfill ships as a TS script invoked via `pnpm --filter @platform/db-postgres pg:backfill:flaggers`.

The script:

- Connects via the admin URL (RLS bypass).
- Lists all `latitude.projects` rows.
- Inserts one row per `(organization_id, project_id, slug)` for every registered strategy slug, with `id = createId()`, `enabled = true`, `sampling = FLAGGER_DEFAULT_SAMPLING`.
- Uses `INSERT ... ON CONFLICT DO NOTHING` against the unique `(organization_id, project_id, slug)` index, so it is fully idempotent and safe to re-run.
- Batches inserts in 5000-row chunks to stay under Postgres' 65535-parameter-per-statement ceiling.

Operational sequence per environment (production specifically):

1. `pnpm --filter @platform/db-postgres pg:migrate` — applies `add-flaggers-table`.
2. `pnpm --filter @platform/db-postgres pg:backfill:flaggers` — backfills existing projects.

New projects created after step 1 do not need step 2 — the workers app provisions flaggers on `ProjectCreated` via `provisionFlaggersUseCase`. Local dev / fresh DBs typically have no projects pre-migration; running the backfill script there is a no-op.

### Sampling

Per-project sampling is read from `flagger.sampling`. Default is `FLAGGER_DEFAULT_SAMPLING = 10`. UI tuning ships in the management PR. The previous `AnnotationQueue.settings.sampling` path is no longer the source of truth for flagger sampling.

### Tests

- `provision-flaggers.test.ts` (renamed from `provision-system-queues.test.ts`) — verifies idempotent insertion and one row per registered strategy slug.
- `process-flaggers.test.ts` (renamed from `process-deterministic-flaggers.test.ts`) — fixtures shift from system-queue rows to flagger rows; new test covers the `disabled` short-circuit; the existing matched/no-match/ambiguous decision tests stay.
- `flagger-workflow.test.ts` (renamed) — assertions shift from "queue item created" to "draft score written with `sourceId='SYSTEM'`, `metadata.flaggerSlug` set".
- `check-eligibility.test.ts` — new cases: SYSTEM draft is eligible; non-SYSTEM draft (human draft) still rejected.
- `flagger-activities.test.ts` — input shapes updated.
- `db-postgres` seeds and `tools/live-seeds` / `tools/ai-benchmarks/src/mappers/jailbreakbench.ts` rewired to flagger config.

## Lifecycle of a flagger output (post-change)

Deterministic match path:

1. `processFlaggersUseCase` runs the strategy's deterministic detector on `SpanIngested → trace-end`.
2. On `matched`, it writes a published score (`source: "flagger"`, `sourceId: flagger.id`, `draftedAt: null`).
3. `ScoreCreated` fan-out publishes to `issues:discovery`.
4. `discoverIssueUseCase` either creates a new issue (`source: "flagger"`) or attaches to an existing one.

LLM path (sampled `no-match` or `ambiguous`):

1. `processFlaggersUseCase` enqueues `start-flagger-workflow` with `{ flaggerId, flaggerSlug }`.
2. The worker starts `flaggerWorkflow` (Temporal).
3. `runFlagger` classifies. If `matched: false`, the workflow ends.
4. `draftAnnotate` generates feedback text from the trace using the strategy's annotator block.
5. `persistAnnotation` writes a draft score (`source: "flagger"`, `sourceId: flagger.id`, `draftedAt: now`).
6. `ScoreCreated` fan-out publishes to `issues:discovery`.
7. `checkEligibilityUseCase` admits the draft because `score.source === "flagger"`.
8. `discoverIssueUseCase` either creates a new issue (`source: "flagger"`) or attaches to an existing one. The score row stays draft until a future event (potential-issue PR) decides whether to publish or discard it.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Flagger entity, table, repository, provisioning, score source

- [ ] **P1-1**: Add `Flagger` entity (`entities/flagger.ts`) with Zod schema and inferred type. Carry over comments from this spec onto the field declarations.
- [ ] **P1-2**: Add `FlaggerRepository` port (`ports/flagger-repository.ts`) with `listByProject`, `findByProjectAndSlug`, `provisionForProject`.
- [ ] **P1-3**: Add `latitude.flaggers` Drizzle schema (`schema/flaggers.ts`) with the indexes and RLS described above. Add the TODO comment on `annotation_queues.system`.
- [ ] **P1-4**: Generate the structural migration (`pg:generate "add flaggers table"`) — also drops `annotation_queues_project_system_slug_idx` in the same migration, since `system` column reads disappear.
- [ ] **P1-5**: Add `scripts/backfill-flaggers.ts` (real CUID2 via `createId()`) plus the `pg:backfill:flaggers` npm script. Idempotent insert, batched at 5000 rows. Operational ordering: `pg:migrate` then `pg:backfill:flaggers`, run once per environment with pre-existing projects.
- [ ] **P1-6**: Implement `FlaggerRepositoryLive` in `@platform/db-postgres` with the standard mapper/insert-row pattern.
- [ ] **P1-7**: Add `"flagger"` to the score `source` Zod literal union in `@domain/scores`. Update inferred types and any exhaustive switches that match on `source`. Add a centroid-weight entry for `flagger` (initial value `1.0`).
- [ ] **P1-8**: Replace `provisionSystemQueuesUseCase` with `provisionFlaggersUseCase` (same `apps/workers/src/services/provisioning.ts` shape, new use-case body).
- [ ] **P1-9**: Add `provision-flaggers.test.ts` — idempotency, one row per strategy slug, defaults `enabled=true`, `sampling=10`.
- [ ] **P1-10**: Update `db-postgres` seeds, `tools/live-seeds`, and `tools/ai-benchmarks/src/mappers/jailbreakbench.ts` to seed flagger rows instead of system-queue rows.

**Exit gate**:

- `pnpm --filter @platform/db-postgres pg:migrate` succeeds locally on a fresh DB and on a DB seeded against the previous migration.
- `provisionFlaggersUseCase` runs idempotently and produces one row per registered strategy slug per project.
- `"flagger"` is a valid `score.source` value end-to-end (Zod parse + DB insert + read).
- The dead `annotation_queues_project_system_slug_idx` no longer exists.

### Phase 2 — LLM flagger workflow drops the queue

- [ ] **P2-1**: Add the `annotator: { name, description, instructions }` block to the LLM-capable strategy exports (`jailbreaking`, `refusal`, `frustration`, `forgetting`, `laziness`, `nsfw`, `trashing`). Copy text verbatim from `SYSTEM_QUEUE_DEFINITIONS`. Tighten the `QueueStrategy` type so `isLlmCapableStrategy` requires the field.
- [ ] **P2-2**: Rename `system-queue-flagger-workflow.ts` → `flagger-workflow.ts` (workflow + test). Update `apps/workflows/src/workflows/index.ts` export. Workflow input shape now `{ organizationId, projectId, traceId, flaggerId, flaggerSlug }`.
- [ ] **P2-3**: Update `flagger-activities.ts`: rename `queueSlug` → `flaggerSlug`, add `flaggerId`, drop `queueId`, drop `AnnotationQueueRepositoryLive` from the activity layer where no longer needed.
- [ ] **P2-4**: Rename `run-system-queue-flagger.ts` → `run-flagger.ts`; update symbol names; drop `queueSlug` references in span annotations.
- [ ] **P2-5**: Rename `run-system-queue-annotator.ts` → `run-flagger-annotator.ts`; rewrite `buildAnnotatorSystemPrompt` to read from the strategy's `annotator` block instead of `SYSTEM_QUEUE_DEFINITIONS`.
- [ ] **P2-6**: Rename `draft-system-queue-annotation.ts` → `draft-flagger-annotation.ts`; drop `findSystemQueueBySlugInProject` call; output shape becomes `{ scoreId, feedback, traceCreatedAt }`.
- [ ] **P2-7**: Rename `persist-system-queue-annotation.ts` → `persist-flagger-annotation.ts`; replace queue-item insertion + `incrementTotalItems` with a single `writeDraftAnnotationUseCase` call. Pass `source: "flagger"`, `sourceId: flaggerId`. Use `findFlaggerDraftByTraceAndFlaggerId` for idempotency.
- [ ] **P2-8**: Add `findFlaggerDraftByTraceAndFlaggerId({ projectId, traceId, flaggerId })` on `ScoreRepository`. Remove `findQueueDraftByTraceId` if no other caller remains.
- [ ] **P2-9**: Update `start-flagger-workflow` worker payload (rename `queueSlug` → `flaggerSlug`, add `flaggerId`).
- [ ] **P2-10**: Update `flagger-workflow.test.ts` and `flagger-activities.test.ts`.

**Exit gate**:

- `flaggerWorkflow` writes one draft score per `(traceId, flaggerId)` and is idempotent under retry.
- No code path references `queueId` or `queueSlug` for system-flagger persistence anywhere.
- `findSystemQueueBySlugInProject` and its `Live` impl are deleted.
- `buildAnnotatorSystemPrompt` no longer references `SYSTEM_QUEUE_DEFINITIONS`.

### Phase 3 — Process-flaggers reads flaggers config

- [ ] **P3-1**: Rename `process-deterministic-flaggers.ts` → `process-flaggers.ts`; rename `processDeterministicFlaggersUseCase` → `processFlaggersUseCase`; update all call sites.
- [ ] **P3-2**: Replace `getProjectSystemQueuesUseCase` invocation with `getProjectFlaggersUseCase`. Build `flaggerBySlug` map.
- [ ] **P3-3**: Add the `enabled === false` short-circuit and the `missing-flagger` defensive branch. Extend `DroppedReason`.
- [ ] **P3-4**: Update `handleMatched` to write `source: "flagger"`, `sourceId: flagger.id` (drop the `"SYSTEM"` sentinel).
- [ ] **P3-5**: Update `handleNoMatch` and `handleAmbiguous` to read `flagger.sampling` (instead of `systemQueue.sampling`) and pass `flaggerId` + `flaggerSlug` into `enqueueWorkflowStart`.
- [ ] **P3-6**: Rename `get-project-system-queues.ts` → `get-project-flaggers.ts`; cache key shifts to `org:${orgId}:flaggers:${projectId}`. Eviction port stays.
- [ ] **P3-7**: Rename / update tests (`process-flaggers.test.ts`); add a `disabled` short-circuit case; assert deterministic-match writes use `source: "flagger"`.

**Exit gate**:

- `processFlaggersUseCase` runs end-to-end against flagger rows; the deterministic-match path writes a published `source: "flagger"` score; the LLM path enqueues the workflow with the new payload shape.
- Disabling a flagger row in fixtures suppresses both deterministic match writes and LLM enqueues for that slug.

### Phase 4 — Issue-discovery admits flagger drafts; issue-source mapping by score.source

- [ ] **P4-1**: Update `check-eligibility.ts` to admit drafts when `score.source === "flagger"`.
- [ ] **P4-2**: Update `create-issue-from-score.ts` to derive `issue.source` directly from `score.source` (`"flagger"` → `"flagger"`, `"annotation"` → `"annotation"`, otherwise `"custom"`). Remove the `sourceId === "SYSTEM"` branch.
- [ ] **P4-3**: Add tests in `check-eligibility.test.ts`: flagger draft admitted, human draft (`source = "annotation"`) rejected.
- [ ] **P4-4**: Add tests in `create-issue-from-score.test.ts` (or equivalent) covering the new mapping.
- [ ] **P4-5**: Add an end-to-end test (where the existing `discover-issue` integration tests live) that runs a flagger draft through `discoverIssueUseCase` and asserts the resulting issue has `source: "flagger"`.

**Exit gate**:

- `discoverIssueUseCase` creates `flagger`-source issues from flagger draft scores in tests.
- Human drafts still skip discovery.
- No code path inside `@domain/issues` references the `"SYSTEM"` sentinel.

### Phase 5 — Cleanup & rename sweep

- [ ] **P5-1**: Delete `SYSTEM_QUEUE_DEFINITIONS` and the `provisionSystemQueues*` exports from `@domain/annotation-queues`.
- [ ] **P5-2**: Delete `findSystemQueueBySlugInProject` from the port and `Live` impl. Verify no remaining callers.
- [ ] **P5-3**: Sweep symbol renames listed in **Renames** above across the monorepo. Update `index.ts` re-exports.
- [ ] **P5-4**: Delete `provisionSystemQueues` from `apps/workers/src/services/provisioning.ts`.
- [ ] **P5-5**: Delete the test file `provision-system-queues.test.ts` (replaced by `provision-flaggers.test.ts`).
- [ ] **P5-6**: Update `apps/web/src/routes/_authenticated/projects/$projectSlug/annotation-queues/-components/queue-modal.tsx` to drop any system-queue branching (verify the file actually has system-queue logic; if not, drop this task).
- [ ] **P5-7**: Repo-wide grep for the `"SYSTEM"` literal as a `sourceId` value. Replace lingering reads with `score.source === "flagger"` checks, or delete dead branches.
- [ ] **P5-8**: Run `pnpm typecheck` and `pnpm test` filters across affected packages until green. Run `knip` and clean up any newly orphaned exports.

**Exit gate**:

- Repo-wide grep for `SYSTEM_QUEUE`, `system-queue`, `systemQueue`, `findSystemQueueBySlugInProject`, `provisionSystemQueues` returns no hits.
- Repo-wide grep for `"SYSTEM"` as a `sourceId` literal returns no hits inside `packages/domain/*` or `apps/*`.
- `pnpm typecheck` clean. Vitest suites for `@domain/annotation-queues`, `@domain/issues`, `@domain/scores`, `apps/workflows`, `apps/workers` all pass.
- The whole branch ships as a single PR with one commit per phase.

## Open Items

- `gen_cuid()` SQL helper availability for the backfill migration is implementation-detail; if not available, the data-fill ships as a Node script invoked from the migration runner. This is decided during P1-5 and does not affect the spec's behavior.
- Future PR introduces the **potential issue** concept and the management UI for enabling/disabling flaggers and tuning sampling.
