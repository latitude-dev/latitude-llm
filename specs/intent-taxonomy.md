# Live Intent Taxonomy

> **Documentation**: `dev-docs/spans.md`, `dev-docs/reliability.md`, `dev-docs/issues.md`, `dev-docs/projects.md`

## Spec Contract

This spec defines the intended design for a live taxonomy of user intents and assistant behaviours over production traces.

The system must classify every eligible trace without running a generative LLM classifier for every trace. It should use cheap embedding and clustering primitives for trace-level coverage, and reserve LLM generation for labeling, summarizing, and organizing clusters.

While this feature is under construction, this spec is the source of truth. Durable final behavior should be promoted into the linked `dev-docs/*` files once implementation stabilizes.

## Product Goal

Latitude users need a way to explore recurring and emerging behaviours in their LLM applications without manually searching through raw traces. The product should surface:

- what users are trying to accomplish
- how the assistant behaves in response
- which behaviours are new, growing, unresolved, costly, or failure-prone
- representative traces for each behavior cluster
- review actions that let users turn discovered clusters into a stable taxonomy

The user-facing experience should resemble a live taxonomy:

```text
Account & billing
  Cancellation
    Cancel because price increased
    Cancel because app no longer needed
  Invoices
    Update tax information
    Download prior invoice

Technical support
  Connectivity
    App refuses to load with VPN
    Login redirect loop
```

A separate emergent-intents view should show clusters first seen recently and not yet reviewed.

## Non-Goals

- Do not run a full LLM classifier per trace as the primary classification mechanism.
- Do not require users to predefine the taxonomy before traces can be classified.
- Do not make HDBSCAN, graph clustering, or any batch algorithm the canonical source of reviewed taxonomy identity.
- Do not let clustering reruns silently rename, delete, or reshape user-reviewed taxonomy nodes.
- Do not build this as a web-only capability; core use-cases and DTOs should be reusable by future MCP/API surfaces.

## Definitions

### Eligible trace

A trace that has reached the existing trace-end lifecycle and has enough conversation content to build a meaningful intent signature.

### Intent signature

A compact textual representation of a trace used for embedding and clustering. It should be derived from existing trace detail data and should prefer behaviorally relevant content:

- user messages, especially the initial request and later clarifications
- assistant final response when short enough to be useful
- tool names and coarse tool outcomes
- error/status/outcome signals
- root span name and relevant tags when useful

It should exclude high-noise or privacy-risk content by default:

- full system prompts
- reasoning content
- large tool response payloads
- unrelated metadata dumps

The first implementation should reuse or extend `buildTraceSearchDocument` rather than creating an unrelated prompt-building pipeline.

### Intent cluster

A discovered group of traces with similar user intent, assistant behaviour, or outcome. Intent clusters are project-scoped and organization-scoped. They may be emergent, reviewed, ignored, merged, or archived.

### Taxonomy node

A stable user-reviewable category or subcategory. Taxonomy nodes organize reviewed clusters into a hierarchy. They are canonical product objects and must remain stable across clustering runs.

### Trace assignment

An append-only analytical record saying that a trace belongs to a cluster with a confidence or membership score. Trace assignments are high-volume data and belong in ClickHouse.

### Clustering run

A batch discovery run over a bounded project/time window. A run produces proposed cluster evidence and trace assignments, but does not directly replace the canonical reviewed taxonomy.

## Core Design Principles

1. **Classify every trace, but do not LLM-classify every trace.**
   Every eligible trace should receive a cluster assignment or explicit unclustered/noise assignment. The per-trace path should be embedding/vector based.

2. **Separate live assignment from batch discovery.**
   New traces should be assigned cheaply to existing cluster centroids. Batch jobs discover new clusters and suggest taxonomy changes.

3. **Separate discovered evidence from canonical taxonomy.**
   Clustering output is evidence. User-reviewed taxonomy nodes and reviewed clusters are canonical product state.

4. **Keep cluster identity stable.**
   Batch algorithms may produce unstable labels. Reconcile discovered clusters to existing canonical clusters using centroid similarity and representative traces.

5. **Use LLMs only for cluster-level interpretation.**
   LLM calls should label, describe, merge/split-suggest, and place clusters in taxonomy using representative examples, not classify individual traces.

6. **Prefer debuggable clustering first.**
   The first discovery backend should be simple to inspect and tune. kNN graph community detection is the recommended MVP discovery algorithm. HDBSCAN should remain a pluggable experimental backend.

## Recommended Algorithm Architecture

### Live Path - Nearest Centroid Assignment

On or after `trace-end`, once trace-search embedding data exists:

```text
trace detail
  -> intent signature
  -> embedding or reused trace-search embedding
  -> nearest active cluster centroid
  -> assignment row in ClickHouse
```

Assignment policy:

```text
similarity >= high threshold
  assign to nearest cluster as high confidence

medium threshold <= similarity < high threshold
  assign to nearest cluster as low confidence and eligible for batch review

similarity < medium threshold
  write unclustered/emergent-candidate assignment
  include trace in next discovery run
```

Initial thresholds should be named constants in the intent-taxonomy domain package and tuned from real traces. Avoid inline threshold literals in workers or repositories.

### Batch Discovery Path - kNN Graph Community Detection

The MVP discovery backend should run periodically over recent unclustered, low-confidence, and optionally recently assigned traces.

Recommended v1 algorithm:

1. Load one vector per trace for the project/window.
2. Normalize vectors.
3. Build a k-nearest-neighbor graph per project/window.
4. Keep edges above a cosine similarity threshold.
5. Run connected components or a simple community detection algorithm.
6. Drop components below `minClusterSize` into noise.
7. Compute centroid and representative traces for each component.
8. Reconcile components against existing clusters.
9. Create new emergent clusters or update existing cluster evidence.
10. Write trace assignment rows with `assignmentSource = "knn-community"`.

This graph-based backend is preferred for MVP because it is easy to explain, inspect, and debug in product terms:

- edge threshold = how similar two traces must be
- minimum component size = how recurring an intent must be
- representative traces = nearest traces to the component centroid

### Optional Discovery Backend - HDBSCAN

HDBSCAN is a valid alternative or second backend for batch emergent-intent discovery. It is useful when:

- cluster density varies significantly
- graph thresholding fragments semantically coherent groups
- robust outlier/noise detection is more important than assigning every point

HDBSCAN should not be the live assignment algorithm. It should be exposed behind a platform clustering port so discovery strategies can be compared on the same input/output contract.

HDBSCAN caveats to preserve in implementation:

- it is batch-oriented, not naturally incremental
- cluster labels are not stable across runs
- high-dimensional embeddings may require dimensionality reduction before quality is acceptable
- it emits noise points, so live classification still needs nearest-centroid fallback

### LLM Labeling Path

Only new or materially changed clusters should be labeled by LLM.

Input should be a bounded set of representative traces and aggregate metadata, not all member traces:

```text
cluster centroid metadata
representative user/assistant snippets
common root span names/tools/outcomes
counts and trend signals
```

Output:

```ts
{
  label: string
  description: string
  userIntentSummary: string
  assistantBehaviorSummary: string
  suggestedParentCategory?: string
  suggestedSubcategory?: string
  outcomeTags: string[]
}
```

LLM labels are suggestions until persisted on a cluster. Reviewed user labels must not be overwritten automatically.

## Data Model

### Postgres - Canonical Mutable State

Postgres owns reviewed and mutable product state.

#### `intent_clusters`

Project-scoped cluster records.

Important fields:

```text
id
organization_id
project_id
label
description
status -- emergent | reviewed | ignored | merged | archived
centroid_embedding_model
centroid_vector -- storage shape TBD; JSON for MVP is acceptable if cluster count is modest
first_seen_at
last_seen_at
trace_count
representative_trace_id
merged_into_cluster_id nullable
created_at
updated_at
```

Required query shapes:

- list active/emergent clusters by project ordered by recent volume/trend
- find cluster by id within active organization/project
- list reviewed cluster centroids for live assignment
- update review status and label/description

#### `intent_taxonomy_nodes`

Project-scoped hierarchy nodes.

Important fields:

```text
id
organization_id
project_id
parent_id nullable
name
description
status -- active | ignored | archived
sort_order
created_at
updated_at
```

Required query shapes:

- list active taxonomy tree by project
- find children of a node
- attach/detach clusters to taxonomy nodes

#### `intent_cluster_taxonomy_links`

A cluster may be attached to one canonical taxonomy node for MVP. Use a join table anyway to preserve flexibility for future multi-axis classification.

```text
id
organization_id
project_id
cluster_id
taxonomy_node_id
created_at
updated_at
```

#### `intent_clustering_runs`

Batch-run lifecycle and audit state.

```text
id
organization_id
project_id
window_start
window_end
status -- running | completed | failed
strategy -- knn-community | hdbscan | spherical-kmeans
parameters_json
error_message nullable
created_at
completed_at nullable
```

### ClickHouse - High-Volume Analytical Assignments

ClickHouse owns high-volume trace assignment analytics.

#### `trace_intent_assignments`

Append-only table.

```text
organization_id String
project_id String
trace_id String
cluster_id String
clustering_run_id String
trace_start_time DateTime64
assigned_at DateTime64
assignment_source LowCardinality(String) -- nearest-centroid | knn-community | hdbscan | manual | unclustered
confidence Float32
membership_probability Float32
embedding_model LowCardinality(String)
retention_days UInt16
```

Query shapes:

- count traces by cluster over a time window
- list clusters by trend and volume
- filter trace list by cluster id
- compute cluster-level metrics from joined trace data
- list representative trace ids for a cluster

All ClickHouse queries must use parameterized bindings.

### Weaviate - Cluster Projection Search

Weaviate should mirror reviewed/emergent cluster projections for semantic search and nearest cluster retrieval when that is preferable to ClickHouse vector scans.

Collection candidate:

```text
IntentClusters
  label
  description
  representativeText
```

Use self-provided vectors and project-scoped multi-tenancy, following the existing issues collection pattern in `packages/platform/db-weaviate`.

## Repository and Package Boundaries

### Domain Package

Create:

```text
packages/domain/intent-taxonomy
```

Expected structure:

```text
src/constants.ts
src/entities/intent-cluster.ts
src/entities/intent-taxonomy-node.ts
src/entities/intent-clustering-run.ts
src/errors.ts
src/helpers.ts
src/ports/intent-cluster-repository.ts
src/ports/intent-assignment-repository.ts
src/ports/intent-clustering-run-repository.ts
src/ports/intent-cluster-projection-repository.ts
src/ports/intent-discovery-engine.ts
src/use-cases/assign-trace-to-intent-cluster.ts
src/use-cases/discover-intent-clusters.ts
src/use-cases/list-intent-taxonomy.ts
src/use-cases/list-emergent-intent-clusters.ts
src/use-cases/review-intent-cluster.ts
```

Domain code owns:

- entity schemas
- review lifecycle rules
- assignment thresholds as constants
- reconciliation rules
- use-case orchestration against ports

Domain code must not import concrete ClickHouse, Postgres, Weaviate, queue, or AI clients.

### Platform Packages

Add or extend:

```text
packages/platform/db-postgres
  intent cluster repositories

packages/platform/db-clickhouse
  trace assignment repository
  embedding-window read methods

packages/platform/db-weaviate
  intent cluster projection repository

packages/platform/clustering
  kNN community detection adapter
  optional HDBSCAN adapter
```

The clustering package should expose a strategy-independent contract:

```ts
interface DiscoveryPoint {
  readonly traceId: TraceId
  readonly embedding: readonly number[]
  readonly startTime: Date
}

interface DiscoveredCluster {
  readonly localClusterId: string
  readonly memberTraceIds: readonly TraceId[]
  readonly centroid: readonly number[]
  readonly representativeTraceIds: readonly TraceId[]
  readonly confidence: number
}

interface IntentDiscoveryEngineShape {
  discover(input: {
    readonly points: readonly DiscoveryPoint[]
    readonly strategy: IntentDiscoveryStrategy
    readonly parameters: IntentDiscoveryParameters
  }): Effect.Effect<readonly DiscoveredCluster[], IntentDiscoveryError>
}
```

### Workers

Add:

```text
apps/workers/src/workers/intent-taxonomy.ts
```

Queue topic:

```text
intent-taxonomy
  assignTrace
  discoverClusters
  labelCluster
```

Payloads carry ids only:

```ts
assignTrace: {
  organizationId: string
  projectId: string
  traceId: string
}

discoverClusters: {
  organizationId: string
  projectId: string
  windowStart: string
  windowEnd: string
  strategy?: "knn-community" | "hdbscan"
}

labelCluster: {
  organizationId: string
  projectId: string
  clusterId: string
}
```

`trace-end` or `trace-search` should enqueue intent assignment only after the trace has enough indexed content or an embedding. Do not add expensive intent work to the ingestion hot path.

## UI Scope

Web UI should be implemented under the project route:

```text
apps/web/src/routes/_authenticated/projects/$projectId/intent-taxonomy/
  index.tsx
  -components/taxonomy-tree.tsx
  -components/emergent-intents-panel.tsx
  -components/intent-cluster-detail.tsx
  -components/intent-trace-list.tsx
  -components/review-intent-actions.tsx
```

Domain functions and collections:

```text
apps/web/src/domains/intent-taxonomy/intent-taxonomy.functions.ts
apps/web/src/domains/intent-taxonomy/intent-taxonomy.collection.ts
```

Initial UI requirements:

- live taxonomy tree with counts and trend indicators
- emergent clusters panel for unreviewed/new clusters
- cluster detail drawer/page with representative traces
- trace list filtered by selected cluster
- review actions: rename, ignore, promote/review, merge

## Cost Controls

The system must remain viable for projects with 500k+ traces per month.

Required controls:

- reuse existing trace-search embeddings where possible
- dedupe intent signature embeddings by content hash
- avoid LLM calls per trace
- batch LLM labeling at cluster level
- label only new or materially changed clusters by default
- cap representative traces sent to LLM labeler
- degrade by delaying long-tail labeling, not by skipping trace assignment
- enforce organization/project-scoped budgets for any new embedding or LLM path

If existing trace-search budgets prevent embedding all traces, this feature should still write lexical/unclustered state where possible and surface budget-limited coverage clearly in internal metrics.

## Open Questions

- Should the intent signature be exactly the existing trace-search document, a new derived projection, or a dedicated field in `trace_search_documents`?
- Should centroid vectors live in Postgres JSON, ClickHouse, or only Weaviate for MVP?
- Should assistant behaviour and user intent be separate cluster axes from day one, or should MVP cluster a combined behavior signature and add axes later?
- What similarity thresholds are acceptable on real Latitude traces?
- Should taxonomy review actions be exposed publicly in API/MCP in the same phase as web UI, or after MVP validation?
- Which JS clustering package, if any, is acceptable for HDBSCAN? If none, should Python be introduced as a subprocess/service only for offline experiments?

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 0 - Product and Data Validation

- [ ] **P0-1**: Export a small anonymized sample of trace-search documents and embeddings from representative projects.
- [ ] **P0-2**: Prototype trace-level vectors by averaging normalized chunk embeddings and compare against tail-chunk-only vectors.
- [ ] **P0-3**: Run offline kNN graph clustering on sample data and inspect cluster quality.
- [ ] **P0-4**: Run offline HDBSCAN on the same sample data and compare quality, noise rate, stability, and parameter sensitivity.
- [ ] **P0-5**: Choose MVP discovery strategy and initial thresholds from evidence.
- [ ] **P0-6**: Decide whether MVP clusters combined user/assistant behavior or separates user intent, assistant behavior, and outcome axes.

**Exit gate**:

- MVP algorithm and thresholds are selected with sample outputs reviewed by product/engineering.
- Open storage decisions needed for Phase 1 are resolved.

### Phase 1 - Domain and Storage Foundation

- [ ] **P1-1**: Create `packages/domain/intent-taxonomy` with entity schemas, constants, errors, ports, and helper functions.
- [ ] **P1-2**: Add Postgres tables for `intent_clusters`, `intent_taxonomy_nodes`, `intent_cluster_taxonomy_links`, and `intent_clustering_runs` with organization-scoped RLS and repository adapters.
- [ ] **P1-3**: Add ClickHouse migrations for `trace_intent_assignments` in both unclustered and clustered migration trees using `ch:create`.
- [ ] **P1-4**: Add ClickHouse repository methods to read trace vectors by project/window and write assignment batches.
- [ ] **P1-5**: Add test fixtures and seed data for clusters and assignments.

**Exit gate**:

- Domain tests and repository tests pass.
- Storage supports listing clusters and writing/querying trace assignments.

### Phase 2 - Live Assignment

- [ ] **P2-1**: Implement `assignTraceToIntentClusterUseCase` using nearest active cluster centroid with threshold-based confidence.
- [ ] **P2-2**: Add `intent-taxonomy:assignTrace` queue topic and worker handler.
- [ ] **P2-3**: Enqueue assignment after trace-search embedding refresh when embedding data is available.
- [ ] **P2-4**: Write unclustered/low-confidence assignments for traces that do not match existing clusters.
- [ ] **P2-5**: Add metrics/logging for assignment coverage, low-confidence rate, and missing-embedding rate.

**Exit gate**:

- Every eligible trace can receive an assignment or explicit unclustered result without a per-trace LLM call.

### Phase 3 - Batch Discovery

- [ ] **P3-1**: Add `packages/platform/clustering` with strategy-independent discovery contracts.
- [ ] **P3-2**: Implement MVP `knn-community` discovery strategy.
- [ ] **P3-3**: Implement `discoverIntentClustersUseCase` to create a clustering run, load points, run discovery, reconcile clusters, and write assignments.
- [ ] **P3-4**: Add `intent-taxonomy:discoverClusters` worker task.
- [ ] **P3-5**: Add scheduling/backfill entrypoints for project/window discovery.
- [ ] **P3-6**: Add optional experimental HDBSCAN strategy behind the same port if a viable implementation is selected.

**Exit gate**:

- Recent unclustered/low-confidence traces are grouped into emergent clusters and assigned in ClickHouse.
- Reviewed clusters are not overwritten by discovery reruns.

### Phase 4 - Cluster Labeling and Review

- [ ] **P4-1**: Add cluster-level LLM labeling use-case and queue task.
- [ ] **P4-2**: Build bounded representative trace prompt inputs.
- [ ] **P4-3**: Persist generated label/description only for unreviewed clusters.
- [ ] **P4-4**: Implement review actions: rename, ignore, promote/review, merge.
- [ ] **P4-5**: Add audit metadata for review actions.

**Exit gate**:

- New clusters can be automatically labeled, then reviewed and stabilized by users.

### Phase 5 - Web UI MVP

- [ ] **P5-1**: Add web server functions and collections for taxonomy and emergent clusters.
- [ ] **P5-2**: Add project route for intent taxonomy.
- [ ] **P5-3**: Implement emergent intents panel with counts, first-seen, trend, and representative examples.
- [ ] **P5-4**: Implement taxonomy tree with category/subcategory/cluster hierarchy.
- [ ] **P5-5**: Implement cluster detail view and trace drilldown.
- [ ] **P5-6**: Implement review actions in the UI.

**Exit gate**:

- Users can discover, inspect, and review emergent intent clusters from the web app.

### Phase 6 - Production Hardening

- [ ] **P6-1**: Add backfill tooling for historical traces.
- [ ] **P6-2**: Add budget and rate-limit enforcement for cluster labeling.
- [ ] **P6-3**: Add coverage dashboards/metrics for assignment coverage and cluster churn.
- [ ] **P6-4**: Add API/MCP-compatible use-cases or routes for core taxonomy read/review capabilities.
- [ ] **P6-5**: Promote stable architecture and behavior into `dev-docs/*` and remove or shrink this spec.

**Exit gate**:

- The feature can run continuously on high-volume projects without per-trace LLM cost, unstable reviewed taxonomy state, or hidden coverage loss.
