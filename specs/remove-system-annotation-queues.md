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

- LLM flaggers produce **published** annotations directly (no queue association). Those published annotations flow through regular issue discovery and create or attach to issues.
- Deterministic flaggers continue producing **published** annotations directly, unchanged in behavior.
- A new per-project `Flagger` config row replaces the system-queue row as the source of truth for "is this flagger enabled? what is its sampling %?".
- All flagger-authored scores are regular published annotation scores with `source = "annotation"`, `sourceId = "SYSTEM"`, and `draftedAt = null`.

Flagger outputs now skip human draft review and enter issue discovery as published annotations.

## Scope

In scope:

- New `Flagger` domain entity, table, repository, port, and provisioning.
- No score-source migration: flagger-authored output stays under the existing `source = "annotation"` score source.
- Per-strategy annotator-context block (`name` / `description` / `instructions`) colocated on the strategy registry, replacing `SYSTEM_QUEUE_DEFINITIONS`.
- LLM flagger workflow rewrite to drop the queue dependency.
- Deterministic-flaggers processing rewrite to read flagger config and write `source = "annotation"` with `sourceId = "SYSTEM"`.
- LLM flagger persistence writes published annotation scores, so issue-discovery eligibility remains the regular "published only" path.
- Issue-source mapping continues to derive `issue.source = "annotation"` for flagger-authored annotation scores.
- File and symbol renames from `system queue …` → `flagger …` across `@domain/flaggers`, `apps/workflows`, and `apps/workers`.
- Removal of dead system-queue code (`SYSTEM_QUEUE_DEFINITIONS`, `provisionSystemQueuesUseCase`, `findSystemQueueBySlugInProject`, the system-queue cache use-case, and the dead index).
- Single Drizzle structural migration creating `latitude.flaggers` and dropping the now-dead `annotation_queues_project_system_slug_idx`. Single Drizzle backfill migration creating one flagger row per existing `(project, strategy slug)`.
- Tests, fixtures, seeds, live-seeds, and AI-benchmarks references updated.
- TODO comment in the `annotation_queues` schema noting that the `system` column is dormant and slated for a follow-up cleanup PR.

Out of scope (explicitly):

- Web UI for enabling/disabling flaggers or tuning sampling. The DB plumbing lands here; management surfaces ship in a separate PR.
- The "potential issue" concept itself.
- Backfill / cleanup of existing system-queue rows, queue items, or draft scores. Existing data stays in place and becomes dormant. New writes use the new path.
- Dropping the `annotation_queues.system` column or deleting dormant `system: true` rows.
- Backfilling historical `score.source = "annotation", sourceId = "SYSTEM"` rows.

## Design

### Score source and source id

`Score.source` remains `"annotation" | "evaluation" | "custom"`. Flagger output uses the existing annotation score shape:

- `source = "annotation"`
- `sourceId = "SYSTEM"`
- `draftedAt = null`
- `metadata.rawFeedback = feedback`

Issue discovery sees flagger-authored rows as ordinary published annotation scores.

### Flagger entity

A `Flagger` is a per-project configuration row, one per registered strategy slug.

```ts
interface Flagger {
  id: string                 // cuid
  organizationId: string
  projectId: string
  slug: FlaggerSlug          // strategy slug from listFlaggerStrategySlugs()
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

`FlaggerRepository` lives in `@domain/flaggers`:

```ts
interface FlaggerRepositoryShape {
  listByProject(input: { projectId: ProjectId }): Effect<readonly Flagger[], RepositoryError, SqlClient>
  findByProjectAndSlug(input: { projectId: ProjectId; slug: string }): Effect<Flagger | null, RepositoryError, SqlClient>
  saveManyForProject(input: { projectId: ProjectId; slugs: readonly FlaggerSlug[] }): Effect<readonly Flagger[], RepositoryError, SqlClient>
}
```

`saveManyForProject` performs an idempotent insert: `INSERT ... ON CONFLICT (organization_id, project_id, slug) DO NOTHING`, returning newly inserted rows. Default values come from constants: `enabled = true`, `sampling = SYSTEM_QUEUE_DEFAULT_SAMPLING` (renamed to `FLAGGER_DEFAULT_SAMPLING` in this PR).

Mutation methods (`setEnabled`, `setSampling`) are **not** added in this PR — they belong with the management-UI PR. Keeping the repository read-mostly here avoids leaving unused code paths.

### Cache layer

`getProjectSystemQueuesUseCase` (Redis-cached, key `org:${orgId}:annotation-queues:system:${projectId}`) becomes `getProjectFlaggersUseCase` with key `org:${orgId}:flaggers:${projectId}`. Cache entries expose `{ slug, enabled, sampling }` per flagger. The eviction port (`evictProjectFlaggersUseCase`) stays so the management PR can wire it; this PR has no eviction caller.

### Provisioning

`provisionFlaggersUseCase(input: { organizationId, projectId })` calls `repo.saveManyForProject({ projectId, slugs: listFlaggerStrategySlugs() })`. Idempotent — safe to run on every `ProjectCreated`.

`apps/workers/src/services/provisioning.ts` swaps `provisionSystemQueues` for `provisionFlaggers`. The `projects:provision` worker step in `apps/workers/src/workers/projects.ts` remains, only its body changes. The `ProjectCreated → projects:provision` publish in `domain-events.ts` is unchanged.

### LLM flagger workflow

`apps/workflows/src/workflows/system-queue-flagger-workflow.ts` is renamed to `flagger-workflow.ts`. The exported workflow becomes `flaggerWorkflow`. The three-step shape is preserved but every step drops its queue dependency.

Workflow input: `{ organizationId, projectId, traceId, flaggerId, flaggerSlug }`. The producing call site (`processFlaggersUseCase`) already has the flagger row in hand. The slug drives the prompt template.

1. `runFlagger({ organizationId, projectId, traceId, flaggerSlug })` — unchanged behavior, the `queueSlug` parameter is renamed `flaggerSlug` for consistency.
2. `draftAnnotate({ organizationId, projectId, traceId, flaggerSlug })` — drops `findSystemQueueBySlugInProject`. Returns `{ scoreId, feedback, traceCreatedAt }` (no `queueId`).
3. `saveAnnotation({ organizationId, projectId, traceId, flaggerId, flaggerSlug, feedback, traceCreatedAt, scoreId })` — writes a single published annotation score, no queue item, no `incrementTotalItems`.

The persisted annotation has:

- `source: "annotation"`
- `sourceId: "SYSTEM"`
- `draftedAt: null`
- `passed: false`, `value: 0`, no anchor (carried over from `SYSTEM_QUEUE_DRAFT_DEFAULTS`, renamed `FLAGGER_DRAFT_DEFAULTS`)

Idempotency: the replacement uses an explicit published system annotation lookup keyed by project, trace, and feedback. The query is served by the existing trace lookup index plus equality filters on `source` and `sourceId`. No new index is required.

Workflow ID stays `flagger:${traceId}:${flaggerSlug}` (renamed from `system-queue-flagger:${traceId}:${queueSlug}`). Slug — not flagger id — is used in the workflow ID so the same trace cannot be processed twice for the same strategy across re-provisioning of the flagger row.

### Deterministic-flaggers processing

`processDeterministicFlaggersUseCase` is renamed `processFlaggersUseCase` (the name was already a misnomer — it dispatches both deterministic and LLM-bound work). It now:

1. Loads flaggers via `getProjectFlaggersUseCase`. Map `{ slug → flagger }`.
2. For each strategy:
   - If `flagger.enabled === false` → drop with `reason: "disabled"` (new `DroppedReason`).
   - If no flagger row for the slug → log a warning and drop with `reason: "missing-flagger"` (defensive — this should not happen post-provisioning).
   - Otherwise, run the strategy's deterministic detector.
3. `handleMatched` — writes a published score with `source: "annotation"`, `sourceId: "SYSTEM"`, `draftedAt: null`. Triggers issue discovery via the existing `ScoreCreated` fan-out.
4. `handleNoMatch` — sampling % comes from `flagger.sampling` (instead of the system-queue row). Sampled-in → enqueue `start-flagger-workflow`, payload includes `flaggerId` and `flaggerSlug`.
5. `handleAmbiguous` — unchanged rate-limit logic; still requires the strategy to be LLM-capable. Payload includes `flaggerId` and `flaggerSlug`.

The `StrategyDecision` union grows by `"disabled"`. Existing `"no-llm-capability"` keeps its meaning.

### Issue discovery

Issue-discovery eligibility stays on the regular published-score path: any score with `draftedAt !== null` is rejected. Since both deterministic and LLM flaggers write published annotation scores, they enter the existing `ScoreCreated → issues:discovery` fan-out without a flagger-specific carve-out.

`create-issue-from-score.ts` maps `source = "annotation"` to `issue.source = "annotation"`; flagger-authored annotations follow that same path.

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

Flagger code lives in `@domain/flaggers`; `@domain/annotation-queues` keeps the manual queue data model and behavior.

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
- Flagger-specific score sources.

The `annotation_queues.system` boolean column **stays** for now per the "leave existing data in place" decision. It is no longer written to by any code path; existing rows remain dormant. A `// TODO(remove-sys-annot-queues): drop this column once dormant rows are confirmed safe to delete` comment is added to `schema/annotation-queues.ts:11` so the cleanup is discoverable.

### Migration

A single Drizzle migration generated via `pg:generate "add flaggers table"`:

- `CREATE TABLE latitude.flaggers (...)` with the columns and indexes described above.
- `DROP INDEX latitude.annotation_queues_project_system_slug_idx`.

No Postgres backfill ships with this branch. Existing projects do not get flagger rows automatically; new projects are provisioned via `ProjectCreated` and `provisionFlaggersUseCase`.

### Sampling

Per-project sampling is read from `flagger.sampling`. Default is `FLAGGER_DEFAULT_SAMPLING = 10`. UI tuning ships in the management PR. The previous `AnnotationQueue.settings.sampling` path is no longer the source of truth for flagger sampling.

### Tests

- `provision-flaggers.test.ts` (renamed from `provision-system-queues.test.ts`) — verifies idempotent insertion and one row per registered strategy slug.
- `process-flaggers.test.ts` (renamed from `process-deterministic-flaggers.test.ts`) — fixtures shift from system-queue rows to flagger rows; new test covers the `disabled` short-circuit; the existing matched/no-match/ambiguous decision tests stay.
- `flagger-workflow.test.ts` (renamed) — assertions shift from "queue item created" to "published annotation score written with `sourceId = "SYSTEM"`".
- `check-eligibility.test.ts` — draft scores remain rejected; flaggers enter discovery only through published annotation scores.
- `flagger-activities.test.ts` — input shapes updated.
- `db-postgres` seeds and `tools/live-seeds` / `tools/ai-benchmarks/src/mappers/jailbreakbench.ts` rewired to flagger config.

## Lifecycle of a flagger output (post-change)

Deterministic match path:

1. `processFlaggersUseCase` runs the strategy's deterministic detector on `SpanIngested → trace-end`.
2. On `matched`, it writes a published score (`source: "annotation"`, `sourceId: "SYSTEM"`, `draftedAt: null`).
3. `ScoreCreated` fan-out publishes to `issues:discovery`.
4. `discoverIssueUseCase` either creates a new issue (`source: "annotation"`) or attaches to an existing one.

LLM path (sampled `no-match` or `ambiguous`):

1. `processFlaggersUseCase` enqueues `start-flagger-workflow` with `{ flaggerId, flaggerSlug }`.
2. The worker starts `flaggerWorkflow` (Temporal).
3. `runFlagger` classifies. If `matched: false`, the workflow ends.
4. `draftAnnotate` generates feedback text from the trace using the strategy's annotator block.
5. `saveAnnotation` writes a published annotation score (`source: "annotation"`, `sourceId: "SYSTEM"`, `draftedAt: null`).
6. `ScoreCreated` fan-out publishes to `issues:discovery`.
7. `checkEligibilityUseCase` admits the score through the normal published-score path.
8. `discoverIssueUseCase` either creates a new issue (`source: "annotation"`) or attaches to an existing one.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Flagger entity, table, repository, provisioning

- [ ] **P1-1**: Add `Flagger` entity (`entities/flagger.ts`) with Zod schema and inferred type. Carry over comments from this spec onto the field declarations.
- [ ] **P1-2**: Add `FlaggerRepository` port (`ports/flagger-repository.ts`) with `listByProject`, `findByProjectAndSlug`, `saveManyForProject`.
- [ ] **P1-3**: Add `latitude.flaggers` Drizzle schema (`schema/flaggers.ts`) with the indexes and RLS described above. Add the TODO comment on `annotation_queues.system`.
- [ ] **P1-4**: Generate the structural migration (`pg:generate "add flaggers table"`) — also drops `annotation_queues_project_system_slug_idx` in the same migration, since `system` column reads disappear.
- [ ] **P1-5**: Do not ship a Postgres flagger backfill in this branch; backwards compatibility for existing projects is intentionally out of scope.
- [ ] **P1-6**: Implement `FlaggerRepositoryLive` in `@platform/db-postgres` with the standard mapper/insert-row pattern.
- [ ] **P1-7**: Replace `provisionSystemQueuesUseCase` with `provisionFlaggersUseCase` (same `apps/workers/src/services/provisioning.ts` shape, new use-case body).
- [ ] **P1-8**: Add `provision-flaggers.test.ts` — idempotency, one row per strategy slug, defaults `enabled=true`, `sampling=10`.
- [ ] **P1-9**: Update `db-postgres` seeds, `tools/live-seeds`, and `tools/ai-benchmarks/src/mappers/jailbreakbench.ts` to seed flagger rows instead of system-queue rows.

**Exit gate**:

- `pnpm --filter @platform/db-postgres pg:migrate` succeeds locally on a fresh DB and on a DB seeded against the previous migration.
- `provisionFlaggersUseCase` runs idempotently and produces one row per registered strategy slug per project.
- Flagger-authored writes use valid published annotation scores end-to-end (Zod parse + DB insert + read).
- The dead `annotation_queues_project_system_slug_idx` no longer exists.

### Phase 2 — LLM flagger workflow drops the queue

- [ ] **P2-1**: Add the `annotator: { name, description, instructions }` block to the LLM-capable strategy exports (`jailbreaking`, `refusal`, `frustration`, `forgetting`, `laziness`, `nsfw`, `trashing`). Copy text verbatim from `SYSTEM_QUEUE_DEFINITIONS`. Tighten the `QueueStrategy` type so `isLlmCapableStrategy` requires the field.
- [ ] **P2-2**: Rename `system-queue-flagger-workflow.ts` → `flagger-workflow.ts` (workflow + test). Update `apps/workflows/src/workflows/index.ts` export. Workflow input shape now `{ organizationId, projectId, traceId, flaggerId, flaggerSlug }`.
- [ ] **P2-3**: Update `flagger-activities.ts`: rename `queueSlug` → `flaggerSlug`, add `flaggerId`, drop `queueId`, drop `AnnotationQueueRepositoryLive` from the activity layer where no longer needed.
- [ ] **P2-4**: Rename `run-system-queue-flagger.ts` → `run-flagger.ts`; update symbol names; drop `queueSlug` references in span annotations.
- [ ] **P2-5**: Rename `run-system-queue-annotator.ts` → `run-flagger-annotator.ts`; rewrite `buildAnnotatorSystemPrompt` to read from the strategy's `annotator` block instead of `SYSTEM_QUEUE_DEFINITIONS`.
- [ ] **P2-6**: Rename `draft-system-queue-annotation.ts` → `draft-flagger-annotation.ts`; drop `findSystemQueueBySlugInProject` call; output shape becomes `{ scoreId, feedback, traceCreatedAt }`.
- [ ] **P2-7**: Rename `persist-system-queue-annotation.ts` → `save-flagger-annotation.ts`; replace queue-item insertion + `incrementTotalItems` with a single published annotation score write. Pass `source: "annotation"`, `sourceId: "SYSTEM"`, `draftedAt: null`.
- [ ] **P2-8**: Remove flagger-specific score source/repository APIs. Remove `findQueueDraftByTraceId` if no other caller remains.
- [ ] **P2-9**: Update `start-flagger-workflow` worker payload (rename `queueSlug` → `flaggerSlug`, add `flaggerId`).
- [ ] **P2-10**: Update `flagger-workflow.test.ts` and `flagger-activities.test.ts`.

**Exit gate**:

- `flaggerWorkflow` writes published annotation scores with `sourceId = "SYSTEM"` and is idempotent under retry.
- No code path references `queueId` or `queueSlug` for system-flagger persistence anywhere.
- `findSystemQueueBySlugInProject` and its `Live` impl are deleted.
- `buildAnnotatorSystemPrompt` no longer references `SYSTEM_QUEUE_DEFINITIONS`.

### Phase 3 — Process-flaggers reads flaggers config

- [ ] **P3-1**: Rename `process-deterministic-flaggers.ts` → `process-flaggers.ts`; rename `processDeterministicFlaggersUseCase` → `processFlaggersUseCase`; update all call sites.
- [ ] **P3-2**: Replace `getProjectSystemQueuesUseCase` invocation with `getProjectFlaggersUseCase`. Build `flaggerBySlug` map.
- [ ] **P3-3**: Add the `enabled === false` short-circuit and the `missing-flagger` defensive branch. Extend `DroppedReason`.
- [ ] **P3-4**: Update `handleMatched` to write `source: "annotation"`, `sourceId: "SYSTEM"`.
- [ ] **P3-5**: Update `handleNoMatch` and `handleAmbiguous` to read `flagger.sampling` (instead of `systemQueue.sampling`) and pass `flaggerId` + `flaggerSlug` into `enqueueWorkflowStart`.
- [ ] **P3-6**: Rename `get-project-system-queues.ts` → `get-project-flaggers.ts`; cache key shifts to `org:${orgId}:flaggers:${projectId}`. Eviction port stays.
- [ ] **P3-7**: Rename / update tests (`process-flaggers.test.ts`); add a `disabled` short-circuit case; assert deterministic-match writes use `source: "annotation"`.

**Exit gate**:

- `processFlaggersUseCase` runs end-to-end against flagger rows; the deterministic-match path writes a published `source: "annotation"` score; the LLM path enqueues the workflow with the new payload shape.
- Disabling a flagger row in fixtures suppresses both deterministic match writes and LLM enqueues for that slug.

### Phase 4 — Issue-discovery cleanup

- [ ] **P4-1**: Keep `check-eligibility.ts` on the regular published-score rule; drafts remain ineligible.
- [ ] **P4-2**: Update `create-issue-from-score.ts` to remove the `sourceId === "SYSTEM"` branch. Flagger-authored scores now map as `source = "annotation"`.
- [ ] **P4-3**: Keep tests covering draft rejection and annotation/custom issue-source mapping.

**Exit gate**:

- Flagger-authored published annotation scores enter issue discovery through the regular annotation path.
- Drafts still skip discovery.
- No code path inside `@domain/issues` references the `"SYSTEM"` sentinel.

### Phase 5 — Cleanup & rename sweep

- [ ] **P5-1**: Delete `SYSTEM_QUEUE_DEFINITIONS` and the `provisionSystemQueues*` exports from `@domain/annotation-queues`.
- [ ] **P5-2**: Delete `findSystemQueueBySlugInProject` from the port and `Live` impl. Verify no remaining callers.
- [ ] **P5-3**: Sweep symbol renames listed in **Renames** above across the monorepo. Update `index.ts` re-exports.
- [ ] **P5-4**: Delete `provisionSystemQueues` from `apps/workers/src/services/provisioning.ts`.
- [ ] **P5-5**: Delete the test file `provision-system-queues.test.ts` (replaced by `provision-flaggers.test.ts`).
- [ ] **P5-6**: Update `apps/web/src/routes/_authenticated/projects/$projectSlug/annotation-queues/-components/queue-modal.tsx` to drop any system-queue branching (verify the file actually has system-queue logic; if not, drop this task).
- [ ] **P5-7**: Repo-wide grep for flagger-specific score sources. Flagger output should remain `source = "annotation"`, `sourceId = "SYSTEM"`.
- [ ] **P5-8**: Run `pnpm typecheck` and `pnpm test` filters across affected packages until green. Run `knip` and clean up any newly orphaned exports.

**Exit gate**:

- Repo-wide grep for `SYSTEM_QUEUE`, `system-queue`, `systemQueue`, `findSystemQueueBySlugInProject`, `provisionSystemQueues` returns no hits.
- Repo-wide grep for flagger-specific score sources returns no hits inside `packages/domain/*` or `apps/*`.
- `pnpm typecheck` clean. Vitest suites for `@domain/flaggers`, `@domain/issues`, `@domain/scores`, `apps/workflows`, `apps/workers` all pass.
- The whole branch ships as a single PR. Phase 2 and Phase 3 are bundled into one commit because the publish/subscribe contract for `start-flagger-workflow` and the `EnqueueFlaggerWorkflowStart` callback shape are shared between the two phases — splitting them would leave one half of the rename in a transiently broken state.

## Open Items

- `gen_cuid()` SQL helper availability for the backfill migration is implementation-detail; if not available, the data-fill ships as a Node script invoked from the migration runner. This is decided during P1-5 and does not affect the spec's behavior.
- Future PRs may introduce the **potential issue** concept and the management UI for enabling/disabling flaggers and tuning sampling.
