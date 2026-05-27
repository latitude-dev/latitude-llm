# Live Taxonomy

Live taxonomy clusters project sessions into behavior categories for product and observability exploration. It is project-scoped at every boundary and organization-scoped in storage, queueing, Redis locks, and cache keys.

## Data model

Postgres stores the durable taxonomy graph:

- `taxonomy_clusters`: leaf behavior clusters. Each row has `organization_id`, `project_id`, an optional `parent_category_id`, generated `name` and `description`, lifecycle `state`, `observation_count`, merge target, and a JSONB centroid. The repository derives and stores a nullable `centroid_embedding vector(2048)` from that centroid for exact pgvector search.
- `taxonomy_categories`: navigation groups rebuilt from active cluster centroids. Categories have generated names/descriptions, `cluster_count`, `observation_count`, lifecycle `state`, and a normalized `centroid_embedding` used for continuation matching between rebuilds.
- `taxonomy_cluster_lineage`: leaf-level birth, merge, and death transitions emitted by gardening runs. Category evolution is derived and not represented as lineage in the MVP.
- `taxonomy_runs`: one row per project gardening run, with trigger, status, started/completed timestamps, counters, and error text.

ClickHouse stores `behavior_observations`, one row per observed session summary/embedding assignment. Rows are rewritten through `ReplacingMergeTree` semantics when gardening reassigns noise or merged-cluster observations. Observation rows carry the session id, time range, trace ids, summary/hash, embedding/model, assigned cluster id, confidence, assignment method, reassignment run id, retention days, and indexed timestamp.

Centroid math is shared with issues through `@domain/shared/centroid`: centroids are decayed weighted running sums, persisted as JSONB, and normalized only for query/storage of the derived pgvector embedding.

## Online observation pipeline

Trace completion is the runtime trigger. After `trace-end:run` finishes trace-search refresh work, it publishes `taxonomy:observeSession` with a per-session org-prefixed debounce key:

```text
org:${organizationId}:taxonomy:observeSession:${projectId}:${sessionId}
```

The taxonomy worker loads the session and trace details, builds a normalized conversation document, skips very short sessions as cheap noise, embeds the behavior text with Voyage (`voyage-4-large`, 2048 dimensions), retrieves nearest active clusters, and applies the two-gate decision:

- absolute top cosine must be at least `TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD`
- softmax probability margin between top-1 and top-2 must be at least `TAXONOMY_ASSIGN_RELATIVE_MARGIN`

Assigned observations update the target cluster through the Redis-backed per-cluster lock and are written to ClickHouse with `assignment_method = "centroid_online"`. Unassigned observations are written as noise. The worker logs observe-session outcome, duration, and confidence; assignment decision spans annotate top-1/top-2 cosine and spread.

## Gardening pipeline

Gardening is a BullMQ per-project task, not a Temporal workflow. A repeatable `taxonomy:gardenSweep` job enumerates non-deleted projects with enough recent observations and publishes throttled `taxonomy:gardenProject` jobs by org-prefixed project key. Manual admin triggering uses the same `gardenProject` queue path.

A `gardenProject` run acquires the per-project Redis garden lock, inserts a running `taxonomy_runs` row, runs activities A through G, then saves completed or failed status. The run is capped by `TAXONOMY_GARDENING_MAX_RUNTIME_MS`; failures replay from scratch on a later task.

Activities:

1. **Noise sweep / births**: pull recent noise, compute the proportional `minMembers`, run pure TypeScript single-linkage candidates with diameter filtering, absorb candidates near existing clusters, otherwise create new active clusters and rewrite member observations as `gardening_birth`.
2. **Merge pass**: find connected components of near-duplicate active clusters, choose the survivor by observation count then id, fold all loser observations into the survivor centroid, mark losers merged, and emit merge lineage. Observation pagination for this internal path uses a full cluster scan so same-timestamp rows are not skipped.
3. **Death pass**: deprecate active clusters that have no new observations for `TAXONOMY_DEAD_CLUSTER_INACTIVITY_DAYS` and whose decayed centroid mass is below `TAXONOMY_DEAD_CLUSTER_MASS_FLOOR`. Observations remain attached.
4. **Noise reassignment**: re-evaluate recent noise against the current active cluster set and rewrite assigned rows as `gardening_reassign`, using the same Redis-locked centroid update path as online assignment.
5. **Hierarchy rebuild**: cluster active leaf centroids with pure TypeScript average-linkage agglomerative clustering. K is `clamp(round(sqrt(activeClusters.length)), 3, TAXONOMY_HIERARCHY_MAX_CATEGORIES)`. Candidate category centroids match prior active categories by cosine continuation threshold; unmatched candidates create `Pending` categories; orphan prior categories are deprecated; member clusters get `parent_category_id` in one batch.
6. **Naming**: clusters and categories named `Pending`, newly born clusters, or refreshed clusters are named with a map/reduce `AI.generate` flow. Clusters sample member observations with farthest-point sampling over embeddings; categories summarize member cluster names/descriptions rather than raw observations.
7. **Lineage emission**: birth, merge, and death lineage rows are appended in Postgres.

The worker emits structured gardening counters, cluster counts, and a `taxonomy.zero_births_streak` warning when a project is past the cold-start gate and the latest three completed runs all scanned noise but produced zero births.

## Read paths

`@domain/taxonomy` exposes project-scoped read use-cases for the web/API composition layer:

- `listCategoriesUseCase`: active non-empty categories by default, with optional state and `includeEmpty`.
- `listClustersInCategoryUseCase`: active leaf clusters in a category, sorted by observation count by default, with cursor/page-size and sort options.
- `listClustersUseCase`: flat cluster list with state/category filters, cursor/page-size, sort options, and optional hybrid search. Search embeds the query with Voyage `inputType: "query"`, uses Postgres vector + tsvector scoring over `taxonomy_clusters`, applies weak-match thresholds, and pages after repository-level state/category filtering.
- `getClusterDetailsUseCase`: project-scoped cluster row plus a small recent ClickHouse observation sample.
- `getCategoryDetailsUseCase`: project-scoped category row plus active member clusters.
- `listObservationsInClusterUseCase`: ClickHouse observations ordered by `(start_time DESC, session_id ASC)` and paged by a compound cursor so same-timestamp observations are not skipped.
- `getTaxonomyAnalyticsUseCase`: active category/cluster counts, total observations in the window, top clusters by windowed ClickHouse occurrence count, and ClickHouse-side current-vs-baseline trend summaries for those top clusters.
- `getLastRunUseCase`: latest taxonomy run plus the last 10 birth/merge lineage transitions for the activity panel.

## Operational controls

`scripts/taxonomy/rerun-project.ts` is the ops/corpus-tuning script for re-enqueuing every ClickHouse session in a project through `taxonomy:observeSession`. It supports `--organization-id`, `--project-id`, `--dry-run`, and `--limit`, paginates through `SessionRepository.listByProjectId`, publishes debounced observe-session jobs, and closes queue/ClickHouse clients.

Configuration lives in `packages/domain/taxonomy/src/constants.ts`. The constants are grouped by responsibility:

- **Embedding and summaries**: `TAXONOMY_EMBEDDING_MODEL`, `TAXONOMY_EMBEDDING_DIMENSIONS`, `TAXONOMY_SUMMARY_MODEL`, `TAXONOMY_SUMMARY_STRATEGY`, and `TAXONOMY_SUMMARY_MIN_SESSION_TOKENS` define the text-to-vector path. The MVP default is `embed_direct`; the LLM summary branch is an operator-controlled quality knob.
- **Session document limits**: `TAXONOMY_SESSION_DOCUMENT_MAX_LENGTH` and `TAXONOMY_SESSION_MIN_LENGTH` bound the conversation text that is summarized/embedded and cheaply skip too-short sessions.
- **Online assignment**: `TAXONOMY_OBSERVATION_DEBOUNCE_MS`, `TAXONOMY_ASSIGN_TOPK`, `TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD`, `TAXONOMY_ASSIGN_RELATIVE_MARGIN`, and `TAXONOMY_ASSIGN_TEMPERATURE` govern observe-session coalescing and the two-gate cluster assignment decision.
- **Gardening cadence and eligibility**: `TAXONOMY_GARDENING_CRON_KEY`, `TAXONOMY_GARDENING_CRON_PATTERN`, `TAXONOMY_GARDENING_THROTTLE_MS`, `TAXONOMY_GARDENING_MIN_OBSERVATIONS`, `TAXONOMY_GARDENING_MAX_RUNTIME_MS`, `TAXONOMY_GARDENING_STALE_GRACE_MS`, and `TAXONOMY_GARDENING_SWEEP_BATCH` define scheduled/offline run behavior.
- **Birth, merge, and death thresholds**: `TAXONOMY_NOISE_LOOKBACK_DAYS`, `TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS`, the proportional min-member floor/ratio/ceiling constants, `TAXONOMY_BIRTH_LINK_THRESHOLD`, `TAXONOMY_BIRTH_MAX_DIAMETER`, `TAXONOMY_ABSORPTION_THRESHOLD`, `TAXONOMY_MERGE_THRESHOLD`, `TAXONOMY_DEAD_CLUSTER_MASS_FLOOR`, and `TAXONOMY_DEAD_CLUSTER_INACTIVITY_DAYS` define the leaf lifecycle.
- **Hierarchy and naming**: `TAXONOMY_HIERARCHY_MAX_CATEGORIES`, `TAXONOMY_CATEGORY_CONTINUATION_THRESHOLD`, `TAXONOMY_NAMING_MODEL`, `TAXONOMY_NAMING_REFRESH_OBSERVATIONS`, and the FPS sample budget constants govern category rebuilds and generated labels.
- **Read search and storage**: `TAXONOMY_SEARCH_MIN_SCORE`, `TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY`, and `TAXONOMY_OBSERVATION_RETENTION_DAYS` define hybrid-search weak-match suppression and ClickHouse retention.
- **Locks**: `TAXONOMY_CLUSTER_LOCK_TTL_SECONDS` and `TAXONOMY_GARDEN_LOCK_TTL_SECONDS` bound Redis lock lifetimes.

The seeded Acme corpus is the smoke-test and threshold tuning corpus. The most sensitive levers are `TAXONOMY_BIRTH_LINK_THRESHOLD` and `TAXONOMY_BIRTH_MAX_DIAMETER`, because they control single-linkage chaining and cluster sterility. A production-embedding pass over the full 1,574-session seeded Acme project used `pnpm --filter @tools/live-seeds taxonomy:tune-seeded-acme -- --limit 1600 --rebase-observations-to-now` plus an offline threshold grid over the stored Voyage embeddings. The pass raised `TAXONOMY_BIRTH_LINK_THRESHOLD` from `0.78` to `0.82` and kept `TAXONOMY_BIRTH_MAX_DIAMETER = 0.45`: looser thresholds produced only broad components, while `0.82/0.45` yielded six hand-recognizable behavior births (mobile/no-service support, order/account/storefront support, flight changes, address updates, airline disruption, and friend-booking flows) with a small residual noise floor. If TypeScript single-linkage cannot find a useful pair of birth threshold/diameter values on that corpus in future tuning, the Python UMAP/HDBSCAN sidecar becomes the next design step.

## Decisions and tradeoffs

- **Cluster sessions, not traces**: user behavior patterns are session-level intents. Trace-level clustering would over-count multi-turn conversations and fragment one user task into multiple clusters.
- **Default to `embed_direct`**: the MVP embeds normalized conversation text directly. The LLM summary path exists, but it is opt-in because it adds per-session LLM cost and latency while the first durable requirement is stable clustering signal.
- **Use exact pgvector search in Postgres**: cluster and issue counts are expected to stay low enough per project that exact project-scoped scans are simpler and more reliable than an external vector store or approximate index.
- **Use TypeScript clustering at MVP scale**: single-linkage births and average-linkage category rebuilds are transparent, testable, and fast at expected noise/cluster counts. They intentionally expose failure modes before adding a sidecar.
- **Run gardening as BullMQ work, not Temporal**: gardening is replayable from current Postgres/ClickHouse state and has no valuable in-flight history. A single capped BullMQ task with a per-project Redis lock is sufficient.
- **Promote to Python UMAP/HDBSCAN only on evidence**: the sidecar is justified when real tuning shows TypeScript single-linkage cannot separate behavior modes, or when whale-scale O(n²) noise scans become the operational bottleneck.
