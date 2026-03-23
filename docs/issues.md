# Issues

Issues are the main observability entities of the reliability system.

They group similar failed, non-errored, non-draft scores into actionable failure patterns.

## Storage Split

- Postgres stores the issue row and lifecycle state.
- Weaviate stores the searchable text projection and centroid vector.
- Postgres also stores the canonical score rows and issue assignment state that discovery mutates.
- ClickHouse stores immutable score projection rows plus issue trend analytics.

## Background Tasks

Issue discovery and issue-refresh work use the repository queue stack in `@domain/queue`, `@platform/queue-bullmq`, and `apps/workers`.

The main contracts are:

- `issue-discovery` for one eligible finalized score that still needs issue assignment
- `issue-refresh` for one issue whose name/description debounce window has elapsed

Rules:

- eligible finalized scores enqueue `issue-discovery` after commit instead of running embedding/search inline in request or annotation-edit paths
- queue payloads carry ids only; workers re-fetch current score/issue state before acting
- debounced issue refresh relies on persisted due-work state plus `issue-refresh`, not on implicit BullMQ delayed/repeat jobs
- durable ownership and idempotency stay in Postgres via `scores.issue_id`, not in BullMQ job history
- issue-generated evaluation creation is also asynchronous: kickoff returns a `jobId`, and the frontend polls a status endpoint backed by a Redis job-status key for that alignment run

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
- annotation flows can also link to an existing issue or create a new issue inline; those explicit human choices bypass discovery for that score
- failed scores from evaluations that are not already linked to an issue may also create new issues
- failed custom scores may also create new issues

## Manual Creation From Annotations

Issue discovery is not the only entrypoint.

When annotating in managed UI, the annotator may:

- leave issue assignment automatic
- link the annotation to an existing issue
- create a new issue inline

For explicit link/create actions:

- skip similarity-based discovery for that annotation score
- write canonical ownership directly through `scores.issue_id`
- treat the issue as annotation-backed evidence immediately

## Discovery Pipeline

Issue discovery should follow the original proposal closely:

1. observe a non-draft failed, non-errored canonical score in Postgres
2. if the score comes from an issue-linked evaluation, assign directly and stop
3. validate eligibility for issue discovery
4. enrich annotation-originated feedback first when needed
5. embed canonical feedback with `voyage-4-large` at `2048` dimensions
6. run hybrid search in Weaviate using vector similarity plus BM25
7. use `RelativeScore` fusion
8. filter out candidates that do not pass the minimum similarity threshold across the hybrid search stage
9. rerank candidates with `rerank-2.5`
10. filter out candidates that do not pass the minimum rerank relevance threshold
11. match an existing issue or create a new issue
12. write `scores.issue_id` in Postgres
13. project the now-immutable score row into ClickHouse
14. refresh issue name/description asynchronously on debounce

Execution rules:

- `issue-discovery` runs after a finalized eligible score exists and still has no `issue_id`
- `issue-refresh` runs after the persisted debounce window elapses for an existing issue
- both workers must re-check current ownership/lifecycle state before doing expensive work

Concrete v1 mechanics worth carrying forward:

- eligibility was strict: non-draft, failed, non-errored, clusterable feedback/reason present, and not already owned by another active issue
- hybrid search used the same canonical feedback as both the keyword query and the embedding source
- the proven v1 defaults were `alpha = 0.75`, minimum similarity `0.8`, minimum BM25 matches `1`, initial candidate limit `1000`, rerank limit `20`, and minimum rerank relevance `0.3`
- even a single candidate still went through reranking so the threshold could reject it
- once an evaluation was linked to an issue, later failures from that evaluation bypassed discovery and assigned directly

Current v2 starting defaults layered on top of those v1 learnings:

- rerank limit: `100`
- issue details regeneration debounce: `8 hours`
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
- keep the core issue entity shape unchanged

## Naming

Issue names and descriptions are summaries, not the cluster identity itself.

The actual cluster identity is driven by:

- centroid state
- incoming evidence stream
- assignment history

Required Postgres indexes on the issue row:

- single-column unique constraint on `uuid` for Postgres/Weaviate linkage and hydration; Postgres backs it with a unique index
- btree on `(organization_id, project_id, ignored_at, resolved_at, created_at)` for project-scoped lifecycle filtering and management actions
- do not add Postgres text-search indexes on `name` or `description`; issue search lives in Weaviate
- do not add JSONB indexes on `centroid` in the issues foundation phase; centroid search is served by the Weaviate projection and centroid updates are driven by explicit ownership events

Names/descriptions are generated from evidence and refreshed on debounce.

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
- the issue table row and issue details modal/page expose `Generate evaluation`
- each trigger publishes a background generation/alignment job, returns a `jobId`, and then the frontend polls its Redis-backed status until the resulting evaluation is ready
- once created, automatic debounced realignment continues as new annotations arrive

Once an issue-linked evaluation exists:

- failed, non-errored monitor scores do not re-enter discovery
- they assign `scores.issue_id` directly
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

The project `Issues` page includes:

- `Active`, `Regressed`, and `Archived` tabs
- per-tab counts
- hybrid search without rerank
- date range selector
- bulk actions for resolve/unresolve/ignore/unignore
- a manual resolve confirmation modal whose keep-monitoring toggle defaults from `keepMonitoring`
- a per-row `Generate evaluation` action that starts a background job and shows polled in-flight status
- an issues table with `Name`, `Seen at`, `Occurrences`, and `Trend`

`Seen at` should combine recency and age, for example `11d ago / 3y old`.

Issue details include:

- full name and description
- `Generate evaluation` button
- pending generation/alignment status when the current issue has a polled background job in flight
- linked evaluations with derived alignment (MCC)
- last seen / first seen / occurrence counts
- 30-day trend chart
- trace/session drilldown table
