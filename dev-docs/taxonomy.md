# Taxonomy — the unified topic cluster tree

Taxonomy organizes the moment-level **topic observations** produced by [conversation intelligence](./conversation-intelligence.md) into a **single tree of clusters** per project. There is no separate category model: every tree level is the same kind of node, and **depth is clustering density** — depth-0 roots form at a coarse calibrated link threshold, and each level below re-clusters its parent's members at a tighter density derived from that parent's own similarity distribution. "Categories" in the product UI are simply depth-0 nodes.

Domain code: `packages/domain/taxonomy`. Postgres adapters: `packages/platform/db-postgres/src/repositories/taxonomy-*.ts`. ClickHouse adapter: `packages/platform/db-clickhouse/src/repositories/taxonomy-observation-repository.ts`. Orchestration: `apps/workflows/src/workflows/taxonomy-gardening-workflow.ts` + `apps/workflows/src/activities/taxonomy-gardening-activities.ts`. Temporal is the **only** gardening orchestrator — the legacy in-process path was removed; a missing workflow starter is a logged misconfiguration, not a fallback.

## Tree model

`taxonomy_clusters` (Postgres) rows carry the tree shape:

- `parent_cluster_id` — null for roots.
- `depth` — 0 for roots, bounded by `TAXONOMY_TREE_MAX_DEPTH`.
- `path` — slash-terminated ancestor id chain (`"rootId/parentId/"`, empty for roots). Subtree membership is `path LIKE '%${id}/%'` (`listSubtreeIds`), safe because cuids contain no LIKE metacharacters and segments are slash-delimited.
- `split_link_threshold` — the link density this node's children were split at; null until the node recurses. Child-level merge floors and descent gates read it so every decision at a level uses the density that created that level.
- `centroid` (JSONB decayed weighted sum, shared math with issues via `@domain/shared/centroid`) plus a derived `centroid_embedding vector(2048)` for pgvector ANN. An interior node deliberately **keeps its full-membership centroid after a split** — it represents its whole subtree for the first hop of descent; only counters drop to residue.
- `observation_count` — a **cached counter**; ClickHouse rows are the truth (see "Counter discipline").
- Lifecycle `state` (`active`/`merged`/`deprecated`), `merged_into_cluster_id`, observed/clustered timestamps.

### Residue is a feature

Observations are **not** pushed to the deepest leaves. A node holds *residue*: members that belong to the topic but match none of its tighter children. Residue comes from two sources — deepest-fit routing stopping at the level where the observation genuinely fits, and recursion leaving uncovered members on the parent. Residue is real information ("a Retail Order Management conversation, but not specifically any subtopic") and the **birth pool for new subtopics**: once a node's residue crosses the recursion floor, the next garden pass re-clusters it into new children. Consequently, "sessions of a node" always means *residue + entire subtree* — every read surface (drawer, filters, behaviours table) resolves subtrees, never single nodes.

### Counter discipline

`observation_count` in Postgres caches what ClickHouse `taxonomy_observations` knows. Three rules keep them honest:

1. **Every path that moves CH rows must move the PG counter** under the per-cluster Redis lock with a fresh `findById` (sweep absorption, noise reassign, merges, live assignment).
2. **Recursion computes residue from the listed CH members**, not the stored counter — the counter can lag, and anything beyond the list cap stays counted on top.
3. **State-aware writes**: a cluster can merge or deprecate between routing and lock acquisition. Counter writers check `state` after the locked re-read; live assignment **redirects increments to `merged_into_cluster_id`** (bounded hops) instead of resurrecting a merged row.

## Data model

Postgres (`@platform/db-postgres`):

- `taxonomy_clusters` — the tree (above).
- `taxonomy_runs` — one row per gardening run: trigger, status, scanned/born/merged/deprecated counters, error.
- `taxonomy_cluster_lineage` — append-only `birth` / `merge` / `split` transitions with from/to cluster ids; drives naming plans and the activity feed.
- `calibration_profiles` — per-project calibrated thresholds, `scope = "clustering"` here (also `"conversation"`, see the CI doc). Deleted on QA resets so fresh corpora recalibrate.

ClickHouse:

- `taxonomy_observations` — one row per moment topic projection: embedding, `assigned_cluster_id` (empty = noise), assignment method (`centroid_online` / `gardening_birth` / `gardening_reassign` / `noise`), confidence, `analysis_hash`, `reassignment_run_id`. `ReplacingMergeTree(indexed_at)` keyed by `(org, project, dimension, observation_id)`.

### ReplacingMergeTree version discipline

`indexed_at` is the replace **version**. Two writers touching the same observation with the same timestamp produce a tie ClickHouse resolves arbitrarily — silent, nondeterministic assignment corruption. Therefore:

- Gardening stages share one run timestamp but write with **deterministic per-stage millisecond offsets** (`GARDEN_STAGE_OFFSET_MS`: sweep +0 … recurse +4) so later stages always win and Temporal retries reproduce identical versions.
- The domain test fake mirrors real semantics (max version wins; ties keep the existing row) so version bugs surface in unit tests instead of production.

## Assignment: deepest-fit descent

`routeToDeepestClusterUseCase` is the single router used by live analysis and gardening's noise reassignment:

1. Start at the roots: pgvector ANN (`listNearestActive` with `parentClusterId = null`) returns top-K active candidates.
2. Gate with the calibrated absolute threshold plus a softmax relative margin between top-1 and top-2 (`decideClusterAssignment`). The margin measures ambiguity *between* candidates — a lone child passes it trivially by design.
3. While a level clears the gates, descend into the winner's children. Descent into a recursed node's children additionally requires `max(absoluteGate, parent.split_link_threshold)` — the global gate is calibrated for root coarseness and would otherwise walk into a tight subtree on marginal similarity.
4. The observation lands on the **deepest node that cleared**; stopping at an interior node leaves honest residue.

Known imprecision sources, in priority order: ambiguous near-duplicate siblings parking observations one level up (mitigated by sibling merges), and greedy single-path descent (beam width 1 — an observation never recovers into a different root's subtree).

## Gardening

`gardenProjectTaxonomyWorkflow` (deterministic workflow id `org:${org}:taxonomy:garden:${project}`) runs one `gardenTaxonomyWorkflow` child per dimension (currently only `topic`) with this activity sequence; each activity is idempotent under retries via the run-scoped deterministic `runId`:

```
calibrate ─► sweep births ─► sibling merges ─► leaf deprecation ─► noise reassign ─► tree recursion ─► naming plan ─► name clusters ─► emit lineage ─► complete run
```

- **Calibrate** (`calibrateClusteringThresholdsUseCase`): samples observation embeddings and assignment scores; derives `rootLinkThreshold` (high quantile of pairwise similarity, clamped), birth diameter (derived from the root link actually used — not a separately calibrated value that would quietly override it), and assignment gates; runs an LLM purity audit. TTL-guarded.
- **Sweep births** (`sweepNoiseAndBirthClustersUseCase`): greedy diameter-bounded clustering over recent noise at root density; births create depth-0 nodes under a root-count cap with density pressure; near-existing groups are **absorbed** into the nearest root instead of birthing (counter bumped under lock).
- **Sibling merges** (`mergeNearDuplicateClustersUseCase`): merges are **sibling-only** (cross-parent merges would give a node two ancestries). Nomination is **density-aware per level**: two siblings more similar than the density that created their level are one cluster at that density — roots nominate at the calibrated root link, children at their parent's `split_link_threshold`. Name-overlap (Jaccard or token-subset) also nominates above a sane floor. An LLM judge (Bedrock Haiku, sizes in the prompt, "a small fragment of the same domain merges into the dominant topic") decides every nominated pair; failures are logged and conservatively reject. Approved pairs assemble via **complete-linkage components** — best pairs first, a component only grows while every cross-pair clears the floor — so one weak transitive edge can no longer drop a whole component's high-confidence merges. The survivor absorbs the loser's observations and **adopts its subtree** (children re-parent, path prefixes rewrite, from fresh locked reads), and losers mark merged under their own lock.
- **Leaf deprecation** (`deprecateInactiveClustersUseCase`): decayed-mass floor + inactivity window, **leaf-only** — a node with active children never deprecates.
- **Noise reassign** (`reassignNoiseToCurrentClustersUseCase`): routes recent noise through the same deepest-fit descent as live assignment, so recovered observations land on the most specific defensible node instead of parking on roots.
- **Tree recursion** (`recurseTreeClustersUseCase`): the top fat nodes (direct count ≥ floor and ≥ share of project observations, depth < max) re-cluster their members at a per-node child density taken from a quantile of the node's own internal pairwise similarities (clamped). Children adopt covered members; the parent keeps residue and persists `split_link_threshold`. Splits **roll back** when no real structure exists (too few children, low coverage, one dominant child). Emits `split` lineage.
- **Naming** (`nameClusterUseCase`): farthest-point-sampled member summaries → map-reduce naming on the project model; children are named **within their parent's context** ("name what distinguishes them inside it; do not restate the parent topic"). Renames trigger on birth/split lineage and on the pending placeholder.

The tree converges over passes: pass 1 births roots and starts splitting, later passes deepen, merge near-duplicates, and stabilize; a pass with zero born/merged/deprecated is the fixed point.

## Read paths

- **Behaviours page** (`listProjectBehavioursUseCase` → `getProjectBehaviours`): returns the literal tree (`ProjectBehaviourNode`: cluster, trend, novelty, `subtreeObservationCount`, children). Nodes show on their own merit (min observations + segment match) or as scaffolding for surviving children; zero-residue interior nodes synthesize a zero trend rather than vanish with their subtree. The web layer rolls conversation-intelligence rates/signals up each subtree weighted by sessions and renders an indented, expandable tree; the `high_escalation` segment is resolved in the web layer where escalation rates exist.
- **Behaviour drawer**: sessions list, histograms, and the intelligence profile are all **subtree-scoped** (`listSubtreeIds` → `assigned_cluster_id IN`), pinned to current analysis generations.
- **Sessions table topics filter**: selected nodes expand to subtree ids server-side before ClickHouse; see the CI doc for the subquery shape and time-bound pruning.
- **Backoffice** (`AdminTaxonomyRepositoryLive`): keeps the legacy category/subcategory DTO shape but sources it from the tree — roots as groups, descendants rolled up by first path segment, orphans in `uncategorized`.

## Trade-off decisions

- **One tree instead of clusters + categories**: levels differ only by density, so a single node type with recursive splitting replaced the two-model design; it removed an entire data model and the singleton-category pathology, at the cost of residue semantics every read surface must respect.
- **Top-down divisive, not bottom-up agglomerative**: a global "tight" density is unknowable up front (telecom separates at ~0.88 where airline only separates at ~0.80); per-node derived densities adapt, and residue gives general observations an honest home that leaves-only models lack. The cost is interior nodes holding direct members — see "Residue is a feature".
- **Sibling-only merges with judge arbitration**: centroid cosine in the 0.86–0.92 band carries no merge signal on dense corpora, so the judge decides from names/descriptions and the floors are density thresholds, not magic constants.
- **Cached counters over CH aggregation on read**: listing surfaces need counts without ClickHouse round-trips; the price is the counter discipline above.
- **Conservative-but-logged judge fallbacks** and **at-most-once centroid updates** (see CI doc) trade slight undercounting for the elimination of double-count corruption.

## Future work

- **Single-child chain collapse**: post-merge consolidation can leave `parent (0 residue) → only-child` husks; a gardening rule should hoist the child into the parent's slot.
- **Recurse-share scaling**: the recursion trigger (`share ≥ 0.12` of project observations) starves sizable topics on large corpora (a 279-observation root that deserves subtopics never recurses at 3.4k total); the floor should scale, e.g. `max(60, total × 0.05)`.
- **Stale-row reclamation**: observations can end up assigned to merged clusters when live assignment races a merge's member listing; a sweep re-pointing rows on non-active clusters to their merge target would self-heal.
- **Beam or re-entrant descent** for cross-root boundary observations.
- **Materialized "General" leaves**: if product wants strict leaves-partition semantics, residue can render as a synthetic per-node "General" child without changing the formation algorithm.
- **Additional dimensions**: the schema keys observations by `dimension`; only `topic` is live today.
