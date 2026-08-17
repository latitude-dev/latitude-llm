# Taxonomy — behavior cluster trees

Taxonomy organizes live-retained session-level observations produced by [conversation intelligence](./conversation-intelligence.md) into **cluster trees** per project. The default tree is the **Topics** behavior — sessions clustered by their transcript embedding — and it is what most of this doc describes. The product now also supports other **behaviors** (facets / "lenses") and **views** (filtered slices), which reuse this exact machinery on a different scope and a different embedding; see [Behaviors, views, and facets](#behaviors-views-and-facets-lenses). "Topic" is the default lens (`facet_id = NULL`), not a special dimension.

There is no separate category model: every tree level is the same kind of node, and **depth is clustering density** — the tree is broad at the root and progressively narrower at the leaves. The divisive build always produces exactly one depth-0 root that englobes the whole project, so the **product UI hides that root and treats its depth-1 children as the top-level "categories"** (see "Read paths").

The tree is produced two ways that must be read separately:

- **Online assignment** routes each new observation to its best-fitting node as sessions are analyzed (the live path).
- **Gardening** periodically rebuilds the whole tree from scratch with a single top-down divisive clustering pass (the batch path).

Domain code: `packages/domain/taxonomy`. Postgres adapters: `packages/platform/db-postgres/src/repositories/taxonomy-*.ts`. ClickHouse adapter: `packages/platform/db-clickhouse/src/repositories/taxonomy-observation-repository.ts`. Orchestration: `apps/workflows/src/workflows/taxonomy-gardening-workflow.ts` + `apps/workflows/src/activities/taxonomy-gardening-activities.ts`. Temporal is the **only** gardening orchestrator — a missing workflow starter is a logged misconfiguration, not a fallback.

> **New to the ML terms here** (embeddings, cosine similarity, spherical k-means, Calinski–Harabasz, relative separation, ARI, purity)? See the [taxonomy glossary](./taxonomy-glossary.md) for plain-language definitions.

## Naming: behaviors, moments, and the *other* "signals"

Three concepts here were renamed at the UI layer only (`#3704`), so a code identifier rarely matches the label a user sees. This is the biggest source of confusion in the area; keep it straight:

- **Topics → "Behaviors".** The cluster tree in this doc is the product's **Behaviors** page. The code dimension is still the singleton `topic` (`assigned_cluster_id`, the sessions `topics` filter). Same thing, two names.
- **Moment labels → "Moments"** (was **"Detected signals"**). Per-session behavioral labels — `escalation`, `user_frustration`, `resolution`, … — live in [conversation intelligence](./conversation-intelligence.md) (`session_moment_labels`), **not here**. They are a read/annotation layer: they feed the behaviour-drawer rollups and the sessions `moments` filter, but they are **never clustered into the taxonomy**. In web/domain code they are still named `signals` (`detectedSignals`, `BehaviourSignalRecord`, the `"signals"` column key), sourced from moment-kind distributions. When someone says "moments *son* signals," this is what they mean.
- **The Signals product** (`@domain/signals`, was **"Issues"**) is a **separate** system that clusters failed *scores* into failure patterns and escalates them to incidents (see [signals](./signals.md)). It has **no data relationship** to the taxonomy or to moments — no shared id, no FK, no pipeline hop. The only overlap is the generic decayed-centroid helper in `@domain/shared` (this doc's "shared math with issues" above), used independently at different half-lives.

Net: a bare "signal" in this codebase is ambiguous — in behaviours/taxonomy code it means a **moment label**; in `@domain/signals` it means a **failure pattern** (the former "issues"). Not the same thing, and nothing wires them together.

The product vocabulary shifted again with facets (see "Behaviors, views, and facets" below), and the code lags it:

- A **behavior** is a *grouping question*: **Topics** (the default, this doc's tree) plus **facet** behaviors ("user goal", "outcome", …). A facet is the lens; in code, `facet_*` / `taxonomy_facets`.
- A **view** is a saved *filtered slice* of a behavior — a `FilterSet` (the scope) paired with a lens. Its code identifiers keep the original prefix `custom_behavior_*` (the earlier name, "Custom behaviors" / "Cohorts"), so a `custom_behaviors` row is a **view**, and its optional `facet_id` is the lens.

Net: "behaviour" in code (`listProjectBehavioursUseCase`, `BehaviourSignalRecord`) still means a taxonomy *cluster*; the product "behavior" is the whole grouping; `custom_behavior_*` is a *view*. Keep it straight.

## Tree model

`taxonomy_clusters` (Postgres, `packages/platform/db-postgres/src/schema/taxonomy-clusters.ts`) rows carry the tree shape. The `TaxonomyCluster` entity (`packages/domain/taxonomy/src/entities/cluster.ts`) mirrors them:

- `parent_cluster_id` — null for roots.
- `depth` — 0 for roots, bounded by the length of `TAXONOMY_TREE_DEPTH_SCHEDULE` (current schedule: roots, sub-topics, fine leaves).
- `path` — slash-terminated ancestor id chain (`"rootId/parentId/"`, empty for roots). Subtree membership is a path prefix match (`listSubtreeIds`), safe because cuids contain no LIKE metacharacters and segments are slash-delimited.
- `split_link_threshold` — the cosine density boundary at which this node's children are still distinguishable from each other (the minimum pairwise cosine between its children's centroids). Null for leaves. The **online router reads it as a per-level descent gate** so the coarse root threshold can't force descent into a tight subtree on marginal similarity.
- `centroid` — JSONB decayed weighted sum (shared math with issues via `@domain/shared` centroid helpers), plus a derived `centroid_embedding vector(2048)` for pgvector nearest-neighbour. An interior node keeps a full-topic centroid representing the parent topic for the first hop of descent.
- `observation_count` — a **cached counter of direct assignments only**; ClickHouse rows are the truth (see "Counter discipline"). A freshly built interior node carries `0` (every member is assigned to a leaf), but online assignment can park residue on an interior node between rebuilds, so the counter is not always zero for interiors.
- `name` / `description` — `name` is `TAXONOMY_PENDING_DISPLAY_NAME` (`"Pending"`) until the naming step runs; `description` may be empty until then.
- Lifecycle `state` (`active` / `merged` / `deprecated`), `merged_into_cluster_id`, and observed/clustered timestamps. `clustered_at` is the centroid decay anchor (not `updated_at`).

### Residue

Residue is what the **online router** leaves on an interior node: an observation that belongs to the topic but matches none of its tighter children stops at the parent rather than being forced down. It is real information ("a Retail Order Management conversation, but not specifically any subtopic") and every read surface resolves *residue + entire subtree* — "sessions of a node" never means a single node.

Note the distinction from gardening: the **divisive build assigns every sampled member to a leaf** and produces no residue itself (interior nodes are born with zero direct count). Residue accumulates only from live online assignment in the window between rebuilds, and the next rebuild reabsorbs it because it samples observations regardless of their current assignment.

### Counter discipline

`observation_count` in Postgres caches what ClickHouse `taxonomy_observations` knows. Two rules keep them honest on the online path:

1. **Every online write that moves CH rows moves the PG counter** under the per-cluster Redis lock against a fresh `findById`. `assignObservationToClusterUseCase` adds (+1, add embedding to centroid); `replaceObservationInClusterUseCase` is the exception that **does not** move the counter — re-analyzing an existing session reuses the stable observation id, so it removes the prior embedding and adds the new one while leaving the count unchanged.
2. **State-aware writes**: a cluster can merge or deprecate between routing and lock acquisition. Counter writers re-check `state` after the locked re-read; live assignment **redirects increments to `merged_into_cluster_id`** (bounded to `MAX_MERGE_REDIRECTS` hops) instead of resurrecting a merged row, and no-ops on a non-`active` cluster.

The gardening rebuild does not incrementally move counters — it sets each new cluster's count directly from its leaf membership and reassigns observations in bulk.

## Data model

Postgres (`@platform/db-postgres`):

- `taxonomy_clusters` — the tree (above).
- `taxonomy_runs` — one row per gardening run: `trigger` (`cron` / `manual` / `threshold`), `status` (`pending` / `running` / `completed` / `failed`), `observations_scanned`, `observations_available`, `observations_sampled`, `sample_strategy`, `sample_cap`, `noise_scanned`, `clusters_born`, `clusters_merged`, `clusters_deprecated`, `error`. The current build path leaves `noise_scanned` and `clusters_merged` at `0`; `observations_scanned` / `observations_available` record the full lookback corpus and `observations_sampled` records the bounded clustering sample.
- `taxonomy_cluster_lineage` — append-only transition rows with `from_cluster_ids` / `to_cluster_ids` (native Postgres arrays, no join table), `similarity`, `run_id`. The transition enum is exactly `birth` / `death` / `continuation`: a build emits `birth` for a freshly created node, `death` for a previously-active cluster no new node continued, and `continuation` when the continuity matcher reused an old cluster's id (see "Cross-run continuity"). `split` / `merge` were retired with the bottom-up gardening path. It drives naming plans and the activity feed.

ClickHouse:

- `taxonomy_observations` — the only live topic-observation table. It stores one retained projection per analyzed session: stable `observation_id`, `session_id`, `analysis_hash`, synthetic session-topic `moment_id`, `projection_method`, `projection_hash`, JSON `projection_metadata` (including the session conversation summary used for naming), 2048-d `embedding` (voyage-4-large), `assigned_cluster_id` (empty = noise), `assignment_method` (`centroid_online` / `gardening_birth` / `gardening_reassign` / `noise`), `assignment_confidence`, `reassignment_run_id`, `start_time` / `end_time` / `indexed_at`. Rows expire on the embedding horizon (`TAXONOMY_OBSERVATION_RETENTION_DAYS`, 30 days). `ReplacingMergeTree(indexed_at)` is keyed by `(organization_id, project_id, observation_id)`, so re-analysis of the same session replaces the prior projection by latest version. There is no observation `dimension` column in ClickHouse. The old `behavior_observations` table is deprecated and removed by the cleanup migration.
- `taxonomy_facet_projections` — a session's projection under one **facet** (lens): the extracted one-sentence answer, its 2048-d embedding, `analysis_hash`, `start_time`. `ReplacingMergeTree(indexed_at)` keyed `(organization_id, project_id, facet_id, session_observation_id)`; no cluster assignment (facet-global, shared across views). See "Behaviors, views, and facets".
- `taxonomy_view_assignments` — the cluster-membership edges for every non-Topics-global tree (filtered Topics views and all facet trees). The renamed, generalized `custom_behavior_assignments`: `ReplacingMergeTree(indexed_at)` keyed `(organization_id, project_id, custom_behavior_id, facet_id, observation_id)`, edges only. `facet_id = ''` edges reference `taxonomy_observations`; a set `facet_id` references `taxonomy_facet_projections`. The global Topics tree keeps its membership inline on `taxonomy_observations.assigned_cluster_id` instead.

`taxonomy_clusters` and `taxonomy_runs` carry a nullable `custom_behavior_id` (scope) **and** a nullable `facet_id` (lens); `(NULL, NULL)` is the global Topics tree.

### Read windows

Two distinct bounded reads sit over the observations table:

- **`latestProjectWindow`** — the newest `TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX` (10k) project rows, newest-first. Used by the read/aggregation paths (`listByCluster`, `listAllByCluster`, `listNoise`).
- **`listForClusteringSample`** — the gardening sample. It does **not** take newest-N; it **day-stratifies** across the lookback window so the rebuilt tree is representative of the whole window instead of biased to the last few hours. Each observation is ranked within its UTC day by `cityHash64(observation_id)` and days are interleaved round-robin (`ORDER BY rn`) up to the limit; the inner scan selects only `observation_id` so the embedding column is never materialized while ranking. The outer read intentionally returns only `observation_id`, `start_time`, and `embedding` so clustering does not pull projection metadata or full observation rows into the workflow worker. The ordering is deterministic (no `rand()`) so a gardening pass replays identically under Temporal.

### ReplacingMergeTree version discipline

`indexed_at` is the replace **version**. Two writers touching the same observation with the same timestamp produce a tie ClickHouse resolves arbitrarily — silent, nondeterministic assignment corruption. The gardening reassign stamps every row it moves with the run's single `now`; online writes use their own ingest time. The domain test fake mirrors real semantics (max version wins; ties keep the existing row) so version bugs surface in unit tests instead of production.

## Online assignment: deepest-fit descent

`routeToDeepestClusterUseCase` is the single router used by live analysis (invoked from conversation intelligence's `analyze-session` path):

1. Start at the roots: pgvector nearest-neighbour (`listNearestActive` with `parentClusterId = null`) returns the top `TAXONOMY_ASSIGN_TOPK` (10) active candidates.
2. Gate with `decideClusterAssignment`: the fixed `TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD` (0.75) plus a softmax relative margin (`TAXONOMY_ASSIGN_RELATIVE_MARGIN`, 0.06) between top-1 and top-2. The margin measures ambiguity *between* candidates — a lone child passes it trivially by design. It is one floor for every path — online routing, the floor under each node's `split_link_threshold`, and full-window reassignment all read the same constant, so a session can never be admissible on one path and rejected on another. The earlier 0.65 was too permissive nearly everywhere: across production clusters with ≥50 members the per-cluster p10 of member-to-centroid similarity has median 0.813, so 0.65 sat below the real floor of ~95% of clusters. 0.75 is deliberately below that median — those floors span 0.671 to 0.977, so a flat value that matches the median cluster costs 2 of 11 well-measured projects more than half their assignments, while 0.75 costs no project that much. Bounding the collateral of being flat is what the value is for; per-cluster thresholds are the real fix.
3. While a level clears the gates, descend into the winner's children. Descent into a node with a `split_link_threshold` raises the absolute gate to `max(absoluteGate, parent.split_link_threshold)` — the global gate is tuned for root coarseness and would otherwise walk into a tight subtree on marginal similarity.
4. The observation lands on the **deepest node that cleared**; a child that fails the gate leaves the observation on the matched parent as residue.

The router only decides placement. Applying it goes through two locked use-cases — `assignObservationToClusterUseCase` (new observation) and `replaceObservationInClusterUseCase` (re-analyzed session, projection changed) — under the per-cluster Redis lock (`org:${org}:taxonomy:cluster:${clusterId}`, TTL `TAXONOMY_CLUSTER_LOCK_TTL_SECONDS`). Both follow `merged_into_cluster_id` redirects and no-op when the locked re-read finds the cluster non-`active`.

Known imprecision sources: ambiguous near-duplicate siblings parking observations one level up, and greedy single-path descent (beam width 1 — an observation never recovers into a different root's subtree). Both are corrected at the next rebuild, which re-derives the whole tree from the raw sample.

## Gardening: top-down divisive rebuild

`gardenTaxonomyWorkflow` is started per project (deterministic workflow id keyed on org + project so concurrent triggers dedupe). The cron sweep (`TAXONOMY_GARDENING_CRON_PATTERN`, every 6h) starts a run only when a project has at least `TAXONOMY_GARDENING_MIN_OBSERVATIONS` (15) observations. The workflow is a **single build pass plus naming** — there is no sweep / recurse / merge / converge loop:

```
start run ─► plan tree ─► save clusters ─► reassign observations ─► deprecate old clusters ─► naming plan ─► name clusters (deepest-first, sequential) ─► assert quality ─► emit lineage ─► complete run
```

The split build path keeps CPU/read planning separate from the write activities. The plan activity stages the large cluster/assignment artifact in Redis under an organization-prefixed key (`org:${organizationId}:...`) and passes only the artifact reference plus compact metrics/lineage through Temporal history. Temporal records each completed write activity, so worker crashes do not cause the whole build to be retried over partially-written state; retries are bounded to the specific idempotent operation (`save`, ClickHouse-side reassignment, or deprecation). A Temporal `patched()` marker keeps executions that already scheduled the legacy single build activity replay-compatible.

### Build (`buildHierarchicalTaxonomyUseCase`)

1. **Sample** from the `TAXONOMY_NOISE_LOOKBACK_DAYS` (7-day) window via the day-stratified `listForClusteringSample`, regardless of current assignment. Small corpora up to `TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX` (1.5k) are read whole; larger corpora use the 1.5k system cap. Below `TAXONOMY_GARDENING_MIN_OBSERVATIONS` the build returns empty (cold-start gate).
2. **Build the tree top-down** with `buildHierarchicalClusters` (see "Clustering primitives") inside a Node `worker_threads` worker so synchronous k-means CPU does not block the Temporal worker event loop or health checks. All sampled members end up on leaves.
3. **Save clusters top-down** (clusters sorted by depth ascending) in its own write activity so a child save never references a missing parent. Interior nodes are stored with `observation_count = 0` and a `split_link_threshold` derived from their children's tightest sibling separation.
4. **Match new nodes against the previous tree** with the continuity matcher (see "Cross-run continuity"): a confident 1:1 centroid match reuses the old cluster's id, so trends that key on the id stay continuous across passes.
5. **Reassign every member to its leaf** in bulk (`reassignManyById`, `assignment_method = "gardening_birth"`), confidence = cosine to the leaf centroid clamped to `[0,1]`. Reassignment copies unchanged observation columns with ClickHouse-side `INSERT … SELECT`, keyed by observation id, so large metadata and embedding payloads do not round-trip through Node after clustering.
6. **Deprecate every previously-active cluster** that no new node continued.
7. **Emit lineage**: a `continuation` row per reused id, a `birth` row per genuinely new node, a `death` row per deprecated cluster.

### Clustering primitives (`clustering.ts`)

Pure, dependency-free, and deterministic given the inputs (seeded mulberry32 PRNG keyed off the project id; no `Math.random()` so Temporal replays match). Inputs are L2-normalized embeddings, so cosine equals the dot product and the centroid update is "mean then re-normalize" (spherical k-means).

- **Auto-K per node**: sweep K = 2..`maxChildren`, run k-means++ initialization + spherical k-means for `TAXONOMY_KMEANS_RESTARTS` (3) restarts (`TAXONOMY_KMEANS_MAX_ITER` 25, `TAXONOMY_KMEANS_TOLERANCE` 1e-4), and keep the best K by a cosine-adapted **Calinski–Harabasz** variance-ratio score.
- **Reject** any K that produces an undersized cluster, two siblings closer than `maxSiblingCosine`, or a score below `minSplitScore`. If no K is valid the node stays a leaf.
- **Per-depth schedule** (`TAXONOMY_TREE_DEPTH_SCHEDULE`) makes the tree broad at the root and narrow at the leaves without per-corpus tuning:

  | depth | maxChildren | minClusterFraction | minClusterAbs | maxSiblingCosine | minSplitScore |
  | --- | --- | --- | --- | --- | --- |
  | 0 (roots) | 10 | 0.01 | 20 | 0.85 | 1.5 |
  | 1 (sub-topics) | 8 | 0.03 | 10 | 0.90 | 1.2 |
  | 2 (leaves) | 6 | 0.05 | 8 | 0.93 | 1.1 |

  Roots permit more children with a larger absolute floor and looser separation (root siblings are intentionally diverse topics); deeper levels accept smaller fractions of the parent's mass and require tighter separation.

### Naming (`nameClusterUseCase`)

Naming runs **deepest-first** so an interior node sees its children's final names, and **one cluster at a time** (`NAMING_ACTIVITY_CONCURRENCY = 1`): each cluster builds a forbidden-name list from its parent, siblings, and children, and siblings named concurrently would each see the others as still-`"Pending"` and could collide — which the sibling-duplicate quality gate then rejects. Sequential naming guarantees each sibling sees the names assigned before it.

Three modes:

- **Leaf** — name from farthest-point-sampled member summaries (budget clamped to `[TAXONOMY_FPS_SAMPLE_BUDGET_MIN, TAXONOMY_FPS_SAMPLE_BUDGET_MAX]`).
- **Interior** — collapse the already-named children into a single umbrella topic broader than every child.
- **Root** — produce a project-wide umbrella that covers *every* top-level category (a different prompt because the model otherwise picks a name fitting its biggest child).

A two-call map-reduce (`TAXONOMY_NAMING_MODEL`) proposes candidate themes then collapses them into a name + description. A **collision guard** normalizes names (lowercase, alphanumeric) and, on a forbidden-name hit, retries once surfacing the offending name; a final fallback suffixes `" (subtopic)"` so the tree never ships duplicate sibling names. The save re-reads the row under the per-cluster lock so it can't clobber centroid/counter mutations made by live assignment during the seconds-long LLM call.

### Quality gate

`assertGardenTaxonomyQualityActivity` fails the run on structural defects — notably **duplicate sibling names** (same parent, normalized-equal name) and active leaf rows whose Postgres direct `observation_count` is zero. Parents with children may have zero direct count because their members live in descendants. A failed gate surfaces as a failed run for Temporal retry rather than shipping a broken tree.

### Cross-run continuity (`lineage.ts`)

The divisive build rebuilds the whole tree from scratch every pass, so without intervention every node would get a fresh cuid — the previous pass's clusters all "die", the new ones are all "born", and any chart or trend that keys on `taxonomy_clusters.id` resets every 6 hours. The **continuity matcher** (`matchTaxonomyLineage`, a pure function) closes that gap between tree assembly and persistence:

- It builds a cosine-similarity matrix of the new nodes × the previously-active clusters, **masking cross-depth pairs** (a tight leaf must not inherit a broad root's identity — depth stability matters to the UI).
- It solves a one-shot **Hungarian (Kuhn–Munkres) assignment** that maximizes total similarity under a strict 1:1 constraint, then accepts each assigned pair as a `continuation` only when its cosine clears `TAXONOMY_CONTINUATION_THRESHOLD` (0.92). Continuations reuse the old cluster's id — `save` upserts, so the row updates in place with the new centroid while preserving its age (`firstObservedAt` / `createdAt`).
- **Name stability**: when the topic barely moved (cosine ≥ `TAXONOMY_NAME_REUSE_THRESHOLD`, 0.95) the continuation carries the old name, so the naming step skips it (it names only `birth` rows and continuations left `Pending`). This avoids cosmetic name churn across passes.
- Everything else stays as before: an unmatched new node is a `birth`, an uncontinued old cluster is a `death`.

The matcher is biased toward continuation on purpose — a false continuation is a visual no-op, a false birth+death pair breaks trend charts. It is pure and deterministic, so a pass replays identically under Temporal. Thresholds are MVP defaults seeded by analogy to published lineage-layer baselines; tune offline on real cross-pass corpora. `split` / `merge` are intentionally not modelled: a confident 1:1 continuation carries the identity trend UIs need, and the divisive build cannot produce near-duplicate siblings to merge.

## Behaviors, views, and facets (lenses)

The product's **Behaviours** page is a **catalog of behaviors**, not a single tree. A **behavior** is a question your sessions are grouped by; each clusters the same sessions a different way:

- **Topics** — the default behavior, "what was this about?", built from every session's transcript embedding. It is the tree described above and the only one with an online router. It has **no `custom_behaviors` row**; the UI resolves it from the reserved slug `lat-topics` (`TOPICS_BEHAVIOR_SLUG`).
- **Facet behaviors** — "user goal", "outcome", "friction reason", "assistant approach", "capability gap", or a user-authored question. Internally a **facet**: the answer to the question is extracted per session and clustered in that answer's embedding space instead of the transcript's.

A **view** is a saved **filtered slice** of a behavior. Model: a saved view = `(scope filterSet × lens)`, stored as a `custom_behaviors` row (`packages/platform/db-postgres/src/schema/custom-behaviors.ts`) with `name`, project-unique `slug`, `filter_set` (jsonb), nullable **`facet_id`** (the lens; null = Topics), `status`, and `last_gardened_at`. Valid combinations:

| filter | lens (`facet_id`) | meaning |
| --- | --- | --- |
| set | null | filtered Topics slice (the former "cohort") |
| set | facet | filtered facet slice |
| empty | facet | whole-project facet behavior |
| empty | null | invalid — that *is* the global Topics tree |

Slugs are the routing namespace, so the `lat-` prefix is reserved (rejected on both custom-behavior and facet slugs) and a user slug can never shadow `lat-topics` or a preset.

### Facets: definition, projection, extraction

A facet is an **immutable lens definition** in `taxonomy_facets` (Postgres): project-unique `slug`, `name`, `description`, and write-once `instructions` (the extraction question). Presets are code-defined with reserved `lat-` slugs, materialized on first pick (find-or-create). To change what a lens means you create a new facet; `name`/`description` stay editable.

Unlike a Topics view (which reuses the transcript embeddings already in `taxonomy_observations`), a facet needs its **own** projection per session. `taxonomy_facet_projections` (ClickHouse, `ReplacingMergeTree(indexed_at)` keyed `(organization_id, project_id, facet_id, session_observation_id)`) stores the extracted one-sentence answer, its 2048-d embedding, `analysis_hash`, and `start_time`. It carries **no cluster assignment** — a facet projection is facet-global, shared by every view that samples the session.

Extraction is **lazy, at gardening time** (`extractFacetProjectionsUseCase`): for the day-stratified clustering sample only, an LLM (`TAXONOMY_DEFAULT_FACET_EXTRACTION_MODEL`, Bedrock `minimax.minimax-m2.5`) answers the facet's `instructions` per session, cached by `(facetId, sessionObservationId)`; "unclear" answers are stored but excluded from clustering. This is the taxonomy's only generative per-session cost, and it stays out of the live path — the online hot path is still embeddings-only (see [conversation intelligence](./conversation-intelligence.md)). It is metered (`taxonomy-facet-extract`, `dev-docs/billing.md`).

### One clustering path, keyed by (scope, facet)

`taxonomy_clusters` and `taxonomy_runs` carry both a nullable `custom_behavior_id` (scope) and a nullable `facet_id` (lens); a tree is identified by that pair, and `(NULL, NULL)` is the global Topics tree. `planHierarchicalTaxonomyUseCase` resolves scope and lens **orthogonally**: scope picks the sample (`listForClusteringSample` whole-project, `listForFacetSample` / scoped sample for a filtered view), lens picks the embeddings (transcript from `taxonomy_observations`, or facet projections). Clustering, quality, and continuity (`lineage.ts`) are the shared code above, unchanged.

**Membership lives in `taxonomy_view_assignments`** (ClickHouse; the renamed, generalized `custom_behavior_assignments`), keyed `(organization_id, project_id, custom_behavior_id, facet_id, observation_id)` with `start_time` + retention. Edges only, no embeddings — observations and facet projections are reused, not copied. `facet_id` had to enter the sort key because different facets reuse the same per-session `observation_id`. A `facet_id = ''` edge resolves against `taxonomy_observations`; a set `facet_id` resolves against `taxonomy_facet_projections`. **Only the global Topics tree writes the inline `taxonomy_observations.assigned_cluster_id`**; every other tree writes edges here and never touches the inline column.

### Facet-aware naming

`nameClusterUseCase` takes a per-tree `ClusterNamingPolicy` (`name-taxonomy.ts`) instead of a hard-coded topic policy, defaulting to `TOPIC_NAMING_POLICY` (byte-identical to the old topic prompts, golden-tested). A facet tree names clusters in the lens's voice and reads member text from `taxonomy_facet_projections` instead of the transcript summary.

### Lifecycle and isolation

Facet behaviors and views are **not a separate pipeline**: they garden through the same `gardenTaxonomyWorkflow` + `gardenCustomBehaviorSweep` + `createCustomBehavior` as filtered Topics views — a facet is just a lens of a custom behavior, so there is no facet-specific sweep, cron, or flag. Accumulate-don't-truncate (`upsertMany`, never `deleteByBehavior` on regenerate), stable-ids-across-runs (Hungarian continuity against the tree's own `listActiveByProject({ customBehaviorId, facetId })`), minimum-gate→waiting, deprecate-last, and preview all work exactly as for filtered Topics views. `getClusterTrendCounts` on `TaxonomyViewAssignmentRepository` windows current-vs-baseline over `taxonomy_view_assignments.start_time` for both lenses. **Isolation:** every Topics read pins `custom_behavior_id IS NULL AND facet_id IS NULL`; a scoped/facet run never writes `taxonomy_observations.assigned_cluster_id`; `deleteByBehavior` purges a behavior's edges across both lenses. Everything sits behind the `customBehaviors` flag; with it off, `/behaviours` renders the legacy single-tree page and no facet code is reachable.

Out of scope (as for the global tree): per-run membership-migration history — the same observation's membership co-existing across runs. That is the only thing that would force `reassignment_run_id` into the sort key, and the global tree lacks it too.

## Read paths

- **Behaviours page** (`listProjectBehavioursUseCase`): returns the literal tree, but **unwraps the single englobing root** — when there is exactly one depth-0 root with children, its depth-1 children become the top-level rows so the table opens on several real categories instead of one all-encompassing row (a tiny corpus collapsed to a single childless root is still shown). Each node's `subtreeObservationCount` is rolled up across visible descendants **at read time** (not the stored counter); zero-residue interior nodes synthesize a zero trend rather than vanish with their subtree. The web layer indents by **relative** tree-walk depth (not absolute `cluster.depth`), rolls conversation-intelligence rates up each subtree weighted by sessions, and renders an expandable tree. The topics filter dropdown (`getTopicFilterOptions`) applies the same root unwrap.
- **Behaviours catalog** (`getBehaviourCatalog`): the grid of behavior cards (Topics + each facet behavior), one card per behavior with a shallow tree teaser and session/view counts, built by reusing `listProjectBehavioursUseCase` per behavior.
- **Behaviour drawer / cluster intelligence** (`getClusterSessionIntelligenceUseCase`, `taxonomy-cluster-intelligence-repository.ts`): sessions list, histograms, trajectories, and the intelligence profile are all **subtree-scoped** (`listSubtreeIds`), and membership is resolved by `clusterMembership(customBehaviorId, facetId)` — the global Topics tree reads `taxonomy_observations.assigned_cluster_id`, every other tree reads its edges from `taxonomy_view_assignments` (with facet trees pulling member text from `taxonomy_facet_projections`). The moment-label and score rollups (the drawer overlays) are session-keyed, so they layer onto a facet tree unchanged. The web SQL pins taxonomy observations and moment labels to the session's current analysis generation before joining them.
- **Sessions table topics filter**: selected nodes expand to subtree ids server-side before ClickHouse; see the CI doc for the subquery shape and time-bound pruning. Repository-level observation reads use `FINAL` over the stable `observation_id` key; read paths that join observations to moments or trace ids still pin through `session_analyses` so every joined row comes from the same current generation.
- **Backoffice** (`AdminTaxonomyRepositoryLive`): keeps the legacy category/subcategory DTO shape but sources it from the tree — roots as groups, descendants rolled up by first path segment.

### Scope details (filtered views)

- **Definition.** A view's `custom_behaviors` row carries `name`, project-unique `slug`, `filter_set` (jsonb), nullable `facet_id`, `status` (`pending` / `generating` / `ready` / `failed`), and `last_gardened_at`. The filter may use any Sessions field **except `topics`** — scoping on behavior clusters is circular (rejected by `customBehaviorFilterSetSchema`). Capped at `MAX_CUSTOM_BEHAVIORS_PER_PROJECT` (10); authz matches saved searches (any org member). Facet *definitions* (`taxonomy_facets`) are not capped — they are inert until a view uses them.
- **Orchestration.** The **shared** `apps/workflows/src/workflows/taxonomy-gardening-workflow.ts` — one workflow, resolving scope (`customBehaviorId`) and lens (`facetId`) orthogonally in the activity. Creating a view enqueues its first run; `gardenCustomBehaviorSweep` re-gardens every eligible view on the 6h cadence (`listGardenableCustomBehaviors`: live project, last gardened before the throttle). No manual "generate".
- **Sampling window.** Views sample the same shared gardening window as the global tree (`TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS`); a filter is sparser than the whole project, so a view holds fewer sessions at the same window.
- **Minimum gate → waiting; failure retains the prior tree; preview** without a run via `countForCustomBehaviorSample` / `listForCustomBehaviorSample` (Topics) or `listForFacetSample` (facet).

## Trade-off decisions

- **One tree instead of clusters + categories**: levels differ only by density, so a single node type replaced the two-model design; it removed an entire data model and the singleton-category pathology, at the cost of residue semantics every read surface must respect.
- **Top-down divisive rebuild instead of incremental agglomeration**: a global "tight" density is unknowable up front (telecom separates at ~0.88 where airline only separates at ~0.80); per-depth schedules adapt and rebuilding the whole tree from the raw sample each pass keeps shape rules tenant-agnostic — no thresholds depend on string matching or topic priors. The CPU-heavy pure JS clustering runs in a worker thread and remains bounded by the activity timeout. Cluster ids no longer churn every pass — the continuity matcher reuses them for stable topics (see "Cross-run continuity").
- **Clean rebuild, every member on a leaf**: the divisive build cannot produce near-duplicate siblings (enforced by `maxSiblingCosine`) and needs no merge/noise phases, so the old sweep → recurse → merge → reconcile → deprecate loop was deleted and collapses to one build pass plus the continuity matcher. The price is that online residue and any drift since the last pass are discarded and re-derived rather than continued.
- **Day-stratified sampling**: newest-N would let a single busy hour dominate the tree on a high-volume tenant; round-robin-over-days keeps the sample representative of the lookback window while staying deterministic for replay.
- **Sequential naming**: trades naming wall-clock (serial LLM calls) for a guarantee that sibling names are unique by construction, which the quality gate requires.
- **Cached counters over CH aggregation on read**: listing surfaces need counts without ClickHouse round-trips; the price is the online counter discipline above.

## Future work

- **Tune the continuity thresholds**: `TAXONOMY_CONTINUATION_THRESHOLD` / `TAXONOMY_NAME_REUSE_THRESHOLD` are MVP defaults. Calibrate offline against real cross-pass corpora; consider a secondary signal (member session-id overlap in CH) to keep a `continuation` when a topic's centroid drifts past the threshold from seasonality rather than a genuine change.
- **Elide no-op continuation rows**: when a continued cluster's centroid moved < ε and its name is unchanged, the `continuation` row is a no-op; skipping it would keep the activity feed signal-heavy.
- **Parallelize naming across independent parents**: only true siblings must serialize; clusters under different parents could be named concurrently without reintroducing the collision race that forced full sequential naming.
- **Beam or re-entrant descent** for cross-root boundary observations on the online path.
- **Stratification window**: the sample lower bound is the fixed 7-day lookback; making the window adaptive (e.g. widen when volume is low) would improve small-tenant coverage.
