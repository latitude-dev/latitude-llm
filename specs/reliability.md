# Reliability

> **Documentation**: `docs/reliability.md`, `docs/filters.md`, `docs/evaluations.md`, `docs/annotations.md`, `docs/scores.md`, `docs/issues.md`, `docs/simulations.md`, `docs/annotation-queues.md`, `docs/organizations.md`, `docs/projects.md`, `docs/users.md`, `docs/settings.md`, `docs/spans.md`

## Spec Contract

This spec defines exactly what to build, how it should be built, and why the design is shaped this way.

While reliability is under construction, overlap between this spec and the future-state docs is intentional.

The docs must remain precise enough to describe the intended implemented system on their own after this spec is eventually removed.

## Scope And Principles

The reliability system allows Latitude users to define, measure, monitor, and improve the reliability of LLM-powered applications, especially LLM Agents.

It must:

- measure performance degradation over time on live traffic
- surface recurring failure modes as issues
- generate monitors from those issues
- continuously align those monitors with human judgment
- support simulation-driven validation before shipping changes
- remain performant enough for users that evaluate every trace/session

The system uses:

- PostgreSQL for configuration, lifecycle, relational ownership data, and canonical mutable score rows
- ClickHouse for immutable score rows and analytical queries
- Weaviate for issue search and clustering projections

Implementation constraints for this repository:

- canonical reliability domain data contracts should be defined as shared Zod schemas first, with TypeScript types inferred from those schemas or from Drizzle table schemas where appropriate
- canonical entity schemas and inferred entity types should live in `entities/<entity>.ts`, and schemas/types elsewhere in the same domain plus app/platform boundary schemas should derive from or reuse those entity shapes whenever practical instead of re-declaring the same fields
- shared base schemas/types that are extended into discriminated unions or related variants should use `baseXxxSchema` / `BaseXxx` naming rather than `xxxCommonSchema` / `XxxCommon`
- canonical entity schemas should treat system-managed fields such as `id`, `createdAt`, and `updatedAt` as core entity fields; do not split an entity into a business payload plus an appended "persistence" wrapper unless a later phase introduces a truly distinct boundary/input DTO that explicitly needs that split
- when a boundary schema must differ materially from the entity shape, it should still reuse the relevant domain constants, field schemas, and literal unions rather than hardcoding duplicated lengths or sentinel values again
- when first translating spec-defined fields into domain types, schema models, or migrations, carry over the original per-field code comments from the spec alongside those fields so intent stays attached to the initial implementation
- when a phase first introduces an entity/model/table, add representative seed data for that entity in the same phase following the repository seeding conventions, so local development and staged rollouts have realistic sample data from day one
- if a phase needs to introduce a type, variable, schema, or other export before the codebase uses it, precede that intentionally temporary unused export with `/** @knipignore - TODO: unignore once used */` so automated `knip` checks tolerate the staged rollout
- enum-like domain contracts should use literal-string unions or `as const` objects, not TypeScript enums
- shared domain schemas should validate data crossing from app/platform boundaries into domain use-cases
- external request/response schemas should stay boundary-specific; they may reuse shared domain schemas or narrower projections of them
- app boundaries should only orchestrate auth, validation, tenancy, and use-cases
- business logic should live in dedicated domain packages, not in routes or jobs
- domain package constants should live in `constants.ts`, domain package errors in `errors.ts`, and small domain-scoped shared helpers in `helpers.ts`
- schemas and types that exist only as the inputs to one domain use-case should live in the same file as that use-case unless several use-cases truly share the same contract
- configurable thresholds, weights, debounce windows, sentinel values, and similar tunables should live in named constants inside the owning domain package rather than as scattered inline literals
- new reliability Postgres tables must not add foreign key constraints
- organization-scoped Postgres tables must use the repo RLS conventions
- ClickHouse tables in this system should stay append-only analytics tables rather than mutable source-of-truth rows
- reliability background work should use single-step queue tasks in `@domain/queue`, `@platform/queue-bullmq`, and `apps/workers`, plus the workflow abstraction in `apps/workflows` for long-running or multi-step orchestration
- domain events should use PascalCase names, while queue topics / `QueueName` entries and per-topic task names should use lower-kebab-case names
- queue payloads should carry ids or opaque storage keys rather than full mutable models, and workers should re-fetch current state before acting
- domain-event dispatchers should publish downstream tasks or start workflows; they must not run synchronous business logic inline
- debounced or delayed work must choose an explicit mechanism per use-case: topic-level dedupe/debounce keyed by logical entity identity for single-step tasks, or workflow timers for durable orchestration; do not rely on opaque BullMQ job history as lifecycle storage
- correctness, dedupe, and user-visible lifecycle state should live in Postgres/domain tables rather than in BullMQ job metadata or history
- the Latitude reliability platform should be equally accessible to humans through the web app UI and to other LLM Agents through MCP/API
- build reliability product management in `apps/web` first when that improves iteration speed, but design schemas, DTOs, use-cases, and public capabilities so the product does not dead-end into UI-only flows
- inbound machine-facing contracts that are core to reliability, especially annotation and score ingestion, should still exist as public APIs in MVP

Postgres indexing rules for this spec:

- each domain foundation phase defines the required secondary indexes at the same time as the table/entity definitions
- required indexes should be expressed directly in the Drizzle model definition itself, not only as prose beneath the snippet; single-column `.unique()` constraints may stay inline on the column when that is the clearest shape
- index design should start from real project-scoped query shapes: tenant scope first, then lifecycle/filter columns, then the dominant sort column
- do not add speculative GIN/JSONB/text indexes when the query path is already served by owner-row primary keys, Weaviate, or ClickHouse

This system spans these new domains:

- Evaluations
- Annotations
- Scores
- Issues
- Simulations
- Annotation Queues

It also extends these existing domains:

- Organizations
- Projects
- Users
- Settings
- Spans

## Legacy V1 Reference Code

This spec keeps explicit references to the legacy v1 implementation.

Important:

- those paths are relative to the root of the old repository on branch `latitude-v1`
- they are not vendored source inside this repository
- future coding agents that want to inspect the old implementation should first checkout branch `latitude-v1` in the old repository
- once that branch is checked out, the cited paths can be read directly from that repository root

Legacy UI/component guidance:

- when this spec refers to reusable v1 components, it means the old design-system components in `packages/web-ui/src/ds` from the old repository on branch `latitude-v1`
- do not reuse route-specific components from the old `apps/web/src` tree; the reliability entities, route structure, and product workflows have changed too much
- before building new reliability UI, inspect the old v1 design-system components as a reference
- reuse as much as possible when the old design-system implementation is still solid
- do not copy v1 UI blindly; be critical and improve it to match v2 conventions, architecture, and quality expectations when needed

Recommended implementation boundaries:

```text
packages/domain/evaluations
packages/domain/annotations
packages/domain/scores
packages/domain/issues
packages/domain/simulations
packages/domain/annotation-queues
```

Settings stay attached to their owner domains instead of becoming a standalone domain package.

The first phase that needs each external provider capability should introduce it as a platform package:

- `@platform/ai-vercel` for calling LLMs
- `@platform/ai-voyage` for embeddings and reranking
- `@platform/db-weaviate` for issue vector/text projection storage and search

Optimizer abstractions live in domain packages, while concrete optimizer implementations live in platform packages:

- `@domain/optimizations` for the optimizer interface/abstraction
- `@platform/op-gepa` for the first GEPA implementation, including the Python engine bridge and GEPA-specific runtime details

## Product Surface Implementation Pattern

Use the current repository product pattern for reliability surfaces:

- human-facing reliability product pages live in `apps/web`
- server-side reads and writes for those pages live in `apps/web/src/domains/<domain>/*.functions.ts` via `createServerFn`
- reactive client state and optimistic sync live in `apps/web/src/domains/<domain>/*.collection.ts`
- route-specific reliability UI components should live in the route directory's dedicated `-components/` subfolder so route files stay separate from their supporting UI
- only rarely, when a component is genuinely shared across multiple routes, it may live in the shared `apps/web/src/components` folder
- stable public or machine-facing reliability capabilities live in `apps/api/src/routes/*` modules under the existing versioned organization-scoped path shape `/v1/organizations/{organizationId}/...`
- `apps/api` must not become the internal backend for `apps/web`; the web product should compose domain use-cases directly
- MCP clients consume that public REST API surface; reliability does not need a separate MCP-only backend contract

## Background Task and Workflow Implementation Pattern

Reliability background work uses the shared async substrate built in Phase 0:

- `@domain/queue` for type-safe topic/task contracts, workflow contracts, and publisher/consumer interfaces
- `@platform/queue-bullmq` for BullMQ transport with built-in dedupe and debounce
- `@domain/events` for typed domain event definitions (`EventPayloads`, `DomainEvent`)
- `apps/workers` for topic consumers with typed `TaskHandlers<T>` maps
- `apps/workflows` for durable multi-step Temporal workflows
- `@platform/workflows-temporal` for Temporal client, worker, and typed `WorkflowStarterShape`

### TopicRegistry — single source of truth for queue topics

All topics, tasks, and payload types are defined in a single `const _registry` object in `packages/domain/queue/src/topic-registry.ts`. Both the `TopicRegistry` type and the `TOPIC_NAMES` runtime array are derived from it — no duplication.

To add a new topic:

1. Add an entry to `_registry` in `packages/domain/queue/src/topic-registry.ts` using the `payloads<T>()` helper
2. Create a worker in `apps/workers/src/workers/<topic>.ts` exporting a function that calls `consumer.subscribe("<topic>", { taskHandlers })`
3. Register the worker in `apps/workers/src/server.ts`

The system enforces completeness at two levels:

- **Compile time**: `subscribe<T>(queue, handlers)` requires a handler for every task in the topic. Missing handlers are a type error.
- **Runtime**: `start()` checks all `TOPIC_NAMES` have registered handlers before opening BullMQ workers. Missing topics fail with `QueueSubscribeError`.

### WorkflowRegistry — single source of truth for Temporal workflows

Workflow names and typed inputs are defined in `packages/domain/queue/src/workflow-registry.ts`. `WorkflowStarterShape` (in `@domain/queue`) is the domain-level typed contract for starting workflows.

To add a new workflow:

1. Add an entry to `_registry` in `packages/domain/queue/src/workflow-registry.ts` using the `input<T>()` helper
2. Implement the workflow in `apps/workflows/src/workflows/`
3. Register activities in `apps/workflows/src/activities/`
4. Trigger via `workflows.start("yourWorkflow", input, { workflowId })` from the dispatcher or a use-case

### Typed domain events

`EventPayloads` in `@domain/events` maps event names to payload shapes. `DomainEvent` is a discriminated union derived from it.

To add a new domain event:

1. Add an entry to `EventPayloads` in `packages/domain/events/src/index.ts`
2. Add a `case` branch in the dispatcher switch in `apps/workers/src/workers/domain-events.ts`

The dispatcher is a `switch` on `event.name` with full TypeScript narrowing — no routing table, no builders, no casts. Unknown events fail with `UnhandledEventError`.

### Dedupe and debounce

`publish()` accepts optional `dedupeKey`, `debounceMs`, and `throttleMs`. `debounceMs` and `throttleMs` are mutually exclusive; callers pick one based on the semantic the task needs:

- **`debounceMs`** (sliding window, `extend: true, replace: true` in BullMQ): each publish pushes the fire time forward and replaces the pending payload. Appropriate when you want to wait for a stream of events to settle, as with `trace-end:run` after `SpanIngested`.
- **`throttleMs`** (first-publish-wins, `extend: false, replace: false` in BullMQ): the first publish schedules the fire time and subsequent publishes within the window are dropped. Requires `dedupeKey`. Bounds worst-case latency at `throttleMs` and caps fires at once per window per key, even under a continuous publish stream. Appropriate for annotation-driven refreshes where starvation under continuous input would be a product bug.

```typescript
// Sliding window (debounce) — used by trace-end:run
pub.publish("trace-end", "run", payload, {
  dedupeKey: `trace-end:run:${traceId}`,
  debounceMs: TRACE_END_DEBOUNCE_MS,
})

// First-publish-wins (throttle) — used by issues:refresh and the evaluation alignment chain
pub.publish("issues", "refresh", payload, {
  dedupeKey: `issues:refresh:${issueId}`,
  throttleMs: ISSUE_REFRESH_THROTTLE_MS,
})
```

### Naming and ownership rules

- queue topics use lower-kebab-case names such as `live-evaluations`
- domain events use PascalCase names such as `SpanIngested` and `ScoreCreated`
- each queue topic maps to one subscribed worker module in `apps/workers/src/workers/<topic>.ts`
- each topic may define several related lower-kebab-case task names such as `enqueue`, `execute`, `flag`, or `annotate`
- the `domain-events` worker is a dispatcher only: it maps each domain event name to downstream topic tasks or workflow starts and never runs synchronous business logic inline
- later phases should add new event-to-topic or event-to-workflow routes in the dispatcher switch rather than creating parallel event-consumer rails
- queue payloads should carry ids or opaque storage keys, not full mutable models
- BullMQ is transport, not lifecycle storage; durable progress, correctness, and ownership live in Postgres/domain state
- queues are for single-step tasks; long-running or multi-step orchestration should use Temporal workflows
- workflow definitions live in `apps/workflows/src/workflows/*.ts`, activities in `apps/workflows/src/activities/*.ts`
- user-triggered background work that needs UI progress feedback should write transient Redis status keys and expose polling endpoints rather than querying BullMQ

Initial reliability domain-event contracts:

- `SpanIngested`: published directly into `domain-events` by the span-ingestion process through `createEventsPublisher(queuePublisher)` after a span write succeeds; consumed by the `domain-events` dispatcher to debounce and publish `trace-end:run`
- `ScoreCreated`: written transactionally after every canonical score write, including drafts; the payload carries the canonical `scoreId` plus an optional selected `issueId`, and the `domain-events` dispatcher consumes it by publishing the deduped `issues:discovery` task and the debounced `annotation-scores:publishHumanAnnotation` task
- `ScoreAssignedToIssue`: written transactionally when an immutable score is added to an existing issue and later async issue-detail regeneration should be throttled; consumed by the `domain-events` dispatcher to publish `issues:refresh`

Rationale for the mixed publication rails:

- `SpanIngested` stays on direct `createEventsPublisher(queuePublisher)` publication because it comes from a high-volume append-only flow whose upstream write is already durable before publication.
- `ScoreCreated` and `ScoreAssignedToIssue` intentionally use the transactional outbox rail so canonical Postgres writes stay atomic with downstream issue discovery, annotation publication, or debounced refresh requests.
- ClickHouse analytics sync and Weaviate projection sync are intentionally not routed through an extra domain-event hop; they run directly after the owning Postgres transaction succeeds so the non-Postgres projections do not stay stale longer than necessary.

Initial reliability topic/task contracts:

- `annotation-scores` / `publish`: debounced publication of one human-editable draft annotation score after its inactivity window elapses; it is distinct from immutable-score analytics save
- `issues` / `discovery`: deduped single-step issue handling for one canonical failed non-errored score; it rechecks eligibility, handles explicit/manual issue routing, resolves issue-linked evaluation routing, and only then starts the multi-step `issue-discovery` workflow when similarity search is still required
- `issues` / `refresh`: throttled asynchronous issue-details regeneration for an existing issue after new immutable evidence lands on that issue (first-publish-wins, 8h window per issue)
- `trace-end` / `run`: implemented as `runTraceEndJob` in `apps/workers/src/workers/trace-end.ts`; loads one ended trace, runs the shared sample-first selection pass across live evaluations, live queues, and system queues via `@domain/spans` / `@domain/evaluations` / `@domain/annotation-queues` orchestrators, then applies downstream work (execute publishes, live-queue membership writes, system-queue workflow starts)
- `live-evaluations` / `execute`: executes one evaluation against one trace/session input after live trigger selection

Initial reliability workflows:

- `issue-discovery`: multi-activity workflow for create-or-match similarity discovery after the centralized `issues:discovery` gate decides the score still needs retrieval/rerank work, plus a separate retryable synchronous first issue name/description generation activity for brand-new issues, assignment, projection sync, and post-immutability publication
- `refresh-evaluation-alignment`: linear workflow invoked by the throttled `evaluations:automaticRefreshAlignment` queue task (1h, first-publish-wins). On start it compares `sha1(evaluation.script)` against `evaluation.alignment.evaluationHash`. When they match (the persisted matrix was produced by the script that is live right now), it only judges examples created after the last alignment, merges their confusion matrix into the persisted one, and either persists the refreshed matrix (`metric-only`), publishes `evaluations:automaticOptimization` for full re-optimization (`full-reoptimization`), or exits (`no-op`). When the hashes diverge (something updated `evaluation.script` outside `persistAlignmentResultUseCase`), it rebuilds the matrix from scratch against every curated example, persists it with the freshly computed hash, and exits (`full-metric-rebuild`) — no GEPA escalation, because MCC drop is re-evaluated cleanly on the next incremental pass. It never sleeps — the 1h window is owned by the queue
- `optimize-evaluation`: linear workflow that serves all three evaluation-write paths. Started directly by the `apps/web` server function for initial generation (workflow id `evaluations:generate:${issueId}`) and manual realignment (workflow id `evaluations:optimize:${evaluationId}`), and by the throttled `evaluations:automaticOptimization` queue task (8h, first-publish-wins) after an MCC drop (same `evaluations:optimize:${evaluationId}` id). Runs example collection, baseline draft, GEPA optimization, baseline evaluation, and persistence; skips the name/description generation pass when an evaluation already exists so an auto-run does not silently rename it. The 8h re-optimization throttle is owned by the queue, not by the workflow

Issue handling now has two queue-backed steps before/after the workflow boundary: `issues:discovery` is a single-step gate for centralized direct-routing decisions, while `issues:refresh` is a single-step debounced task for subsequent detail regeneration of existing issues. The initial name/description for a brand-new issue must still be generated synchronously inside `issue-discovery` before the first issue row is persisted, but both the synchronous first-generation path and the later asynchronous refresh path must call the same shared issue-details generation use case underneath. Only the branch that still needs similarity retrieval starts the Temporal `issue-discovery` workflow.

These workflow names map to concrete Temporal workflows registered in the existing `apps/workflows` service.

Span-ingested trace-end runtime:

- the span-ingestion process publishes `SpanIngested` directly through `createEventsPublisher(queuePublisher)` after spans are durable
- the `domain-events` dispatcher reacts to `SpanIngested` by publishing `trace-end:run`, debounced and deduped by `(organizationId, projectId, traceId)`
- if another span for the same trace arrives before the debounce window elapses, the pending tasks are replaced/rescheduled so the window starts over
- `trace-end:run` finishes selection before applying side effects, then it may publish or start further work such as `live-evaluations:execute` or `system-queue-flagger`, but the dispatcher itself never performs the work inline

## Trace Filters

The `filter` fields used in this specification use the trace filters defined in `packages/domain/shared/src/filter.ts` which are exported from `@domain/shared` as `FilterSet`.

The canonical shared filter model looks like this (but the docs or its implementation must be looked up for specifics):

```typescript
type FilterOperator = (typeof FILTER_OPERATORS)[number];

interface FilterCondition {
  readonly op: FilterOperator;
  readonly value: string | number | boolean | readonly (string | number)[];
}

type FilterSet = Readonly<Record<string, readonly FilterCondition[]>>;
```

Reliability must reuse this shared filter model instead of inventing a second free-form string filter language

App and API boundaries that accept filters should validate them with the shared `filterSetSchema`

Trace-oriented reliability filtering reuses the shared trace field registry in `packages/platform/db-clickhouse/src/registries/trace-fields.ts`.

## Settings

There is no standalone settings domain. Settings stay attached to the owner entity only when a concrete reliability capability needs them.

Conceptually there are three ownership layers:

- organization-wide
- project-wide
- user-wide

For MVP, the only reliability owner settings required are the organization/project defaults for `keepMonitoring`.

The MVP settings shapes should stay intentionally small:

```typescript
type ProjectSettings = {
  keepMonitoring?: boolean; // if true, issue-linked evaluations keep running after resolution; if false they are archived
};

type OrganizationSettings = {
  keepMonitoring?: boolean; // organization-wide default for post-resolution monitoring behavior
};
```

These extend the existing Postgres owner tables by adding `settings` columns only where MVP behavior needs them:

```typescript
import { sql } from "drizzle-orm";
import { jsonb, varchar } from "drizzle-orm/pg-core";

export const organization = latitudeSchema.table("organization", {
  // existing Better Auth fields...
  settings: jsonb("settings")
    .$type<OrganizationSettings>()
    .notNull(),
  ...timestamps(),
});

export const projects = latitudeSchema.table(
  "projects",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 256 }).notNull(),
    settings: jsonb("settings")
      .$type<ProjectSettings>()
      .notNull(),
    deletedAt: tzTimestamp("deleted_at"), // existing project soft-delete field
    lastEditedAt: tzTimestamp("last_edited_at").notNull().defaultNow(), // existing project metadata field
    ...timestamps(),
  },
  () => [organizationRLSPolicy("projects")],
);
```

MVP does not need:

- `user.settings`
- provider/model fields in `organization.settings` or `projects.settings`
- evaluation-level provider/model settings

Important MVP repository-specific notes:

- `projects.settings` lives on an organization-scoped table and should use existing RLS protections.
- `organization.settings` lives on a Better Auth-owned table, so it is protected by boundary auth/membership rules rather than `organizationRLSPolicy`.
- user-scoped settings remain deferred until a concrete user preference requires them

MVP indexing note:

- do not add new secondary indexes on `organization.settings` or `projects.settings` in the settings foundation phase
- those settings payloads are loaded through the existing owner-row primary/unique lookup paths, so speculative JSONB/GiN indexing would be premature

MVP UI placement:

- organization settings are accessible from the home dashboard
- project settings are accessible from the project dashboard
- user settings stay deferred until they have concrete product value

`keepMonitoring` is the exact field controlling post-resolution issue-monitor behavior:

- `true` keeps issue-linked evaluations active after resolution so they can detect regressions
- `false` archives issue-linked evaluations when the issue resolves
- when `ProjectSettings.keepMonitoring` is undefined, it falls back to `OrganizationSettings.keepMonitoring`
- when a user manually resolves an issue, this setting controls the default state of the confirmation-modal toggle for keeping linked evaluations active for future regressions
- the manual resolution modal may override that default for the specific resolve action

Manual ignore behavior is separate from `keepMonitoring`:

- when an issue is manually ignored, its linked evaluations are archived immediately
- `keepMonitoring` only governs what happens on issue resolution, not on issue ignore

> Temporary implementation note: until the evaluations dashboard exists, issue-driven
> "stop monitoring" actions in the product UI and issue lifecycle flows soft delete
> linked evaluations instead of moving them into the archived/read-only state. The
> intended long-term behavior remains archival once that dashboard ships.

### Post-MVP Provider/Model Settings

The original provider/model settings plan is intentionally retained for post-MVP work.

When that phase returns, the settings shapes should stay close to the original proposal:

```typescript
type UserSettings = {
  ... // User-wide settings. Still pending precise definition.
}

type ProjectSettings = {
  keepMonitoring?: boolean // retained from MVP
  defaultProvider?: string // if not provided, the organization's default provider will be used
  defaultModel?: string // if not provided, the organization's default provider's model will be used
}

type ProviderSettings = {
  apiKey: string // persisted using application-level encryption via repository crypto helpers
  ... // provider-specific fields remain extensible
}

type OrganizationSettings = {
  keepMonitoring?: boolean // retained from MVP
  providers: Record<string, ProviderSettings> // provider name to provider settings
  defaultProvider?: string // if not provided, the first configured provider will be used
  defaultModel?: string // if not provided, the first configured model for that provider will be used
}

type EvaluationSettings = {
  provider?: string // if not provided, the project or organization post-MVP defaults will be used
  model?: string // if not provided, the project or organization post-MVP defaults will be used
}
```

Important post-MVP notes:

- before implementing provider/model settings, explicitly define whether `OrganizationSettings.providers` stays embedded in `organization.settings` JSONB or moves to a dedicated organization-scoped table
- Provider API keys must use application-level encryption via the repository crypto helpers before persistence. The spec does not lock a new JSON envelope format; it only requires app-level encryption so plaintext keys are never stored by the application.
- once provider/model settings land, evaluation execution resolution order is evaluation settings, then project settings, then organization settings

## Evaluations

Evaluations are the core monitor entities of the reliability system.

They are JavaScript-like sandboxed scripts that receive a conversation plus metadata and return a Score verdict:

- `value`: normalized float in `[0, 1]`
- `passed`: boolean verdict
- `feedback`: human-readable text that later feeds issue discovery and optimization

Evaluations work on unseen conversations. They do not compare an output to a pre-existing expected answer.

In MVP, only evaluations generated from issues (by user demand) are required. User-created evaluation authoring through the UI is deferred and should remain explicitly marked as pending definition.

### Evaluation Script

The stored `script` field should contain the body of a JavaScript-like evaluation function whose input/output contract is host-controlled by Latitude.

The contract should stay aligned with the original proposal:

```typescript
// Feedback is always required
// If present, score value is passed before the feedback... this is achieved using a variadic function that accepts (number | string)[] as arguments. If score is not present, it will default to 1 (Passed) or 0 (Failed).
function Passed(score?: number, feedback: string): Score
function Failed(score?: number, feedback: string): Score

async function llm(
  prompt: string,
  options?: {
    temperature?: number
    maxTokens?: number
    schema: z.ZodSchema
  },
): Promise<unknown>

async function parse(
  value: unknown,
  schema: z.ZodSchema,
): Promise<{ valid: boolean; error?: string }>

type Metadata = {
  duration: number // duration in nanoseconds
  usage: {
    input: number
    output: number
    reasoning: number
    cacheRead: number
    cacheWrite: number
  }
  cost: number // cost in microcents
  turns: number
  ...
}

async function evaluate(conversation: Message[], metadata: Metadata): Score {
  // The script body is stored in the database. Latitude controls the wrapper.
}
```

Rules:

- the script artifact is always stored as source text from day one
- the script never talks directly to the outside world
- all external capabilities are exposed as host-controlled functions such as `llm()` or `parse()`
- the eventual runtime must be portable between backend execution and the simulation CLI
- the eventual runtime must enforce resource limits for CPU, memory, loops, sleep, and other abuse patterns
- the script should have access to `zod` and other host-approved globals or dependencies only
- for MVP and early hosted execution, `llm()` runs through `@platform/ai-vercel` and the Vercel AI SDK with a Latitude-managed provider, model, and environment-managed API key rather than user-configured provider/model settings
- if post-MVP provider/model settings return, they should extend `llm()` without changing the stored script artifact model, using evaluation -> project -> organization resolution

The stored script must point toward the full JS-like runtime even before that runtime ships.

#### MVP execution constraint

The full sandbox runtime is not required for MVP.

For MVP, evaluations generated from issues (by user demand) may be executed by a simpler host-controlled implementation, and the generated script can be as simple as a single `llm()`-as-judge call. However:

- the persisted artifact is still a script
- the evaluation model, optimizer, APIs, and simulation architecture must already target the future JS-like runtime
- the MVP implementation must not back the system into a hidden prompt-config model that later needs a migration
- because the MVP script is constrained to a single `llm()` template call, the host runner may extract the prompt/options from the stored script and execute them directly through `@platform/ai-vercel` and the Vercel AI SDK with the Latitude-managed provider/model/API-key configuration

#### MVP target architecture

Even before the full runtime exists, MVP must already treat this as the real architecture:

- evaluations generated from issues (by user demand) are script-native artifacts
- the optimizer abstraction lives in `@domain/optimizations` and is built around optimizing scripts
- the first concrete optimizer lives in `@platform/op-gepa`
- only the execution substrate is temporarily simplified for MVP

### Evaluation Alignment

Evaluations generated from issues (by user demand) are the mainline flow of the reliability system.

Issue discovery and issue creation do not automatically generate evaluations. Instead, monitoring is started explicitly from the issue details drawer. When an issue currently has no linked evaluations, that drawer exposes a `Monitor issue` action inside the linked-evaluations section. Triggering it starts the `optimize-evaluation` Temporal workflow with a deterministic `evaluations:generate:${issueId}` workflow id and returns immediately without exposing any internal identifier; the frontend polls a dedicated status endpoint that asks Temporal directly via `workflow.describe()` on the three relevant workflow ids (`evaluations:generate:${issueId}`, `evaluations:refreshAlignment:${evaluationId}`, and `evaluations:optimize:${evaluationId}` per linked evaluation) while the generation/alignment pipeline runs in the background. Temporal is the single source of truth for workflow state; no Redis-backed job-status mirror exists. Issues may still accumulate several linked evaluations over time, but the managed UI should not show a second monitor-generation button once at least one linked evaluation already exists.

After explicit creation, automatic dynamic realignment remains unchanged for each linked evaluation: the system still refreshes alignment asynchronously as new annotations arrive.

To generate or realign an evaluation for an issue, annotation-derived truth follows these minimum rules:

- drafts and errored scores must never be used as alignment examples
- alignment reads only published, non-errored canonical Postgres scores

1. positive examples where human annotations indicate the issue being aligned is present, meaning failed, non-errored, non-draft annotation scores linked to that specific issue, using this priority order:
   1. conversations with at least one failed annotation linked to the target issue and no passed scores at all
   2. conversations with at least one failed annotation linked to the target issue, regardless of any passed scores that may also be on the same conversation

   The minimum required positive-example count is `1` (this happens naturally because otherwise the issue would not have been created in the first place).
2. negative examples where the issue is absent, drawn only from conversations that have at least one passed annotation (non-draft, non-errored), using this priority order:
   1. conversations with at least one passed annotation and no failed scores at all
   2. conversations with at least one passed annotation and failed scores, as long as every failed score is unrelated to the issue we are trying to align for

   Conversations without any passed annotation are never used as negatives, even when only passed evaluation/custom scores exist — the signal is considered too weak. Any score tied to the target issue (regardless of `passed`) disqualifies the conversation as a negative.

There is no minimum negative-example count. This means a user can still generate a monitor for a brand new issue from a single failed, non-errored, non-draft human annotation linked to that issue, even before any explicit negatives exist.

Early monitors created from such sparse evidence may be weakly aligned, which is acceptable. The on-demand generation flow should still let users create them immediately, and later annotation-driven realignment should improve them as more positive and negative evidence accumulates.

The only persisted alignment primitive is the confusion matrix.

When this spec references alignment, it means the MCC (Matthews Correlation Coefficient) derived from that confusion matrix. Accuracy, F1, and other comparison metrics must also be computed from the same stored counts instead of being persisted separately.

Stop conditions:

- perfect alignment is reached
- configurable resource usage limits are hit
- alignment stagnates for a configurable number of iterations

After the best script is selected, a second pass generates or refreshes the evaluation name and description from the resulting script, using the previous name/description as baseline when realigning an existing evaluation.

Alignment scheduling must follow the proposal exactly:

- user-triggered initial generation/alignment starts immediately when requested from an issue, but it runs in the background through the `optimize-evaluation` workflow under an `evaluations:generate:${issueId}` workflow id
- asynchronous debounced recomputation after new human annotations arrive
- metric recomputation debounced to at most once per hour
- full re-optimization debounced to at most once every eight hours
- manual realignment must be available and throttled
- the evaluation UI must show alignment status and last aligned timestamp

When a user creates a new issue-linked evaluation, it must initialize `trigger.sampling` from a named constant in `packages/domain/evaluations`. The starting default for that constant is `10`, meaning new issue-linked evaluations sample `10%` of eligible traffic until a user changes the sampling value.

Incremental refresh behavior:

- hash the script (`sha1`) when alignment completes and persist it alongside the confusion matrix on `evaluation.alignment.evaluationHash`
- on refresh, re-hash the live script and compare to the persisted hash; when they match, only evaluate new examples since the last alignment window and add their counters to the existing matrix
- when the hashes diverge, treat the persisted matrix as stale (it was produced by a different script) and rebuild it from scratch against every curated example, persisting the freshly computed hash so the next refresh is back on the incremental path
- if derived alignment (MCC) decreases more than the configured tolerance band, run full optimization again
- if derived alignment (MCC) stays effectively the same or improves, keep the script and just update alignment state

### Evaluation Optimizer

The first optimizer should be GEPA, but the system must support future optimizers through a common interface.

That abstraction lives in `@domain/optimizations`, while the first concrete implementation lives in `@platform/op-gepa`.

The abstraction in `@domain/optimizations` must support Pareto-driven multi-objective optimization with this ordered priority model:

1. maximize alignment (MCC) against human judgment
2. minimize cost in dollars, derived from stored microcent values
3. minimize duration in seconds, derived from stored nanosecond values

Concrete optimizers may search the candidate space differently, but the abstraction must preserve that priority ordering when reporting and selecting candidate scripts. The abstraction should model optimizer orchestration contracts and result comparison, not embed GEPA's concrete search algorithm.

The optimizer-facing alignment objective is the derived MCC produced by the ground-truth evaluation run. The only persisted alignment primitive remains the confusion matrix, from which MCC, accuracy, F1, and other metrics can be computed.

Persisted reliability cost stays in a field named `cost` and is stored in microcents. UI/reporting and optimizer-facing cost displays convert that stored value into dollars at read time.

Persisted reliability duration stays in a field named `duration` and is stored in nanoseconds. UI/reporting and optimizer-facing duration displays convert that stored value into seconds or other human-friendly units at read time.

Implementation guidance from v1 that should be reused where compatible:

- TypeScript should orchestrate the domain-specific pipeline
- the Python RPC optimizer process can be reused/adapted for GEPA
- the evaluator and proposer feedback loop from v1 should be studied and adapted for scripts instead of prompts
- the transport can remain JSON-RPC over stdio if that remains the cleanest fit

Concrete v1 architecture notes worth carrying forward:

- v1 was a queued lifecycle, not a one-shot function call: `start -> prepare -> execute -> validate -> end`, with explicit timestamps, job boundaries, status events, and cancellation across phases
- TypeScript owned dataset/example curation, candidate execution, candidate evaluation, proposer prompting, persistence, and cancellation; Python only ran the GEPA search loop
- the workers runtime stayed Node-based, but its container image bundled the Python engine runtime and source so TypeScript could spawn `python -m app.main` as a child process
- the transport was bidirectional newline-delimited JSON-RPC over stdio, with Zod validation on the TypeScript side and strict schema validation on the Python side
- the Python side registered handlers in `apps/engine/app/main.py` and `apps/engine/app/rpc/server.py`, while the TypeScript GEPA adapter registered `Evaluate` and `Propose` callbacks for the engine to call back into
- the RPC boundary was intentionally skinny: examples crossed as ids, candidate artifacts crossed as hashes, and trajectories crossed back into Python only as ids plus scalar outputs; full traces and feedback stayed host-side and were rehydrated only when proposal generation needed them
- `evaluate` validated candidate invariants, converted many candidate-specific failures into learnable feedback instead of crashing the whole run, executed the candidate, optionally simulated extra turns, selected spans by trigger, ran the evaluation, and aggregated the resulting scores/feedback/usage into a trajectory
- `propose` sanitized trajectories, enriched model metadata when available, called a Copilot prompt template, cached by exact input hash, and returned the next candidate artifact text

Useful v1 defaults to review before implementing v2, even if they are later re-tuned:

- optimization max time: `7200` seconds
- optimization max tokens: `100_000_000`
- optimizer stagnation cap: `10`
- default seed: `310700`
- curated dataset bounds: `4` to `1000` rows
- train split: `0.7`
- validation split: `0.3`

Legacy v1 reference paths for this section:

- `apps/engine`
- `apps/workers/docker/Dockerfile`
- `packages/core/src/services/optimizations`
- `packages/core/src/services/optimizations/optimizers/evaluate.ts`
- `packages/core/src/services/optimizations/optimizers/propose.ts`

These references are relative to the repository root of branch `latitude-v1`.

The new optimizer differs from v1 in one critical way:

- it optimizes evaluation scripts, not prompt documents or hidden config objects

Important v2 corrections relative to v1:

- keep the host-driven lifecycle and child-process RPC split, but change the optimized artifact from prompt text to evaluation script text
- keep Node workers as the primary runtime, and package the Python GEPA engine as a subordinate process inside the workers image rather than turning workers into a Python-native app
- keep learnable feedback as a first-class concept, but redefine the invariant checks around script/runtime contracts rather than prompt provider/model/config compatibility
- keep the narrow RPC payload design, but send script hashes / example ids / trajectory ids rather than prompt-document-specific payloads
- do not copy prompt-specific scope semantics, prompt commit forking, or provider/model pinning as a hard optimizer invariant
- do not assume v1 already had true multi-objective optimization just because GEPA exposed Pareto settings; the actual adapter only supplied a single scalar score, and v2 continues to optimize on that scalar correctness signal
- prefer deterministic sampling/seeding for v2 reliability work rather than copying v1's more ad-hoc randomness

The initial baseline for a brand new issue-linked evaluation should be a sample script that performs a simple `llm()`-as-judge evaluation using:

- the conversation
- the metadata
- the issue name
- the issue description

The proposer and details-generator should use Latitude-owned prompts, stored in this repository, and API keys through the agreed runtime/storage packages and optimizer packages:

- `@platform/ai-vercel`
- `@platform/ai-voyage`
- `@platform/db-weaviate`
- `@domain/optimizations`
- `@platform/op-gepa`

The proposer and details-generator model selections must live in named constants inside the owning optimizer implementation package rather than as inline magic strings. The initial defaults are:

- proposer: OpenAI `gpt-5.4` with reasoning settings maximized
- details-generator: OpenAI `gpt-5.4` with lower reasoning settings

### Evaluation Triggering

Not all spans/traces/sessions must be evaluated.

The evaluation trigger shape stays aligned with the proposal:

```typescript
import type { FilterSet } from "@domain/shared";

type EvaluationTrigger = {
  filter: FilterSet; // trace/session filter over the shared trace field registry; `{}` matches all traces
  turn: "first" | "every" | "last"; // runs on the first, every, or last ingested trace/turn
  debounce: number; // debounce time in seconds
  sampling: number; // percentage [0, 100]
};
```

MVP status:

- `filter`, `turn`, `debounce`, and `sampling` are all in MVP
- `filter` reuses the shared `FilterSet` from `@domain/shared` rather than a reliability-only string grammar
- live evaluation selection should reuse the shared trace filter semantics and field registry rather than inventing a parallel trigger-filter interpreter

Live evaluation triggering is incremental:

- whenever a `SpanIngested` domain event is observed for a project, the `domain-events` dispatcher debounces and publishes one `trace-end` message with task `run` for that trace
- `trace-end:run` lists all active evaluations in that project, meaning rows with `archivedAt = null` and `deletedAt = null`
- trigger checks run against the incoming trace rather than rescanning historical traces on each read
- trigger evaluation order is `sampling` first, then shared batched `filter`, then `turn` / `debounce`
- when an evaluation passes those trigger checks, `trace-end:run` publishes one `live-evaluations` message with task `execute` for that `(evaluationId, traceId)` pair; the payload carries ids plus trigger context only, and score generation/writes happen later in that task
- this shared `trace-end:run` task batches live-evaluation and live-queue filter evaluation instead of keeping separate selection tasks
- an empty `trigger.filter` means "match all traces"

Deleted or archived evaluations never trigger.

### Evaluation Status

Archived and deleted are different states:

- archived evaluations remain visible in the UI in read-only mode and do not run anymore
- deleted evaluations are soft deleted, removed from management UI, and do not run anymore
- deleted evaluations still count in historical aggregates and score analytics
- issue-linked evaluations are archived immediately when the issue is manually ignored in the target design; until the evaluations dashboard exists, the temporary implementation soft deletes them instead
- issue-linked evaluations may also be archived when the issue is manually resolved, according to the confirmation-modal toggle defaulted from `keepMonitoring`; until the evaluations dashboard exists, the temporary implementation soft deletes them instead
- `keepMonitoring` only applies to issue resolution; it does not affect the manual ignore path

### Evaluation Model

In MVP, evaluations do not need a `settings` JSONB column. Provider/model overrides are deferred to a post-MVP extension.

```typescript
import type { FilterSet } from "@domain/shared";

type EvaluationTrigger = {
  filter: FilterSet; // trace/session filter over the shared trace field registry; `{}` matches all traces
  turn: "first" | "every" | "last"; // runs on the first, every, or last ingested trace/turn
  debounce: number; // debounce time in seconds
  sampling: number; // percentage [0, 100]
};

type EvaluationAlignment = {
  evaluationHash: string; // sha1 of the script so we know if we can increment or recompute the confusion matrix
  confusionMatrix: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    trueNegatives: number;
  }; // stored counts from which MCC and other metrics can be derived later on
};
```

```typescript
import { index, jsonb, text, unique, varchar } from "drizzle-orm/pg-core";

export const evaluations = latitudeSchema.table(
  "evaluations",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project
    issueId: cuid("issue_id").notNull(), // in MVP evaluations are issue-linked; multiple evaluations may link to the same issue
    name: varchar("name", { length: 128 }).notNull(), // unique name within the project among non-deleted rows
    description: text("description").notNull(),
    script: text("script").notNull(), // javascript-like evaluation script that runs inside a sandbox/runtime wrapper
    trigger: jsonb("trigger").$type<EvaluationTrigger>().notNull(),
    alignment: jsonb("alignment").$type<EvaluationAlignment>().notNull(),
    alignedAt: tzTimestamp("aligned_at").notNull(), // last time the evaluation was realigned
    archivedAt: tzTimestamp("archived_at"), // archived evaluations are still visible in read-only mode
    deletedAt: tzTimestamp("deleted_at"), // deleted evaluations are soft deleted from management UI
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("evaluations"),
    index("evaluations_project_lifecycle_idx").on(
      t.organizationId,
      t.projectId,
      t.deletedAt,
      t.archivedAt,
      t.createdAt,
    ),
    index("evaluations_issue_lookup_idx").on(t.organizationId, t.projectId, t.issueId, t.deletedAt),
    unique("evaluations_unique_name_per_project_idx")
      .on(t.organizationId, t.projectId, t.name, t.deletedAt)
      .nullsNotDistinct(),
  ],
);
```

Required Postgres indexes:

- soft-delete-aware unique btree on `(organization_id, project_id, name, deleted_at)` with nulls-not-distinct semantics
- btree on `(organization_id, project_id, deleted_at, archived_at, created_at)` for active/archived project list views
- btree on `(organization_id, project_id, issue_id, deleted_at)` for issue-linked evaluation lookups and issue-driven lifecycle updates
- do not add a unique issue-level constraint in MVP; issues may have several linked evaluations
- do not add GIN/JSONB indexes on `trigger` or `alignment`, and do not add text indexes on `script` or `description` in the evaluations foundation phase

### Evaluation Table

Each project has an `Evaluations` page.

Before the table, show project-wide aggregates:

- total evaluations: active evaluations only
- total token usage: include archived and deleted evaluations
- total cost: include archived and deleted evaluations

The active evaluations table must include:

- `Name`: truncated, with a paused tag when `sampling = 0`
- `Description`: truncated to two lines
- `Issue`: linked issue name plus derived alignment tag
- `Trend`: mini area chart of running average score per day over the last 14 days
- `Quick actions`: settings, pause/resume, archive, delete

Pause/resume/archive/delete actions require confirmation modals with explanation text.

Below the active evaluations table, continue with the custom score sources table:

- it is a continuation of the same headless table
- it shows `source = 'custom'` rows grouped by `source_id`
- `Name` is the `source_id` plus a custom tag
- `Description` is `Pushed through the API`
- `Issue` is `-`
- `Trend` behaves the same
- there are no quick actions

Below that, show archived evaluations in a separate lighter table:

- columns: `Name`, `Description`
- on hover, show an `Unarchive` action

Pagination:

- limit/offset pagination
- sorted by `created_at DESC`

### Evaluation Dashboard

An active evaluation has a full page dashboard.

Header area:

- name
- description
- settings button
- trigger button
- read-only script button

If the dashboard is for a custom score source:

- there is no settings button
- there is no trigger button
- there is no script button

Aggregates:

- score over time
- total scores
- average score
- average duration
- total cost
- total tokens
- derived alignment with last aligned timestamp and force realignment button

Score table:

- keyset pagination
- `Time`
- `Span`
- `Score` with Passed/Failed/Error duotone tag and numeric value
- `Feedback`
- `Duration`
- `Cost`
- `Tokens`

If the score errored, tint the whole row red.

Row click opens full score details modal.

Filters:

- date range
- exclude scores from simulations toggle, enabled by default
- passed / failed / errored / all selectors

## Annotations

Annotations are human-reviewed scores.

Human-created annotations are the highest-confidence source of truth, and the system may also create draft annotations that wait for human review.

They can be created:

- through Latitude UI
- through the public API
- through system-created annotation-queue workflows that draft annotations before human review

Human-reviewed annotations are the main human source of truth for the reliability system. They are used to:

- discover issues
- align evaluations
- monitor product quality with human judgment

Annotations are not a standalone canonical fact table. They are scores with:

- `source = "annotation"`
- `source_id = "UI" or "API"` or the Annotation Queue CUID

### Annotation Requirements

- the API for pushing annotations must be simple and agent-friendly
- annotation ingestion lives under `POST /v1/organizations/:organizationId/projects/:projectId/annotations` rather than the generic scores endpoint, even though annotations still persist canonical `source = "annotation"` score rows
- users must be able to build their own annotation UI outside Latitude
- annotations are attached to spans/traces/sessions and to message-level or text-range anchors in the conversation UI
- the original feedback must be preserved
- the stored canonical feedback used for clustering can be enriched

### Draft Annotations

Annotations may exist as drafts before they become published scores.

Rules:

- drafts still use `source = "annotation"` and the queue CUID or `"UI"` / `"API"` as `source_id`
- draft state is represented by `draftedAt`, not by fake error strings
- human-created UI annotations are written as drafts in Postgres immediately so they remain visible on refresh while the user is still editing
- system-created annotation queues may also create draft annotations before a human has reviewed the trace
- draft annotations do not enter issue discovery, issue-centroid mutation, Weaviate projection sync, ClickHouse analytics, or evaluation alignment until `draftedAt` is cleared
- if a draft annotation carries `issueId`, treat that value as editable draft intent only until publication clears `draftedAt`
- a human-reviewed annotation can later confirm, edit, or replace a draft while it is still drafted; once published, it should only support deletion

### Annotation Issue Intent

When an annotation is created through Latitude-managed UI, the annotator can currently choose one of two issue paths:

- leave the annotation unlinked and let issue discovery decide
- link the annotation to an existing issue explicitly

Inline manual issue creation from the annotation flow is intentionally cancelled for now to keep the managed annotation UX and ownership rules simpler while Phase 11 finishes.

Rules:

- explicit link choices are human overrides and bypass similarity-based candidate selection for that annotation score once the draft is published
- while the annotation is still drafted, a selected existing issue is stored only as editable draft intent on the canonical score row
- publication of that linked draft emits `ScoreCreated` carrying the selected `issueId`, and the centralized `issues:discovery` task then performs the canonical ownership claim plus Weaviate/ClickHouse sync after the Postgres transaction commits; if the score is added to an existing issue, that same transaction also writes `ScoreAssignedToIssue` for the later debounced refresh
- explicitly linked annotation issues are immediately visible in the product only after publication

### Annotation Enrichment

Users often provide low-quality or extremely short annotation feedback.

For annotation-originated scores:

- keep the original human text in metadata
- run an LLM enrichment pass using surrounding conversation context
- store the enriched, clusterable text in the canonical `feedback` field
- run issue discovery against the enriched canonical feedback

Concrete v1 carry-forward notes:

- v1 persisted the generalized/enriched reason so later discovery and reassignment work could reuse it instead of re-running enrichment every time
- the enrichment step assembled surrounding trace/message context and asked an LLM to generalize the raw human annotation into clusterable language
- v1 delayed discovery by `60` seconds for editable human results with no linked issue so the annotation could still be revised first; v2 keeps the same general idea through draft rows in Postgres, with the publish debounce defined as a named constant

### Annotation Score Metadata

The annotation score metadata must store the fields required to reconstruct the annotation in the conversation UI later.

Recommended exact shape:

```typescript
type BaseScoreMetadata = {};

type AnnotationScoreMetadata = BaseScoreMetadata & {
  rawFeedback: string; // original feedback text before enrichment; human-authored for created annotations, model-authored for system-created drafts
  messageIndex?: number; // optional index in the canonical `TraceDetail.allMessages` conversation; omit for conversation-level annotations
  partIndex?: number; // optional raw GenAI `parts[]` index inside the target message
  startOffset?: number; // optional start offset for substring annotations within a textual part
  endOffset?: number; // optional end offset for substring annotations within a textual part
};
```

This keeps the metadata aligned with the proposal without over-abstracting it into a separate target-level system.

Because conversation messages are GenAI messages with a `parts[]` array, the minimal anchor should be:

- no anchor fields for whole-conversation annotations
- `messageIndex` to identify the target message in `TraceDetail.allMessages`
- `partIndex` only when the annotation targets a specific part inside `parts[]`
- `startOffset` / `endOffset` only when the annotation targets a substring inside a textual part

Anchor coordinates must use the raw persisted conversation structure:

- `messageIndex` is indexed against `TraceDetail.allMessages`, not against a UI-visible list after tool-response absorption
- `partIndex` is indexed against the raw `GenAIMessage.parts[]` array, not against grouped reasoning blocks or other UI-only presentation transforms

Do not store redundant quoted text when the selection can be reconstructed from the conversation plus these indices/offsets.

### Annotation Queues

Annotation queues are the managed workflow surface through which users review traces and annotate quickly with minimal distraction.

Queue concepts:

- a queue is considered `manual` when it has no filter configured and queue membership is created by explicit insertion rather than by stored filter materialization
- a queue is considered `live` when it has a filter configured and materializes traces incrementally over time from that filter plus optional sampling
- user-created queues are in MVP
- each project also gets a default set of system-created manual annotation queues

Queue filters reuse the same shared `FilterSet` used by `EvaluationTrigger.filter`, applied against the shared trace field registry. Live queues should omit `settings.filter` entirely when no conditions are configured so manual/live semantics stay unambiguous.

Queue assignees are optional. A queue may be assigned to none, one, or many existing Latitude users from the same organization.

System-created default queues:

#### Jailbreaking

- description: attempts to bypass system or safety constraints
- instructions: review traces for prompt injection, instruction hierarchy attacks, role or identity escape attempts, policy-evasion behavior, tool abuse meant to bypass guardrails, or assistant behavior that follows those bypass attempts. Do not use this queue for harmless roleplay or normal requests that are safely refused.

#### Refusal

- description: the assistant refuses a request it should handle
- instructions: review traces where the assistant declines, deflects, or over-restricts even though the request is allowed and answerable within product capabilities and policy. Do not use this queue when the refusal is correct because the request is unsafe, unsupported, or missing required permissions/context.

#### Frustration

- description: the conversation shows clear user frustration or dissatisfaction
- instructions: review traces where the user expresses annoyance, disappointment, loss of trust, repeated dissatisfaction, or has to restate/correct themselves because the assistant is not helping. Do not use this queue for neutral clarifications or isolated terse responses without evidence of frustration.

#### Forgetting

- description: the assistant forgets earlier conversation context or instructions
- instructions: review traces where the assistant loses relevant session memory, repeats already-settled questions, contradicts earlier facts, or ignores previously stated constraints/preferences from the same conversation. Do not use this queue for ambiguity that was never actually resolved or for missing context that the user never provided.

#### Laziness

- description: the assistant avoids doing the requested work
- instructions: review traces where the assistant gives a shallow partial answer, stops early without justification, refuses to inspect provided context, or tells the user to do work that the assistant should have done itself. Do not use this queue when the task is genuinely impossible because of missing access, missing context, or policy constraints.

#### NSFW

- description: sexual or otherwise not-safe-for-work content appears
- instructions: review traces that contain sexual content, explicit erotic content, or other clearly NSFW material that should be flagged for review. Do not use this queue for benign health/anatomy discussion, mild romance, or safety-oriented discussion that is not itself NSFW content.

#### Tool Call Errors

- description: a tool call failed or returned an error state
- instructions: review traces where the conversation history shows failed tool results, malformed tool interactions, or another clear tool-call failure signal. In the initial deterministic implementation, `Tool Call Errors` inspects conversation history directly rather than relying on trace-level error counters or the low-cost flagger model.

#### Resource Outliers

- description: the trace has unusually high latency, cost, or usage
- instructions: review traces whose latency, token usage, or cost materially exceeds project norms. This queue is primarily detected through deterministic outlier checks based on project medians and configured thresholds rather than the low-cost flagger model.

#### Thrashing

- description: the agent cycles between tools without making progress
- instructions: review traces where the agent repeatedly invokes the same tools or tool sequences, oscillates between states, or accumulates tool calls without advancing toward the goal. Do not use this queue for legitimate retries after transient errors or for iterative refinement that is visibly converging.

The flagger for this queue receives a structured payload derived from the trace's span tree rather than raw conversation messages alone. The payload must include the ordered tool call sequence so the flagger can detect repetition and cycling patterns:

```typescript
type ThrashingFlaggerPayload = {
  conversation_excerpt: Array<{ role: string; content: string }>; // last N assistant/user turns for goal context
  system_prompt_excerpt: string; // leading portion of the system prompt, truncated to a fixed token budget
  turn_count: number; // total conversation turns in the trace
  tool_call_sequence: Array<{
    tool_name: string;
    call_index: number; // zero-based position in the full trace tool call order
    outcome: "success" | "error" | "empty_result";
  }>; // most recent SYSTEM_QUEUE_FLAGGER_MAX_TOOL_CALLS entries (tail); summary below reflects the full trace
  tool_call_summary: {
    total_calls: number;
    failed_calls: number;
    repeated_tool_calls: Array<{ tool_name: string; call_count: number }>; // tools invoked more than once, sorted by call_count desc
    tools_available: string[]; // tool names declared in the trace context
    tools_used: string[]; // deduplicated tool names actually invoked
  };
};
```

Queue population flows:

- user-managed manual queues are populated from the trace dashboard table and the sessions dashboard table
- from the trace dashboard table, users select traces with row checkboxes and use a bulk action to add those traces to an annotation queue
- that trace bulk action creates one `annotation_queue_items` row per selected `(queueId, traceId)` pair with `completedAt = null`
- from the sessions dashboard table, users select sessions with row checkboxes and use a bulk action to add those sessions to an annotation queue
- that session bulk action resolves each selected session to its newest trace and creates one `annotation_queue_items` row per `(queueId, latestTraceId)` pair with `completedAt = null`
- system-created queues are also manual queues: they have no `settings.filter`, they are marked with `system = true`, and membership is inserted by the system instead of by user bulk selection or live filter materialization
- when a `SpanIngested` domain event is observed for a project, the `domain-events` dispatcher debounces and publishes one `trace-end` message with task `run` for that trace
- `trace-end:run` lists all non-deleted `system = true` queues in that project
- `trace-end:run` applies each queue's `settings.sampling` first; if the sampling check does not pass for a queue, that queue is skipped entirely for the current trace
- for every selected queue, `trace-end:run` starts one `system-queue-flagger` workflow keyed by `(traceId, queueSlug)` so queue evaluation stays durable and idempotent per trace/queue pair
- inside that workflow, deterministic checks may match queues that do not need an LLM; the initial concrete matcher is `Tool Call Errors`, which inspects conversation history for failed or malformed tool interactions
- for the remaining sampled-in system queues, the flagger LLM uses limited conversation context, such as the last `N` messages and the most recent `SYSTEM_QUEUE_FLAGGER_MAX_TOOL_CALLS` tool-call entries (tail), plus the name, description, and instructions of the LLM-classified system queues, and returns a boolean decision per queue; the aggregate tool-call summary (`total_calls`, `failed_calls`, `repeated_tool_calls`, etc.) always reflects the full trace even when the detailed sequence is truncated
- a trace may match none of the system-created queues, or it may match several of them
- only if the workflow confirms the match does the system create the draft annotation and add the trace to that queue
- draft-annotation creation and queue-item creation should happen together so the queue always has a matching pending annotation artifact
- live queues are incremental: whenever a `SpanIngested` domain event is observed for a project, the `domain-events` dispatcher debounces and publishes one `trace-end` message with task `run` for that trace; `trace-end:run` lists all non-deleted live queues in that project, applies `settings.sampling` first, batches the remaining `settings.filter` checks together with live-evaluation filters using the shared trace filter semantics, and batch inserts the matching `annotation_queue_items` rows with `completedAt = null`
- `trace-end:run`, `system-queue-flagger`, and `live-evaluations:execute` are separate responsibilities: trace-end selects and routes, workflows decide system matches, and execute tasks run evaluations
- when a live queue is created with `settings.filter` and no explicit sampling, initialize `settings.sampling` from a named constant in `packages/domain/annotation-queues`; the starting default for that constant is `10`
- when a system queue is provisioned for a project, initialize `settings.sampling` from a named constant in `packages/domain/annotation-queues`; users may later edit that sampling value per queue
- the unique `(organization_id, project_id, queue_id, trace_id)` constraint prevents duplicate queue membership when a trace is manually re-added, when a session resolves to the same latest trace, or when a live materialization path retries

```typescript
import type { FilterSet } from "@domain/shared";

type AnnotationQueueSettings = {
  filter?: FilterSet; // shared trace filter set; omit when the queue is manual
  sampling?: number; // optional percentage [0, 100]; used by live queues and by system queues, with defaults seeded from named constants on queue creation/provisioning
};
```

```typescript
import { sql } from "drizzle-orm";
import { boolean, index, jsonb, text, unique, varchar } from "drizzle-orm/pg-core";

export const annotationQueues = latitudeSchema.table(
  "annotation_queues",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project
    system: boolean("system").notNull().default(false), // true when the queue definition is provisioned by the system
    name: varchar("name", { length: 128 }).notNull(), // unique queue name within the project
    description: text("description").notNull(),
    instructions: text("instructions").notNull(), // guidance shown to annotators while reviewing the queue
    settings: jsonb("settings")
      .$type<AnnotationQueueSettings>()
      .notNull(), // queue is conceptually "live" when settings.filter is present; system queues keep filter absent but may still store sampling
    assignees: varchar("assignees", { length: 24 })
      .array()
      .notNull(), // assigned user ids; empty array when unassigned
    deletedAt: tzTimestamp("deleted_at"), // soft deletion timestamp
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("annotation_queues"),
    index("annotation_queues_project_list_idx").on(t.organizationId, t.projectId, t.deletedAt, t.createdAt),
    unique("annotation_queues_unique_name_per_project_idx")
      .on(t.organizationId, t.projectId, t.name, t.deletedAt)
      .nullsNotDistinct(),
  ],
);

export const annotationQueueItems = latitudeSchema.table(
  "annotation_queue_items",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project
    queueId: cuid("queue_id").notNull(),
    traceId: varchar("trace_id", { length: 32 }).notNull(), // ClickHouse trace id of the queued trace; when a session is queued manually, store the newest trace id of that session
    completedAt: tzTimestamp("completed_at"), // set when a reviewer marks the queue item as fully annotated
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("annotation_queue_items"),
    index("annotation_queue_items_queue_progress_idx").on(
      t.organizationId,
      t.projectId,
      t.queueId,
      t.completedAt,
      t.createdAt,
      t.traceId,
    ),
    unique("annotation_queue_items_unique_trace_per_queue_idx").on(t.organizationId, t.projectId, t.queueId, t.traceId),
  ],
);
```

Queue invariants:

- queues always work with traces; when session context matters, it is derived from related traces sharing the current trace's `session_id`
- when a user manually adds a session to a queue, resolve that session to its newest trace and store only that `traceId`
- a queue is conceptually `manual` when `settings.filter` is absent
- a queue is conceptually `live` when `settings.filter` is present
- empty filter sets should be normalized to absent `settings.filter` so manual/live queue semantics stay unambiguous
- every project has a default set of system-created manual queues from the start
- system-created default queues are manual queues with `system = true` even though the system inserts their members automatically
- `system = true` queues keep their canonical `name`, `description`, `instructions`, and `settings.filter` non-editable, but they may still be deleted and their `settings.sampling` may still be edited
- `settings.filter` is only editable for `system = false` queues
- `settings.sampling` is valid for live queues and for `system = true` queues
- when a live queue is created with no explicit sampling, `settings.sampling` is initialized from a named constant with an initial default of `10%`
- when a system queue is provisioned, `settings.sampling` is initialized from a named constant with an initial default of `10%`
- both manual and live queues use the same `annotation_queue_items` table once a trace has entered the queue
- `annotation_queue_items` stores `traceId` only; it does not store `sessionId`, because the newest trace of a session already contains the full incremental conversation context
- manual queue insertion creates `annotation_queue_items` rows with `completedAt = null`
- system-created queue insertion creates `annotation_queue_items` rows with `completedAt = null` only after the asynchronous validation/annotation task confirms the queue match and creates the draft annotation
- live queue materialization also creates `annotation_queue_items` rows with `completedAt = null`
- live queue materialization is incremental on debounced `SpanIngested`, and it evaluates `sampling` before the shared batched `filter` query
- progress is derived from total queue items versus queue items with `completedAt` set
- marking an item as fully annotated is queue-item state, not annotation-row state
- `assignees` behaves as a set of unique same-organization user ids and is validated in application/domain logic; there are no foreign keys
- queue review order is derived from deterministic query order (`created_at ASC`, then `trace_id ASC`), not from a persisted position column

Required Postgres indexes:

- on `annotation_queues`: soft-delete-aware unique btree on `(organization_id, project_id, name, deleted_at)` with nulls-not-distinct semantics
- on `annotation_queues`: btree on `(organization_id, project_id, deleted_at, created_at)` for project-scoped queue listing/management
- on `annotation_queue_items`: btree on `(organization_id, project_id, queue_id, completed_at, created_at, trace_id)` for progress queries, pending-item navigation, and deterministic review order
- on `annotation_queue_items`: unique btree on `(organization_id, project_id, queue_id, trace_id)` to prevent duplicate queue membership for the same trace
- do not add GIN/array indexes on `assignees`, do not add GIN/JSONB indexes on `settings`, and do not add text indexes on `description` or `instructions` until queue search/filter workloads are better defined

### Annotation Queues Page

Each project has an `Annotation Queues` page that lists all non-deleted annotation queues.

Each row shows:

- `Name`: truncated, with a `system` tag when `system = true` and a `live` tag when `settings.filter` is configured
- `Description`: truncated to two lines
- `Progress`: small percentage bar derived from total queue items versus queue items with `completedAt`
- `Assignees`: zero or more rounded user avatars
- `Created at`: queue creation timestamp
- `Quick actions`: edit and delete

Interactions:

- a create button opens the queue creation modal
- the edit quick action opens the queue settings modal
- the delete quick action opens a confirmation modal
- row click navigates to the focused queue annotation screen
- the create modal edits `name`, `description`, `instructions`, `assignees`, and the optional `settings.filter` / `settings.sampling` fields for user-created queues, using the shared trace-filter builder rather than a free-form text input
- the edit modal keeps `name`, `description`, `instructions`, and `settings.filter` read-only for `system = true` queues while still allowing `assignees` and `settings.sampling` updates
- when a queue is created with `settings.filter` and no explicit sampling, the UI/server path initializes `settings.sampling` from the named default constant
- when a system queue is provisioned for a project, the UI/server path initializes `settings.sampling` from the named default constant and later lets users tune that sampling per queue
- manual queue insertion entry points live in both the trace dashboard table and the sessions dashboard table

Pagination:

- limit/offset pagination
- sorted by `created_at DESC`

### Focused Queue Annotation Screen

The queue review screen is intentionally optimized for annotation speed and low distraction.

The left sidebar stays collapsed.

The screen operates on one queued trace at a time.

Bottom bar:

- left side: action to add the current trace to a dataset
- right side: current index position inside the queue, derived from the paginated query position rather than a persisted queue-item position field
- right side: previous and next navigation buttons
- right side: mark current item as fully annotated
- every action must also have a visible hotkey label and the hotkey bindings should be defined as named constants in the annotation-queue domain package

Main layout:

- `Metadata`: timestamp, duration, tokens, cost, and current related scores grouped by `source_id`
- `Conversation`: full message list using the existing web conversation/message components, with support for message-level or text-range selection to create annotations
- `Annotations`: queue name and instructions at the top, then the trace's annotations list, plus a button to create a conversation-level annotation

Selection/highlight behavior:

- once an annotation is created, its message/text highlight must remain visible in the conversation view
- clicking the persisted highlight must focus the matching annotation card in the right-hand list

Annotation cards in the queue screen show:

- linked issue name or pending-discovery state
- annotator name
- annotation feedback text
- green thumbs-up when `score.value >= 0.5`
- red thumbs-down when `score.value < 0.5`

If no queue items remain pending annotation, show a congratulations empty state.

Annotation Scores (`source_id`) are tied to the Annotation Queue CUID if the annotation happened through a queue. Otherwise, they are tied to the `"UI"` or `"API"` sentinel values.

## Scores

Scores are the canonical operational facts of the reliability system.

Everything else is built around them:

- annotations produce scores
- evaluations produce scores
- custom code can push scores
- issues cluster failed scores
- simulations group scores

Operational truth lives in Postgres.

ClickHouse stores immutable score analytics rows only.

That split is intentional:

- Postgres is the source of truth for score lifecycle, metadata, draft state, issue assignment, and all mutable reads
- ClickHouse is append-only and should not be treated as an updatable score store
- analytics must not rely on `FINAL`, app-level deduplication, or replacement engines to hide duplicate score rows

### Core Fields

Every score has these canonical fields:

- `value`: normalized float `[0, 1]`
- `passed`: boolean verdict
- `feedback`: clusterable human/LLM-friendly text
- `error`: canonical error text when score generation truly errored
- `errored`: boolean helper derived from whether `error` is present
- `draftedAt`: nullable timestamp marking the score as a draft while it is still editable or awaiting human confirmation

`feedback` deserves special emphasis.

Its text format is intentionally part of the reliability design:

- it must be readable and useful to both humans and LLMs
- it must be phrased so similar failures can cluster together cleanly
- it is the canonical text used both for semantic similarity search over issue centroids and for BM25 text search against issue names/descriptions
- it should describe the underlying failure pattern, not just dump incidental raw context

`error` remains the source of truth for score failures. `errored` is a derived physical helper, not a second logical source of truth.

Score lifecycle states:

- draft: `draftedAt != null`
- passed published: `draftedAt = null`, `passed = true`, `errored = false`
- failed awaiting issue assignment: `draftedAt = null`, `passed = false`, `errored = false`, `issueId = null`
- failed published: `draftedAt = null`, `passed = false`, `errored = false`, `issueId != null`
- errored published: `draftedAt = null`, `errored = true`

Rules:

- drafts are excluded from default score listings, aggregates, issue discovery, evaluation alignment, and ClickHouse analytics
- draft-aware surfaces such as in-progress annotation editing and queue review explicitly read drafts from Postgres
- writers must never emit a passed score with a non-empty `error`
- errored scores are observability-relevant, but they should not participate in issue discovery or evaluation alignment

### Resource Usage

Scores denormalize resource usage so the system can report cost:

- `duration`: nanoseconds in storage, converted to human-friendly duration units in UI/reporting
- `tokens`: total LLM token usage
- `cost`: microcents in storage, converted to dollars in UI/reporting

If a score did not use tokens/cost, store `0`.

### Score Sources

Scores are generated from:

```typescript
type ScoreSource = "evaluation" | "annotation" | "custom";
```

- `evaluation`
- `annotation`
- `custom`

`source_id` groups scores from the same source:

- evaluation: evaluation CUID
- annotation: annotation queue CUID or sentinel `"UI"` / `"API"` values
- custom: user-defined source tag

### Public API Surface

Machine-facing score ingestion uses:

- `POST /v1/organizations/:organizationId/projects/:projectId/scores` for project score uploads that should land as canonical scores
- the shared `/scores` route defaults to `source = "custom"` for ordinary user-facing uploads
- the same `/scores` route may accept `_evaluation: true` for uploads of locally executed Latitude evaluation scores; in that branch `source_id` must be the evaluation CUID and metadata must satisfy evaluation-score rules
- annotation ingestion remains on `POST /v1/organizations/:organizationId/projects/:projectId/annotations`, even though it still writes canonical score rows with `source = "annotation"`

### Score Relations

Scores can be attached to:

- spans
- traces
- sessions

Custom scores may also be unattached when the user pushes them without instrumentation.

Scores can additionally belong to:

- a simulation
- an issue

### Score Model

```typescript
type BaseScoreMetadata = {
  // common metadata shared by all score sources
};

type EvaluationScoreMetadata = BaseScoreMetadata & {
  evaluationHash: string; // sha1 of the script so we know whether this score was generated by the current version
};

type AnnotationScoreMetadata = BaseScoreMetadata & {
  rawFeedback: string; // original feedback text before enrichment; human-authored for human drafts/published annotations, model-authored for system-created drafts
  messageIndex?: number; // optional index in the canonical `TraceDetail.allMessages` conversation; omit for conversation-level annotations
  partIndex?: number; // optional raw GenAI `parts[]` index inside the target message
  startOffset?: number; // optional start offset for substring annotations within a textual part
  endOffset?: number; // optional end offset for substring annotations within a textual part
};

type CustomScoreMetadata = BaseScoreMetadata & Record<string, unknown>; // whatever the user wants to store in custom score metadata

type ScoreMetadata = EvaluationScoreMetadata | AnnotationScoreMetadata | CustomScoreMetadata;
```

### Canonical Postgres Store

The canonical mutable score row lives in Postgres:

```typescript
import { sql } from "drizzle-orm";
import { bigint, boolean, doublePrecision, index, jsonb, text, varchar } from "drizzle-orm/pg-core";

export const scores = latitudeSchema.table(
  "scores",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project

    sessionId: varchar("session_id", { length: 128 }), // optional session id inherited from instrumentation
    traceId: varchar("trace_id", { length: 32 }), // optional trace id inherited from instrumentation
    spanId: varchar("span_id", { length: 16 }), // optional span id inherited from instrumentation

    source: varchar("source", { length: 32 }).$type<ScoreSource>().notNull(), // "evaluation" | "annotation" | "custom"
    sourceId: varchar("source_id", { length: 128 }).notNull(), // evaluation cuid, annotation queue cuid or sentinel `"UI"` / `"API"` values, or custom source tag

    simulationId: cuid("simulation_id"), // optional simulation CUID link
    issueId: cuid("issue_id"), // optional issue CUID assignment; draft annotations may carry editable issue intent here before publication

    value: doublePrecision("value").notNull(), // normalized [0, 1] score value
    passed: boolean("passed").notNull(), // true if passed, false if failed or errored
    feedback: text("feedback").notNull(), // clusterable feedback text used by issues
    metadata: jsonb("metadata")
      .$type<ScoreMetadata>()
      .notNull(), // JSON-encoded EvaluationScoreMetadata | AnnotationScoreMetadata | CustomScoreMetadata
    error: text("error"), // canonical error text when the score generation truly errored
    errored: boolean("errored").notNull(), // maintained in application/domain code on create or update

    duration: bigint("duration", { mode: "number" }).notNull().default(0), // duration of score generation in nanoseconds
    tokens: bigint("tokens", { mode: "number" }).notNull().default(0), // total LLM token usage for this score generation
    cost: bigint("cost", { mode: "number" }).notNull().default(0), // total LLM cost in microcents

    draftedAt: tzTimestamp("drafted_at"), // set while the score is still editable or awaiting human confirmation
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("scores"),
    index("scores_project_list_idx")
      .on(t.organizationId, t.projectId, t.createdAt, t.id)
      .where(sql`${t.draftedAt} IS NULL`),
    index("scores_source_lookup_idx")
      .on(t.organizationId, t.projectId, t.source, t.sourceId, t.createdAt, t.id)
      .where(sql`${t.draftedAt} IS NULL`),
    index("scores_issue_lookup_idx")
      .on(t.organizationId, t.projectId, t.issueId, t.createdAt, t.id)
      .where(sql`${t.issueId} IS NOT NULL AND ${t.draftedAt} IS NULL`),
    index("scores_trace_lookup_idx")
      .on(t.organizationId, t.projectId, t.traceId, t.createdAt, t.id)
      .where(sql`${t.traceId} IS NOT NULL`),
    index("scores_session_lookup_idx")
      .on(t.organizationId, t.projectId, t.sessionId, t.createdAt, t.id)
      .where(sql`${t.sessionId} IS NOT NULL`),
    index("scores_span_lookup_idx")
      .on(t.organizationId, t.projectId, t.spanId, t.createdAt, t.id)
      .where(sql`${t.spanId} IS NOT NULL`),
    index("scores_issue_discovery_work_idx")
      .on(t.organizationId, t.projectId, t.createdAt, t.id)
      .where(sql`${t.draftedAt} IS NULL AND ${t.errored} = false AND ${t.passed} = false AND ${t.issueId} IS NULL`),
    index("scores_draft_publish_idx")
      .on(t.updatedAt, t.id)
      .where(sql`${t.draftedAt} IS NOT NULL`),
  ],
);
```

Postgres-specific rules:

- `simulation_id` and `issue_id` are nullable in Postgres; do not use empty-string sentinels there
- `errored` is maintained in application/domain code on every create or update
- drafts update the same canonical Postgres row in place instead of deleting and recreating scores
- `issue_id` on a draft annotation may represent user-editable issue intent; canonical issue ownership, centroid mutation, and downstream visibility happen only after `draftedAt = null`
- once a score is no longer a draft, it may later be deleted, but it should not be edited again; failed non-errored scores may still receive later `issue_id` assignment before they become fully immutable
- new Postgres `scores` rows must use repository conventions: `latitudeSchema`, `cuid("id")`, `tzTimestamp(...)`, `...timestamps()`, `organizationRLSPolicy("scores")`, and no foreign keys

Required Postgres indexes:

- btree on `(organization_id, project_id, created_at, id)` with a partial predicate `drafted_at IS NULL` for default non-draft project score reads
- btree on `(organization_id, project_id, source, source_id, created_at, id)` with a partial predicate `drafted_at IS NULL` for evaluation/custom source reads
- btree on `(organization_id, project_id, issue_id, created_at, id)` with a partial predicate `issue_id IS NOT NULL AND drafted_at IS NULL` for issue drilldowns and issue-backed reads
- btree on `(organization_id, project_id, trace_id, created_at, id)` with a partial predicate `trace_id IS NOT NULL` for trace review, trace-scoped score hydration, and draft-aware annotation reads
- btree on `(organization_id, project_id, session_id, created_at, id)` with a partial predicate `session_id IS NOT NULL` for session drilldowns
- btree on `(organization_id, project_id, span_id, created_at, id)` with a partial predicate `span_id IS NOT NULL` for span-scoped score hydration
- partial btree on `(organization_id, project_id, created_at, id)` where `drafted_at IS NULL AND errored = false AND passed = false AND issue_id IS NULL` for issue-discovery work selection
- partial btree on `(updated_at, id)` where `drafted_at IS NOT NULL` for draft-publication scans and other draft-aware annotation maintenance
- do not add GIN/JSONB indexes on `metadata`, and do not add Postgres text-search indexes on `feedback` or `error` in the scores foundation phase

These draft-aware score indexes are the minimal annotation-editing and queue-review foundation; keep reusing canonical `scores` rows rather than introducing a standalone annotation table.

### ClickHouse Score Analytics

ClickHouse stores a second `scores` table, but it is an immutable score analytics table rather than the canonical score store.

Its row shape intentionally keeps only aggregation-relevant fields:

```sql
-- +goose NO TRANSACTION
-- +goose Up
CREATE TABLE IF NOT EXISTS scores
(
    id              FixedString(24)                  CODEC(ZSTD(1)),            -- CUID score identifier
    organization_id LowCardinality(FixedString(24)) CODEC(ZSTD(1)),            -- owning organization CUID
    project_id      LowCardinality(FixedString(24)) CODEC(ZSTD(1)),            -- owning project CUID

    session_id      FixedString(128) DEFAULT ''     CODEC(ZSTD(1)),            -- optional session id inherited from instrumentation
    trace_id        FixedString(32) DEFAULT ''      CODEC(ZSTD(1)),            -- optional trace id inherited from instrumentation
    span_id         FixedString(16) DEFAULT ''      CODEC(ZSTD(1)),            -- optional span id inherited from instrumentation

    source          FixedString(32)                 CODEC(ZSTD(1)),            -- "evaluation" | "annotation" | "custom"
    source_id       FixedString(128)                CODEC(ZSTD(1)),            -- evaluation cuid, annotation queue cuid or sentinel `"UI"` / `"API"` values, or custom source tag, capped to 128 chars

    simulation_id   FixedString(24) DEFAULT ''      CODEC(ZSTD(1)),            -- optional simulation CUID link, empty string when absent
    issue_id        FixedString(24) DEFAULT ''      CODEC(ZSTD(1)),            -- optional issue CUID assignment, empty string when absent

    value           Float32                         CODEC(Gorilla, ZSTD(1)),   -- normalized [0, 1] score value
    passed          Bool                            CODEC(T64, LZ4),           -- true if passed, false if failed or errored
    errored         Bool                            CODEC(T64, LZ4),           -- true if errored, false if passed or failed

    duration        UInt64 DEFAULT 0                CODEC(T64, ZSTD(1)),       -- duration of score generation in nanoseconds
    tokens          UInt64 DEFAULT 0                CODEC(T64, ZSTD(1)),       -- total llm token usage for this score generation
    cost            UInt64 DEFAULT 0                CODEC(T64, ZSTD(1)),       -- total llm cost in microcents

    created_at      DateTime64(3, 'UTC')           CODEC(Delta(8), ZSTD(1)),  -- score creation time

    INDEX idx_source        source        TYPE set(3)             GRANULARITY 4,
    INDEX idx_source_id     source_id     TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_issue_id      issue_id      TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_simulation_id simulation_id TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_trace_id      trace_id      TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_session_id    session_id    TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_span_id       span_id       TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_passed        passed        TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_errored       errored       TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
PRIMARY KEY (organization_id, project_id, created_at)
ORDER BY (
    organization_id,
    project_id,
    created_at,
    source,
    source_id,
    session_id,
    trace_id,
    span_id,
    id
);

-- +goose Down
DROP TABLE IF EXISTS scores;
```

ClickHouse-specific rules:

- do not store `feedback`, `metadata`, `error`, `drafted_at`, or `updated_at` in the ClickHouse analytics table
- do not update or replace score rows in ClickHouse after insertion
- do not allow duplicate rows for the same score id; analytics must remain correct without `FINAL`
- failed non-errored scores are not inserted into ClickHouse until `issue_id` is assigned and the score becomes immutable

Phase 10 integration tests for “delete after publish” should assert the chosen behavior end-to-end.

ClickHouse deployments in this repository have both `unclustered/` and `clustered/` migration variants. The `scores` analytics table must follow the same pattern:

- `unclustered/`: keep the schema above with `CREATE TABLE IF NOT EXISTS scores` and `ENGINE = MergeTree()`
- `clustered/`: use `CREATE TABLE IF NOT EXISTS scores ON CLUSTER default`, switch the engine to `ReplicatedMergeTree()`, and use `DROP TABLE IF EXISTS scores ON CLUSTER default`
- keep the column list, partitioning, primary key, `ORDER BY`, and skip indexes identical across both variants
- future score rollups/materialized views introduced by this spec must also ship in both `unclustered/` and `clustered/` forms, following the same single-node vs replicated engine pattern already used by the repository

ClickHouse fixed-width identifier rule:

- use `FixedString(24)` for CUID-valued columns
- use non-null `FixedString(24)` plus the empty-string sentinel for optional CUID links such as `issue_id` and `simulation_id`
- use `FixedString(128)` for bounded non-CUID identifiers such as `session_id` and `source_id`
- use `FixedString(32)` for trace ids and `FixedString(16)` for span ids

### Score Publication And Projection

All score writes happen in Postgres first.

Publication rules:

- if a score is a draft (`draftedAt != null`), do not write it to ClickHouse analytics
- if a score is non-draft and either passed or errored, write it to ClickHouse analytics immediately because it is already immutable
- if a score is non-draft, failed, and non-errored, keep it only in Postgres until issue discovery or direct issue assignment sets `issue_id`
- when a draft is published and still has `issue_id = null`, it may now participate in issue discovery
- when a failed non-errored score finally receives `issue_id`, it becomes immutable and is then written to ClickHouse analytics
- publishing to ClickHouse analytics must be retry-safe and preserve at-most-one row per score id
- the canonical Postgres write transaction must not talk to ClickHouse directly; after that transaction commits, the caller must run the shared `syncScoreAnalyticsUseCase`, which re-fetches the canonical score row and inserts into ClickHouse only if it is still immutable and not already present in analytics so retries remain safe and stale sync attempts become no-ops

Draft-specific rules:

- human-created UI annotations are written as drafts in Postgres immediately so refresh-safe reads do not depend on local memory or Redis
- draft publication uses a debounced timeout after the last edit; the initial default is `5 minutes`
- human-editable draft publication should be driven by a debounced `annotation-scores` topic task `publish` keyed by the canonical score id rather than by browser-local timers or persisted due-work scans
- system-created queue annotations are also drafts, but they use `draftedAt` instead of faking an error state
- system-created queue drafts do not use the automatic publication path; they stay draft until explicit human review resolves them
- once a draft is published, it may be deleted later but should no longer be edited

Delete behavior:

- if a canonical score must be deleted, delete it from Postgres first
- if that score was already stored in ClickHouse analytics, issue a rare ClickHouse `DELETE` mutation by `id`
- if the deleted score had contributed to an issue, run the corresponding centroid/member removal flow and refresh any dependent derived issue state

### Score Reads And Analytics

Read rules:

- most score reads, listings, details, and draft-aware product surfaces query Postgres
- only aggregates and analytical rollups, such as counts, sums, averages, and time-series, query ClickHouse
- eventual consistency in ClickHouse is acceptable for aggregates
- immediate consistency is required for mutable score reads, so those reads stay on Postgres

Scores and telemetry must still be queryable together without expensive hot joins on raw score facts.

The exact materialized score analytics tables are intentionally deferred until the first real reporting/query shapes stabilize.

Those later materializations will likely need to support responsibilities such as:

- filtering spans by score state/value/issue/source
- filtering traces by aggregated score properties
- filtering sessions by aggregated score properties
- evaluation/custom source trend charts
- issue occurrence charts and counts

The repository materializes both `traces` and `sessions`, so reliability can filter sessions by aggregated properties without additional materialization work.

## Issues

Issues are the main observability entities of the reliability system.

An issue is a failure pattern: a group of similar failed, non-errored, non-draft scores clustered together based primarily on their feedback.

Issues are the entrypoint for:

- understanding what is failing at scale
- prioritizing what to fix next
- monitoring whether fixes actually reduce the problem over time

Issue creation eligibility in MVP:

- annotations are the primary signal
- during annotation creation, a human may also link an annotation to an existing issue explicitly; that human path bypasses similarity discovery for that annotation score
- failed scores from evaluations that are not already linked to an issue may also create new issues
- failed custom scores may also create new issues

### Issue Lifecycle

Issues can be in these states:

```typescript
export const IssueState = {
  New: "new",
  Escalating: "escalating",
  Resolved: "resolved",
  Regressed: "regressed",
  Ignored: "ignored",
} as const;

export type IssueState = (typeof IssueState)[keyof typeof IssueState];
```

- `new`: first discovered less than 7 days ago
- `escalating`: occurrences in the last day are 33% greater than the average in the previous 7-day baseline
- `resolved`: no occurrences in the last 14 days, or manually resolved
- `regressed`: new occurrences appeared after the issue was resolved
- `ignored`: manually ignored by the user

An issue could be in multiple states at the same time, for example it can be both `new` and `escalating`.

Conceptual groupings:

- `Active`: not ignored and not resolved
- `Archived`: ignored or resolved without regression

Manual resolution behavior:

- manual resolve opens a confirmation modal
- that modal includes a toggle for keeping linked evaluations active to monitor future regressions
- the toggle defaults from `keepMonitoring` after project-over-organization resolution
- the user may override the toggle for that specific resolve action

### Manual Creation From Annotations

Issue discovery is not the only way an issue can be assigned.

When annotating a conversation in managed UI, the annotator may:

- link the annotation to an existing issue

For that explicit human action:

- do not run similarity search for that annotation score once the draft is published
- keep any selected issue as editable draft intent while the annotation is still drafted
- publication assigns canonical ownership through `scores.issue_id`, updates the issue centroid, and then requests debounced issue-detail refresh plus direct projection/analytics sync
- treat the issue as annotation-backed evidence for visibility and follow-up monitoring only after publication

### Issue Clusterization

Issue discovery must remain close to the original proposal and to the proven parts of v1:

1. a non-draft failed, non-errored canonical score exists in Postgres
2. if the score comes from an evaluation already linked to an issue, assign it directly to that issue and stop
3. validate that the score is eligible for issue discovery
4. if the score comes from an annotation, enrich the annotation feedback first
5. embed the canonical feedback with VoyageAI `voyage-4-large` at `2048` dimensions
6. run hybrid search against current issue centroids and text projections in Weaviate
7. use `RelativeScore` fusion for vector + BM25 search
8. filter out candidates that do not pass the minimum similarity (both vector and BM25) threshold
9. rerank candidates with VoyageAI `rerank-2.5`
10. filter out candidates that do not pass the minimum rerank relevance threshold
11. if a candidate passes thresholds, assign the score to that issue in Postgres
12. otherwise call a separate retryable issue-details-generation activity to synchronously generate the initial issue name/description from that first score, outside the final create/assign transaction, then persist the new issue with those details and assign the score to it in Postgres
13. once the score has `issue_id`, project the now-immutable score into ClickHouse

All similarity, rerank, visibility, and debounce thresholds must be configurable constants defined inside the owning domain package rather than as scattered inline literals.

Discovery/refresh execution rules:

- eligible non-draft failed non-errored scores should write `ScoreCreated` after commit rather than running issue-routing, embeddings, or search inline in request or annotation-edit paths
- the `domain-events` dispatcher should publish a deduped `issues:discovery` task from `ScoreCreated`; that task rechecks eligibility, short-circuits scores already written with `issue_id`, and either assigns a selected/linked issue directly or starts the `issue-discovery` workflow only when similarity search is still required
- the very first name/description for a brand-new issue must be generated synchronously inside `issue-discovery` before the issue row is first persisted
- the synchronous first-generation step must happen in its own workflow activity, outside and before the final create/assign transaction, so LLM generation retries do not hold the ownership-write transaction open and the first persisted issue row already carries the generated name/description
- subsequent issue name/description regeneration should run through a debounced BullMQ task on the `issues:refresh` topic once the refresh window elapses
- the debounced `issues:refresh` path must generate from the last `25` assigned issue occurrences plus the current persisted issue name/description as the stabilization baseline
- after generation, `issues:refresh` must re-lock and re-read the canonical issue row before saving any new details so it does not overwrite newer centroid or lifecycle updates
- after `issues:refresh` persists changed issue details, it must upsert the Weaviate issue projection again; if the issue no longer exists or the generated details are unchanged, it should skip the projection write
- workflows and debounced tasks should recheck persisted Postgres eligibility and current ownership state for correctness and idempotency rather than trusting queue or workflow history alone

Proven v1 retrieval defaults to carry forward and revalidate:

- hybrid search ratio: `0.75`
- minimum hybrid similarity: `0.8`
- minimum BM25 keyword matches: `1`
- minimum rerank relevance: `0.3`
- maximum initial candidates: `1000`
- rerank limit: `20`
- issue details regeneration debounce in v1: `6 hours`
- centroid half-life: `14 days`

Current v2 starting defaults layered on top of those v1 learnings:

- rerank limit to `100` candidates
- issue details regeneration debounce: `8 hours`
- issue-linked evaluation default sampling: `10%`
- live annotation queue default sampling: `10%`
- source weights: annotations `1.0`, evaluations `0.8`, custom `0.8`

Exact v1-backed discovery mechanics that coding agents should understand:

- v1 eligibility required all of these: failed, non-errored, usable clusterable reasoning, not already assigned to a non-merged issue, not composite, and not generated by the optimizer itself
- the closest v2 translation is: `draftedAt = null`, `passed = false`, `errored = false`, canonical `feedback` present, and no existing canonical `score.issue_id`
- discovery embedded the canonical reason/feedback, normalized that embedding, and searched Weaviate with hybrid search using the same text as the keyword query
- hybrid search used `alpha = 0.75`, cosine `distance <= 0.2`, `RelativeScore` fusion, BM25 `OR` with `minimumMatch = 1`, and an initial candidate limit of `1000`
- merged issues were filtered out after the Weaviate query, then only the top `20` surviving candidates were sent to reranking
- reranking used `rerank-2.5` over candidate descriptions only, rejected candidates below `0.3` relevance, and selected the first surviving reranked item as the match
- even a single candidate still went through reranking so the relevance threshold could reject it
- once an evaluation was linked to an issue, future failures from that evaluation stopped re-entering discovery and assigned directly to that issue

Concurrency and ownership rules learned from v1:

- dedupe discovery work per score/result id before heavy search starts
- re-check ownership before doing expensive discovery work
- revalidate under lock before the final assignment write
- only save the score to ClickHouse after that final Postgres ownership write makes it immutable
- do not recreate the v1 race where one failing result could end up attached to multiple active issues at once; in v2, canonical ownership must be the single `scores.issue_id` contract
- do not let two parallel no-match discovery flows for different scores turn into duplicate visible issues for the same emerging problem; the intended solution can live in the later denoising/provisional workflow rather than the Phase 11 MVP flow, but the product must still absorb that noise before it reaches the main issue surface
- preserve resolved-issue and ignored-issue rematching so regressions can be surfaced and ignored ownership stays stable across future matching scores

Legacy v1 reference paths for this section:

- `packages/core/src/weaviate/index.ts`
- `packages/core/src/voyage/index.ts`
- `packages/core/src/services/issues/results/validate.ts`
- `packages/core/src/services/issues/discover.ts`

These references are relative to the repository root of branch `latitude-v1`.

### Issue Centroids

The centroid shape should remain exactly aligned with the proposal:

```typescript
type ScoreSource = "evaluation" | "annotation" | "custom";

type IssueCentroid = {
  base: number[]; // running vector sum
  mass: number; // running scalar mass
  model: string; // embedding model
  decay: number; // half-life in seconds
  weights: Record<ScoreSource, number>; // source weights
};
```

Centroid rules:

- normalize incoming embeddings before contributing them
- decay existing centroid state based on elapsed time
- weight new contributions by source weight and recency
- persist both the running sum and the mass
- normalize only when emitting the vector used for search

The centroid math from v1 should be reused where correct, but the new type names and fields must match the proposal (`mass`, not `weight`).

Concrete v1 math that should be preserved conceptually:

- `base` is the running weighted, decayed sum `S`, not a pre-normalized centroid vector
- `mass` is the scalar accumulator `M`, not an occurrence count
- at update time `t`, first decay the previous centroid state from `clusteredAt` using `alpha = 0.5 ^ (elapsed / halfLife)`
- normalize the incoming embedding to `x̂`
- compute the incoming recency factor `beta = 0.5 ^ (max(0, t - score.createdAt) / halfLife)`
- compute the effective contribution mass `m = weights[source] * beta`
- add uses `S' = alpha * S + m * x̂` and `M' = alpha * M + m`
- remove uses `S' = alpha * S - m * x̂` and `M' = alpha * M - m`
- the vector emitted to Weaviate/search is `normalize(S')`, not `S' / M'`

Critical v2 corrections relative to v1:

- use `clusteredAt` as the authoritative decay anchor; do not couple centroid decay to generic `updatedAt`
- pin `model`, `decay`, and `weights` on the centroid config and rebuild centroids when those settings change instead of silently mixing incompatible contributions
- remember that v1 weights were keyed by evaluation type (`Human = 1.0`, `Rule = 0.8`, `Llm = 0.6`, `Composite = 0.0`), while v2 intentionally remaps the concept onto score sources (`annotation`, `evaluation`, `custom`)
- fail fast on embedding-dimension mismatches
- clamp future-dated contributions with `max(0, t - score.createdAt)` so clock skew cannot amplify a contribution
- if removal drives `mass <= 0`, zero both `base` and `mass` or rebuild from membership; never keep a negative/nonzero base with zero mass
- centroid state updates must not depend on Weaviate availability; vector sync may lag or retry, but centroid math should still advance
- do not make an issue searchable in Weaviate until it has a non-empty centroid / real evidence

Legacy v1 reference path for this section:

- `packages/core/src/services/issues/shared.ts`

This reference is relative to the repository root of branch `latitude-v1`.

### Issue Denoising

Do not bring back the v1 merge/merged-state system.

The baseline denoising strategy for v2 should stay close to the proposal:

- issues are still created/matched in real time
- the main Issues UI hides low-evidence issues that have fewer than a configurable minimum number of occurrences and no linked annotation scores
- issues with at least one linked annotation score are always visible
- manually created issues and manually annotated issues are always visible

This is the chosen MVP strategy because it is conservative and faithful to the proposal.

Post-MVP, the system may adopt a stronger buffered/provisional creation workflow while keeping the same core issue model:

- newly created issue candidates are persisted immediately
- provisional issues stay hidden from the main UI until they reach a promotion threshold, receive annotation evidence, or are explicitly promoted
- published annotation-linked issues remain immediately visible
- the stronger workflow may also absorb duplicate/noisy concurrent no-match issue candidates before they become visible in the main Issues UI
- this stronger workflow is a post-MVP discovery policy, not a change to the canonical issue entity shape

### Issue Monitoring

Issues are initially discovered from human annotations and failed evaluation/custom scores.

Because humans cannot annotate everything, users can generate evaluations from issues when they want to monitor active issues on live traffic.

Issue discovery never auto-creates those evaluations. The managed UI exposes `Monitor issue` only from the issue details drawer, and only when the issue currently has no linked evaluations. Issues may still accumulate several linked evaluations over time.

That action is asynchronous:

- the server starts the `optimize-evaluation` Temporal workflow with a deterministic workflow id derived from the issue (`evaluations:generate:${issueId}` for initial generation) or the evaluation (`evaluations:optimize:${evaluationId}` for manual realignment) and returns immediately — no internal identifier leaks back to the frontend
- Temporal is the single source of truth for workflow state: no Redis-backed job-status mirror is written, and no `jobId` contract is exposed to the UI
- the frontend polls a dedicated server function (`getIssueAlignmentState`) that asks Temporal directly via `workflow.describe()` on the three relevant workflow ids: `evaluations:generate:${issueId}` for the initial-generation run and `evaluations:refreshAlignment:${evaluationId}` + `evaluations:optimize:${evaluationId}` per active linked evaluation. All three new workflows are linear and exit when their activities finish, so a running status unambiguously means "actively running" — there is no more "alive-but-napping" state
- that response is reduced to a minimal UI contract (`idle` / `generating` / `realigning` with `evaluationId`), intentionally omitting internal identifiers like `runId` or `currentJobId`
- when the workflow terminates, its final status and any error are available through Temporal's own history; the frontend infers "just finished" by observing the transition back to `idle`, then re-fetches the issue/evaluation reads through the normal data-fetching path

Direct monitoring rule:

- if an incoming failed, non-errored score comes from an evaluation already linked to an issue, assign the score to that issue directly
- do not run issue discovery again for that score

If monitoring continues after resolution and new failures appear, the issue becomes `regressed`.

Issue lifecycle effects on linked evaluations:

- manual ignore archives linked evaluations immediately in the target design; until the evaluations dashboard exists, the temporary implementation soft deletes them instead
- manual resolution uses the confirmation-modal toggle, defaulted from `keepMonitoring`, to decide whether linked evaluations stay active or archive; until the evaluations dashboard exists, the temporary implementation soft deletes them when the user chooses not to keep monitoring

### Issue Model

```typescript
type ScoreSource = "evaluation" | "annotation" | "custom";

type IssueCentroid = {
  base: number[]; // running vector sum
  mass: number; // running scalar mass
  model: string; // embedding model
  decay: number; // half-life in seconds
  weights: Record<ScoreSource, number>; // source weights
};
```

```typescript
import { index, jsonb, text, uuid, varchar } from "drizzle-orm/pg-core";

export const issues = latitudeSchema.table(
  "issues",
  {
    id: cuid("id").primaryKey(),
    uuid: uuid("uuid").notNull().unique(), // links the Postgres row with the Weaviate object
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project
    name: varchar("name", { length: 128 }).notNull(), // generated from clustered score feedback and related evaluation/annotation context when useful, but generic enough to represent the shared failure pattern across different backgrounds/details
    description: text("description").notNull(), // generated from clustered score feedback and related evaluation/annotation context when useful, but focused on the underlying problem rather than one specific conversation
    centroid: jsonb("centroid").$type<IssueCentroid>().notNull(), // generated from the running weighted sum of the clustered score feedback embeddings
    clusteredAt: tzTimestamp("clustered_at").notNull(), // last time the issue centroid/cluster state was refreshed
    escalatedAt: tzTimestamp("escalated_at"), // latest escalation transition timestamp
    resolvedAt: tzTimestamp("resolved_at"), // issue resolved automatically or manually
    ignoredAt: tzTimestamp("ignored_at"), // issue ignored manually
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("issues"),
    index("issues_project_lifecycle_idx").on(t.organizationId, t.projectId, t.ignoredAt, t.resolvedAt, t.createdAt),
  ],
);
```

Required Postgres indexes:

- single-column unique constraint on `uuid` for Postgres/Weaviate linkage and hydration; Postgres backs it with a unique index
- btree on `(organization_id, project_id, ignored_at, resolved_at, created_at)` for project-scoped lifecycle filtering and management actions
- do not add Postgres text-search indexes on `name` or `description`; issue search lives in Weaviate
- do not add JSONB indexes on `centroid` in the issues foundation phase; centroid search is served by the Weaviate projection and centroid updates are driven by explicit ownership events

Issue naming and centroid semantics:

- `name` and `description` may use clustered score feedback plus related evaluation names/descriptions or annotation/message context when that helps explain the pattern
- they must stay generic enough to group scores that point to the same underlying problem even when the exact background details differ
- they should not overfit to one conversation, one user message, or one concrete example
- the centroid is generated from the clustered score feedback embeddings and drives semantic matching; the text fields help both human understanding and BM25 matching
- synchronous first-generation and later asynchronous `issues:refresh` regeneration must both call the same shared issue-details generation use case so prompt logic, score selection, and stabilization behavior live in one place
- for existing issues, that shared use case should generate from the last `25` assigned issue occurrences' canonical feedback, using the previous issue `name` and `description` as baseline context so the model avoids unnecessary churn and may keep the current details unchanged when they already capture the underlying issue well
- for brand-new issues, that shared use case must accept optional explicit occurrence input as an array of issue occurrences, because the synchronous first-generation path runs before the score is yet linked to the new issue and therefore cannot rely only on repository-loaded assigned issue occurrences
- after asynchronous issue detail regeneration changes the canonical Postgres `name` or `description`, the Weaviate issue projection must be upserted again so BM25-searchable text stays in sync with Postgres

Search projection in Weaviate:

```typescript
export const Collection = {
  Issues: "Issues",
} as const;

export type Collection = (typeof Collection)[keyof typeof Collection];

export const ISSUES_COLLECTION_TENANT_NAME = ({
  organizationId,
  projectId,
}: {
  organizationId: string;
  projectId: string;
}) => `${organizationId}_${projectId}`;

export type IssuesCollection = {
  // id: string // equals `issues.uuid`
  title: string; // searchable issue title mirrored from Postgres
  description: string; // searchable issue description mirrored from Postgres
  // embedding: number[] // self-provided vector equal to the normalized issue centroid
};
```

Weaviate collection requirements:

- multi-tenancy enabled
- tenant scope `${organizationId}_${projectId}`
- self-provided vectors
- cosine distance
- `title` searchable with trigram tokenization
- `description` searchable with word tokenization
- BM25 tuned for short texts
- read/search paths must explicitly ensure the tenant exists before querying
- empty issues should not get a searchable vector projection before real evidence lands

Exact v1 configuration that should inform the v2 implementation:

- `title` used trigram tokenization with `skipVectorization = true`
- `description` used word tokenization with `skipVectorization = true`
- BM25 used `b = 0.35` and `k1 = 1.1`
- the vector index used self-provided vectors, cosine distance, dynamic indexing with threshold `10_000`, and quantization disabled
- v1 tenant scope was `${workspaceId}_${projectId}_${documentUuid}`; v2 is intentionally changing that to `${organizationId}_${projectId}` so issues become project-scoped rather than document-scoped (underscore separator because Weaviate tenant names only allow alphanumeric, underscore, and hyphen)
- v1 user-facing issue search still relied on Postgres title search while Weaviate was mainly used for discovery and merge candidate lookup; v2 is intentionally upgrading the product search surface to hybrid search in Weaviate

Exact legacy v1 reference collection configuration code to preserve (must be adapted though):

```typescript
// Note: once the collections are migrated, changing the configuration
// is not straightforward so, care of what to change!
async function migrateCollections() {
  if (!(await connection.collections.exists(Collection.Issues))) {
    await connection.collections.create<IssuesCollection>({
      name: Collection.Issues,
      properties: [
        {
          name: "title",
          dataType: configure.dataType.TEXT,
          indexSearchable: true, // Note: enables BM25 hybrid search
          indexFilterable: false,
          indexRangeFilters: false,
          tokenization: configure.tokenization.TRIGRAM,
          skipVectorization: true,
          vectorizePropertyName: false,
        },
        {
          name: "description",
          dataType: configure.dataType.TEXT,
          indexSearchable: true, // Note: enables BM25 hybrid search
          indexFilterable: false,
          indexRangeFilters: false,
          tokenization: configure.tokenization.WORD,
          skipVectorization: true,
          vectorizePropertyName: false,
        },
      ],
      vectorizers: vectors.selfProvided({
        quantizer: configure.vectorIndex.quantizer.none(),
        vectorIndexConfig: configure.vectorIndex.dynamic({
          distanceMetric: configure.vectorDistances.COSINE,
          threshold: 10_000,
        }),
      }),
      invertedIndex: configure.invertedIndex({
        bm25b: 0.35, // Note: tuned for short texts
        bm25k1: 1.1, // Note: tuned for short texts
        indexTimestamps: false,
        indexPropertyLength: false,
        indexNullState: false,
      }),
      multiTenancy: configure.multiTenancy({
        enabled: true,
        autoTenantActivation: true,
        autoTenantCreation: true,
      }),
    });
  }
}

export async function getIssuesCollection({ tenantName }: { tenantName: string }) {
  // Note: even though the collection is configured with auto-tenant-creation, it seems
  // that for read and search operations it still fails when the tenant is not created yet

  const client = await weaviate();
  const collection = client.collections.use<Collection.Issues, IssuesCollection>(Collection.Issues);

  const exists = await collection.tenants.getByName(tenantName);
  if (!exists) {
    await collection.tenants.create([{ name: tenantName }]);
  }

  return collection.withTenant(tenantName);
}
```

This code is preserved verbatim as a v1 reference. Do not copy it blindly into v2 without also applying the intentional v2 changes documented above, especially the project-scoped tenant name and UUID-backed Postgres/Weaviate linkage.

### Issues Page

Each project has an `Issues` page.

Its overall shell should mirror the project `Traces` page:

- a top action row
- an aggregate-counts-plus-histogram analytics panel
- an infinitely paginated issues table
- a right-side details drawer opened from table row click

#### Actions Row

The top action row uses the same left-end / spacer / right-end layout pattern as the project `Traces` page.

On the left end side:

1. a time range selector, using the same component family as the `Traces` page
2. a `Columns` selector, using the same component family as the `Traces` page

In the middle:

- flexible empty space

On the right end side:

1. a tab menu with `Active` and `Archived`
2. a search bar that performs issue hybrid search without rerank

Action-row semantics:

- the time range selector defaults to all time, meaning no time filter on the table or aggregate counts
- the time range is applied to score `created_at` in ClickHouse, not to issue-row timestamps in Postgres
- the columns selector only affects which columns are visible in the issues table
- the `Active` / `Archived` tab filters the issues table only; it does not affect the analytics panel
- the page exposes no additional shared trace-filter builder; the Issues action row is limited to time range, columns, lifecycle tab, and search
- the search query embedding should rely on the shared AI-layer Redis cache

#### Issues Page Read Orchestration

The issues page list read is intentionally multi-store and must not be simplified into a single Postgres query.

Read responsibilities:

- ClickHouse owns score-backed time filtering, analytics, and per-issue occurrence/trend metrics
- Weaviate owns issue hybrid search and similarity scores
- Postgres owns canonical issue rows, lifecycle group filtering, and linked evaluation hydration

Execution order:

1. Build the score-backed ClickHouse predicate from the selected time range.
2. Build the canonical issue-row Postgres predicate from lifecycle group state (`Active` / `Archived`).
3. If search text is present, run Weaviate hybrid search without rerank, rely on the shared AI-layer Redis cache for the query embedding, and capture the matched issue UUIDs plus similarity scores.
4. Run ClickHouse reads first to determine the issue ids that match the selected time range and to compute the issue-page analytics data needed for the panel and table.
5. Intersect the ClickHouse candidate issue ids with the Weaviate search candidates when search text is present.
6. Query canonical Postgres issues using `IN (...)` clauses on the matched issue ids / UUIDs and apply the lifecycle-group filter there.
7. Hydrate linked evaluations from Postgres after the canonical issue rows are known.
8. Perform final table ordering and pagination after merging Postgres rows with ClickHouse metrics and optional Weaviate similarity scores, so the cross-store sort keys are preserved.

Control application rules:

- the selected time range applies to the final issues table and the analytics panel through ClickHouse-backed issue candidate selection
- search applies to the final issues table and the analytics panel through Weaviate candidate selection
- lifecycle-group filtering in Postgres does not affect the analytics panel
- no generic trace-filter builder or filter drawer is part of the Issues page surface
- Postgres score rows must not be used for issue-page filtering or aggregations

#### Analytics Panel

The analytics block should reuse the same aggregate-counts-plus-histogram component pattern as the `Traces` page.

Aggregate counts:

1. new issues count
2. escalating issues count
3. regressed issues count
4. resolved issues count
5. seen occurrences count

Aggregate-count rules:

- the aggregate counts use the full selected time-range semantics on score `created_at`
- no time selected means all time
- only `from` selected means `created_at >= from`
- only `to` selected means `created_at <= to`
- both selected means a bounded time range
- search and the selected time range affect these counts
- the `Active` / `Archived` tab does not

Histogram rules:

- show the total occurrences of all matched issues by day
- if both `from` and `to` are selected, render that exact range
- if neither is selected, render the last 7 days ending today
- if exactly one endpoint is selected, render the last 7 days ending at that selected endpoint
- the histogram uses the same matched issue set as the analytics counts, meaning search and the selected time range apply, but the lifecycle-group tab does not

#### Issues Table

The issues table is infinitely paginated, following the same general table pattern as the `Traces` page. After fetching the current page, the next page should be prefetched in the background.

Table interaction rules:

- no bulk-selection checkbox or bulk-action bar is shown in this UI revision
- row click opens the issue details drawer
- default sorting is by last seen descending, then occurrences descending
- when search text is present, similarity score descending is also preserved as an additional tie-breaker
- the `Occurrences` column is user-sortable in ascending or descending order

Issues table columns:

- `Issue`: issue name plus lifecycle tags; truncate/ellipsis the issue name so the column does not consume more than one third of the table width
- `Trend`: mini histogram of issue occurrences for the last 14 days by day; use the same end-day selection logic as the analytics histogram, but always render exactly 14 daily buckets
- `Seen at`: last seen / age, like `11d ago / 3y old`; this display uses full-history issue timestamps and is not re-based by the page-level time range, lifecycle-tab, or search controls
- `Occurrences`: occurrence count for the selected time range; the column header also shows the sum of occurrences across all matched issues, not only the issues visible on the current page
- `Affected traces`: `occurrences / total traces in the selected time window`, expressed as a percentage and capped at `100%`
- `Evaluations`: linked evaluations shown as truncated tags containing the evaluation name plus alignment MCC percentage; if no evaluations are linked, show `-`

#### Issue Details Drawer

Clicking an issue row opens a right-side drawer, following the same interaction pattern as the `Traces` details drawer.

Drawer rules:

- page-level time range, lifecycle-tab, and search controls do not apply inside this drawer; everything shown here uses full history
- the header left side contains the close button and previous/next navigation buttons, mirroring the `Traces` details drawer chrome
- the header right side contains an ignore/unignore secondary button and a resolve/unresolve primary button

Drawer body sections:

1. issue name and description
2. a summary row with issue status, `Seen at`, and total occurrences
3. a collapsible 14-day trend histogram ending today
4. a collapsible linked evaluations section
5. a collapsible mini traces list table

Linked evaluations section behavior:

- render one evaluation row per linked evaluation
- each evaluation row has two subrows:
  1. evaluation name
  2. last alignment date, alignment MCC percentage, and a manual realign action
- if a realignment is currently in progress, replace the realign action with a loading spinner and the text `Aligning...`
- each linked evaluation row also includes an archive action with a confirmation modal explaining that archiving it will stop monitoring this issue through that evaluation
- when there are no linked evaluations, show a `Monitor issue` button here
- when there is already at least one linked evaluation, do not show another monitor-generation button in the managed UI
- `Monitor issue` reuses the asynchronous `optimize-evaluation` workflow kickoff plus polling flow defined above

Mini traces table behavior:

- use the same infinite-table family as the `Traces` page
- show only timestamp and duration columns
- list full-history seen traces for the issue, newest first

## Simulations

Simulations are the CI/regression-testing layer of the reliability system.

They allow users to test LLM application changes before shipping them by:

- running the agent locally or in CI
- capturing instrumented traces when available
- running Latitude evaluations locally
- running user-defined custom code evaluations
- pushing results back to Latitude for inspection

Simulations are post-MVP and land after the full evaluation script runtime. The first simulations phase scopes the runner and SDK to JavaScript/TypeScript. Additional languages remain later post-MVP work.

### Simulation Execution

Simulation execution must follow the proposal:

- runs locally or in CI/CD, close to the user's agent code
- is driven by a, performant, TypeScript CLI
- is agnostic to the end user's programming language and build process
- accepts a user-configured command that runs the target `*.sim.*` entrypoints through the user's chosen runtime/toolchain
- discovers `*.sim.*` entrypoints
- spawns a temporary local HTTP bridge to communicate with the SDK
- reuses the ingest pipeline as a local OTEL-compatible collector
- can capture simulation-related traces/sessions when the agent/s is/are instrumented
- can still run without instrumentation by accepting score-only uploads, where default uploads are custom scores and later Latitude-evaluation uploads reuse the same `/scores` API with `_evaluation: true`
- can generate a local-only report or optionally upload results to Latitude

The CLI and SDK are intentionally local-first and should feel useful even without the hosted Latitude platform:

- the CLI must be usable as a standalone simulation runner
- users should be able to run simulations without depending on a hosted Latitude workspace if they do not want one
- users should still be able to run simulations even when their LLM application is not instrumented
- upload back to Latitude is optional, not required for the core simulation runner experience

The CLI should print a testing-style summary and return CI-friendly exit codes.

Because Latitude evaluations are stored as sandboxed JavaScript-like scripts, the CLI can download those evaluation artifacts, execute them locally, and only push the resulting scores back through the API if the user wants to.

### Simulation Model

The `dataset` column stores either a Latitude dataset CUID or the `"CUSTOM"` sentinel when the user provides a custom function loader. Query-backed datasets (SQL-like expressions defined in user code) are deferred to post-MVP Phase 22, which will migrate the column from `varchar(24)` to `text`.

```typescript
type SimulationMetadata = {
  threshold: number | "CUSTOM"; // percentage [0, 100] or "CUSTOM"
  scenarios: number; // number of dataset rows/scenarios executed by the run
  file: string; // simulation entrypoint filename that was used to run the simulation
  sdk: string; // language and version of the sdk that was used to run the simulation e.g. "javascript@1.2.3"
};
```

```typescript
import { boolean, index, jsonb, text, varchar } from "drizzle-orm/pg-core";

export const simulations = latitudeSchema.table(
  "simulations",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project
    name: varchar("name", { length: 128 }).notNull(), // simulation name (defined in the `*.sim.*` file)
    dataset: varchar("dataset", { length: 24 }).notNull(), // dataset CUID or "CUSTOM" sentinel; query-backed datasets are deferred to post-MVP
    evaluations: varchar("evaluations", { length: 128 }).array().notNull(), // evaluation cuids or custom source ids used during the run
    passed: boolean("passed").notNull(), // true if the full simulation run passed
    errored: boolean("errored").notNull(), // derived helper maintained by application code at write time from whether `error` is present
    metadata: jsonb("metadata").$type<SimulationMetadata>().notNull(),
    error: text("error"), // canonical error text when the simulation failed to run
    startedAt: tzTimestamp("started_at").notNull(), // simulation start timestamp
    finishedAt: tzTimestamp("finished_at").notNull(), // simulation finish timestamp
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("simulations"),
    index("simulations_project_created_at_idx").on(t.organizationId, t.projectId, t.createdAt),
  ],
);
```

Because Postgres does not give us a ClickHouse-style `MATERIALIZED` column here, simulation writes must set `errored` in application code every time the row is created or updated.

Required Postgres indexes:

- btree on `(organization_id, project_id, created_at)` for project-scoped simulation runs listing and pagination
- do not add GIN/JSONB indexes on `metadata` or array indexes on `evaluations` in the simulations foundation phase; simulation reporting filters are project/time/run-id oriented and deeper analytics live in ClickHouse

Telemetry changes:

Extend telemetry through new ClickHouse migrations instead of rewriting existing migration history. Because these reliability changes are additive, use ordinary additive statements such as `ALTER TABLE` plus sensible defaults rather than bespoke compatibility choreography unless a later change truly needs a rebuild.

The `spans` table definition should directly include:

```sql
simulation_id FixedString(24) DEFAULT '' CODEC(ZSTD(1)), -- optional simulation CUID link, empty string when absent
INDEX idx_simulation_id simulation_id TYPE bloom_filter(0.01) GRANULARITY 2,
```

Carry `simulation_id` into traces/session materializations and score rollups, but keep time-first ClickHouse ordering instead of moving `simulation_id` to the front of sort keys.

### Simulation Entrypoint

The initial post-MVP TypeScript entrypoint should preserve the proposal shape:

```typescript
// supportAgent.sim.ts

import { Simulation, Passed, Failed } from "latitude" // latitude sdk
import { levensthein, similarity } from "agent-evals" // package created by latitude, note, this is just an example, no need to create a evals package ourselves!
import { getTurns, includesExpectedCites } from "my-app/evaluations" // client custom evals
import { getParameters } from "my-app/utils" // client utils to interact with latitude
import { SupportAgent } from "my-app/agents" // client custom agent

// Feedback is always required, because all our reliability system is based on clustering feedback into issues!
// Ideally, if present, score value is passed before the feedback... maybe to achieve this a variadic function that accepts number | string would work?
function Passed(score?: number, feedback: string): Score // If value is not provided, it will default to 1
function Failed(score?: number, feedback: string): Score // If value is not provided, it will default to 0

export const simulation = Simulation({
  // Simulation name. Display name will be `${name} #${count}`
  name: "Support Agent",

  // At least 50% of scenarios must pass all evaluations.
  // This can also be a custom function for your own threshold logic
  // like async (results: Record<scenario, results[]>) => results.filter((result) => result.passed).length / results.length >= 0.5
  threshold: 50,

  // Use a Latitude dataset CUID, or "CUSTOM" when the user provides a custom function loader.
  // Query-backed datasets (e.g. "environment = 'production' AND scores.annotation = 0") are deferred to post-MVP.
  // This can also be a function that loads a list of traces (in genai format) with
  // optional expected output, from wherever you store your existing golden datasets
  // like async () => await fetch('https://api.myapp.com/goldset') as Record<string, any>[]
  dataset: "goldset",

  // The "agent" callback is the main function that will be executed for each scenario (row) in the dataset.
  // The scenario comes from the dataset, it contains whatever the row of the dataset contains
  // The sdk wraps this span in a "simulation" span that allows the cli to link the instrumented trace with the dataset scenario
  agent: (scenario) => {
    const parameters = getParameters(scenario)

    // If SupportAgent is instrumented, we capture traces automatically to the CLI
    const output = await SupportAgent(parameters)

    // The "agent" callback can optionally return anything, it will be passed down the code evaluations
    return output
  },

  // The simulation can be evaluated by one or more evaluations
  evaluations: {
    // All latitude evaluations (monitors) that are tracking active issues for this agent.
    // These only run if the "agent" callback is instrumented.
    // The CLI will download and run the evaluation scripts locally.
    "issues": true,

    // Custom evaluation created manually in latitude (llm as judge).
    // These only run if the "agent" callback is instrumented.
    // The CLI will download and run the evaluation scripts locally.
    "custom-latitude-eval": true,

    // Custom code evaluations receive:
    // output: the return value of the "agent" callback
    // scenario: the row being evaluated of the dataset
    // conversation: the whole conversation that was generated by the agent if the "agent" callback is instrumented
    // metadata: the metadata of the conversation if the "agent" callback is instrumented
    // They have to return an instance of the Passed or Failed object, or an array of them.
    "custom-code-simple": (output, scenario, conversation, metadata) => { // Custom code simple evaluation
      if (output.length > 1000) {
        return Failed(0%, 'your answer is too long, please be concise and to the point, it should be no more than 1000 tokens')
      }

      return Passed(100%, 'your answer is concise and to the point')
    },

    // Custom code evaluation using utils from our separated evals sdk
    "custom-code-evals-sdk": (output, scenario, conversation, metadata) => {
      const distance = levensthein(output, scenario.answer)
      if (distance === 0) {
         return Passed()
      } else if (distance < MAXIMUM_DISTANCE) {
        return Passed(distance/100, `Response should be more similar to '${scenario.answer}'`)
      }

      return Failed(distance/100, `Response is nothing like '${scenario.answer}'`)
    },

    // Custom code evaluation using specific custom code from the client
    // As the evaluations are executed after the agent callback has returned,
    // it could have been a span, trace or a whole session, so we allow the user
    // to return an array of results if they wanted to evaluated every turn, for example
    "custom-code-advanced": (output, scenario, conversation, metadata) => {
      const results = []

      const turns = getTurns(conversation)
      for (const turn of turns) {
        const cites = turn.filter((message) => message.role === "assistant" && message.type === "cite-toolcall")
        if (includesExpectedCites(cites, scenario[`turn-${turn.index}-cites`])) {
          results.push(Passed(`Response includes all expected cites`))
        }

        results.push(Failed(`Response does not include any of the expected cites, which are: ${scenario[`turn-${turn.index}-cites`]}`))
      }

      return results
    },
  },
})
```

Entrypoint requirements:

- `Simulation`, `Passed`, and `Failed` are provided by the Latitude SDK
- the per-language SDK should stay lightweight and only provide the simulation entrypoint/runtime bridge needed by the CLI
- the CLI is responsible for invoking the user-configured command that executes the chosen `*.sim.*` entrypoints
- `agent()` can return any output, which is later given to custom code evaluations
- built-in Latitude evaluations can be referenced by id or through the special `issues` selector
- custom code evaluations can return a single score or an array of scores
- custom code evaluations receive `output`, `scenario`, `conversation`, and `metadata`

### Simulation Dashboard

Each project has a `Simulations` page.

Project-wide aggregates:

- total simulations
- total scenarios
- total token usage, split between captured traces and evaluations
- total cost, split between captured traces and evaluations

Simulation runs table columns:

- `Name`
- `Score`
- `Duration`
- `Scenarios`
- `Evaluations`
- `Dataset`
- `Timestamp`

Rows with run errors should be tinted.

Pagination:

- limit/offset
- sorted by `created_at DESC`

### Simulation Details

Row click opens a detailed view with:

- full name and creation timestamp
- average score, duration, scenarios
- evaluations list
- dataset reference
- simulation metadata such as threshold/file/sdk
- spans/traces/sessions table when instrumentation exists
- direct scores table fallback when instrumentation does not exist

## Tasks

## Task Governance

- the local task list in `specs/reliability.md` is the source of truth for reliability planning and execution state
- each phase is intended to become one GitHub PR and one Linear issue in the `Reliability` project
- before Linear sync, phase headings should use the placeholder id `LAT-XXX`; after sync, replace them with the created Linear issue ids
- synchronization is one-way from the local spec/task list to Linear
- future coding agents must update the local spec/task list first, then reconcile Linear from it
- future coding agents must not sync or reconcile Linear until the user explicitly approves the spec and explicitly instructs them to do so

## Task Implementation Pattern

- human-facing product work should be implemented in `apps/web`
- `apps/web` reads/writes should use `createServerFn` modules in `apps/web/src/domains/<domain>/*.functions.ts`
- reactive client state should use TanStack collections in `apps/web/src/domains/<domain>/*.collection.ts`
- route-specific reliability UI should live in the route directory's dedicated `-components/` subfolder so route files stay separate from their supporting UI
- only rarely, when a component is genuinely shared across multiple routes, it may live in the shared `apps/web/src/components` folder
- `apps/api` work in this task list means stable public or machine-facing capabilities under the existing versioned organization-scoped route shape `/v1/organizations/{organizationId}/...`; it must not be used as an internal proxy for the web product
- background work in this task list should follow the queue/topic conventions defined above and use `apps/workers` as the default execution home unless a later explicit phase introduces a different runtime
- each phase should include the tests, fixtures, and benchmarks needed to validate its risky behavior rather than deferring verification until the end of the roadmap
- domain foundation phases (Settings, Scores, Annotations, Issues, Evaluations, Annotation Queues, Simulations) should define complete shapes, fields, and migrations from the start even if later phases only begin using some fields afterward

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`
>
> Each phase is intended to become one GitHub PR and one Linear issue. Before Linear sync, phase headings use the placeholder id `LAT-XXX`; after sync, they should use the created Linear issue ids. Task bullets are local checklist items.

### (LAT-457) Phase 0 - Reliability Async Foundations

**Depends on**: none

**Parallelization notes**: Phase 0 can run in parallel with phases 1–9; the async-heavy implementation phases should wait for it before wiring shared queue/workflow execution behavior.

- [x] Extend the shared async substrate over `@domain/queue`, BullMQ, the existing `domain-events` dispatcher rail, and the existing Temporal-backed `apps/workflows` service, including PascalCase domain-event names, lower-kebab-case topic/task names, dispatcher-only `domain-events` handling, per-message dedupe/debounce options keyed by logical identity, the `apps/workers` topic-dispatcher pattern, the direct `createEventsPublisher(queuePublisher)` publication path for the reliability domain events introduced by this spec, and the generic workflow-start capabilities later phases will use.

**Exit gate**: met. Centralized `TopicRegistry` + `WorkflowRegistry` in `@domain/queue`, typed `EventPayloads` + `DomainEvent` in `@domain/events`, typed publish/subscribe/workflow-start APIs, runtime topic validation, BullMQ dedupe/debounce, all 11 topics with workers, domain-events dispatcher with full type narrowing, `@platform/workflows-temporal` package, and a working issue-discovery workflow scaffold. Later phases add registry entries and handler implementations — no core changes needed.

### (LAT-458) Phase 1 - Keep-Monitoring Settings Foundations

**Depends on**: none

**Parallelization notes**: can run in parallel with phases 2 through 7.

- [x] Define the canonical shared Zod schemas for the MVP reliability owner settings (`OrganizationSettings.keepMonitoring` and `ProjectSettings.keepMonitoring`) and infer TypeScript types; use literal-string unions rather than TypeScript enums for enum-like contracts.
- [x] Extend `organization` and `projects` with `settings` JSONB columns for `keepMonitoring`, without adding speculative secondary JSONB indexes.
- [x] Include `keepMonitoring` in organization/project settings shapes from the start so downstream settings `apps/web` and public/machine-facing settings work can rely on it, while deferring `user.settings` until a concrete user preference exists.
- [x] Keep settings reads on existing owner-row primary/unique paths and explicitly avoid speculative JSONB secondary indexes in the settings foundation phase.

**Exit gate**: organization/project settings schema and migrations are complete; `keepMonitoring` is settled before downstream phases; user/provider-model settings remain deferred.

### (LAT-459) Phase 2 - Scores Foundations

**Depends on**: none

**Parallelization notes**: can run in parallel with phases 1 and 3 through 7.

- [x] Define the canonical shared Zod schemas for scores and score metadata (evaluation, annotation, custom); infer TypeScript types from those schemas or matching Drizzle schemas; use literal-string unions for enum-like contracts.
- [x] Add the Postgres `scores` table with full Drizzle definition using repo-convention helpers, the exact secondary indexes defined by this spec, RLS, no foreign keys, `scores.drafted_at`, nullable `issue_id` / `simulation_id`, write-time-maintained `errored`, and all metadata/feedback/usage fields.
- [x] Add the immutable ClickHouse `scores` analytics table in both `unclustered/` and `clustered/` migration variants, with the fixed-width identifier contract, non-null issue/simulation links using empty-string sentinels, `UInt64` duration/tokens/cost fields, no mutable replacement/version columns, spans-style TTL/storage policy, and revalidated CODECs/skip indexes.
- [x] Add representative Postgres and ClickHouse seed data for scores, reflecting the canonical lifecycle and publication/analytics rules from this spec.
- [x] Define the score-domain named constants for score-lifecycle debounce thresholds inside the owning package.
- [x] Document the score/telemetry analytics query requirements that later ClickHouse materializations must satisfy; defer the exact materialized-table definitions until a later phase.

**Exit gate**: scores schema, Postgres table, and ClickHouse analytics storage are complete; later phases can build ingestion and analytics on top.

### (LAT-460) Phase 3 - Annotations Foundations

**Depends on**: Phase 2

**Parallelization notes**: can run in parallel with phases 4 through 7 once Phase 2 lands.

- [x] Define the canonical shared Zod schemas for annotations, annotation anchors (messageIndex, partIndex, text offsets), and annotation score metadata; infer TypeScript types.
- [x] Implement the exact minimal GenAI-aware annotation anchor schema and persistence rules required to reopen annotations in the conversation UI.
- [x] Ensure annotation score metadata and `source_id` semantics for `"UI"`, `"API"`, and annotation-queue provenance are defined in the scores schema; annotations produce scores via the canonical score model.
- [x] Add representative seed data for annotation-backed score examples covering UI, API, and annotation-queue provenance.
- [x] Define the minimal draft-aware query and index expectations for later annotation editing and queue review while continuing to reuse `scores` as the canonical store and avoiding a standalone annotation table.

**Exit gate**: annotation schema and anchor rules are complete; later phases can build in-product annotation creation and queue integration.

### (LAT-461) Phase 4 - Issues Foundations

**Depends on**: Phase 2

**Parallelization notes**: can run in parallel with phases 5 through 7 once Phase 2 lands.

- [x] Define the canonical shared Zod schemas for issues, `IssueCentroid`, and issue lifecycle; infer TypeScript types.
- [x] Add the Postgres `issues` table with full Drizzle definition using repo-convention helpers, the stored `issues.uuid` used to link with Weaviate, centroid JSONB, `clusteredAt`, lifecycle timestamps, RLS, and the exact secondary indexes defined by this spec.
- [x] Add the Weaviate `Issues` collection definition with the required BM25, vector, and multi-tenancy settings.
- [x] Add representative seed data for issues and their initial search/projection state.
- [x] Define the issues-domain named constants for discovery thresholds, centroid decay/weights, refresh debounce, and denoising visibility in the owning package.
- [x] Document the centroid math, decay anchor (`clusteredAt`), and source-weight rules for later discovery phases.

**Exit gate**: issues schema, Postgres table, and Weaviate collection are complete; later phases can build discovery and lifecycle.

### (LAT-462) Phase 5 - Evaluations Foundations

**Depends on**: Phase 2, Phase 4

**Parallelization notes**: can run in parallel with phases 6 and 7 once phases 2 and 4 land.

- [x] Define the canonical shared Zod schemas for evaluations, triggers, and evaluation lifecycle; infer TypeScript types.
- [x] Add the Postgres `evaluations` table with full Drizzle definition using repo-convention helpers, support for multiple linked evaluations per issue, RLS, and the exact secondary indexes defined by this spec.
- [x] Add representative seed data for evaluations, including linked-issue examples where the schema supports them.
- [x] Define the evaluations-domain named constants for cadence, default sampling, and alignment tolerances. (Historical note: an earlier job-status TTL constant backed a Redis-based status mirror that has since been removed — Temporal is now the single source of truth for workflow state.)
- [x] Define `EvaluationTrigger.filter` as the shared `FilterSet` from `@domain/shared`, using the shared trace field registry semantics instead of a reliability-only string grammar.

**Exit gate**: evaluations schema and table are complete; later phases can build generation, alignment, and execution.

### (LAT-463) Phase 6 - Annotation Queues Foundations

**Depends on**: Phase 2, Phase 3

**Parallelization notes**: can run in parallel with Phase 7 once phases 2 and 3 land.

- [x] Define the canonical shared Zod schemas for annotation queues, queue items, queue settings, and queue provenance; infer TypeScript types.
- [x] Define `AnnotationQueueSettings.filter` as an optional shared `FilterSet` over trace fields, keep it absent for manual/system queues, and normalize empty filter sets away at write time.
- [x] Add the Postgres `annotation_queues` and `annotation_queue_items` tables with full Drizzle definitions using repo-convention helpers, queue `system` flags, settings JSONB, assignee arrays, queue item completion/progress state, RLS, and the exact secondary indexes defined by this spec.
- [x] Add representative seed data for annotation queues and queue items across manual, system, and live queue shapes.
- [x] Define the annotation-queue-domain named constants for live/system default sampling, context-window limits, and outlier thresholds.
- [x] Document the default system-created queue provisioning rules and canonical names/descriptions/instructions for later orchestration phases.

**Exit gate**: annotation queue schema and tables are complete; later phases can build queue CRUD, population, and product surface.

### (LAT-464) Phase 7 - Simulations Foundations

**Depends on**: Phase 2

**Parallelization notes**: should land before score analytics and post-MVP simulation phases start, but it can run in parallel with phases 3 through 6 once Phase 2 lands.

- [x] Define the canonical shared Zod schemas for simulations and simulation runs; infer TypeScript types.
- [x] Add the Postgres `simulations` table with full Drizzle definition using repo-convention helpers, RLS, and the exact secondary indexes defined by this spec.
- [x] Extend telemetry storage with `simulation_id` as a non-null fixed-width CUID link using the empty-string sentinel when absent through a new ClickHouse migration rather than by editing existing migration history.
- [x] Add representative seed data for simulations and simulation-linked score/telemetry examples.
- [x] Define the simulations-domain named constants for reporting defaults and upload/local-only behavior.
- [x] Propagate `simulation_id` into the existing traces and sessions materializations via a new ClickHouse migration rather than by editing existing migration history.

**Exit gate**: simulations schema and table are complete; telemetry has `simulation_id` propagated through spans, traces, and sessions materializations; later phases can build simulation runtime and product surface.

### (LAT-465) Phase 8 - Scores Ingestion And Base Reads

**Depends on**: Phase 2

**Parallelization notes**: Phase 9 can start once Phase 8 exposes base reads.

- [x] Implement the canonical score write path into Postgres with source-aware validation, plus retry-safe append-only ClickHouse save for published immutable scores only.
- [x] Implement the project-scoped public `/scores` API for score ingestion, defaulting to custom scores while reserving `_evaluation: true` for later locally executed Latitude evaluation uploads, including arbitrary custom metadata storage.
- [x] Implement the internal score writer used by evaluation execution and simulations, with Postgres-first writes and immutable-score analytics save into ClickHouse only when save rules are satisfied.
- [x] Enforce exact metadata validation for evaluation, annotation, and custom scores before persistence.
- [x] Support instrumented and uninstrumented score creation paths, including optional `session_id`, `trace_id`, and `span_id`.
- [x] Expose base read/query contracts over canonical Postgres scores for project scores, evaluation sources, and custom score sources, with draft exclusion by default and explicit opt-in for draft-aware surfaces.
- [x] Add contract/integration tests for UI, API, and internal score writers covering provenance, metadata validation, in-place draft edits, analytics save gating, retry-safe save behavior, and instrumented/uninstrumented ingestion paths.

**Exit gate**: public `/scores` ingestion and internal evaluation writes land in the same canonical score model; later annotation phases can reuse the same storage path without reworking score ingestion.

### (LAT-466) Phase 9 - Scores Analytics And Telemetry Queries

**Depends on**: Phase 2, Phase 8

**Parallelization notes**: Phase 10 can continue in parallel while this phase finishes; phases 11 and 15 should wait for it.

- [x] Implement repositories and query primitives over canonical Postgres scores plus the initial ClickHouse score analytics query layer, while keeping the exact later materialized analytics tables deferred.
- [x] Implement score-aware filtering for spans using rollups instead of hot joins against raw scores.
- [x] Implement trace and session drilldowns filtered by score state, value, source, and issue.
- [x] Implement evaluation/custom source trend queries and project-wide score aggregates from the immutable ClickHouse score analytics rows, while keeping score-table and drilldown reads in Postgres.
- [x] Implement issue occurrence/time-series aggregates used by issue lifecycle and UI.
- [x] Ensure score queries can include or exclude simulation-generated scores where the product requires it.
- [x] Benchmark and tune the ClickHouse score analytics table sort keys, partitions, and skip indexes against realistic reliability workloads.
- [x] Add query regression tests and benchmark fixtures for Postgres-backed score drilldowns, ClickHouse-backed project aggregates, and include/exclude simulation behavior.

**Exit gate**: spans, traces, and sessions can be filtered by score-derived properties; evaluation, issue, and simulation analytics have a working query path without prematurely locking the final materialized-table design.

### (LAT-467) Phase 10 - Annotations Backend And Human Ground Truth

**Depends on**: Phase 0, Phase 3, Phase 8

**Parallelization notes**: can run in parallel with Phase 9 once phases 0, 3, and 8 land.

- [x] Implement the public API for annotation ingestion under `/:organizationId/projects/:projectId/annotations` with a minimal, agent-friendly contract on top of canonical scores, including the canonical annotation `source_id` semantics for `"UI"`, `"API"`, and annotation-queue provenance.
- [x] Introduce the shared text-generation capability in the first phase that needs it, and define the concrete `annotation-scores:publish` topic-task payload/schema plus dedupe key semantics keyed by the canonical score id.
- [x] Implement in-product annotation creation on conversations/messages/spans/traces/sessions, including Postgres-backed draft score creation, annotation-side issue intent for automatic discovery, existing-issue linking, debounced draft publication through `annotation-scores:publish` keyed by the canonical score id, and post-publication immutability after the debounce window closes.
- [x] Implement annotation feedback enrichment using surrounding context before issue discovery, persist the enriched canonical feedback, and preserve the original raw human text separately in metadata.
- [x] Implement annotation read/query surfaces needed by issue discovery, issue visibility, evaluation alignment, draft-aware editing, and queue review, with default exclusion of drafts outside draft-aware surfaces.
- [x] Ensure UI-created and API-created annotations converge on the exact same score contract and behavior, including the canonical `source_id` provenance rules for `"UI"`, `"API"`, and annotation queues plus shared `draftedAt` semantics.
- [x] Add integration tests covering UI/API annotation parity, raw/enriched feedback preservation, refresh-safe draft visibility, debounce-based publication through `annotation-scores:publish`, deletion after publication, and reliable reopening of message-level and text-range anchors. Not done out of scope, tested manually that annotations UI worked.

**Exit gate**: annotations are a reliable human ground-truth source across UI and API; enriched feedback is available for clustering without losing original human wording; explicit annotation-side issue linking preserves human ownership without relying on similarity discovery.

### (LAT-468) Phase 11 - Issues Discovery And Cluster Maintenance

**Depends on**: Phase 0, Phase 4, Phase 8, Phase 9, Phase 10

**Parallelization notes**: after this phase lands, Phase 12 can start while Phase 14 waits for both issue discovery and evaluation generation.

Legacy v1 reference paths: `packages/core/src/weaviate/index.ts`, `packages/core/src/voyage/index.ts`, `packages/core/src/services/issues/results/validate.ts`, `packages/core/src/services/issues/discover.ts`, `packages/core/src/services/issues/shared.ts`. Checkout branch `latitude-v1` in the old repository before using.

- [x] Implement score eligibility validation for issue discovery, including the explicit exclusion of errored scores, drafted scores with `draftedAt != null`, missing canonical feedback, already-owned scores, and any source classes explicitly excluded from clustering.
- [x] Centralize known-issue routing for failed non-errored non-draft scores behind `ScoreCreated` plus a deduped `issues:discovery` task, so selected annotation issue intent and issue-linked evaluation routing are resolved in one place before either direct assignment or the Temporal `issue-discovery` workflow starts.
- [x] Implement feedback embedding with `voyage-4-large` at `2048` dimensions and caching.
  - [x] Add Voyage embedding support to the shared AI service surface (`AI.embed`) via `@platform/ai-voyage`.
  - [x] Wire issue-discovery embedding calls to enforce `voyage-4-large` with `2048` dimensions.
  - [x] Wire embedding caching in the issue-discovery embedding flow.
- [x] Implement hybrid search in Weaviate with `RelativeScore` fusion over centroid vectors plus BM25 text search, including explicit tenant-existence guards on read/search paths.
- [x] Implement reranking with `rerank-2.5`, fixed threshold constants, and the v1-style search sequence of hybrid retrieval first and rerank second.
  - [x] Add Voyage reranking support to the shared AI service surface (`AI.rerank`) via `@platform/ai-voyage`.
  - [x] Wire issue-discovery rerank calls to enforce `rerank-2.5`.
  - [x] Implement and verify the retrieval order: hybrid retrieval first, rerank second.
- [x] Implement the running centroid math with source weights and decay, adapting the v1 math to the new `IssueCentroid` shape while using `clusteredAt` as the decay anchor instead of generic row `updatedAt`.
- [x] Implement the create-or-match discovery flow as the `issue-discovery` workflow in the existing Temporal-backed `apps/workflows` service, with separate activities for eligibility recheck, feedback embedding/normalization, hybrid Weaviate search, reranking, matched-issue resolution against canonical Postgres state, synchronous first issue-details generation inside the create-from-score path for brand-new issues, separate issue creation and existing-issue assignment mutations, direct `syncIssueProjectionsUseCase` Weaviate projection sync before direct `syncScoreAnalyticsUseCase` ClickHouse sync after the create/assign transaction commits, preserving recheck-before-work, single-owner invariants around canonical `scores.issue_id`, and one-time ClickHouse save after the score becomes immutable; reuse the shared `@domain/issues` centroid helpers (`createIssueCentroid`, `updateIssueCentroid`, `normalizeIssueCentroid`) plus the shared hybrid-search path instead of reimplementing centroid math or raw Weaviate issue search in workflow/activity code.
  - [x] Wire the current `issue-discovery` workflow and activities for eligibility recheck, feedback embedding/normalization, hybrid Weaviate search, reranking, canonical matched-issue resolution, separate create-from-score and assign-to-issue mutations, direct `syncIssueProjectionsUseCase` Weaviate projection sync before direct `syncScoreAnalyticsUseCase` ClickHouse sync after the create/assign transaction commits, preserving recheck-before-work and single-owner `scores.issue_id` claiming.
  - [x] Lock the canonical issue row during existing-issue assignment so concurrent discovery workflows updating the same issue serialize centroid mutations instead of losing one occurrence.
  - [x] Generate the first issue name/description synchronously inside `issue-discovery` from the initial score before the new issue row is first persisted; this must happen in its own retryable workflow activity outside and before the final create/assign transaction, and that transaction must persist the new issue already carrying those generated details. It must reuse the same shared issue-details generation use case that later async refreshes also call.
- [x] Implement asynchronous subsequent issue name/description generation and eight-hour refresh debounce through a debounced BullMQ task on the `issues:refresh` topic with dedupe/debounce options, reusing the same shared issue-details generation use case as the synchronous new-issue path, generating from the last `25` assigned occurrences plus previous issue details as baseline, and upserting the Weaviate issue projection again after any persisted name/description change.
- [x] Implement the baseline denoising visibility rule for low-evidence, non-annotation issues, with the visibility threshold kept configurable.
- [x] Implement immutable-score save into ClickHouse after issue assignment through the shared direct `syncScoreAnalyticsUseCase` path, without breaking the canonical `score.issue_id` contract or creating duplicate analytics rows.
- [x] Add concurrency and ownership regression tests covering single-owner `scores.issue_id`, resolved-issue and ignored-issue rematching, stale Weaviate-candidate fallback after final Postgres existence check, one-time immutable ClickHouse save, and explicit human annotation assignment bypasses.

**Exit gate**: new failed scores can match existing issues or create new ones; issue centroids move correctly over time; canonical score ownership cannot race into multiple active issues; issue visibility is denoised without reintroducing the v1 merge system.

### (LAT-469) Phase 12 - Evaluation Generation And Alignment

**Depends on**: Phase 0, Phase 5, Phase 10, Phase 11

**Parallelization notes**: after this phase lands, phases 13 and 14 can proceed in parallel.

Legacy v1 reference paths: `apps/engine`, `packages/core/src/services/optimizations`, `packages/core/src/services/optimizations/optimizers/evaluate.ts`, `packages/core/src/services/optimizations/optimizers/propose.ts`. Checkout branch `latitude-v1` in the old repository before using.

- [x] Implement canonical evaluation persistence, repository APIs, and lifecycle rules for active/archived/deleted evaluations, including ignore-driven archiving, resolution-driven `keepMonitoring` behavior, and support for several linked evaluations per issue.
- [x] Implement the baseline issue-monitor script generator from issue context and examples, using Latitude-owned prompts stored in this repository.
- [x] Adapt the v1 optimizer transport/orchestration for evaluation scripts inside the `optimize-evaluation` workflow in the existing Temporal-backed `apps/workflows` service, including the GEPA integration path, the child-process stdio JSON-RPC bridge, the worker-image packaging of the Python engine runtime/source, the skinny id/hash-based RPC payloads, ordered multi-objective support for alignment (MCC), cost in dollars derived from stored microcents, and duration in seconds derived from stored nanoseconds, while keeping the GEPA optimization pass as one workflow activity for now.
- [x] Implement the proposer/evaluator feedback loop for script optimization, preserving learnable feedback patterns from v1, candidate-invariant validation that turns recoverable failures into learnable feedback, sanitized host-side trajectory context, candidate comparison across derived alignment (MCC), cost, and duration, and the named default proposer-model constant defined by the GEPA implementation package.
- [x] Implement exact positive/negative ground-truth example selection from annotation-derived evidence as a separate `optimize-evaluation` workflow activity before the optimizer run, using failed, non-errored, non-draft annotation scores linked to the specific issue being aligned as positives, excluding drafts and errored scores from alignment entirely, allowing initial generation from a single positive example with zero negatives, and using the defined negative-example priority order.
- [x] Implement confusion-matrix storage and derived metric computation on evaluations without persisting MCC separately.
- [x] Implement user-triggered initial generation/alignment as the `optimize-evaluation` workflow when a user asks to generate an evaluation from an issue, including initial trigger configuration with default sampling loaded from the named constant, a deterministic per-resource workflow id so the workflow is the queryable resource (no `jobId` leaked to callers), and a polling server function that asks Temporal directly via `workflow.describe()` and workflow queries for frontend status — Temporal is the single source of truth, no Redis-backed job-status mirror.
- [x] Implement incremental recomputation when the evaluation hash is unchanged and the alignment drop stays within tolerance, adding new examples into the existing confusion-matrix counters instead of recomputing from scratch. The refresh workflow enforces the hash invariant explicitly — it loads `evaluation.script` plus `evaluation.alignment.evaluationHash` and compares `sha1(script)` to the persisted hash. A match means the persisted matrix was produced by the live script, so the incremental merge is safe. A mismatch means the script drifted from the hash that produced the matrix (someone updated `evaluation.script` outside `persistAlignmentResultUseCase`); in that case the workflow rebuilds the confusion matrix from scratch against every curated example and persists it with the freshly computed hash so future refreshes are back on the incremental path. The rebuild does not trigger GEPA — MCC drop is re-evaluated on the next incremental pass once the hash and script agree again.
- [x] Implement annotation-driven throttled refresh with the one-hour / eight-hour cadence from the proposal through delayed BullMQ queue tasks that kick off single-purpose Temporal workflows: `evaluations:automaticRefreshAlignment` (1h throttle, keyed per evaluation) starts `refresh-evaluation-alignment`, which publishes `evaluations:automaticOptimization` (8h throttle, keyed per evaluation) to start `optimize-evaluation` when the incremental pass reports `full-reoptimization`; workflows themselves do not sleep or manage timers — throttle semantics (first-publish-wins, subsequent drops) live in `dedupeKey + throttleMs` on the queue, so a continuous annotation stream cannot starve the refresh and fire latency is bounded at the configured window.
- [x] Implement manual throttled realignment plus alignment status reporting for `apps/web` and the approved public/machine-facing surfaces, reusing the same `optimize-evaluation` workflow path and the same deterministic per-resource workflow id contract where a user-triggered run needs polling feedback — the polling server function asks Temporal directly (via `workflow.describe()` and workflow query handlers) rather than reading any Redis-backed job-status mirror.
- [x] Implement the post-alignment name/description generation pass for evaluations as a separate `optimize-evaluation` workflow activity after alignment, using Latitude-owned prompts stored in this repository and the named default details-generator-model constant defined by the GEPA implementation package.
- [x] Implement curated example sizing plus deterministic balanced train/validation splitting for alignment runs using the configured bounds and defaults from this spec.
- [x] Add deterministic alignment/optimizer integration tests with fixed fixtures covering explicit on-demand generation, multiple linked evaluations on the same issue, single-occurrence generation, example curation, confusion-matrix derivation, and incremental refresh behavior.

**Exit gate**: users can generate evaluations from issues when needed through Temporal-backed `optimize-evaluation` workflows with deterministic per-resource ids polled directly from Temporal (no Redis-backed job-status mirror) and align them against human annotations; alignment is measurable, inspectable, and refreshable; the optimizer targets scripts rather than hidden prompt configs.

### (LAT-470) Phase 13 - Live Monitoring And Evaluation Execution

**Depends on**: Phase 0, Phase 8, Phase 12

**Parallelization notes**: can run in parallel with Phase 14 once Phase 12 lands.

- [x] Implement `SpanIngested` publication from successful span ingestion via direct `createEventsPublisher(queuePublisher)` publication into `domain-events`, keep `projects:checkFirstTrace` on `SpanIngested`, debounce and publish `trace-end:run` directly from the `SpanIngested` handler keyed by `(organizationId, projectId, traceId)`, and trigger incremental live evaluation work over spans, traces, and sessions using the shared `FilterSet` for `trigger.filter` plus `turn`, `debounce`, and `sampling`, including the `first` / `every` / `last` turn semantics from the model, shared trace-field-registry filter matching, the project-scoped scan of active evaluations on each debounced `SpanIngested` run, the shared trace-end selector that samples first and batches live-evaluation and live-queue filters together, and the follow-up `live-evaluations` task `execute` published for each matching `(evaluationId, traceId)` pair.
- [x] Implement hosted `llm()` execution for live evaluations through `@platform/ai-vercel` and the Vercel AI SDK, using Latitude-managed provider/model/API-key configuration rather than user-configured provider/model settings.
- [x] Implement `live-evaluations:execute` result writing, including value/passed/feedback/error plus persisted nanosecond `duration` and microcent `cost`, Postgres-first canonical persistence, correct `error -> errored` semantics, immediate ClickHouse save for immutable passed/errored results, and immediate save for failed non-errored issue-linked monitor results once `issue_id` is assigned at write time.
- [x] Ensure archived/deleted evaluations never trigger and paused evaluations use `sampling = 0`.
- [x] Implement direct `issue_id` assignment at write time for issue-linked monitor failures so those scores are immutable and can be written to ClickHouse analytics immediately.
- [x] Add the execution hooks needed later by the full portable runtime so the same evaluation artifact can move from the MVP executor into later runtimes without storage changes.
- [x] Add end-to-end monitor execution tests covering `SpanIngested` debounce reset behavior, debounced `trace-end:run` behavior, downstream `live-evaluations:execute` behavior, turn selection, pause/archive/delete behavior, direct issue assignment, immutable-score analytics save timing, and persisted usage accounting.

**Exit gate**: issue monitors run on live traffic; `SpanIngested -> (debounce) -> trace-end:run -> live-evaluations:execute` works end to end; evaluation-generated scores land in the canonical score model with the right issue linkage; and passed, errored, plus issue-linked failed immutable monitor results sync to ClickHouse immediately after commit.

### (LAT-471) Phase 14 - Issues Lifecycle, Search, And Product Surface

**Depends on**: Phase 11, Phase 12

**Parallelization notes**: can run in parallel with Phase 13 once phases 11 and 12 land.

- [x] Implement derived issue lifecycle states: `new`, `escalating`, `resolved`, `regressed`, and `ignored`.
- [x] Implement manual resolve/unresolve/ignore/unignore commands, including both single-item and bulk variants, `apps/web` server-function actions for managed product use, and matching public APIs for approved agent-facing access, including the resolve-action override for keeping linked evaluations active, the confirmation-modal default from `keepMonitoring`, and the immediate archival of linked evaluations when an issue is ignored.
- [x] Implement the issues-page read contract that splits time range, search, and lifecycle controls across ClickHouse, Weaviate, and Postgres; runs ClickHouse first, invokes Weaviate only when search text is present, and then queries canonical Postgres issues through `IN (...)` clauses while preserving cross-store sort keys for final pagination.
- [x] Implement ClickHouse-backed issue-page analytics reads for histogram buckets, lifecycle aggregate counts, per-issue occurrences in the selected time range, per-issue last seen values, per-issue 14-day trend buckets, and the selected-window total trace count used by `Affected traces`.
- [x] Implement project-level issue search with Weaviate hybrid search, no rerank, shared AI-layer Redis caching for query embeddings, and propagation of search similarity scores into the final table ordering.
- [x] Implement the `apps/web` issues domain server functions and collections for the new issues-page state model, including time-range state, columns state, Active/Archived lifecycle tab state, search state, infinite pagination, and next-page prefetch.
- [x] Build the issues-page action row in `apps/web` so it mirrors the Traces-page structure with time range, columns, Active/Archived tabs, and search.
- [x] Build the issues-page analytics panel in `apps/web` using the Traces-page aggregate-plus-histogram component pattern, including the default 7-day histogram fallback rules and aggregate counts for `new`, `escalating`, `regressed`, `resolved`, and `seen occurrences`.
- [x] Build the infinitely paginated issues table in `apps/web` with columns `Issue`, `Trend`, `Seen at`, `Occurrences`, `Affected traces`, and `Evaluations`, including lifecycle tags, issue-name truncation, occurrence subheader aggregation, occurrence sorting, linked evaluation tags, and row-click drawer opening.
- [x] Build the issue details drawer in `apps/web` with Traces-style close/navigation chrome, ignore/unignore and resolve/unresolve header actions, full-history summary data, a collapsible 14-day trend histogram, a collapsible linked evaluations section, and a collapsible infinitely paginated mini traces table.
- [x] Integrate drawer-side monitoring and evaluation controls so `Monitor issue` appears only when no linked evaluations exist, monitor-generation kickoff polls background status until the resulting evaluation appears, linked evaluations show alignment metadata, manual realign shows `Aligning...` while in flight, and per-evaluation archive actions require confirmation.
- [x] Keep the Phase 14 issue management surface web-only for now: implement search, analytics, drawer reads, lifecycle commands, and monitor-generation status through `apps/web` server functions and do not expose public `apps/api` issue routes yet.
- [x] Add backend regression coverage for bulk lifecycle actions, the multi-store control split, analytics-vs-table control application rules, hybrid search ordering, ClickHouse-backed issue-trace pagination, ignore-driven archival, resolve defaults from `keepMonitoring`, regression reopening behavior, and the web-private issue read orchestration; do not add dedicated React/UI tests for this product surface.

**Exit gate**: users can filter, search, inspect, and manage issues end to end through an Issues page that mirrors the Traces page shell; analytics, search, and table rows stay consistent across ClickHouse, Weaviate, and Postgres reads; the issue drawer exposes lifecycle and monitoring controls with the specified full-history behavior; and the managed issue surface remains web-only until a later phase explicitly introduces a public API contract.

### (LAT-472) Phase 15 - Evaluations Product Surface And API

**Depends on**: Phase 9, Phase 12, Phase 13

**Parallelization notes**: after this phase lands, Phase 16 can proceed while post-MVP evaluation work still waits for the MVP cutoff.

- [ ] Build the project Evaluations page in `apps/web` with active evaluation analytics and the active evaluations table, backed by evaluation server functions/collections.
- [ ] Build the custom score sources continuation table for `source = 'custom'`.
- [ ] Build the archived evaluations table in `apps/web` with unarchive behavior, backed by evaluation server functions/collections.
- [ ] Build `apps/web` quick actions and confirmation modals for trigger updates, pause/resume, archive, and delete, with trigger updates editing `filter`, `turn`, `debounce`, and `sampling` through the shared filter-builder/UI patterns where applicable.
- [ ] Build the evaluation dashboard in `apps/web` with charts and aggregates backed by ClickHouse plus filters, score table, and score details modal backed by Postgres canonical scores, using evaluation server functions/collections.
- [ ] Add the read-only script modal for evaluations in `apps/web`.
- [ ] Expose the stable public/machine-facing APIs for evaluation listing, status changes, trigger updates, dashboard reads, and custom source reads without routing internal web product flows through `apps/api`, using the shared `FilterSet` payload shape for trigger filters.
- [ ] Add UI/API regression tests covering lifecycle actions, archived/custom source visibility, dashboard filters, the Postgres/ClickHouse read split, and the default exclusion of simulation-generated scores.

**Exit gate**: evaluation management works from both UI and API; custom score sources are visible as first-class evaluation-like dashboards.

### (LAT-473) Phase 16 - Keep-Monitoring Settings Product Surface And API

**Depends on**: Phase 1, Phase 15

**Parallelization notes**: after this phase lands, Phase 17 can proceed.

- [x] Implement organization/project reliability settings on the owner entities only for `keepMonitoring`, with `apps/web` management flows plus matching public/machine-facing APIs.
- [x] Implement `keepMonitoring` in organization/project settings, use it as the default state for the manual issue-resolution confirmation toggle, and enforce its effect on resolved issue-linked evaluation lifecycle behavior.
- [x] Place the MVP settings entry points in the home dashboard and project dashboard exactly as specified.

**Exit gate**: MVP reliability settings live on the right owner entities; `keepMonitoring` can be managed through both UI and API.

### (LAT-474) Phase 17 - Annotation Queues Orchestration And Product Surface

**Depends on**: Phase 0, Phase 6, Phase 9, Phase 10, Phase 16

**Parallelization notes**: this is the final MVP phase; no later MVP phase should start after it.

- [x] Implement annotation queue persistence and orchestration for manual and live queues, including queue CRUD, repository/query surfaces for queue lists, progress, assignee hydration, next/previous navigation, assignee-array management with set semantics, optional shared `FilterSet` storage for live queues, default sampling loaded from named constants when creating live queues and provisioning system queues, project provisioning of the default system-created manual queues with their canonical names/descriptions/instructions, deterministic queue ordering derived from query order, and per-item completion tracking.
- [x] Build the project `Annotation Queues` page in `apps/web` with the non-deleted queue table, `live` tags for live queues, `system` tags for system queues, progress bars, assignee avatars, pagination, and create/edit/delete modals, using the shared trace-filter builder for `settings.filter` while keeping `name`, `description`, `instructions`, and `settings.filter` read-only for `system = true` queues.
- [x] Connect manual trace/session selection, system-created queue population, and live filter/sampling materialization to the set of traces awaiting annotation, including the trace-dashboard bulk action that inserts manual queue items with `completedAt = null`, the sessions-dashboard bulk action that resolves each selected session to its newest trace before inserting the queue item (deferred to dedicated sessions redesign phase), the shared `trace-end:run` task dispatched from debounced `SpanIngested` that applies per-queue system sampling first and starts one `systemQueueFlaggerWorkflow` per selected system queue, and that also batch inserts matched live queue items using shared `FilterSet` semantics after sample-first pruning and one batched filter query across live queues plus live evaluations, with zero-or-many queue matches per trace and deterministic pending-trace ordering.
- [x] Build the focused queue annotation screen in `apps/web` with the collapsed sidebar, hotkey-backed bottom action bar, metadata/conversation/annotations columns, dataset-add action, conversation-level annotation creation, persisted selection highlights that focus the matching annotation card, derived queue-item position in the UI, and the congratulations empty state when no queue items remain pending.
- [x] Integrate queue context into annotation creation, including the canonical queue-provenance contract on annotation `source_id`, the shared `draftedAt` draft contract for system-created queue annotations, queue-item completion semantics, exclusion of drafts from issue discovery until human review, and any additional annotation metadata needed to reopen the annotation cleanly.
- [x] Add end-to-end tests covering manual trace selection, manual session selection resolved to newest trace (deferred to sessions redesign), system queue tags and locked fields, system-created queue sampling seeded from defaults and later user edits, sampling-before-deterministic-check behavior, one `systemQueueFlaggerWorkflow` started per selected system queue, full-context validator/drafter confirmation, zero-match and multi-match traces, `draftedAt`-based draft exclusion from issue discovery, live incremental materialization through `trace-end:run` (post-MVP), default live queue sampling, sample-before-filter behavior, duplicate-membership prevention, focused review navigation/hotkeys, queue completion, and progress updates. (Unit tests exist; e2e tests deferred to post-MVP hardening.)

**Exit gate**: annotation queues are no longer just a base model; managed annotation workflows exist before MVP; default system-created queues provide immediate project value; both the queue-management page and the focused queue-review screen are usable end to end.

**Post-MVP note**: Sessions bulk action (resolving session to newest trace for queue insertion) is deferred to a dedicated sessions redesign phase where sessions become an independent section from traces.

--- **MVP** ---

### (LAT-475) Phase 18 - Full Evaluation Script Runtime

**Depends on**: Phase 12, Phase 13

**Parallelization notes**: after this phase lands, phases 19 and 21 can proceed in parallel.

- [ ] Implement the portable JavaScript-like sandbox runtime with resource limits and host-controlled syscalls.
- [ ] Expose the full runtime helpers such as `Passed`, `Failed`, `llm`, `parse`, and `zod`, including feedback-required score helpers, the MVP `llm()` options shape, `parse(value, schema)`, and the hosted `llm()` bridge through `@platform/ai-vercel` and the Vercel AI SDK with Latitude-managed provider/model configuration.
- [ ] Keep the runtime packaged and reusable so backend execution and the later simulation CLI can share the same portable implementation.
- [ ] Keep the stored script artifact unchanged while swapping executors.
- [ ] Add portability and resource-limit regression tests for the portable runtime and the later CLI-reuse contract.

**Exit gate**: evaluation scripts are portable across executors and ready for later simulation CLI reuse; the MVP script subset expands without storage migration.

### (LAT-476) Phase 19 - Simulation Runtime And CLI

**Depends on**: Phase 7, Phase 8, Phase 9, Phase 18

**Parallelization notes**: after this phase lands, phases 20, 22, and 23 can proceed in parallel.

- [ ] Implement simulation run creation/update APIs and repositories on top of the `simulations` model, always maintaining `errored` from the current error state in application code.
- [ ] Build the initial post-MVP JavaScript/TypeScript lightweight SDK with `Simulation`, `Passed`, `Failed`, and the entrypoint/runtime bridge needed by the CLI, including the feedback-required score-helper contract.
- [ ] Build the local-first CLI runner that can be used as a standalone simulation runner without requiring the hosted Latitude platform, accepts a user-configured command, loads entrypoints, runs scenarios with or without instrumentation, prints reports, and exits with CI-friendly status codes.
- [ ] Implement the local HTTP bridge between SDK and CLI.
- [ ] Reuse the ingest pipeline as a local OTEL-compatible collector with `simulation_id` propagation.
- [ ] Download Latitude evaluations as sandboxed JavaScript-like scripts and run them locally through the shared portable runtime against captured conversations, only pushing resulting scores back through the shared project-scoped `/scores` API when the user chooses to upload them; those uploads must use `_evaluation: true` plus evaluation-score metadata and evaluation CUID `source_id` values.
- [ ] Execute user-defined custom code evaluations and push the resulting scores through the same public `/scores` API using the default custom-score contract.
- [ ] Support both fully local-only reports and optional upload of resulting scores/traces back to Latitude.
- [ ] Support dataset sources by dataset id and custom function loaders in the initial simulations phase, while keeping query-backed datasets explicitly deferred.
- [ ] Support non-instrumented simulations by still accepting score-only reporting paths.
- [ ] Resolve the special `issues` selector into the current project's active issue-linked evaluations at runtime so simulations can target all live monitors without enumerating them manually.
- [ ] Add end-to-end CLI integration tests covering local-only runs, optional upload, instrumented runs, uninstrumented runs, downloaded evaluation execution, and the `issues` selector.

**Exit gate**: users can run simulations locally or in CI in JS/TS; the CLI is genuinely useful as a standalone local-first simulation runner; simulations work with or without instrumentation.

### (LAT-477) Phase 20 - Simulation Product Surface And Reporting

**Depends on**: Phase 9, Phase 19

**Parallelization notes**: can run in parallel with phases 22 and 23 once Phase 19 lands.

- [ ] Build the Simulations page in `apps/web` with project-wide aggregate cards, the simulation runs table columns defined by this spec, row error tinting, and pagination, backed by simulation server functions/collections.
- [ ] Build the simulation details view in `apps/web` with the summary fields, dataset/evaluation links, metadata, and hosted reporting details defined by this spec, backed by simulation server functions/collections.
- [ ] Show spans/traces/sessions when instrumentation data exists for the run.
- [ ] Show the direct score-list fallback when the run has no instrumentation data.
- [ ] Expose the stable public/machine-facing APIs for simulation listing, details, and linked evaluation/dataset resources without using `apps/api` as the internal backend for the web product.
- [ ] Add reporting integration tests for aggregate cards, instrumented detail tables, and direct-score fallback details.

**Exit gate**: simulation runs are visible inside Latitude; users can move between CI/local execution and hosted inspection without changing the core model.

### (LAT-478) Phase 21 - User-Created Evaluations

**Depends on**: Phase 15, Phase 18

**Parallelization notes**: can run in parallel with Phase 19 once Phase 18 lands.

- [ ] Finalize the user-created evaluation editor/copilot UX, which remains pending definition.
- [ ] Implement user-created evaluation creation/editing in UI and API.
- [ ] Support non-issue-linked evaluation lifecycle and dashboards.

**Exit gate**: users can author and run their own evaluations directly in Latitude.

### (LAT-479) Phase 22 - Filter UX Hardening, Query-Backed Datasets, And Deferred Analytics Materializations

**Depends on**: Phase 13, Phase 19

**Parallelization notes**: can run in parallel with phases 20 and 23 once Phase 19 lands.

- [ ] Harden the evaluation and annotation-queue filter UX around the shared `FilterSet`, including field/operator-aware affordances and approved public/machine-facing filter surfaces where richer UX is required.
- [ ] Add query-backed simulation datasets and validate their performance characteristics, including migrating the `simulations.dataset` column from `varchar(24)` to `text` to accommodate query strings.
- [ ] Define and implement the exact ClickHouse materialized score analytics tables once the initial reporting/query shapes have stabilized.

**Exit gate**: shared filters no longer rely on raw JSON editing where richer UX is required, and query-backed datasets plus deferred score analytics materializations are no longer pending definition.

### (LAT-480) Phase 23 - Additional Simulation SDKs

**Depends on**: Phase 19

**Parallelization notes**: can run in parallel with phases 20 and 22 once Phase 19 lands.

- [ ] Add a lightweight Python simulation SDK/entrypoint.
- [ ] Add a lightweight Ruby simulation SDK/entrypoint.
- [ ] Add a lightweight PHP simulation SDK/entrypoint.
- [ ] Add a lightweight Go simulation SDK/entrypoint.

**Exit gate**: the simulation runtime is no longer limited to JavaScript/TypeScript.

### (LAT-481) Phase 24 - Advanced Issue Denoising

**Depends on**: Phase 11, Phase 14

**Parallelization notes**: can run in parallel with phases 18 through 23 once Phase 14 lands.

- [ ] Design the stronger buffered/provisional issue creation workflow on top of the existing issue model.
- [ ] Persist provisional issues and hide them from the main UI until promotion rules pass.
- [ ] Define and implement promotion rules based on evidence thresholds, annotation evidence, and explicit manual promotion.
- [ ] Ensure the stronger denoising/provisional workflow absorbs duplicate or noisy concurrent no-match issue candidates before they become visible in the main Issues UI.
- [ ] Validate that the stronger denoising workflow reduces duplicate/noisy issues without reintroducing the v1 merge system.

**Exit gate**: the system supports a stronger provisional workflow without changing the canonical issue entity or bringing back issue merging, and duplicate/noisy concurrent no-match issue candidates are absorbed before they become visible in the main issue surface.

### (LAT-486) Phase 25 - Provider/Model Settings And Hosted Execution Configuration

**Depends on**: Phase 15, Phase 18

**Parallelization notes**: can run in parallel with later post-MVP product work once phases 15 and 18 land.

- [ ] Before implementing provider/model settings, define the exact post-MVP storage model and shapes across organization/project/evaluation scopes, including whether `OrganizationSettings.providers` stays embedded in `organization.settings` JSONB or moves to a dedicated organization-scoped table.
- [ ] Implement organization-wide provider credential storage plus default provider/model management, with application-level encryption, write-only credential updates, redacted reads, and replace/rotation semantics for provider secrets.
- [ ] Implement project-wide provider/model overrides and evaluation-level provider/model overrides if the design phase keeps both scopes.
- [ ] Extend the hosted `llm()` bridge and the portable runtime so provider/model selection resolves from evaluation settings to project settings to organization settings once this phase lands, without changing the stored script artifact.
- [ ] Expose the matching `apps/web` and public/machine-facing APIs for provider/model settings management and evaluation execution-configuration updates.
- [ ] Add regression tests covering secret redaction/rotation, scope resolution, and evaluation execution with configured providers/models.

**Exit gate**: user-configurable provider/model execution is available end to end, and the `providers` storage shape is explicitly settled rather than left implicit.
