# Live Intent Taxonomy

> **Documentation**: `dev-docs/spans.md`, `dev-docs/reliability.md`, `dev-docs/issues.md`, `dev-docs/projects.md`

## Spec Contract

This spec defines the spike plan for a live taxonomy of user intents and assistant behaviours over production traces.

The system must classify eligible production traces without running a generative LLM classifier per trace. It should use the existing trace-search indexing path, ClickHouse vector storage, Postgres canonical state, nearest-centroid assignment, and batch clustering for coverage; reserve LLM generation for segment/trace summarization, cluster labeling, taxonomy placement suggestions, and review assistance.

While this feature is under construction, this spec is the source of truth. Durable final behavior should be promoted into the linked `dev-docs/*` files once implementation stabilizes.

## Current Implementation Baseline

The spike must build on the current repository shape, not the older Linear proposal.

### What exists now

- There is **no Weaviate package or external vector database** in the monorepo. Do not add `packages/platform/db-weaviate` or design around Weaviate projections.
- Trace search already stores lexical and semantic search data in **ClickHouse**:
  - `trace_search_documents`: one lexical row per trace, 90-day TTL.
  - `trace_search_embeddings`: one embedding row per trace chunk, 30-day TTL.
- `buildTraceSearchDocument` already turns trace messages into searchable text and embedding chunks:
  - excludes system prompts, reasoning, and tool result payloads
  - keeps user/assistant text and tool-call names
  - builds full-trace lexical text plus chunked embedding text
  - selects head+tail turns for long traces and prioritizes tail chunks under budget pressure
- Trace-search embeddings use `voyage-4-large` at 2048 dimensions and are generated with `inputType: "document"`.
- Trace-search query-time semantic search runs inline in `TraceRepositoryLive` via ClickHouse `cosineDistance`; there is intentionally no standalone semantic-candidate read port today.
- Query embedding is cached through the shared AI cache. Indexing has organization-scoped token budgets in Redis.
- Issue discovery already proves the desired canonical-vector pattern in Postgres: canonical rows own mutable state, derived `pgvector` columns power exact semantic search, and ClickHouse owns analytics mirrors.
- The web project routes use `$projectSlug`, not `$projectId`, in route paths.

### Consequences for this spike

- **Remove Weaviate from the plan entirely.** Nearest-cluster retrieval should use Postgres pgvector for canonical cluster centroids or ClickHouse/in-process scans for analytical experiments.
- **Do not duplicate trace-search indexing unless the spike proves a new projection is needed.** Phase 0 should first reuse `trace_search_documents` and `trace_search_embeddings`.
- **Do add read-oriented ports/methods for taxonomy discovery.** The current `TraceSearchRepository` only supports write/dedup indexing; taxonomy needs bounded project/window reads of trace documents, chunk embeddings, and possibly raw trace messages.
- **Respect trace-search TTLs.** The current semantic corpus is only 30 days. Historical taxonomy/backfill needs explicit re-indexing or a dedicated intent projection; it cannot assume embeddings exist for older traces.
- **Use the existing AI/Voyage abstractions.** Avoid a new embedding provider surface.
- **Treat ClickHouse vector scans as acceptable for the spike but not necessarily for production.** Trace search already documents that scans above ~1M embeddings per project become user-visible; taxonomy discovery should operate in windows and batch jobs.

## Product Goal

Latitude users need a way to explore recurring and emerging behaviours in their LLM applications without manually searching through raw traces. The product should surface:

- what users are trying to accomplish
- how assistants behave in response
- which behaviours are new, growing, unresolved, costly, or failure-prone
- representative traces and conversation moments for each behavior cluster
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

## Competitor Post Takeaways

The Moda clustering post is a useful benchmark because it describes a production-scale unsupervised clustering system over conversation data. The following points should shape our plan:

1. **Trace-level clustering can be too coarse for long multi-topic interactions.** A single trace can contain several unrelated intents. Segment-level clustering should be evaluated before committing to trace-only product semantics.
2. **Summaries are better embedding inputs than raw transcripts.** Raw text carries filler, tool noise, and context-window truncation risk. The plan should test compact intent/behavior summaries against the existing trace-search chunk embeddings.
3. **Noise is a product signal, not waste.** Unassigned or low-confidence items should feed an emerging-behavior path, not disappear into a generic null bucket.
4. **Thresholds should be calibrated from data, not hand-picked forever.** Initial constants are fine for the spike, but the architecture should preserve calibration/evaluation hooks.
5. **Cluster labels need coverage-aware representatives.** Random representatives over-sample dense centers. We should choose centroid-near and frontier examples for LLM labeling.
6. **Batch clustering output is unstable.** Stable product identity must be canonical clusters/taxonomy nodes plus lineage/reconciliation, not raw batch labels.
7. **Online assignment needs both absolute and relative confidence gates.** A nearest centroid can be far away but still be the winner; it can also be close but ambiguous. Both cases should route to low-confidence/noise.

## Comparison With the Original Linear Plan

| Area | Original plan | Current spike plan |
| --- | --- | --- |
| Vector store | Weaviate mirror for cluster projections | No Weaviate; use Postgres pgvector for canonical centroids and ClickHouse for high-volume vectors/analytics |
| Trace representation | One vector per trace from an intent signature | Start from existing trace-search chunk embeddings; compare chunk/trace rollup/summary strategies |
| Unit of analysis | Trace-level clusters | Evaluate segment-level clusters, but use existing trace chunks as the cheapest first proxy |
| Discovery backend | kNN graph community detection MVP, HDBSCAN optional | Keep kNN MVP; evaluate UMAP/HDBSCAN offline behind a strategy port only if quality justifies operational cost |
| Assignment gates | High/medium similarity thresholds | Add absolute cosine threshold plus relative margin/softmax-style confidence threshold |
| Noise handling | Unclustered/emergent-candidate assignment | Treat noise as a first-class rolling bucket for emerging clusters and coverage metrics |
| Labeling | Representative traces and aggregate metadata | Use coverage-aware sampling: centroid-near canonical examples plus farthest/frontier examples |
| Stability | Reconcile components against existing clusters | Add explicit lineage types: continuation, split, merge, birth, death |
| Calibration | Tune thresholds from real traces | Add a small human-reviewed evaluation set and periodic parameter report as spike deliverables |
| Package boundaries | Includes `packages/platform/db-weaviate` | Do not add Weaviate; add read/query methods to ClickHouse and Postgres adapters instead |

## Non-Goals

- Do not run a full LLM classifier per trace or segment as the primary classification mechanism.
- Do not require users to predefine the taxonomy before traces can be classified.
- Do not make HDBSCAN, graph clustering, or any batch algorithm the canonical source of reviewed taxonomy identity.
- Do not let clustering reruns silently rename, delete, or reshape user-reviewed taxonomy nodes.
- Do not add Weaviate or another external vector database for this spike.
- Do not build this as a web-only capability; core use-cases and DTOs should be reusable by future MCP/API surfaces.

## Definitions

### Eligible trace

A trace that has reached the existing trace-end lifecycle and has enough conversation content to build a meaningful trace-search document, intent signature, or one or more segment signatures.

### Intent segment

A contiguous topic-coherent slice of a trace. Segment-level discovery is preferred when traces contain multiple user intents, long tool loops, or pivots from one task to another.

For the first spike, existing trace-search chunks can act as a cheap proxy for segments, but they are not equivalent: trace-search chunks are budget/packing slices, while intent segments should eventually be topic-coherent.

### Segment summary

A compact textual representation of one intent segment used for embedding and clustering. It should capture:

- the user goal or question
- the assistant behaviour or failure mode
- coarse outcome/status
- important tool names or root span names when they explain behaviour

It should exclude full system prompts, reasoning content, large tool payloads, unrelated metadata dumps, and incidental private details when not needed for clustering.

### Trace rollup summary

A summary stitched from segment summaries. Trace rollups are useful for dashboards, search, and trace-level navigation, but should not be the only clustering primitive if Phase 0 shows multi-topic traces are common.

### Intent cluster

A discovered group of similar intent segments, trace-search chunks, or trace rollups. Intent clusters are project-scoped and organization-scoped. They may be emergent, reviewed, ignored, merged, or archived.

### Taxonomy node

A stable user-reviewable category or subcategory. Taxonomy nodes organize reviewed clusters into a hierarchy. They are canonical product objects and must remain stable across clustering runs.

### Segment/trace assignment

An append-only analytical record saying that a segment or trace belongs to a cluster with confidence and membership scores. High-volume assignments belong in ClickHouse.

### Clustering run

A batch discovery run over a bounded project/time window. A run produces proposed cluster evidence and assignments, but does not directly replace the canonical reviewed taxonomy.

## Core Design Principles

1. **Classify every eligible trace, but do not LLM-classify every trace.** Every eligible trace should receive cluster assignments for its eligible segments/chunks, or explicit unclustered/noise assignments.
2. **Reuse existing trace-search data first.** The current ClickHouse trace-search corpus is the fastest spike substrate and already follows privacy/noise exclusions.
3. **Cluster summaries when quality requires it.** If raw chunk embeddings produce poor cluster labels, introduce segment/trace summaries as an additional projection.
4. **Separate live assignment from batch discovery.** New segments/chunks should be assigned cheaply to existing cluster centroids. Batch jobs discover new clusters and suggest taxonomy changes.
5. **Separate discovered evidence from canonical taxonomy.** Clustering output is evidence. User-reviewed taxonomy nodes and reviewed clusters are canonical product state.
6. **Keep cluster identity stable.** Batch algorithms may produce unstable labels. Reconcile discovered clusters to existing canonical clusters using centroid similarity, representative examples, and lineage.
7. **Use LLMs only for interpretation and summarization.** LLM calls may summarize segments, label clusters, suggest merges/splits, and suggest taxonomy placement; they must not be the per-item classifier.
8. **Treat noise as emerging signal.** Low-confidence and unassigned segments/chunks should be monitored and reclustered as the primary source of emerging behaviours.
9. **Preserve calibration hooks.** Every threshold and clustering parameter should be named, logged per run, and easy to evaluate against a held-out human-reviewed sample.

## Recommended Algorithm Architecture

### Stage 0 - Reuse, Segment, and Summarize

The spike should compare four vectorization strategies in this order:

1. **Existing trace-search chunk vectors**: use rows from `trace_search_embeddings` directly. This is the cheapest baseline and aligns with current ingestion.
2. **Trace-level pooled vector**: max/mean-pool normalized trace-search chunk vectors into one vector per trace.
3. **Trace rollup summary vector**: build one summary from `trace_search_documents.search_text` or raw trace messages and embed it.
4. **Intent segment summary vectors**: split the trace into topic-coherent segments, summarize each segment, and embed each summary.

Candidate segmentation strategies:

- use existing trace-search chunks as a proxy baseline
- message/turn windows with simple topic-shift heuristics
- cosine drift between adjacent turn-pair embeddings
- span/tool-boundary heuristics for agent traces
- fallback to one segment per short trace

Phase 0 should answer whether segment summaries produce enough quality lift over existing trace-search chunk vectors to justify additional storage, summarization cost, and backfill complexity.

### Stage 1 - Live Nearest-Centroid Assignment

On or after `trace-search:refreshTrace`, once trace-search embedding data exists:

```text
trace detail / trace-search chunks
  -> optional segment or rollup summaries
  -> embedding or reused trace-search embedding
  -> nearest active cluster centroids
  -> assignment rows in ClickHouse
```

Assignment policy:

```text
absolute similarity >= high threshold
and relative confidence/margin >= high threshold
  assign as high confidence

absolute similarity >= medium threshold
and relative confidence/margin >= medium threshold
  assign as low confidence and eligible for batch review

otherwise
  write unclustered/noise assignment
  include in rolling emerging-cluster discovery
```

The relative gate can start as a simple top-1 minus top-2 cosine margin. A temperature-scaled softmax over top centroid similarities is an optional later improvement if validation shows margin is not stable enough.

Live assignment should not run in the trace ingestion hot path. It should be triggered after trace-search indexing completes or as a downstream queue task from the trace-search worker.

### Stage 2 - Batch Discovery

The MVP discovery backend should run periodically over recent unclustered, low-confidence, and sampled recently assigned chunks/segments/traces.

Recommended MVP algorithm remains kNN graph community detection because it is easy to inspect:

1. Load vectors for the project/window from ClickHouse or a derived intent projection.
2. Normalize vectors.
3. Build a k-nearest-neighbor graph per project/window.
4. Keep edges above a cosine similarity threshold.
5. Run connected components or simple community detection.
6. Drop components below `minClusterSize` into noise.
7. Compute centroids and representative examples.
8. Reconcile components against existing canonical clusters.
9. Create new emergent clusters or update existing cluster evidence.
10. Write assignment rows with `assignmentSource = "knn-community"`.

HDBSCAN should remain an experimental backend behind the same discovery port. For the spike, evaluate whether UMAP + HDBSCAN improves cluster quality/noise rate enough to justify Python or a separate offline service. Do not persist UMAP coordinates as product state; product identity should anchor on original embedding-space centroids and canonical cluster ids.

### Stage 3 - Noise and Emerging Clusters

Unassigned/noise segments should be stored explicitly and reclustered on a rolling window.

Rules:

- noise buckets are project-scoped and organization-scoped
- noise share is a first-class metric per project/run
- emerging clusters can be born from noise when they cross minimum support
- an emerging cluster can be absorbed into an existing reviewed cluster when centroid similarity and representative examples support it
- long-tail noise can remain unlabeled, but coverage loss must be visible in metrics

### Stage 4 - Reconciliation and Lineage

Batch runs should reconcile new components against existing canonical clusters before mutating product state.

Lineage classifications:

- `continuation`: one old cluster maps cleanly to one new component
- `split`: one old cluster maps to multiple new components
- `merge`: multiple old clusters map to one new component
- `birth`: a new component has no sufficiently similar prior cluster
- `death`: an old cluster has no sufficiently similar new evidence in the run window

Initial reconciliation can use centroid cosine plus representative-example overlap. The spike should log a similarity matrix and lineage decision for every changed cluster so reviewers can inspect churn.

Reviewed cluster labels and taxonomy placements must never be overwritten automatically by lineage decisions. Splits/merges should be surfaced as review suggestions.

### Stage 5 - Cluster Labeling

Only new or materially changed clusters should be labeled by LLM.

Labeling input should use bounded representative examples:

- one or more centroid-near canonical examples
- frontier examples chosen to maximize semantic coverage
- aggregate metadata: count, trend, common tools/root spans/outcomes, error rates, cost/duration summaries

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

LLM labels are suggestions until persisted on an unreviewed cluster. Reviewed user labels must not be overwritten automatically.

## Data Model

### Postgres - Canonical Mutable State

Postgres owns reviewed and mutable product state:

- `intent_clusters`
- `intent_taxonomy_nodes`
- `intent_cluster_taxonomy_links`
- `intent_clustering_runs`
- optional `intent_cluster_lineage_edges` if lineage needs to be queryable beyond run metadata

`intent_clusters` should mirror the issue-centroid pattern:

```text
id
organization_id
project_id
label
description
status -- emergent | reviewed | ignored | merged | archived
centroid -- JSON running centroid state
centroid_embedding vector(2048) -- derived normalized pgvector for nearest-centroid search
centroid_embedding_model
first_seen_at
last_seen_at
trace_count
segment_count
representative_trace_id
representative_segment_id nullable
merged_into_cluster_id nullable
created_at
updated_at
```

Use Postgres pgvector for canonical cluster centroid search unless Phase 0 proves cluster counts are too large for exact project-scoped scans. Do not introduce an external vector DB.

### ClickHouse - High-Volume Analytical Assignments

Add a new assignment table. It should support both trace-level and segment/chunk-level assignments.

Recommended generic shape:

```text
organization_id String
project_id String
trace_id String
segment_id String -- empty string for trace-level assignments; may encode chunk index for trace-search chunk baseline
cluster_id String -- empty string for unclustered/noise
clustering_run_id String
trace_start_time DateTime64
segment_start_time Nullable(DateTime64)
assigned_at DateTime64
assignment_source LowCardinality(String) -- nearest-centroid | knn-community | hdbscan | manual | unclustered
confidence Float32
membership_probability Float32
absolute_similarity Float32
relative_confidence Float32
embedding_model LowCardinality(String)
retention_days UInt16
```

Query shapes:

- count traces and segments by cluster over a time window
- list clusters by trend and volume
- filter trace list by cluster id
- compute cluster-level metrics from joined trace data
- list representative trace/segment ids for a cluster
- measure assignment coverage, noise share, low-confidence share, and cluster churn

All ClickHouse queries must use parameterized bindings.

### Trace-Search Read Methods Needed

Current trace-search ports are indexing-only. Add bounded read methods in the appropriate ClickHouse adapter/port for the spike, for example:

```ts
listTraceSearchVectorsByProjectWindow(input: {
  organizationId: OrganizationId
  projectId: ProjectId
  windowStart: Date
  windowEnd: Date
  limit: number
}): Effect.Effect<readonly TraceSearchVectorPoint[], RepositoryError>
```

Each point should include `traceId`, `chunkIndex`, `startTime`, `rootSpanName`, `embeddingModel`, `embedding`, and enough text metadata to inspect examples. Keep these reads explicitly project/window bounded to avoid accidental full-table scans.

### Intent Segment Projection

Do not add a durable segment-summary table until Phase 0 chooses segment summaries for MVP. If needed, add a ClickHouse table or Postgres table only after deciding:

- retention window
- backfill story
- whether summaries are product-visible artifacts
- whether segment ids need stable identity across reruns
- cost/budget policy for summary generation and embedding

## Package Boundaries

Create and extend:

```text
packages/domain/intent-taxonomy
packages/platform/db-postgres
packages/platform/db-clickhouse
packages/platform/clustering
apps/workers/src/workers/intent-taxonomy.ts
apps/web/src/routes/_authenticated/projects/$projectSlug/intent-taxonomy/
apps/web/src/domains/intent-taxonomy/
```

Do **not** add `packages/platform/db-weaviate`.

Domain code owns:

- entity schemas
- review lifecycle rules
- assignment thresholds as named constants
- reconciliation and lineage rules
- use-case orchestration against ports

Domain code must not import concrete ClickHouse, Postgres, queue, or AI clients.

## Alerts and Notifications

Reuse the existing alerts pipeline instead of creating a parallel system.

Add:

- source type: `intent_cluster`
- incident kinds: `intent_cluster.new`, `intent_cluster.regressed`, `intent_cluster.escalating`
- lifecycle events for cluster creation, regression, escalation, and escalation end
- notification payload support and project settings toggles for intent alert kinds

Escalation detection should read assignment aggregates from ClickHouse and derive current open/closed state through alert incidents, matching issue alerts.

## Cost Controls

Required controls:

- reuse existing trace-search embeddings where possible
- avoid LLM classification per trace/segment
- cache/dedupe any new segment and rollup summaries by content hash
- route any new embedding or summarization through organization/project-scoped budgets
- batch LLM labeling at cluster level
- label only new or materially changed clusters by default
- cap representative examples sent to LLM labeler
- degrade by delaying long-tail labeling, not by skipping assignment
- surface budget-limited coverage in metrics

## Seed Data Revamp Input Datasets

A seed-data revamp should happen before Phase 0 algorithm evaluation so local development contains realistic customer-support trajectories rather than mostly Acme novelty scenarios.

Recommended source hierarchy:

1. **Primary source: τ-bench / τ³-bench (`sierra-research/tau2-bench`)** — best fit for AI-agent support trajectories. It is MIT-licensed and contains customer-service tasks, policies, domain databases, tool definitions, evaluation criteria, and published result JSON files with full simulated trajectories: user turns, assistant turns, assistant tool calls, tool results, costs, termination reason, and reward info. Use the `retail`, `telecom`, `airline`, and `banking_knowledge` domains as realistic support-agent seed material.
2. **Primary domain subset: τ³ `telecom` and `retail`** — `telecom` provides troubleshooting/workflow-heavy support trajectories with user tools and operational checks; `retail` provides ecommerce returns, exchanges, cancellation, account lookup, and order-management trajectories. These map directly onto Latitude spans with model calls, tool calls, tool results, success/failure labels, and support-intent ground truth.
3. **Supplemental source: τ³ `banking_knowledge`** — useful for knowledge-retrieval customer support, recommendations, and document-grounded answer patterns. Include only if the seed should exercise RAG/document-search trajectories.
4. **Supplemental source: τ³ `airline`** — useful for policy-heavy booking/cancellation flows, but slightly less aligned with generic customer support than retail/telecom.
5. **Do not use ABCD as the primary source.** ABCD is human-to-human support dialogue with `action` annotations, not AI-agent telemetry. It can inspire user-support intents, but it should not be the main seed source for this spike.
6. **Not recommended for default seeds: Customer Support on Twitter** — real-world support language and thread links are attractive, but brand-specific public tweets, Kaggle distribution, and Twitter/X terms make it a poor default repository seed source. Use only for private/offline analysis if legal/licensing is approved.
7. **Avoid: low-quality synthetic turn tables with random filler or one-turn QA.** They do not provide agent trajectories and would actively degrade clustering evaluation.

Seed replacement plan:

- Re-theme the default seed from Acme novelty support toward a realistic ecommerce/telecom support agent while keeping the existing coherent single-tenant graph.
- Build deterministic trace families from τ³ result trajectories, converting published `messages` into Latitude spans: assistant/user messages, `tool_calls`, tool result rows, model usage/cost metadata, termination reason, and reward/success labels.
- Preserve enough task metadata (`domain`, task id, reason for call, expected actions, reward, and termination reason) to act as seed-only ground truth for intent-taxonomy evaluation, but do not expose those labels to the clustering algorithm.
- Use failed and partial-reward trajectories as realistic reliability issues: unauthorized policy exceptions, missing authentication, wrong tool sequence, incomplete troubleshooting, unnecessary transfer, incorrect cancellation/refund/exchange handling, and unsupported escalation promises.
- Keep successful trajectories as controls so clustering can separate user intent from assistant failure outcome.
- Keep all copied dataset-derived content in `packages/domain/shared/src/seed-content/*`; seeders should continue importing through `@domain/shared/seeding`.
- Include the τ³ MIT license notice and transformation notes alongside the seed content.

## Revised Open Questions

- Do existing trace-search chunk embeddings produce useful clusters, or do we need true topic-coherent segment summaries?
- If segment summaries win, where should stable segment identity and summary storage live?
- Are user intent, assistant behavior, and outcome best represented as one combined embedding axis or three linked axes?
- Which absolute and relative assignment thresholds achieve acceptable false-assignment and noise rates on a human-reviewed sample?
- Is kNN community detection good enough for MVP, or does UMAP + HDBSCAN produce materially better emergent clusters?
- Should canonical centroids use the same issue-style Postgres pgvector pattern from day one?
- Should lineage edges be persisted as first-class rows or only stored in clustering run metadata for the first release?
- How much does the 30-day `trace_search_embeddings` TTL constrain useful taxonomy discovery and historical backfill?

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase -1 - Realistic Seed Data Revamp

- [ ] **P-1-1**: Replace the default seed narrative with a realistic customer-support agent project while preserving one coherent organization/project graph.
- [ ] **P-1-2**: Import or adapt a curated subset of τ³-bench result trajectories into shared seed content, retaining task/domain/reward metadata as seed-only ground truth.
- [ ] **P-1-3**: Convert τ³ assistant tool calls and tool result messages into realistic Latitude spans so seeded traces look like AI support-agent trajectories, not flat chat transcripts.
- [ ] **P-1-4**: Select both successful and failed/partial-reward trajectories so taxonomy experiments can distinguish user intent, assistant behavior, and outcome.
- [ ] **P-1-5**: Rework seeded issues, evaluations, datasets, annotation queues, and fixed traces around realistic support failure families from retail/telecom/banking trajectories.
- [ ] **P-1-6**: Document dataset provenance, licenses, transformations, and any content that is generated rather than copied.

**Exit gate**:

- Local seeds provide realistic, labeled customer-support trajectories suitable for intent-taxonomy clustering experiments.
- Existing reliability workflows still have deterministic traces and linked records.
- Seed content provenance and licenses are clear enough for repository inclusion.

### Phase 0 - Product and Data Validation

- [ ] **P0-1**: Export a small anonymized sample of current `trace_search_documents`, `trace_search_embeddings`, trace metadata, and representative trace details from active projects.
- [ ] **P0-2**: Cluster existing trace-search chunk vectors and inspect output quality before adding new summarization or segmentation storage.
- [ ] **P0-3**: Compare trace-search chunk vectors, pooled trace-level vectors, trace rollup summary vectors, and segment summary vectors.
- [ ] **P0-4**: Run offline kNN graph clustering on each vector strategy and inspect cluster quality.
- [ ] **P0-5**: Run offline HDBSCAN/UMAP experiments on the same sample and compare quality, noise rate, stability, parameter sensitivity, and operational complexity.
- [ ] **P0-6**: Create a small human-reviewed evaluation panel for cluster quality, assignment correctness, and lineage sanity.
- [ ] **P0-7**: Choose MVP unit of analysis, discovery strategy, canonical centroid storage, and initial absolute/relative assignment thresholds from evidence.
- [ ] **P0-8**: Decide whether MVP clusters combined user/assistant/outcome behavior or separate axes.

**Exit gate**:

- MVP algorithm, unit of analysis, storage shape, and thresholds are selected with sample outputs reviewed by product/engineering.
- Noise rate, low-confidence rate, cluster churn, and labeling quality are measured on sample data.
- The plan explicitly accounts for trace-search TTL and backfill limits.

### Phase 1 - Domain and Storage Foundation

- [ ] **P1-1**: Create `packages/domain/intent-taxonomy` with entity schemas, constants, errors, ports, and helper functions.
- [ ] **P1-2**: Add Postgres tables for clusters, taxonomy nodes, cluster-taxonomy links, clustering runs, and optional lineage edges with organization-scoped RLS and repository adapters.
- [ ] **P1-3**: Store canonical cluster centroid state in Postgres using the issue-style JSON centroid plus derived pgvector column unless Phase 0 rejects this.
- [ ] **P1-4**: Add ClickHouse migrations for segment/trace intent assignments in both unclustered and clustered migration trees using `ch:create`.
- [ ] **P1-5**: Add bounded ClickHouse repository methods to read trace-search vectors/documents by project/window and write assignment batches.
- [ ] **P1-6**: Add durable segment-summary storage only if Phase 0 chooses segment-level MVP.
- [ ] **P1-7**: Extend shared alert source/kind primitives with `intent_cluster` source type and `intent_cluster.*` incident kinds, including severity defaults.
- [ ] **P1-8**: Add test fixtures and seed data for clusters, lineage, and assignments.

**Exit gate**:

- Domain tests and repository tests pass.
- Storage supports listing clusters, nearest-centroid lookup, recording lineage metadata, and writing/querying segment or trace assignments.
- No Weaviate or external vector DB dependency is introduced.

### Phase 2 - Live Assignment

- [ ] **P2-1**: Implement `assignTraceToIntentClusterUseCase` using nearest active cluster centroid with absolute and relative confidence gates.
- [ ] **P2-2**: Add `intent-taxonomy:assignTrace` queue topic and worker handler.
- [ ] **P2-3**: Enqueue assignment after `trace-search:refreshTrace` succeeds when embedding data is available.
- [ ] **P2-4**: Write unclustered/noise and low-confidence assignments for segments/chunks/traces that do not confidently match existing clusters.
- [ ] **P2-5**: Emit assignment-driven lifecycle events needed for future escalation checks without doing notification work inline.
- [ ] **P2-6**: Add metrics/logging for assignment coverage, low-confidence rate, noise rate, missing-embedding rate, TTL-missing rate, and gate rejection reasons.

**Exit gate**:

- Every eligible trace can receive segment/chunk or trace assignments, or explicit unclustered/noise results, without a per-trace LLM classifier.

### Phase 3 - Batch Discovery and Emerging Noise

- [ ] **P3-1**: Add `packages/platform/clustering` with strategy-independent discovery contracts.
- [ ] **P3-2**: Implement MVP `knn-community` discovery strategy.
- [ ] **P3-3**: Implement `discoverIntentClustersUseCase` to create a clustering run, load points, run discovery, reconcile clusters, classify lineage, and write assignments.
- [ ] **P3-4**: Add `intent-taxonomy:discoverClusters` worker task.
- [ ] **P3-5**: Add scheduling/backfill entrypoints for project/window discovery that respect trace-search embedding TTL and budget limits.
- [ ] **P3-6**: Add rolling noise-bucket discovery for emerging clusters.
- [ ] **P3-7**: Add optional experimental HDBSCAN/UMAP strategy behind the same port if Phase 0 shows enough quality gain.

**Exit gate**:

- Recent unclustered/low-confidence segments/chunks or traces are grouped into emergent clusters and assigned in ClickHouse.
- Reviewed clusters are not overwritten by discovery reruns.
- Discovery runs report lineage, churn, and noise metrics.

### Phase 4 - Cluster Labeling and Review

- [ ] **P4-1**: Add cluster-level LLM labeling use-case and queue task.
- [ ] **P4-2**: Build bounded representative prompt inputs with centroid-near and frontier examples.
- [ ] **P4-3**: Persist generated label/description only for unreviewed clusters.
- [ ] **P4-4**: Implement review actions: rename, ignore, promote/review, merge, and split-suggestion acknowledgement.
- [ ] **P4-5**: Add audit metadata for review actions.
- [ ] **P4-6**: Define which reviewed cluster states can later regress and emit `IntentClusterRegressed` when they do.

**Exit gate**:

- New clusters can be automatically labeled, then reviewed and stabilized by users without automatic overwrites.

### Phase 5 - Web UI MVP

- [ ] **P5-1**: Add web server functions and collections for taxonomy and emergent clusters.
- [ ] **P5-2**: Add project route at `apps/web/src/routes/_authenticated/projects/$projectSlug/intent-taxonomy/`.
- [ ] **P5-3**: Implement emergent intents panel with counts, first-seen, trend, noise source, and representative examples.
- [ ] **P5-4**: Implement taxonomy tree with category/subcategory/cluster hierarchy.
- [ ] **P5-5**: Implement cluster detail view and trace/segment drilldown.
- [ ] **P5-6**: Implement review actions in the UI.
- [ ] **P5-7**: Surface coverage, low-confidence, noise-rate, and TTL/backfill indicators so users and operators understand blind spots.

**Exit gate**:

- Users can discover, inspect, and review emergent intent clusters from the web app.

### Phase 6 - Production Hardening

- [ ] **P6-1**: Add backfill tooling for historical traces, including cost estimation and explicit re-indexing when trace-search embeddings have expired.
- [ ] **P6-2**: Add budget and rate-limit enforcement for summarization, embeddings, and cluster labeling.
- [ ] **P6-3**: Add coverage dashboards/metrics for assignment coverage, noise share, low-confidence share, cluster churn, lineage events, and label refresh volume.
- [ ] **P6-4**: Generalize alert incident creation/closing for non-issue sources or add intent-specific wrappers around a shared builder.
- [ ] **P6-5**: Add domain event fan-out from intent cluster lifecycle events to `alert-incidents` queue tasks.
- [ ] **P6-6**: Implement intent cluster escalation checks over ClickHouse assignment aggregates with throttle/debounce scheduling.
- [ ] **P6-7**: Extend in-app notification payloads, renderers, project settings toggles, and incident chart overlays for `intent_cluster.*` incidents.
- [ ] **P6-8**: Add API/MCP-compatible use-cases or routes for core taxonomy read/review capabilities.
- [ ] **P6-9**: Promote stable architecture and behavior into `dev-docs/*` and remove or shrink this spec.

**Exit gate**:

- The feature can run continuously on high-volume projects without per-trace LLM classification cost, external vector DB dependency, unstable reviewed taxonomy state, or hidden coverage loss.
