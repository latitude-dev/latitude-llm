# Issues

Issues are the main observability entities of the reliability system.

They group similar failed, non-errored, non-draft scores into actionable failure patterns.

## Domain errors (`@domain/issues` reference pattern)

Repository-wide rules and a per-package `errors.ts` inventory are in [`docs/domain-errors.md`](./domain-errors.md).

The `packages/domain/issues` package is the **reference implementation** for how domain-specific errors should be organized in this repository. When adding a new `packages/domain/*` package or growing error surfaces in an existing one, mirror this layout before inventing a different structure.

**Where to look**

- `packages/domain/issues/src/errors.ts` — all package-level `Data.TaggedError` classes for this domain
- Use-cases import those classes from `../errors.ts` and fail with `yield* new SomeSpecificError({ ... })` inside `Effect.gen`

**Conventions**

- **One file per package** at `src/errors.ts` for errors that are shared across multiple use-cases in that package. Errors that truly belong to a single use-case can stay in that use-case file until a second consumer appears (see `AGENTS.md` domain conventions).
- **Specific class names** for business rules (`ScoreNotFoundForDiscoveryError`, `DraftScoreNotEligibleForDiscoveryError`), not generic `NotFoundError` / `BadRequestError` from `@domain/shared` when the failure is part of the domain vocabulary.
- **HTTP metadata on every class**: each error implements `HttpError` with `httpStatus` and `httpMessage` (static `readonly` fields or a getter when the message depends on fields). See `.agents/skills/effect-and-errors/SKILL.md`.
- **Union types per flow**: export a union (for example `CheckEligibilityError`) that lists exactly the errors a use-case or small group of use-cases can return, so callers and tests stay typed end-to-end.
- **Shared infrastructure errors** stay in `@domain/shared` (`RepositoryError`, `ValidationError`, generic `NotFoundError`, etc.); **domain semantics** live in the domain package’s `errors.ts`.

## Storage Split

- Postgres stores the issue row and lifecycle state.
- Weaviate stores the searchable text projection and centroid vector.
- Postgres also stores the canonical score rows and issue assignment state that discovery mutates.
- ClickHouse stores immutable score analytics rows plus issue trend analytics.

## Background Tasks

Issue discovery uses the existing Temporal-backed workflow abstraction in `apps/workflows`, while queue tasks in `@domain/queue`, `@platform/queue-bullmq`, and `apps/workers` continue to dispatch the upstream single-step triggers, including the throttled `issues:refresh` task.

The main contracts are:

- `issue-discovery` as a multi-activity workflow for one eligible non-draft failed non-errored score that still needs similarity retrieval after the centralized `issues:discovery` gate runs
- `issues:discovery` as a deduped single-step task that rechecks canonical score eligibility and chooses between selected/linked issue assignment or the fallback Temporal workflow
- `issues:refresh` as a throttled single-step task for one issue whose name/description throttle window has elapsed

Rules:

- canonical score writes emit `ScoreCreated` through the transactional outbox after commit, and the `domain-events` dispatcher publishes `issues:discovery` from that score event; the payload may carry a selected `issueId` for a published annotation
- workflow inputs carry ids only; activities re-fetch current score/issue state before acting
- throttled issue refresh relies on the `issues:refresh` queue task with logical `dedupeKey` + `throttleMs`, not on implicit BullMQ delayed/repeat jobs or persisted due-work scans — first publish schedules fire; subsequent publishes within the window are dropped
- `ScoreAssignedToIssue` is the trigger for later existing-issue detail regeneration; the dispatcher publishes `issues:refresh` keyed by the canonical issue id with the configured eight-hour throttle window (at most one refresh per issue per 8h, fires at most 8h after the first assignment)
- durable ownership and idempotency stay in Postgres via `scores.issue_id`, not in BullMQ or workflow history
- issue-generated evaluation creation is also asynchronous: kickoff starts a deterministic-id Temporal workflow and returns nothing to the caller; the frontend polls `getIssueAlignmentState`, which asks Temporal directly (`workflow.describe()` for the initial run, a query handler for in-flight manual-realignment) — there is no Redis-backed job-status key

## Lifecycle

Issues can be:

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

An issue can be in multiple states at the same time, for example `new` and `escalating`.

Conceptually:

- `Active` means not ignored and not resolved
- `Archived` means ignored or resolved without regression

Lifecycle side effects:

- ignoring an issue archives its linked evaluations immediately
- manual resolve opens a confirmation modal with a keep-monitoring toggle
- that toggle defaults from `keepMonitoring`, after project settings fall back to organization settings when project-level `keepMonitoring` is unset, and can be overridden for the specific resolve action
- the confirmed toggle state decides whether linked evaluations stay active or archive

Important state timestamps:

- `clusteredAt`: last centroid/cluster refresh
- `escalatedAt`: latest escalation transition timestamp
- `resolvedAt`: manual or automatic resolution timestamp
- `ignoredAt`: manual ignore timestamp

Issue creation eligibility:

- annotations are the primary signal
- annotation flows can also link to an existing issue explicitly; that human choice is carried as selected issue intent once the draft is published and then resolved by the centralized `issues:discovery` task
- failed scores from evaluations that are not already linked to an issue may also create new issues
- failed custom scores may also create new issues

## Manual Linking From Annotations

Issue discovery is not the only entrypoint.

When annotating in managed UI, the annotator may:

- leave issue assignment automatic
- link the annotation to an existing issue

Inline manual issue creation from the annotation flow is intentionally deferred for now to keep the managed annotation UX and ownership rules simpler.

For explicit link actions:

- while the annotation is still drafted, keep the selected issue only as editable draft intent
- skip similarity-based candidate selection for that annotation score once the draft is published
- publication clears `draftedAt`, emits `ScoreCreated` with the selected `issueId`, and the centralized `issues:discovery` task performs the canonical ownership claim, centroid mutation, refresh event write when needed, and projection/analytics sync
- treat the issue as annotation-backed evidence immediately after publication

## Discovery Pipeline

Issue discovery should follow the original proposal closely:

1. observe a non-draft failed, non-errored canonical score in Postgres
2. emit `ScoreCreated` after the canonical Postgres write commits; that payload may carry a selected `issueId` for published annotations
3. let the deduped `issues:discovery` task recheck canonical eligibility and decide whether a selected issue or issue-linked evaluation should be assigned directly before any similarity search runs
4. enrich annotation-originated feedback first when needed
5. embed canonical feedback with `voyage-4-large` at `2048` dimensions
6. run hybrid search in Weaviate using vector similarity plus BM25
7. use `RelativeScore` fusion
8. filter out candidates that do not pass the minimum similarity threshold across the hybrid search stage
9. rerank candidates with `rerank-2.5`
10. filter out candidates that do not pass the minimum rerank relevance threshold
11. verify the final selected candidate still exists in Postgres for the same organization/project; if missing, treat it as stale projection data and continue as no-match
12. when the final path is a brand-new issue, generate the first issue name/description synchronously from the initial issue occurrence inside the dedicated create-from-score workflow activity before starting the create transaction
13. match an existing issue or create a new issue when the centralized gate did not already route to a known issue
14. if the final selected candidate is stale, delete its projection object asynchronously
15. write `scores.issue_id` in Postgres
16. if the score was added to an existing issue, write `ScoreAssignedToIssue` transactionally so later issue-details regeneration can debounce safely
17. after the create or assign transaction commits, run `syncIssueProjectionsUseCase` directly so the Weaviate issue projection reflects the latest centroid and details
18. after the same transaction commits, run `syncScoreAnalyticsUseCase` directly so the immutable score reaches ClickHouse without waiting for another async hop
19. refresh issue name/description asynchronously on debounce only for the existing-issue path that requested `ScoreAssignedToIssue`, reusing the shared issue-details generation use case against the last `25` assigned occurrences plus the previous persisted details as the stabilization baseline

Execution rules:

- `issues:discovery` runs first after an eligible non-draft failed non-errored score write commits
- scores already written with `issue_id`, including direct-owned live issue-linked monitor failures, short-circuit before retrieval/rerank; retries through `issues:discovery` may still replay projection and analytics sync idempotently
- `issue-discovery` runs only when that centralized gate still needs retrieval/rerank work
- `issues:refresh` runs after the configured throttle window elapses for an existing issue
- both the workflow and the debounced task must re-check current ownership/lifecycle state before doing expensive work
- in workflow orchestration, keep retrieval split into granular activities: feedback embedding (with normalization), hybrid Weaviate search, then reranking
- the brand-new issue path must generate its first name/description before the issue row is first persisted, and that synchronous generation step must reuse the same shared issue-details generation use case that later debounced refreshes call
- the debounced `issues:refresh` path must re-lock and re-read the canonical issue row before saving generated details so it cannot overwrite a newer centroid or lifecycle update
- after `issues:refresh` persists changed details, it must upsert the Weaviate issue projection again; if the issue disappeared or the generated details were unchanged, it should skip the projection write
- after rerank selects a candidate, resolve that matched issue against canonical Postgres state before choosing between the create-from-score and assign-to-issue paths
- both the create-from-score step and the assign-to-issue step must use a conditional `scores.issue_id` claim so only one concurrent owner wins while the canonical issue row and centroid stay transactionally consistent
- the assign-to-issue path must lock the canonical issue row before recomputing and saving the centroid so parallel score assignments into the same issue do not lose centroid contributions
- resolved and ignored issues are still valid discovery match candidates; this preserves regression detection and keeps future matching scores linked to intentionally ignored issues

Concrete v1 mechanics worth carrying forward:

- eligibility was strict: non-draft, failed, non-errored, clusterable feedback/reason present, and not already owned by another active issue
- hybrid search used the same canonical feedback as both the keyword query and the embedding source
- the proven v1 defaults were `alpha = 0.75`, minimum similarity `0.8`, minimum BM25 matches `1`, initial candidate limit `1000`, rerank limit `20`, and minimum rerank relevance `0.3`
- even a single candidate still went through reranking so the threshold could reject it
- once an evaluation is linked to an issue, live monitor failures may already be written with `scores.issue_id` claimed at creation time; unowned evaluation-originated failures that still reach `issues:discovery` should have the centralized gate resolve the linked issue directly before similarity search starts

Current v2 starting defaults layered on top of those v1 learnings:

- rerank limit: `100`
- issue details regeneration throttle: `8 hours` (at most once per issue, fires at most 8h after the first assignment)
- keep the low-evidence visibility threshold configurable instead of hard-coding it into the issue model

Important v2 correction:

- v1 could still race the same failing result into multiple active issues under concurrency; v2 must keep canonical single ownership in `scores.issue_id`

Legacy v1 reference paths for discovery/search:

- `packages/core/src/weaviate/index.ts`
- `packages/core/src/voyage/index.ts`
- `packages/core/src/services/issues/results/validate.ts`
- `packages/core/src/services/issues/discover.ts`

Before using those paths, checkout branch `latitude-v1` in the old repository and read them from its root.

## Centroids

```typescript
type ScoreSource = "evaluation" | "annotation" | "custom";

type IssueCentroid = {
  base: number[]; // running vector sum of normalized, weighted, decayed member embeddings
  mass: number; // running scalar mass of the centroid
  model: string; // embedding model used to compute the centroid
  decay: number; // half-life in seconds
  weights: Record<ScoreSource, number>; // source weights used in centroid updates
};
```

Centroids are running weighted sums with decay. They are not full historical re-averages.

The preserved math shape from v1 is:

- decay the previous centroid state before every update
- normalize each incoming embedding before contributing it
- add or subtract a weighted, time-decayed contribution from `base`
- track the scalar accumulator in `mass`
- normalize `base` only when emitting the vector for Weaviate/search

Important v2 corrections:

- use `clusteredAt`, not a generic row `updatedAt`, as the decay anchor
- pin `model`, `decay`, and `weights` on the centroid config and rebuild if they change
- remember that v1 weights were keyed by evaluation type, while v2 intentionally remaps them onto score sources
- fail fast on embedding-dimension mismatches
- if removal underflows, zero or rebuild the centroid instead of leaving an invalid negative state
- centroid updates must not depend on Weaviate availability

Legacy v1 reference path for centroid math:

- `packages/core/src/services/issues/shared.ts`

Before using that path, checkout branch `latitude-v1` in the old repository and read it from the repository root.

Recommended initial weights:

- annotations: `1.0`
- evaluations: `0.8`
- custom: `0.8`

Recommended initial half-life:

- `14 days`

These thresholds, weights, half-lives, and other tunables should be defined as named constants inside `packages/domain/issues` rather than as scattered inline literals.

## Denoising

The base v2 denoising strategy should remain conservative and aligned with the proposal:

- low-evidence issues with no linked annotations can be hidden from the main UI
- issues with at least one linked annotation are always visible
- manually created issues and manually linked annotation issues are always visible
- do not bring back the v1 merge/merged-state system

The exact low-evidence visibility threshold should remain configurable.

The system may also support a stronger buffered/provisional workflow on top of the same issue entity. The exact promotion rules are still pending precise definition, but the intended shape is:

- persist newly created issue candidates immediately
- keep provisional issues hidden until they pass promotion rules
- promote them when enough evidence accumulates, when annotation evidence lands, or when a user explicitly promotes them
- let the stronger provisional workflow absorb duplicate or noisy concurrent no-match issue candidates before they become visible in the main Issues UI
- keep the core issue entity shape unchanged

## Naming

Issue names and descriptions are summaries, not the cluster identity itself.

The actual cluster identity is driven by:

- centroid state
- incoming occurrence stream
- assignment history

Required Postgres indexes on the issue row:

- single-column unique constraint on `uuid` for Postgres/Weaviate linkage and hydration; Postgres backs it with a unique index
- btree on `(organization_id, project_id, ignored_at, resolved_at, created_at)` for project-scoped lifecycle filtering and management actions
- do not add Postgres text-search indexes on `name` or `description`; issue search lives in Weaviate
- do not add JSONB indexes on `centroid` in the issues foundation phase; centroid search is served by the Weaviate projection and centroid updates are driven by explicit ownership events

Names/descriptions are generated from occurrences and refreshed on debounce.

They may use:

- clustered score feedback
- related evaluation names/descriptions when available
- related annotation or message context when that helps explain the pattern

But they must stay generic enough to represent the shared failure mode rather than the exact background details of one conversation.

This matters because discovery combines semantic similarity and BM25:

- issue text should help scores with different wording or different surrounding details still converge on the same problem
- titles/descriptions should capture the underlying failure pattern, not memorize incidental facts from one example

## Direct Monitoring

Issue-linked evaluation creation is explicit:

- issue discovery and issue creation do not automatically create evaluations
- issues may have several linked evaluations
- the managed UI exposes `Monitor issue` only from the issue details drawer, and only when the issue currently has no linked evaluations
- each trigger starts the `optimize-evaluation` Temporal workflow with a deterministic `evaluations:generate:${issueId}` workflow id for initial generation (or `evaluations:optimize:${evaluationId}` for manual realignment); the server function returns `void`, and the frontend polls `getIssueAlignmentState`, which queries Temporal via `workflow.describe()` until the workflow terminates and the resulting evaluation appears via normal data-fetching
- once created, automatic throttled realignment continues as new annotations arrive: each new annotation writes `ScoreAssignedToIssue`, which the `domain-events` dispatcher routes to `issues:refresh` (throttled at 8h), which in turn publishes `evaluations:automaticRefreshAlignment` (throttled at 1h, one per active linked evaluation) to kick off `refresh-evaluation-alignment`; that workflow escalates into `optimize-evaluation` via `evaluations:automaticOptimization` (throttled at 8h) when the incremental MCC drop exceeds tolerance. All windows are first-publish-wins so a continuous annotation stream cannot push the fire time forward indefinitely

Once an issue-linked evaluation exists:

- failed, non-errored monitor scores that already carried `scores.issue_id` at write time do not re-enter discovery
- failed, non-errored monitor scores that stayed unowned still flow through the centralized `issues:discovery` task, which resolves the linked issue before similarity search starts and then claims `scores.issue_id`
- errored monitor scores stay out of discovery entirely because `errored = true` makes them ineligible
- they can move a resolved issue into `regressed`

## Weaviate Projection

The `Issues` collection stores:

- `title`
- `description`
- self-provided centroid vector generated from clustered score feedback embeddings

Requirements:

- tenant scope `${organizationId}:${projectId}`
- cosine distance
- trigram tokenization for title
- word tokenization for description
- BM25 tuned for short texts
- self-provided vectors with auto-vectorization disabled
- tenant existence must be ensured before read/search paths
- empty issues should not get a searchable vector projection before real evidence lands

Exact v1 configuration that informs this design:

- BM25 used `b = 0.35` and `k1 = 1.1`
- the vector index used a self-provided dynamic index with cosine distance and threshold `10_000`
- v1 tenant scope was document-scoped; v2 is intentionally changing that to project scope
- v1 used Weaviate mainly for discovery and merge lookup, while user-facing issue search still used Postgres title search; v2 intentionally upgrades the product search surface to hybrid search in Weaviate

Exact legacy v1 reference collection configuration code to preserve, but adapt for v2:

In v2, enum-like names such as score sources or collection names should be modeled with literal-string unions or `as const` objects, not TypeScript enums. The `Collection.Issues` symbol below is preserved only because this block is kept as historical v1 reference code.

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

This code is preserved verbatim as a v1 reference. Do not copy it blindly into v2 without also applying the intentional v2 changes documented here, especially the project-scoped tenant name and UUID-backed Postgres/Weaviate linkage.

Weaviate object ids are UUID-based, so the issue row should store a dedicated `uuid` used as the object id for the Weaviate projection and to link the Postgres issue row with the issue object living in Weaviate.

## Product Surface

The project `Issues` page mirrors the project `Traces` page shell:

- a top action row
- a shared aggregate-counts-plus-histogram analytics panel
- an infinitely paginated issues table
- a right-side issue details drawer opened from row click

Action-row behavior:

- left side: time range selector and columns selector
- right side: `Active` / `Archived` tabs plus hybrid search without rerank
- the time range filters score `created_at` in ClickHouse, not issue-row timestamps in Postgres
- the lifecycle tabs affect the issues table only, not the analytics panel
- the page does not expose the generic Traces filter builder or filter drawer
- issue search relies on the shared AI-layer Redis cache for embeddings; the issues domain does not add an extra embedding cache on top
- the managed Issues surface is web-only for now; there is no public `apps/api` issues contract yet

Read orchestration:

- ClickHouse owns score-backed time-range filtering, occurrence analytics, and issue trend metrics
- Weaviate owns hybrid search and similarity scores
- Postgres owns canonical issue rows, lifecycle grouping, and linked evaluation hydration
- issue-page reads query ClickHouse first, run Weaviate only when search text is present, and then hydrate canonical Postgres issues through `IN (...)` issue-id / issue-uuid clauses

Analytics panel behavior:

- aggregate counts show `new`, `escalating`, `regressed`, `resolved`, and total seen occurrences
- the histogram shows matched issue occurrences by day
- when no full range is selected, the histogram falls back to a 7-day window ending today or ending at the single selected endpoint

Issues table behavior:

- no bulk-selection UI is shown in this revision, even though backend bulk lifecycle actions may still exist for API parity
- default sorting is last seen descending, then occurrences descending, with search similarity preserved as an additional tie-breaker when search text is present
- visible columns are `Issue`, `Trend`, `Seen at`, `Occurrences`, `Affected traces`, and `Evaluations`
- `Issue` shows the issue name plus lifecycle tags, with truncation
- `Seen at` combines recency and age, for example `11d ago / 3y old`
- `Occurrences` uses the selected time range and its column header also shows the sum across all matched issues
- `Affected traces` is the occurrences count divided by the total number of traces in the selected time window, capped at `100%`
- `Evaluations` shows linked evaluation tags with truncated names plus alignment MCC percentage, or `-` when none are linked

Issue details drawer behavior:

- page-level time range, lifecycle-tab, and search controls do not apply inside the drawer; drawer reads use full history
- the header uses the same close and previous/next navigation pattern as the `Traces` details drawer
- the header actions are ignore/unignore and resolve/unresolve
- the body includes issue name/description, a summary row, a collapsible 14-day trend histogram ending today, a collapsible linked-evaluations section, and a collapsible infinitely paginated mini traces table
- linked evaluations show name, last alignment date, MCC, manual realign, and per-evaluation archive actions
- while a realignment is in flight, the UI shows `Aligning...`
- when an issue has no linked evaluations, the drawer shows `Monitor issue`; once at least one linked evaluation exists, the managed UI no longer shows another monitor-generation button
