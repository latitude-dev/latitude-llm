# Live Behavior Taxonomy

> **Documentation**: `dev-docs/taxonomy.md` (to be created), `dev-docs/spans.md`, `dev-docs/issues.md`

A dynamic, project-scoped 2-level taxonomy of behaviors (user + agent) extracted from ingested traces. The taxonomy evolves as new traffic arrives: new behavior types are born from a noise bucket, existing categories absorb similar incoming sessions, and labels are LLM-named from cluster contents. The MVP is **TypeScript-orchestrated with a single Python sidecar** for the births step (UMAP + HDBSCAN), reusing the patterns proven by `@domain/issues` (running decayed centroid math, pgvector hybrid retrieval), `@platform/db-clickhouse` trace-search (org-scoped append-only embedding rows with TTL), and `@platform/op-gepa` (Python RPC engine with a TS client wrapping it).

The product surface (out of scope for the MVP backend, but worth fixing in mind) is a single project-scoped page showing categories and their member clusters, with example sessions per cluster:

```
Billing
  ├─ User requested cancellation                     1,243 sessions   ↑12%
  ├─ Agent failed to comply with cancellation         347 sessions   ↑45%
  └─ User asked about refund policy                   512 sessions    →
Product feedback
  ├─ User complained about not finding settings        88 sessions   new
  ├─ User reported broken integration                  41 sessions   new
  └─ User praised the assistant                       219 sessions    →
Onboarding
  └─ User stuck on signup flow                        163 sessions   ↑8%
```

## Shape of the MVP

The pipeline has a small number of moving parts and they sit at deliberate scales:

- **One observation per session.** Sessions are the durable conversational boundary in this product (see `specs/session-problems/`). In-session segmentation by cosine drift is reasonable Future Work.
- **2-level hierarchy: Category → Cluster.** Matches the product mockup. 3+ levels are reasonable Future Work.
- **Online assignment via pgvector exact cosine.** Per-project cluster counts are hundreds to low-thousands; brute-force exact cosine over the `(organization_id, project_id)` partition is sub-ms. Same pattern as `@domain/issues`.
- **Two-gate assignment (absolute + relative).** Either gate alone runs at ~5% false-assignment in published baselines; combined drops to ~2–3%. Cheap to implement, matches user intuition ("assign only if there's a clearly best match and it's actually close").
- **Periodic gardening pass per project.** Births new clusters from noise, merges near-duplicates, deprecates dead clusters, rebuilds the category hierarchy, and LLM-names changed clusters.
- **Births use UMAP + HDBSCAN via a Python sidecar** (`@platform/op-taxonomy-engine`, mirrors `@platform/op-gepa`). This is the one place we don't compromise: launching with medium+ tenants on day 1, the variable-density quality gap between fixed-threshold single-linkage and HDBSCAN is observable in the product surface (chained mega-clusters and over-split niches), so we take the Python sidecar cost on day 1.
- **Category roll-up uses pure-TS agglomerative average-linkage** over leaf-cluster centroids. Sub-millisecond at the 5–15 category count this targets; engine RPC would be artificial overhead.
- **Cluster labeling via Farthest-Point Sampling** over each cluster's member observation summaries, then map+reduce LLM calls to produce the final name + description.
- **Lineage** is recorded inline as births/merges happen (simple `Birth | Death | Continuation | Split | Merge` transition rows). A fuller Hungarian + secondary-link lineage matcher is documented under Future Work.
- **Named constants for every threshold**, seeded from a benchmark corpus and a tuning pass on the seeded Acme corpus. Bayesian / automated retuning is Future Work.

The architectural bet is that for the **per-tenant** scale this product actually runs at, a careful online-assignment + scheduled-gardening loop on top of pgvector + ClickHouse is sufficient to ship the product, with the Python engine carrying the one piece where quality matters most. If a tenant ever crosses the scale where exact pgvector cosine stops being instant on the online path, the existing trace-search HNSW/vector-similarity work is the natural upgrade path; nothing in this MVP design forecloses it.

## Scope

- **Per-session unit.** The clustered entity is one *behavior observation* per `(organizationId, projectId, sessionId)`. Multi-trace sessions are clustered once across all their traces.
- **Forward-only.** Sessions that complete after rollout are clustered. There is no first-class customer backfill in the product UI. Re-enqueueing past sessions through the worker works mechanically but is operational, not productized.
- **Project-scoped.** Every query, every centroid, every Redis key is `(organizationId, projectId)`-keyed. No cross-project, no cross-organization clustering.
- **2-level hierarchy.** Top-level Categories (`"Billing"`, `"Product feedback"`) own leaf Clusters (`"User requested cancellation"`). Sub-leaf or category-of-category structure is Future Work.
- **One canonical assignment per session.** An observation lands in exactly one leaf cluster (or in the noise bucket). Multi-label assignment is Future Work; in-session segmentation is Future Work.
- **Backend MVP only.** The PRD-level product surface in the opening illustration drives the data shape and the read endpoints, but no frontend work is part of this spec. Read use-cases ship as plain `@domain/taxonomy` use-cases consumable by `apps/web` server functions when the UI lands.

## Glossary

The vocabulary below is canonical. Code, dev-docs, and the product surface use these exact terms.

- **Observation** — one clustered behavior unit per session. Carries `summary`, `embedding`, `assignedClusterId`, `assignmentConfidence`, `assignmentMethod`. Stored append-only in ClickHouse `behavior_observations`.
- **Cluster** — a leaf taxonomy node. Carries a running weighted-decayed centroid, derived pgvector column, LLM-generated `name` and `description`, lifecycle state, and an optional `parentCategoryId`. Stored canonically in Postgres `taxonomy_clusters`.
- **Category** — a top-level grouping over clusters (e.g. `"Billing"`). Derived during gardening from the centroids of its member clusters. Stored canonically in Postgres `taxonomy_categories`.
- **Centroid** — the same running weighted-decayed-sum shape as `@domain/issues` (`{ base, mass, model, decay, weights }`), with a derived normalized `vector(2048)` column materialized inside the repository `save`. Decay anchor is a dedicated `clusteredAt`, not `updatedAt`. See `dev-docs/issues.md#centroids`.
- **Assignment** — the act of attaching a fresh observation to an existing cluster. Decided by the two-gate rule (absolute cosine ≥ `TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD` *and* softmax relative-margin ≥ `TAXONOMY_ASSIGN_RELATIVE_MARGIN`).
- **Noise bucket** — observations that fail to assign live in the noise bucket. The bucket is a ClickHouse predicate (`assigned_cluster_id = ''`), not a separate table.
- **Gardening** — the offline pass per project that births clusters from the noise bucket, merges near-duplicates, rebuilds the category hierarchy, and renames changed clusters. Runs at most once per `TAXONOMY_GARDENING_THROTTLE_MS` per project, plus a periodic cron sweep.
- **Lineage** — the typed transition record between two gardening runs: `Continuation`, `Birth`, `Death`, `Split`, `Merge`. Stored append-only in Postgres `taxonomy_cluster_lineage`.
- **Confidence** — the cosine similarity of an observation to its assigned cluster's centroid at assignment time. Persisted on the observation row.

## Dependencies & preconditions

- **Session materialization parity** (`specs/session-problems/1-parity-traces-sessions.md`). The taxonomy clusters at session granularity using the canonical synthesized `session_id` (`coalesce(nullIf(session_id, ''), toString(trace_id))`) so orphan traces become 1-trace sessions and every trace is covered exactly once. Until that lands, the taxonomy worker reads `traces.session_id` directly and applies the same coalesce inline; the canonical column from session-materialization should be substituted on landing.
- **Voyage embedding + Redis cache layer** (`@platform/ai`, `@platform/ai-voyage`). Already in place; the taxonomy worker reuses `withAi(AIEmbedLive, redisClient)` exactly as trace-search does.
- **LLM structured generation via `@platform/ai-vercel`** (`AIGenerateLive`). Already in place; the taxonomy worker uses `AI.generate({ schema, system, prompt, ... })` for summarization and naming.
- **`trace-end:run` debounce boundary** (`apps/workers/src/workers/trace-end.ts`). The taxonomy worker hooks the same dispatch point trace-search already uses.
- **Python clustering engine sidecar** (`@platform/op-taxonomy-engine`, new). Single-purpose RPC service exposing `noiseSweep({ embeddings, minClusterSize, minSamples, umapNComponents, umapNNeighbors, randomSeed }) → { assignments, outlierScores }`. Mirrors the `@platform/op-gepa` shape exactly: Python `op_taxonomy_engine` package using `uv` + `pyproject.toml` + the same RPC protocol as op-gepa; TS client `@platform/op-taxonomy-engine` wrapping it. Dependencies: `numpy`, `scikit-learn-contrib hdbscan`, `umap-learn`. The engine is stateless — embeddings in, assignments out, no DB access.

## Data model

### Postgres — `taxonomy_clusters`

Canonical leaf-cluster row. Mirrors the `issues` shape: JSONB centroid + derived `vector(2048)` + GIN-indexed `tsvector`.

```text
taxonomy_clusters
├─ id                       cuid          PRIMARY KEY
├─ organization_id          cuid          NOT NULL
├─ project_id               cuid          NOT NULL
├─ parent_category_id       cuid          NULL    -- nullable while uncategorized
├─ name                     text          NOT NULL
├─ description              text          NOT NULL
├─ centroid                 jsonb         NOT NULL  -- TaxonomyCentroid (see Helpers)
├─ centroid_embedding       vector(2048)  NULL     -- derived from centroid on save
├─ search_document          tsvector      GENERATED ALWAYS AS (
│                             setweight(to_tsvector('english', name),        'A') ||
│                             setweight(to_tsvector('english', description), 'B')
│                           ) STORED
├─ observation_count        bigint        NOT NULL DEFAULT 0
├─ state                    text          NOT NULL DEFAULT 'active'
│                                          -- 'active' | 'merged' | 'deprecated'
├─ merged_into_cluster_id   cuid          NULL    -- set when state = 'merged'
├─ first_observed_at        timestamptz   NOT NULL
├─ last_observed_at         timestamptz   NOT NULL
├─ clustered_at             timestamptz   NOT NULL  -- decay anchor, NOT updated_at
├─ created_at, updated_at   timestamptz   NOT NULL
└─ INDEXES
   ├─ btree (organization_id, project_id, state, last_observed_at)
   ├─ btree (organization_id, project_id, parent_category_id)
   └─ GIN   (search_document)
```

**No IVFFlat/HNSW index on `centroid_embedding`.** Per-project cluster count is expected in the hundreds, low thousands at worst; exact sequential scan under the `(organization_id, project_id)` prefix outperforms any approximate index at that scale. Same rule as `@domain/issues`.

### Postgres — `taxonomy_categories`

Top-level grouping. The MVP keeps categories as their own table (rather than a `parent_cluster_id` self-link on `taxonomy_clusters`) so that:

- a category can carry its own LLM-generated name/description independent of any single leaf,
- a category can survive its members being merged/split,
- the derived `centroid_embedding` over member clusters can be persisted for fast read.

```text
taxonomy_categories
├─ id                       cuid          PRIMARY KEY
├─ organization_id          cuid          NOT NULL
├─ project_id               cuid          NOT NULL
├─ name                     text          NOT NULL
├─ description              text          NOT NULL
├─ centroid_embedding       vector(2048)  NULL     -- mean-of-member-cluster-centroids, normalized
├─ search_document          tsvector      GENERATED ALWAYS AS (...)
├─ cluster_count            integer       NOT NULL DEFAULT 0
├─ observation_count        bigint        NOT NULL DEFAULT 0
├─ state                    text          NOT NULL DEFAULT 'active'  -- 'active' | 'deprecated'
├─ clustered_at             timestamptz   NOT NULL
├─ created_at, updated_at   timestamptz   NOT NULL
└─ INDEXES
   ├─ btree (organization_id, project_id, state)
   └─ GIN   (search_document)
```

### Postgres — `taxonomy_cluster_lineage`

Append-only transition log. One row per detected transition per gardening run.

```text
taxonomy_cluster_lineage
├─ id                  cuid          PRIMARY KEY
├─ organization_id     cuid          NOT NULL
├─ project_id          cuid          NOT NULL
├─ run_id              cuid          NOT NULL          -- one per gardening run
├─ transition_type     text          NOT NULL          -- 'birth' | 'death' | 'continuation' | 'split' | 'merge'
├─ from_cluster_ids    cuid[]        NOT NULL DEFAULT '{}'
├─ to_cluster_ids      cuid[]        NOT NULL DEFAULT '{}'
├─ similarity          double precision NULL           -- evidence for the transition
├─ created_at          timestamptz   NOT NULL
└─ INDEXES
   └─ btree (organization_id, project_id, created_at DESC)
```

Lineage is **derived state**; it lets the UI explain "this cluster was born from noise on May 14th" or "two clusters merged into this one." It is not used on the hot online assignment path.

### ClickHouse — `behavior_observations`

Append-only observation rows. Mirrors `trace_search_embeddings` exactly — `ReplacingMergeTree(indexed_at)`, org-first sort, monthly partitions, per-row `retention_days` with a grace buffer. **Created via `pnpm --filter @platform/db-clickhouse ch:create`; both the `clustered/` and `unclustered/` variants are filled in.**

```sql
CREATE TABLE IF NOT EXISTS behavior_observations ON CLUSTER default (
  organization_id           LowCardinality(String) CODEC(ZSTD(1)),
  project_id                LowCardinality(String) CODEC(ZSTD(1)),
  session_id                String                 CODEC(ZSTD(1)),
  start_time                DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
  end_time                  DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
  trace_ids                 Array(FixedString(32)) CODEC(ZSTD(1)),
  summary                   String                 CODEC(ZSTD(3)),
  summary_hash              FixedString(64)        CODEC(ZSTD(1)),
  embedding                 Array(Float32)         CODEC(ZSTD(1)),
  embedding_model           LowCardinality(String) CODEC(ZSTD(1)),
  assigned_cluster_id       String                 DEFAULT '' CODEC(ZSTD(1)),
  assignment_confidence     Float32                DEFAULT 0.0 CODEC(ZSTD(1)),
  assignment_method         LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
  -- 'centroid_online' | 'gardening_birth' | 'gardening_reassign' | 'noise'
  reassignment_run_id       String                 DEFAULT '' CODEC(ZSTD(1)),
  retention_days            UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
  indexed_at                DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, session_id)
ORDER BY (organization_id, project_id, session_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;
```

**Why one row per session, versioned by `indexed_at`.** When gardening reassigns an observation (after a merge or a birth), the worker writes a fresh row with a newer `indexed_at`; `ReplacingMergeTree` collapses to the latest version. The same row also gets rewritten if the upstream session adds new traces and the worker resummarizes — see [Online observation pipeline](#online-observation-pipeline).

**Embedding column is `Array(Float32)` with no fixed dimension.** Matches the proven trace-search shape; a future model swap rewrites rows without a table rebuild.

**Why no separate noise table.** The noise bucket is `assigned_cluster_id = ''` — a single index-friendly predicate on the existing observations table. No second storage surface to keep consistent.

### Postgres — `taxonomy_runs`

One row per gardening run per project. Used for monitoring and for joining lineage rows.

```text
taxonomy_runs
├─ id                       cuid          PRIMARY KEY
├─ organization_id          cuid          NOT NULL
├─ project_id               cuid          NOT NULL
├─ trigger                  text          NOT NULL    -- 'cron' | 'manual' | 'threshold'
├─ status                   text          NOT NULL    -- 'pending' | 'running' | 'completed' | 'failed'
├─ started_at               timestamptz   NOT NULL
├─ completed_at             timestamptz   NULL
├─ observations_scanned     integer       NOT NULL DEFAULT 0
├─ noise_scanned            integer       NOT NULL DEFAULT 0
├─ clusters_born            integer       NOT NULL DEFAULT 0
├─ clusters_merged          integer       NOT NULL DEFAULT 0
├─ clusters_deprecated      integer       NOT NULL DEFAULT 0
├─ categories_rebuilt       integer       NOT NULL DEFAULT 0
├─ error                    text          NULL
└─ INDEXES
   └─ btree (organization_id, project_id, started_at DESC)
```

## Architecture

Two pipelines, sharing the same data model and the same centroid helpers.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Online (per session, near-real-time)                                    │
│                                                                         │
│   TracesIngested → trace-end:run (existing, debounced)                  │
│       │                                                                 │
│       ├── publish trace-search:refreshTrace (existing)                  │
│       └── publish taxonomy:observe-session  (new, debounced per session)│
│                                                                         │
│   taxonomy:observe-session worker                                       │
│     1. Load session messages from ClickHouse (TraceRepository)          │
│     2. Build session document (buildSessionDocument)                    │
│     3. Summarize via AI.generate (cached by summary_hash)               │
│     4. Embed summary via AI.embed (cached, 24h TTL)                     │
│     5. Project-scoped pgvector top-K cluster lookup                     │
│     6. Two-gate assignment decision (absolute + relative)               │
│     7. On match → IssueLike centroid update inside per-cluster lock     │
│     8. Write observation row to ClickHouse (assigned or noise)          │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ noise accumulates; clusters drift
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Offline gardening (per project, scheduled)                              │
│                                                                         │
│   taxonomy:garden-sweep cron (hourly)                                   │
│     fans out one taxonomy:garden-project per active project             │
│                                                                         │
│   taxonomy:garden-project worker (throttled per project)                │
│     1. Open taxonomy_runs row                                           │
│     2. Noise sweep: RPC → op-taxonomy-engine (UMAP + HDBSCAN)           │
│        → emit Births                                                    │
│     3. Merge pass: pairwise cosine over active clusters                 │
│        → emit Merges; reassign observations                             │
│     4. Death pass: clusters with mass < floor → 'deprecated'            │
│     5. Reassignment pass: re-run two-gate over recent noise             │
│        observations against current cluster set                         │
│     6. Hierarchy rebuild: agglomerative cluster centroids → categories  │
│     7. Naming pass: LLM-name changed clusters and rebuilt categories    │
│        from FPS-sampled observation summaries                           │
│     8. Lineage write: emit transition rows                              │
│     9. Close taxonomy_runs row                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

The online pipeline lands assignment decisions within seconds of session settle; the offline pipeline catches up the rest (births, merges, hierarchy) at the configured cadence (default 1h throttle, 6h cron sweep). Both pipelines are best-effort: failures log and swallow at the worker level (`Effect.orElseSucceed(() => undefined)`), and the next pass picks up from canonical state.

## Online observation pipeline

### Trigger

When `runTraceEndJob` finishes a trace successfully (`apps/workers/src/workers/trace-end.ts`), it publishes a new sibling task right next to the existing `trace-search:refreshTrace` publish:

```ts
yield* publisher.publish("taxonomy", "observeSession", {
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  sessionId: canonicalSessionId, // coalesce(nullIf(traceSessionId, ''), toString(traceId))
  triggeringTraceId: payload.traceId,
  triggeringStartTime: traceDetail.startTime.toISOString(),
}, {
  dedupeKey: `org:${payload.organizationId}:taxonomy:observeSession:${payload.projectId}:${canonicalSessionId}`,
  debounceMs: TAXONOMY_OBSERVATION_DEBOUNCE_MS, // 5 min default
})
```

**Why `debounceMs` not `throttleMs`.** Active sessions keep producing traces. We want the worker to wait until the session settles — the same shape `trace-end:run` itself uses with respect to `TracesIngested`. Each new trace in the same session pushes the firing time forward; the worker only runs once the session is quiet.

**Why the `org:${organizationId}:…` prefix on the dedupe key.** Project ids are globally unique cuids, so org-prefixing isn't required for collision avoidance — but every other org-scoped Redis/queue key in the codebase leads with `org:${organizationId}:` (see the repo-wide convention in `CLAUDE.md`). Matching that shape keeps the keyspace consistently partitioned and makes tenancy obvious at a glance.

**Why fire-and-forget (no error coupling).** Wrap the publish in `Effect.map(() => true).catch(...)` like the `deterministic-flaggers:run` sibling, so a taxonomy failure cannot stall trace-end. This mirrors what trace-search would do if it weren't already swallowing in-handler.

### Worker

A new file `apps/workers/src/workers/taxonomy.ts` follows `trace-search.ts` line-for-line for composition:

- subscribes to topic `"taxonomy"` with task `"observeSession"` (and later `"gardenSweep"`, `"gardenProject"`),
- runs `withPostgres`, `withClickHouse(Layer.mergeAll(TraceRepositoryLive, BehaviorObservationRepositoryLive, ...))`, `withAi(AIEmbedLive ⊕ AIGenerateLive, redisClient)`,
- wraps the per-session handler in `Effect.withSpan("taxonomy.observeSession")` and `Effect.orElseSucceed(() => undefined)` so a single failing session never re-enters the job queue forever.

### `observeSession` handler (step by step)

1. **Load the session.** Read all traces for `(orgId, projectId, sessionId)` since the start of the session via a use-case `loadSessionForTaxonomyUseCase` in `@domain/spans` (or a co-located helper in `@domain/taxonomy` that delegates to `TraceRepository`). Empty session → no-op.

2. **Build the session document.** A pure helper `buildSessionDocument({ traces, messages })` in `@domain/taxonomy/src/helpers.ts` produces:
   - a flat normalized conversation text (same role gate as trace-search: only `user` + `assistant`; tool calls preserved as `[TOOL CALL: <name>]`; tool results dropped),
   - the canonical `summary_hash` over `(sessionId + "\0" + conversationText)` for caching/dedup,
   - lightweight metadata (`primaryActor`, `traceCount`, `firstTraceId`, `lastTraceId`).

   Conversation text is hard-capped at `TAXONOMY_SESSION_DOCUMENT_MAX_LENGTH` (initial: 30,000 chars; sessions tend to be longer than single traces). Middle-truncation when over budget, matching trace-search.

3. **Skip floor.** If conversation text length is below `TAXONOMY_SESSION_MIN_LENGTH` (initial: 200 chars), record an observation row with `assigned_cluster_id = ''`, `assignment_method = 'noise'`, and **no embedding** (empty array). These rows are visible to the noise sweep but cheap. Reason: a session whose entire conversation is "hi" is not signal worth embedding.

4. **Decide what text to embed.** Two-branch decision based on `TAXONOMY_SUMMARY_STRATEGY` and conversation length:

   - **LLM-summary branch** — when `TAXONOMY_SUMMARY_STRATEGY === "llm"` *and* conversation tokens ≥ `TAXONOMY_SUMMARY_MIN_SESSION_TOKENS`. Call `summarizeBehaviorUseCase` in `@domain/taxonomy`:
     - port: `@domain/ai` `AI.generate`,
     - Zod output schema:
       ```ts
       z.object({
         summary: z.string().min(20).max(280)
           .describe("One sentence capturing what the user was trying to do and what the agent did. Generic, not memorizing facts."),
         primaryActor: z.enum(["user", "agent", "both"])
           .describe("Whose behavior the summary primarily describes."),
         intentTags: z.array(z.string()).max(4)
           .describe("Up to four short topical tags (lowercase, kebab-case)."),
       })
       ```
     - model: `TAXONOMY_SUMMARY_MODEL` (initial: a cheap-fast non-reasoning model, e.g. Haiku 4.5). Reasoning is intentionally off — a 1-sentence intent label doesn't need it. Subscription-plan model resolution is Future Work.
     - **Cache on `summary_hash`.** The use-case checks ClickHouse for an existing observation with the same `(orgId, projectId, sessionId, summary_hash, strategy)` and skips the LLM call if found. Appending new traces to a session whose conversation hash didn't change does not re-pay the summary cost. Including `strategy` in the key prevents stale `embed_direct` rows from masking a switch to `"llm"`.
     - The text-to-embed for step 5 is the returned `summary` string.

   - **Embed-direct branch** — when `TAXONOMY_SUMMARY_STRATEGY === "embed_direct"` *or* conversation tokens < `TAXONOMY_SUMMARY_MIN_SESSION_TOKENS`. No LLM call. The text-to-embed for step 5 is the normalized conversation text already produced in step 2, capped at the same `TAXONOMY_SESSION_DOCUMENT_MAX_LENGTH`. The `summary` column on the observation row stores the first 280 chars of that conversation (so FPS sampling and inspection still work); `assignment_method` is unchanged by this branch.

   This is the single biggest cost knob in the MVP. See [Cost & performance](#cost--performance) for the ceilings each branch produces at XL.

5. **Embed.** Call `embedBehaviorSummaryUseCase` in `@domain/taxonomy` → `AI.embed({ text: textToEmbed, model: TAXONOMY_EMBEDDING_MODEL, dimensions: TAXONOMY_EMBEDDING_DIMENSIONS, inputType: "document" })`. **The cache wrap inside `withAi` keys on `(text, model, dimensions, inputType)`**, so identical embed inputs across sessions hit the same cached embedding without re-paying.

6. **Top-K cluster lookup.** Call `findNearestClustersUseCase`. The repository method is `TaxonomyClusterRepository.listNearestActive(orgId, projectId, queryVector, k = TAXONOMY_ASSIGN_TOPK)` — exact pgvector cosine over `WHERE organization_id AND project_id AND state = 'active' AND centroid_embedding IS NOT NULL`, ordered by `1 - (centroid_embedding <=> $vector)` DESC, LIMIT K. Vector inlined as `sql.raw` literal as in `issue-repository.hybridSearch` (node-postgres can't bind JS arrays to `vector`).

7. **Two-gate decision.** `decideAssignmentInGardening` helper:
   ```ts
   if (topK.length === 0) return { method: "noise", clusterId: null, confidence: 0 }
   const sims = topK.map(c => c.cosine)               // already 0..1
   const probs = softmax(sims, TAXONOMY_ASSIGN_TEMPERATURE)
   const absoluteOk = sims[0] >= TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD
   const relativeOk = (probs[0] - (probs[1] ?? 0)) >= TAXONOMY_ASSIGN_RELATIVE_MARGIN
   if (absoluteOk && relativeOk) {
     return { method: "centroid_online", clusterId: topK[0].id, confidence: sims[0] }
   }
   return { method: "noise", clusterId: null, confidence: sims[0] }
   ```
   Both gates apply. Published baselines put either gate alone at ~5% false-assignment and the combined rate at ~2–3%. The same ratio is expected to hold here at this scale, and is the calibration target for the benchmark corpus described under [Tuning](#tuning-and-the-benchmark-corpus).

8. **Update the cluster centroid (only on assignment).** `assignObservationToClusterUseCase` mirrors `assignScoreToIssueUseCase`:
   - acquire a per-cluster Redis lock keyed `org:${organizationId}:taxonomy:cluster:${clusterId}` with token + `SET NX EX` (so concurrent observations into the same cluster don't lose centroid contributions),
   - re-read the cluster row,
   - `updateTaxonomyCentroid({ centroid, embedding, weight: 1.0, timestamp: observation.startTime })` — the same running-decayed-sum math as `updateIssueCentroid`, exported from `@domain/taxonomy/src/helpers.ts`,
   - persist; `TaxonomyClusterRepository.save` materializes the derived `centroid_embedding` via `normalizeTaxonomyCentroid(centroid)` exactly as `IssueRepository.save` does,
   - release lock.

9. **Write the observation row.** `BehaviorObservationRepository.upsert(...)` writes one row to ClickHouse `behavior_observations` with `assigned_cluster_id` set (or empty if noise), `assignment_method` per step 7, `assignment_confidence = sims[0]` when matched and the bare top-1 cosine when noise (for visibility into how close we came), `indexed_at = now`.

10. **Bump cluster counters.** On assignment, `+1 observation_count` and `last_observed_at = now` on the cluster row. Async-batchable, but keeping it in the same transaction is fine at this scale.

11. **Bump the noise counter (noise path only).** When the observation lands as noise, `INCR org:${organizationId}:taxonomy:noise-count:${projectId}` (Redis). If the post-INCR value crosses `TAXONOMY_NOISE_GARDENING_TRIGGER`, publish the noise-pressure `gardenProject` per [Trigger model §3](#trigger-model). The counter is best-effort (re-synced from CH at gardening start/end — see [§A](#a-noise-sweep-cluster-births)); a missed INCR just delays the trigger by one observation. Counter key carries a 7-day idle TTL refreshed on each INCR.

12. **Span and finally.** `Effect.withSpan("taxonomy.observeSession")` + `withTracing` per worker tracing rules. Failure paths fall through to `Effect.orElseSucceed(() => undefined)`; the next session ingest reattempts naturally.

### Shared centroid math

`@domain/taxonomy/src/helpers.ts` exports an analog of every centroid function in `@domain/issues/src/helpers.ts`:

```ts
export const createTaxonomyCentroid = (): TaxonomyCentroid => ({
  base: new Array(TAXONOMY_EMBEDDING_DIMENSIONS).fill(0),
  mass: 0,
  model: TAXONOMY_EMBEDDING_MODEL,
  decay: TAXONOMY_CENTROID_HALF_LIFE_SECONDS,
  weights: TAXONOMY_OBSERVATION_WEIGHT_SCHEME, // { default: 1.0 }
})

export const updateTaxonomyCentroid = (input: {
  centroid: TaxonomyCentroid
  embedding: number[]
  weight: number      // observation-specific; 1.0 in MVP
  timestamp: Date     // assignment time, used as new clusteredAt
  operation: "add" | "remove"
  previousClusteredAt: Date
}): TaxonomyCentroid => { ... }

export const normalizeTaxonomyCentroid = (centroid: TaxonomyCentroid): number[] => { ... }
```

The **only** changes from `@domain/issues` helpers are:

- the weight scheme is `Record<"default", number>` for MVP (single bucket; multi-source weighting like annotations vs evaluations is Future Work),
- the model/dimensions constants come from `@domain/taxonomy/src/constants.ts`, not `@domain/issues`,
- `decay` half-life default is `TAXONOMY_CENTROID_HALF_LIFE_SECONDS = 30 days` (longer than issues' 14d, since taxonomy categories are slower-moving than failure patterns).

The math is otherwise byte-for-byte the issues helpers, which is exactly the point — the centroid engine is the proven, tested part. **The two helpers should share an underlying utility once both are stable; see [Future Work — Extract shared centroid core](#future-work). For the MVP, they are duplicated (with tests) inside `@domain/taxonomy`.**

## Offline gardening pipeline

### Trigger model

Three complementary triggers, each via the existing `@domain/queue` rails:

1. **Cron sweep.** Registered once at worker boot in `apps/workers/src/server.ts` with `queuePublisher.scheduleRepeatable("taxonomy", "gardenSweep", {}, { key: TAXONOMY_GARDENING_CRON_KEY, pattern: TAXONOMY_GARDENING_CRON_PATTERN, tz: "UTC" })`. Initial pattern: `"0 */6 * * *"` (every 6 hours). The handler enumerates eligible projects (admin Postgres / RLS-bypass path, same as `sweepEscalating`) and publishes one `taxonomy:gardenProject` per project with the throttle key below.

2. **Activity-driven throttled publish.** The online `observeSession` handler also publishes `taxonomy:gardenProject` opportunistically when a noise observation lands, throttled to one fire per project per `TAXONOMY_GARDENING_THROTTLE_MS` (initial: 1h):

   ```ts
   yield* publisher.publish("taxonomy", "gardenProject", { organizationId, projectId }, {
     dedupeKey: `org:${organizationId}:taxonomy:gardenProject:${projectId}`,
     throttleMs: TAXONOMY_GARDENING_THROTTLE_MS,
   })
   ```

   This means an idle project still gets the 6-hour sweep; an active project with noise accumulating gets gardening every hour at most; a quiet project incurs no gardening cost.

3. **Noise-pressure publish.** The online handler also maintains a per-project Redis counter (`org:${organizationId}:taxonomy:noise-count:${projectId}`, INCR on every noise-bound observation write in step 9 of the online pipeline). When the counter crosses `TAXONOMY_NOISE_GARDENING_TRIGGER` (initial: 30,000 — sized for first-taxonomy latency and RPC payload, not engine compute; see [§A](#a-noise-sweep-cluster-births) and the [config table](#configuration-reference) for the rationale), the handler publishes `taxonomy:gardenProject` with a *tighter* throttle than path (2):

   ```ts
   yield* publisher.publish("taxonomy", "gardenProject", { organizationId, projectId }, {
     dedupeKey: `org:${organizationId}:taxonomy:gardenProject:${projectId}`,
     throttleMs: TAXONOMY_NOISE_PRESSURE_THROTTLE_MS, // 5 min
   })
   ```

   This is the safety valve for cold-starting high-volume tenants. At ~7k/hr noise inflow (XL cold-start), path (2)'s 1h throttle is the binding constraint at first; the pressure trigger fires at ~4.3 hours when the counter crosses 30k, producing the first taxonomy. At ~20k/hr noise inflow (hyper-whale), the pressure trigger crosses 30k every ~90 minutes and the 5-minute throttle floor is never binding; the pool peaks near 30–40k between fires.

The three triggers share the same dedupe key, so a publish from any path is dropped if another is already scheduled inside the *shorter* of the two throttles. Same semantics as the `issues:refresh` throttle pattern.

### Eligibility & cold-start gate

The gardening handler short-circuits when:

- the project's observation count in the gardening lookback window (default 30 days) is below `TAXONOMY_GARDENING_MIN_OBSERVATIONS` (initial: 50). A handful of sessions is not enough signal to build a taxonomy; we wait. This is the cold-start gate. The next sweep will pick it up.
- another `taxonomy_runs` row for the same `(orgId, projectId)` is in `'running'` state. Defensive against stuck runs; combined with the lock, prevents concurrent gardening for one project.

### Per-project gardening (step by step)

The worker acquires a per-project Redis lock (`org:${organizationId}:taxonomy:garden:${projectId}`), inserts a `taxonomy_runs` row, then runs the activities below in order. Every step is idempotent; a crashed run is picked up by the next sweep with no double-counting.

#### A. Noise sweep (cluster births)

The most important step — this is how new behavior types enter the taxonomy.

1. **Re-sync the noise counter from CH** and load the noise pool in one shot: `SELECT session_id, embedding FROM behavior_observations WHERE organization_id = ? AND project_id = ? AND assigned_cluster_id = '' AND length(embedding) > 0 AND start_time >= now() - INTERVAL TAXONOMY_NOISE_LOOKBACK_DAYS DAY`. (Default lookback: 7 days. Empty-embedding noise rows from step 3 of online are excluded.) Use `count(rows)` to `SET` the Redis counter `org:${organizationId}:taxonomy:noise-count:${projectId}` to ground truth; this corrects any drift accumulated by the best-effort INCR path during online ingest.
2. If the noise count is below `TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS` (initial: 8), skip — not enough density for a birth.
3. **Cluster the noise embeddings via the Python engine.** Compute the per-run `minClusterSize` (see step 4), then RPC out to `@platform/op-taxonomy-engine`:

   ```ts
   const { assignments, outlierScores } = yield* TaxonomyEngineClient.noiseSweep({
     embeddings,                     // Array<number[]>, 2048-dim
     minClusterSize,                 // see step 4
     minSamples: TAXONOMY_HDBSCAN_MIN_SAMPLES,
     umapNComponents: TAXONOMY_UMAP_N_COMPONENTS,
     umapNNeighbors: TAXONOMY_UMAP_N_NEIGHBORS,
     umapMinDist: TAXONOMY_UMAP_MIN_DIST,
     randomSeed: TAXONOMY_UMAP_RANDOM_SEED,
   })
   ```

   The engine's pipeline is `UMAP(2048 → TAXONOMY_UMAP_N_COMPONENTS)` → `HDBSCAN(metric="euclidean", min_cluster_size, min_samples, cluster_selection_method="eom")`. UMAP gives HDBSCAN a sharper density signal than raw 2048-dim cosines provide; HDBSCAN handles variable-density clusters natively (dense and sparse topics in the same pool both work), produces a first-class noise label (`assignment = -1`) for points that don't fit anywhere, and returns a per-point `outlier_score ∈ [0, 1]`.

   `randomSeed` is pinned in constants so reproducibility holds across runs (lineage continuity depends on this). The engine's library versions are pinned in `pyproject.toml` for the same reason.

   At MVP scale (≤30,000 noise observations bounded by [Trigger model §3](#trigger-model)), the engine returns in ~30–60s end-to-end including RPC overhead and ~80–120MB compressed payload, comfortably inside `TAXONOMY_GARDENING_MAX_RUNTIME_MS = 5 min`. The pool can briefly overshoot the trigger under bursty inflow — HDBSCAN scales fine to ~100k points; the trigger threshold is set well below where the engine starts to slow, and the bound is RPC payload + first-taxonomy UX, not engine compute.

4. **Birth eligibility per candidate cluster.** HDBSCAN's `min_cluster_size` is the proportional-floor knob:

   ```ts
   const minClusterSize = clamp(
     round(noisePoolSize * TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_RATIO),
     TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR,
     TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_CEILING,
   )
   ```

   Computed once per run from `noisePoolSize` (the count read in step 1) and passed to the engine in step 3. Initial values: floor `4`, ratio `0.005` (0.5%), ceiling `30`. At small scale the floor binds (a 4-member micro-pattern in a 250-noise pool is real signal); at whale scale the ratio binds (~30 members required when the pool is in the tens of thousands) so the UI isn't cluttered with low-count artifacts. See [Why a proportional `min_members`](#why-a-proportional-min_members).

   HDBSCAN already enforces this floor by construction (clusters below `min_cluster_size` are emitted as noise), so the post-engine eligibility check is reduced to:

   - **absorption check**: build the candidate centroid (normalized mean of member embeddings); if its top-1 cosine against an existing active cluster ≥ `TAXONOMY_ABSORPTION_THRESHOLD` (initial: 0.85), do not birth — instead reassign all members to that absorbing cluster. This catches "we already have a cluster for this, the gate just barely rejected each member individually."

   The intra-cluster diameter check from the previous spec design is dropped — HDBSCAN's density criterion is a stronger filter than a single-number diameter cap (it adapts to local density rather than imposing a fixed bound).

5. **Birth.** For each eligible candidate that survives the absorption check, create a `taxonomy_clusters` row with:
   - `centroid = createTaxonomyCentroid()` then folded with each member observation via `updateTaxonomyCentroid` (so the running-sum invariant matches the online path),
   - `name = "Pending"`, `description = ""` (the naming pass below fills these in),
   - `observation_count = members.length`, `first_observed_at = min(member start times)`, `last_observed_at = max(member start times)`, `clustered_at = now`,
   - `state = "active"`, `parent_category_id = NULL` (filled by the hierarchy step),
   - reassign each member observation in ClickHouse with `assignment_method = "gardening_birth"`, `reassignment_run_id = run.id`, `assigned_cluster_id = newCluster.id`, fresh `indexed_at`.

6. Emit a `taxonomy_cluster_lineage` row per birth with `transition_type = "birth"`, `from_cluster_ids = []`, `to_cluster_ids = [newCluster.id]`.

#### B. Merge pass

Detect and consolidate near-duplicate active clusters.

1. List all active clusters with non-null `centroid_embedding`.
2. Compute pairwise cosine between every pair (project-scoped only; per-project N is small enough that `O(n²)` is trivial). Threshold at `TAXONOMY_MERGE_THRESHOLD` (initial: 0.92 cosine).
3. Build connected components over the threshold-passing edges. Each component with ≥2 members triggers a merge.
4. **Choose the survivor.** Per component, the survivor is the cluster with the highest `observation_count` (tiebreak: lowest `id` for determinism).
5. **Reassign observations.** For each non-survivor, reassign all of its observations in ClickHouse to the survivor with `assignment_method = "gardening_reassign"`, fold their normalized embeddings into the survivor's centroid via repeated `updateTaxonomyCentroid` (under the survivor's Redis lock), mark the non-survivor's `state = "merged"`, set `merged_into_cluster_id = survivor.id`.
6. Emit lineage `transition_type = "merge"` with `from_cluster_ids = [losers...]`, `to_cluster_ids = [survivor]`, `similarity = min pairwise cosine in component`.

#### C. Death pass

A cluster whose centroid mass has decayed below `TAXONOMY_DEAD_CLUSTER_MASS_FLOOR` (initial: 0.5) without new observations in the last `TAXONOMY_DEAD_CLUSTER_INACTIVITY_DAYS` (initial: 30 days) is transitioned to `state = "deprecated"`. Observations stay attached (we don't orphan them), but the cluster is no longer a candidate for online assignment and is hidden from the default UI.

Emit lineage `transition_type = "death"` per deprecated cluster.

#### D. Reassignment pass (catch-up for the noise floor)

Run after births: re-evaluate the two-gate decision for each noise observation in the lookback window against the **current** active cluster set (which now includes any births from step A). This catches observations that landed in noise because the matching cluster didn't exist yet at observation time.

For each reassigned observation, fold its embedding into the target cluster's centroid (same Redis-locked update path as online) and rewrite its ClickHouse row with `assignment_method = "gardening_reassign"`.

#### E. Hierarchy rebuild (categories)

The taxonomy's 2nd level. Rebuilt from scratch each gardening run.

1. List all active clusters with non-null `centroid_embedding` and `observation_count > 0`.
2. **Choose K.** `K = clamp(round(sqrt(activeClusters.length)), 3, TAXONOMY_HIERARCHY_MAX_CATEGORIES)` (initial cap: 15). A square-root heuristic that matches typical UI navigation breadth.
3. Run **pure-TS agglomerative clustering with average linkage** over the cluster centroids until K components remain. Stays in TS (not the engine) on purpose: category roll-up is sub-millisecond at this count, the input is already-clean cluster centroids (not raw noise), and a category isn't a density region — it's a navigation grouping. See [Why HDBSCAN for births and TS agglomerative average-linkage for the category roll-up](#why-hdbscan-for-births-and-ts-agglomerative-average-linkage-for-the-category-roll-up).
4. **Match against existing categories.** For each new candidate category, compute the centroid (mean of member cluster centroids, normalized) and find the best-matching existing category by cosine. If similarity ≥ `TAXONOMY_CATEGORY_CONTINUATION_THRESHOLD` (initial: 0.80), keep the existing category id, update its `centroid_embedding`, `cluster_count`, `observation_count`. Otherwise, create a new category row with `name = "Pending"`, `description = ""`.
5. **Update `parent_category_id` on every member cluster.** Set in one batch update.
6. **Deprecate orphan categories.** Any prior active category that wasn't matched is `state = 'deprecated'`.
7. Emit lineage rows for each rebuilt category? **No** — lineage is leaf-level only in the MVP. Categories are derived/rebuilt; their evolution is observable via the `taxonomy_runs` `categories_rebuilt` counter.

#### F. Naming pass

For each cluster that:

- is newly born, **or**
- has had ≥ `TAXONOMY_NAMING_REFRESH_OBSERVATIONS` (initial: 25) observations attached since its last naming, **or**
- is `name = "Pending"`,

run `nameClusterUseCase`:

1. Sample observation summaries via **Farthest-Point Sampling** over the cluster's member observations (read from CH, ranked by recency). Budget: `clamp(round(log2(observation_count + 1)) * 2, TAXONOMY_FPS_SAMPLE_BUDGET_MIN, TAXONOMY_FPS_SAMPLE_BUDGET_MAX)` (initial bounds: 4, 12). FPS implementation in helpers: start from the observation closest to the centroid (the canonical example), iteratively add the observation furthest from the already-selected set by cosine distance.
2. Map step: call `AI.generate` once with the K sampled summaries and a `proposeCandidateThemes` system prompt; output schema is `z.object({ candidates: z.array(z.object({ theme: z.string(), examples: z.array(z.number()) })).min(1).max(5) })`.
3. Reduce step: a second `AI.generate` call that takes the candidate themes plus the original samples and outputs the final `z.object({ name: z.string().min(3).max(80), description: z.string().min(20).max(280) })`.
4. Save to the cluster row; update `clustered_at = now`.

The map-reduce shape (propose candidate themes, then collapse to a single name + description) is a standard cluster-labeling pattern. At per-cluster scale (K ≤ 12 samples), both calls fit comfortably in a single model context; the indirection is mostly about quality, not size.

Same flow applies for renaming a newly-created category, with the input being the names+descriptions of its member clusters (not raw observation summaries — categories summarize over clusters).

#### G. Close the run

Update the `taxonomy_runs` row with `status = 'completed'`, `completed_at`, the counters, release the per-project Redis lock. Re-sync `org:${organizationId}:taxonomy:noise-count:${projectId}` from ClickHouse one more time (`SELECT count(*) ... WHERE assigned_cluster_id = ''` over the lookback window) — births and reassignments during the run drained most of the pool, and the counter must reflect post-drain reality so the next noise-pressure trigger fires at the right point.

### Backpressure & long-running gardening

- Per-project gardening should complete in under a minute at expected MVP scale (≤10k active observations, ≤500 active clusters per project). The hard cap is `TAXONOMY_GARDENING_MAX_RUNTIME_MS` (initial: 5 min); past that the worker writes `status = 'failed'`, `error = 'timeout'`, releases the lock, and lets the next sweep retry.
- The cron sweep enumerates projects in batches of `TAXONOMY_GARDENING_SWEEP_BATCH` (initial: 25) with a small delay between batches to avoid thundering-herding the queue.
- The per-project work is a single BullMQ task, not a Temporal workflow. Failures replay from scratch; there's no in-flight state worth resuming.

## Read paths

`@domain/taxonomy` exposes the use-cases below. All are project-scoped at the boundary. The MVP ships them as plain use-cases; the web composition adds `apps/web` server functions on top when the UI lands.

- `listCategoriesUseCase(orgId, projectId, { state?, includeEmpty? })` — list categories, default `state = 'active'`, default omit categories with zero member clusters.
- `listClustersInCategoryUseCase(orgId, projectId, categoryId, { state?, sort? })` — list leaf clusters, sorted by `observation_count` desc by default.
- `listClustersUseCase(orgId, projectId, { state?, search?, parentCategoryId?, sort?, cursor?, pageSize? })` — flat-list with hybrid search (pgvector + tsvector) on `(name, description)` exactly as `IssueRepository.hybridSearch`. `search` runs the same dual lexical+semantic plan, with the search embedding cached via `withAICache` (24h TTL).
- `listObservationsInClusterUseCase(orgId, projectId, clusterId, { cursor?, pageSize? })` — paginated ClickHouse list of observations attached to a cluster, ordered by `start_time DESC`.
- `getClusterDetailsUseCase(orgId, projectId, clusterId)` — cluster row + a small sample of recent observation summaries for the details drawer.
- `getCategoryDetailsUseCase(orgId, projectId, categoryId)` — category row + its member clusters.
- `getTaxonomyAnalyticsUseCase(orgId, projectId, { window? })` — top-line counts (total active categories, total active clusters, total observations in window, top-5 clusters by occurrence) plus ClickHouse-side current-vs-baseline trend summaries for those top clusters. For the page-level summary panel.
- `getLastRunUseCase(orgId, projectId)` — the most recent `taxonomy_runs` row plus a small slice of lineage transitions (last 10 births/merges) for an "Activity" panel.

Operational use-cases (not user-surfaced):

- `triggerProjectGardeningUseCase(orgId, projectId, { reason })` — admin-only manual trigger that publishes a `taxonomy:gardenProject` with the throttle key, so it coalesces with any pending scheduled run.
- `recordObservationUseCase` — the use-case the worker calls; exposed for tests and admin manual ingest.

## Configuration reference

All constants live in `packages/domain/taxonomy/src/constants.ts`.

| Constant | Initial value | Purpose |
|---|---|---|
| `TAXONOMY_EMBEDDING_MODEL` | `"voyage-4-large"` | Same family as issues + trace-search, single embedding-account surface. |
| `TAXONOMY_EMBEDDING_DIMENSIONS` | `2048` | Matches stored centroid column shape. |
| `TAXONOMY_SUMMARY_MODEL` | `{ provider: "anthropic", model: "claude-haiku-4-5" }` (or any equivalent cheap-fast non-reasoning model) | Summaries are 1-sentence intent labels; reasoning tokens buy nothing here. Per-tier resolution is Future Work — XL tenants will likely want an even cheaper option. Intentionally different from `ISSUE_DETAILS_GENERATION_MODEL`, which carries reasoning because issue details summarize over many examples. |
| `TAXONOMY_SUMMARY_STRATEGY` | `"llm"` | Global text-to-embed switch. `"llm"` (default) summarizes then embeds the summary; `"embed_direct"` skips the LLM call and embeds normalized conversation text directly. Quality/cost tradeoff in [Decisions & tradeoffs](#why-llm-summary-is-the-default-not-embed_direct). |
| `TAXONOMY_SUMMARY_MIN_SESSION_TOKENS` | `500` | Below this conversation-token count, skip the LLM summary even under `"llm"` strategy and embed conversation text directly. Short sessions are usually single-intent already; the LLM call buys little. Estimated 40–60% summary-call reduction on chat-heavy mixes. |
| `TAXONOMY_CENTROID_HALF_LIFE_SECONDS` | `30 * 24 * 60 * 60` (30d) | Slower decay than issues (14d); behavior categories move slower than failures. |
| `TAXONOMY_OBSERVATION_WEIGHT_SCHEME` | `{ default: 1.0 }` | Single weight bucket in MVP; multi-source weighting is Future Work. |
| `TAXONOMY_SESSION_DOCUMENT_MAX_LENGTH` | `30_000` chars | Hard cap before middle-truncation. |
| `TAXONOMY_SESSION_MIN_LENGTH` | `200` chars | Skip floor below this; observation row written without embedding. |
| `TAXONOMY_OBSERVATION_DEBOUNCE_MS` | `5 * 60_000` (5 min) | Per-session debounce on `observeSession`. |
| `TAXONOMY_ASSIGN_TOPK` | `10` | Top-K cluster lookup. |
| `TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD` | `0.65` | Absolute cosine floor. |
| `TAXONOMY_ASSIGN_RELATIVE_MARGIN` | `0.06` | Softmax margin between top-1 and top-2 probabilities. |
| `TAXONOMY_ASSIGN_TEMPERATURE` | `0.08` | Softmax temperature; smaller → sharper. |
| `TAXONOMY_GARDENING_CRON_KEY` | `"taxonomy:garden-sweep"` | Idempotent repeatable-job key. |
| `TAXONOMY_GARDENING_CRON_PATTERN` | `"0 */6 * * *"` (every 6h) | Sweep cadence. |
| `TAXONOMY_GARDENING_THROTTLE_MS` | `60 * 60_000` (1h) | Per-project activity-driven gardening throttle. |
| `TAXONOMY_NOISE_GARDENING_TRIGGER` | `30_000` | Noise-counter threshold above which the online handler publishes a `gardenProject` via the pressure path (see [Trigger model §3](#trigger-model)). Bound is **first-taxonomy latency + RPC payload**, not engine compute: HDBSCAN handles 100k+ comfortably, but at 30k the RPC payload is ~80–120MB compressed and a new whale tenant sees its first taxonomy after ~4.3 hours of ingest — both acceptable. Higher values improve HDBSCAN quality (sharper density estimates, less re-birth/re-merge churn) at the cost of longer cold-start UX. |
| `TAXONOMY_NOISE_PRESSURE_THROTTLE_MS` | `5 * 60_000` (5 min) | Floor on the noise-pressure publish path. Bypasses `TAXONOMY_GARDENING_THROTTLE_MS` so cold-starting high-volume tenants can garden faster than hourly. |
| `TAXONOMY_GARDENING_MIN_OBSERVATIONS` | `50` | Cold-start gate. |
| `TAXONOMY_GARDENING_MAX_RUNTIME_MS` | `5 * 60_000` (5 min) | Per-run safety cap. |
| `TAXONOMY_GARDENING_SWEEP_BATCH` | `25` | Cron sweep enumeration batch size. |
| `TAXONOMY_NOISE_LOOKBACK_DAYS` | `7` | Noise sweep / reassignment window. |
| `TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS` | `8` | Minimum noise size to attempt birthing. |
| `TAXONOMY_UMAP_N_COMPONENTS` | `15` | UMAP target dimensionality before HDBSCAN. Reduces 2048-dim Voyage embeddings to a density-friendlier space. |
| `TAXONOMY_UMAP_N_NEIGHBORS` | `15` | UMAP neighborhood size. Lower → preserves more local structure; higher → preserves more global structure. 15 is the standard default. |
| `TAXONOMY_UMAP_MIN_DIST` | `0.0` | UMAP minimum distance between projected points. 0.0 packs tightly for downstream HDBSCAN. |
| `TAXONOMY_UMAP_RANDOM_SEED` | `42` | Pinned for reproducibility — lineage continuity across runs depends on stable UMAP projections. Bump only when intentionally re-evaluating the taxonomy. |
| `TAXONOMY_HDBSCAN_MIN_SAMPLES` | `5` | HDBSCAN's outlier sensitivity. Higher → more conservative (more points labeled noise), lower → more permissive. |
| `TAXONOMY_HDBSCAN_CLUSTER_SELECTION_METHOD` | `"eom"` | Excess-of-mass cluster selection. Produces fewer, more stable clusters than `"leaf"`; the right choice when the noise sweep is one input to a fuller pipeline (we don't want every micro-pattern). |
| `TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR` | `4` | Minimum members per born cluster at small scale — preserves sensitivity for projects where 4 members is genuinely meaningful signal. |
| `TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_RATIO` | `0.005` (0.5%) | Proportional floor: a born cluster needs at least this share of the current noise pool. Binds at whale scale to filter birthday-paradox artifacts. |
| `TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_CEILING` | `30` | Hard cap so a 30-session real pattern in a 1M-noise pool still births. |
| `TAXONOMY_ABSORPTION_THRESHOLD` | `0.85` cosine | Re-absorb a candidate birth into an existing cluster instead of birthing. |
| `TAXONOMY_MERGE_THRESHOLD` | `0.92` cosine | Pairwise merge threshold. |
| `TAXONOMY_DEAD_CLUSTER_MASS_FLOOR` | `0.5` | Mass below which a cluster can be deprecated. |
| `TAXONOMY_DEAD_CLUSTER_INACTIVITY_DAYS` | `30` | Inactivity window required alongside mass floor. |
| `TAXONOMY_HIERARCHY_MAX_CATEGORIES` | `15` | Upper bound on K for the category layer. |
| `TAXONOMY_CATEGORY_CONTINUATION_THRESHOLD` | `0.80` cosine | Match a candidate category against an existing one. |
| `TAXONOMY_NAMING_REFRESH_OBSERVATIONS` | `25` | Re-name a cluster after this many new observations. |
| `TAXONOMY_FPS_SAMPLE_BUDGET_MIN` | `4` | FPS sample floor. |
| `TAXONOMY_FPS_SAMPLE_BUDGET_MAX` | `12` | FPS sample ceiling. |
| `TAXONOMY_OBSERVATION_RETENTION_DAYS` | `90` | ClickHouse TTL on `behavior_observations`. |

All thresholds are initial seeds chosen by analogy to the issues system and to published cluster-labeling baselines. They are explicitly **MVP defaults**, not optimal values. See [Tuning](#tuning-and-the-benchmark-corpus).

## Tuning and the benchmark corpus

The MVP ships with the constants above. The seeded **Acme** corpus (already used to tune `TRACE_SEARCH_MIN_RELEVANCE_SCORE`) is the natural smoke-test set: run the worker against it, eyeball the resulting categories and a sample of cluster contents, and adjust the absolute/relative gates if the false-assignment rate is materially above the ~2–3% target. The procedure:

1. Seed: `pnpm db:up && pnpm db:seed` (existing).
2. Re-enqueue every seeded session through `taxonomy:observeSession` via a one-off admin script.
3. Trigger `taxonomy:gardenProject` once per seeded project.
4. Manually inspect: are obviously-different sessions in the same cluster (false positives)? Are obviously-same sessions split (false negatives)?
5. Adjust `TAXONOMY_ASSIGN_*` constants; re-run.

Bayesian / automated tuning is Future Work; the MVP's expectation is that the seeded corpus + a human eyeball pass picks defaults that hold for the first cohort of real customers, and that production observability (next item) tells us when to retune.

## Observability

The MVP includes the following metrics, all surfaced as structured logs via `@repo/observability`'s `createLogger("taxonomy")` and as Effect spans (`Effect.withSpan`) for OTel:

- `taxonomy.observeSession.duration` and `.outcome` (`assigned` / `noise` / `skip_too_short` / `error`).
- `taxonomy.observeSession.confidence` (histogram).
- `taxonomy.gardenProject.duration`, `.observations_scanned`, `.noise_scanned`, `.clusters_born`, `.clusters_merged`, `.clusters_deprecated`, `.categories_rebuilt`.
- `taxonomy.assign.topk.cosine` histogram (top-1, top-2 spread).
- `taxonomy.embed.cache_hit_rate` (derived from existing `withAICache` instrumentation).
- `taxonomy.cluster.count_active`, `.count_deprecated` per project (gauge, refreshed by gardening).

Dashboards are not part of the MVP; the metrics ship and the observability epic owns the dashboards.

## Cost & performance

The trace-search tenant brackets (Small 5k / Medium 50k / Large 500k / XL 5M **traces** per month) are the volume reference. The taxonomy adds at most one LLM call and one Voyage embed call per **session**, both cached, with the LLM call gated by [the strategy + min-session-tokens decision in step 4](#observesession-handler-step-by-step).

### From traces to sessions

The taxonomy clusters per-session, so per-trace tenant volume has to be translated through a traces:sessions ratio. The product has no measured ratio yet; the table below uses **2:1 as a blended assumption** and surfaces the bounds explicitly:

| Workload | Ratio | Why |
|---|---|---|
| One-shot completions / API-only | **1:1** | Every trace becomes its own session via the orphan→1-trace-session synthesis (`specs/session-problems/0-problems.md`). |
| Chat / agent (typical) | **3:1 to 10:1** | Multi-turn conversations group several traces into one session. |
| **Blended default** | **2:1** | Used in the ceiling table below. |

Real tenant mix swings the per-session cost by roughly 3× from these numbers (one-shot tenants pay more per trace; chat-heavy tenants pay less).

### Per-session cost components

- **LLM summary** (LLM-summary branch only — `"llm"` strategy *and* conversation ≥ `TAXONOMY_SUMMARY_MIN_SESSION_TOKENS`):
  - Input: ~3,000 conversation tokens + ~500 static system prompt + schema (the static half is prompt-cached).
  - Output: ~150 tokens (1-sentence summary + small Zod object).
  - At **Claude Haiku 4.5** (~$1 / $5 per MTok): **~$0.004/session**.
  - At a cheap MoE-class model without reasoning (~$0.30 / $1.20 per MTok ballpark): **~$0.001/session**.
  - `summary_hash` cache hit (same conversation seen for this session before): **$0**.
- **Voyage embedding** (`voyage-4-large`, 2048 dims, $0.12 / MTok, 200M-token monthly account allowance shared with trace-search):
  - LLM branch: ~80 input tokens (the summary). Embed-direct branch: ~3,000 input tokens (the conversation).
  - Embed-cache hit on identical `(text, model, dims, inputType)`: **$0**.
- **Gardening LLM** (per project per run): bounded by cluster count, not session count. ≤24 LLM calls/run × a few runs/day per active project. Trivial at every tier.

### Cost ceiling per tier

**Monthly worst case** for a single tenant, assuming no cache hits and every session crossing the LLM threshold. Real costs sit below this thanks to `summary_hash` caching, short-session skipping, and dormancy.

| Tier | Traces/mo | Sessions/mo (2:1) | LLM summary @ Haiku 4.5 | LLM summary @ cheap MoE | Voyage embed | Gardening LLM |
|---|---|---|---|---|---|---|
| Small | 5k | 2.5k | **~$10** | **~$3** | free | <$1 |
| Medium | 50k | 25k | **~$100** | **~$28** | free | <$1 |
| Large | 500k | 250k | **~$1,000** | **~$275** | free | <$1 |
| XL | 5M | 2.5M | **~$10,000** | **~$2,750** | ~$24 marginal | ~$1 |

The LLM summary call dominates and **only the XL number is meaningful**. Three knobs in MVP scope curb it:

1. **Default to a cheap non-reasoning model.** `TAXONOMY_SUMMARY_MODEL` is initialized to a Haiku-class model with reasoning off. A 1-sentence intent label doesn't need reasoning tokens, and reasoning bills as output (the expensive side).
2. **`TAXONOMY_SUMMARY_MIN_SESSION_TOKENS = 500`.** Short sessions bypass the LLM entirely and embed conversation text directly. In chat-heavy mixes this cuts summary calls by an estimated 40–60% with negligible quality loss (short sessions are usually already single-intent).
3. **`TAXONOMY_SUMMARY_STRATEGY = "embed_direct"`.** Documented escape hatch for tenants where the XL ceiling is intolerable. Never pays the per-session LLM cost; worst-case XL drops to **~$880/mo** (Voyage overflow only: 7.5B embed tokens − 0.2B free × $0.12/MTok). Quality tradeoff documented in [Decisions & tradeoffs](#why-llm-summary-is-the-default-not-embed_direct).

Subscription-plan model/strategy resolution (per-tier `TAXONOMY_SUMMARY_MODEL` and `TAXONOMY_SUMMARY_STRATEGY` overrides) is the right answer once a customer crosses the XL bracket. Documented as Future Work and not in MVP scope.

### Storage

- Postgres `taxonomy_clusters`: few KB/row × low-thousands of clusters per project. Negligible.
- ClickHouse `behavior_observations`: 2048 × 4 bytes = 8 KB/row uncompressed, ~6 KB with ZSTD. At XL (2.5M sessions/mo × 90-day TTL) ≈ ~45 GB/project for embeddings, plus tens of MB for summary text. Same order of magnitude as the trace-search XL embedding footprint.

### Latency

- `observeSession`: dominated by the summary LLM call (~1–3s) when the LLM branch fires, or by the embed call (~100ms cached, ~300ms uncached) when the embed-direct branch fires. Per-cluster Redis lock + Postgres write + ClickHouse insert: ~30ms. Total p95 ~3s end-to-end on the LLM branch, ~400ms on embed-direct. Runs out-of-band so the user never waits.
- Online assignment query (Postgres pgvector scan): instant up to ~10k clusters per project; multi-ms beyond. Same scaling profile as `IssueRepository.hybridSearch`.
- `gardenProject`: dominated by the `op-taxonomy-engine.noiseSweep` RPC at ~30–60s for a 30k noise pool (UMAP fit_transform on 30k × 2048 → 30k × 15: ~15–35s; HDBSCAN: ~5–15s; serialization + ~80–120MB compressed payload + RPC: ~10s). Capped at 5 min by `TAXONOMY_GARDENING_MAX_RUNTIME_MS`. The remaining gardening activities (merge, death, reassignment, hierarchy, naming) are sub-second each at MVP scale.

## Decisions & tradeoffs

### Why UMAP + HDBSCAN for births (and not the full BIRCH/UMAP/HDBSCAN/FAISS stack)

We adopt the part of the published clustering stack where the quality gap matters at our scale, and skip the parts that exist only to scale it to hundreds-of-millions-of-segment corpora.

**Adopted: UMAP + HDBSCAN for the noise-sweep births step.** Launching with medium+ tenants on day 1, the single-density-threshold limitation of agglomerative single-linkage is observably worse than HDBSCAN. Concretely: a noise pool that contains both a dense, dominant intent (e.g. "user asked about pricing", thousands of tight neighbors) and a sparse-but-real one (e.g. "user reported a niche Stripe webhook edge case", a dozen members) cannot be served by a single fixed link threshold — single-linkage chains the dense topic into a mega-cluster *and* over-splits the sparse one. HDBSCAN's per-point mutual-reachability distance adapts to local density and handles both correctly. UMAP-15 before HDBSCAN sharpens the density signal (raw 2048-dim cosines compress in the uninteresting range).

**Skipped: BIRCH coreset.** BIRCH is a scale technique for global multi-tenant corpora at the hundreds-of-millions of segments range. The per-project noise pool here is bounded by [Trigger model §3](#trigger-model) at ~30k observations; HDBSCAN runs on this comfortably in tens of seconds. Add BIRCH only if a hyper-whale project crosses the threshold where HDBSCAN itself starts to slow (>100k noise observations per run).

**Skipped: FAISS IVF for online assignment.** Per-tenant cluster count is hundreds to low-thousands of leaves. Pgvector exact cosine over `(organization_id, project_id)` is sub-ms and already proven by `@domain/issues`. FAISS-class ANN matters at five-figure+ cluster counts per project.

**Operational cost of going Python.** Mitigated by `@platform/op-gepa` setting the precedent — the engine, RPC protocol, TS client, and deploy lane are already a solved shape. The new sidecar `@platform/op-taxonomy-engine` mirrors it.

If a tenant ever crosses the scale where pgvector exact cosine stops being instant on the online path, the upgrade path is the same one trace-search documents: ClickHouse `vector_similarity` HNSW under the `(org, project)` sort prefix. The taxonomy MVP's data layout (org-first sort, append-only embeddings) does not foreclose that path.

### Why per-session and not per-trace

Multi-trace sessions ("user requested cancellation → agent failed to comply") are the unit users care about, per the product mockup. Per-trace clustering would treat each trace independently and lose the cross-trace arc. The cost is one dependency: the canonical synthesized `session_id` from `specs/session-problems/1-parity-traces-sessions.md`. Until that lands, the worker derives the same coalesce inline.

### Why per-session and not per-segment (intra-session)

An alternative design segments conversations by cosine drift between adjacent message windows and clusters each segment separately. That produces more clusters with finer intent resolution but requires a tunable drift threshold and adds storage. The MVP picks **one observation per session** to keep the data model and the trigger boundary simple. Segmentation is Future Work; it can layer on top of the existing observation row by emitting multiple observations per session and continuing to use the same `(sessionId, segmentIndex)` versioning key.

### Why LLM summary is the default (not `embed_direct`)

The core argument for summary-first is that embedding raw conversation text collapses multi-intent sessions into one diluted vector — a conversation spanning pricing, feature questions, bugs, and refund requests becomes one undifferentiated cluster. LLM summaries focus on intent, which is the thing the product is clustering on.

The MVP keeps `"llm"` as the default because the product mockup is dominated by intent-shaped clusters ("user requested cancellation", "agent failed to comply") — precisely where summaries pay back. `"embed_direct"` exists as:

- the **mandatory short-session branch** (sessions below `TAXONOMY_SUMMARY_MIN_SESSION_TOKENS`, where the conversation is already short and usually single-intent — the LLM call's quality gain is negligible), and
- an **explicit knob** for tenants where the XL cost ceiling outweighs the quality gap. Cost-conscious customers can opt in via per-tier overrides once subscription-plan resolution lands.

Switching strategies in production affects future observations only — existing rows keep their original assignment and `assignment_method`. The next gardening run re-evaluates the noise bucket and any boundary observations against the current cluster set, so the system converges to the new strategy without a forced rebuild.

### Why two gates (absolute + relative)

Published baselines put either gate alone at ~5% false-assignment, dropping to ~2.3% combined. The two gates are cheap to implement (one extra softmax over the top-K returned set) and the combined behavior matches user intuition: "assign only if there's a clearly best match and it's actually close." The taxonomy adopts this verbatim.

### Why a new `@domain/taxonomy` package, not refactor `@domain/issues`

`@domain/issues` is live, complex, and orchestrated via Temporal workflows. The taxonomy is a new product surface with its own lifecycle (births/merges/categories), its own cron+throttle cadence, and a different consumer model (browsing, not alerting). Generalizing the shared centroid math into a `@domain/shared` clustering core is the right *eventual* design, but doing it as a refactor during MVP couples taxonomy delivery to risk in a live failure-detection system. Duplicated helpers with tests are the cheaper path for now; the extraction is explicit Future Work.

### Why pgvector for centroids and ClickHouse for observations

Same reasoning as the rest of the codebase. Centroids are the small, mutable, hybrid-searched set (project-scoped low-thousands) — that's pgvector + tsvector territory. Observations are the high-volume, append-only, retention-bounded stream — that's ClickHouse's home. Mixing them produces the worst of both stores; splitting them is what the existing reliability system already does (canonical issues in PG, score analytics in CH).

### Why a proportional `min_members` (HDBSCAN's `min_cluster_size`)

A fixed `min_members = 4` (the small-N default) does not scale across the size range this product targets. At small-project scale (a 250-noise-obs pool), 4 members is ~1.6% of the pool — genuinely meaningful signal. At whale scale (60k noise obs), 4 members is ~0.007% of the pool. Two failure modes compound at that size:

- **Density-artifact clusters.** Even with HDBSCAN's robust density criterion, the lower bound on cluster size determines how many low-count "shapes" the algorithm is willing to emit. At a fixed floor of 4 in a 60k pool, the resulting cluster list contains a long tail of tight-but-irrelevant micro-groupings.
- **UX clutter.** A "User stuck on signup flow — 4 sessions" cluster is not a product insight in a project that does 2.5M sessions/mo. The UI gets flooded with low-count born clusters that drown out the patterns that actually matter, and the naming pass burns LLM cost on each one.

The proportional floor `min_cluster_size = clamp(round(pool * 0.005), 4, 30)` resolves both: small projects keep the `4` floor (preserving sensitivity to micro-patterns); whale projects float up to the `30` ceiling (filtering chance and clutter). The ceiling is intentionally generous — a 30-session pattern in a 1M-noise pool is still a real product insight, and we don't want the scaling rule to silently lose it.

This is the same shape as the rest of the taxonomy's "use absolute thresholds with proportional bounds" pattern (see [Trigger model](#trigger-model)): a single static threshold can't span 3 orders of magnitude of project size without becoming wrong at one end or both.

### Why HDBSCAN for births and TS agglomerative average-linkage for the category roll-up

Different goals at different stages, different tools:

- **Births** need to handle variable-density topic populations and produce a first-class noise label for points that don't fit anywhere. HDBSCAN does both natively (see [Why UMAP + HDBSCAN for births](#why-umap--hdbscan-for-births-and-not-the-full-birchumaphdbscanfaiss-stack)). UMAP-15 reduces dimensionality before HDBSCAN so the density estimates are sharp.
- **Category roll-up** wants spherical-ish groupings of ~hundreds of leaf centroids into 5–15 categories. Pure-TS agglomerative average-linkage on the cluster centroids is sub-millisecond at that count and gives clean results. Pushing it through HDBSCAN would force an artificial second engine RPC for a problem the engine isn't shaped for (a category isn't a density region; it's a navigation grouping over already-cleaned centroids).

This keeps the engine boundary narrow: one RPC, one purpose, one place to swap.

### Why a square-root-K heuristic for the category layer

The category layer is a navigation aid, not a statistical claim. `K ≈ sqrt(active_cluster_count)` (capped at 15) gives the user a reasonable navigation breadth at any scale: 9 clusters → 3 categories, 100 clusters → 10 categories, 1000 clusters → 15 categories (clamped). Information-criterion-based K selection (BIC, gap statistic) is Future Work and only worth the complexity if the heuristic produces noticeably wrong groupings on real data.

### Why no Hungarian lineage at the category layer

Leaf clusters carry identity across runs (they exist persistently in PG with stable ids). Categories are rebuilt from scratch each run and matched against prior categories via cosine continuation. Hungarian-style 1:1 + secondary scans for splits/merges is overkill for the K≤15 category layer and would obscure the simpler "rebuild + match" mental model the user sees in the UI. Leaf-level Hungarian + secondary scans is the right tool for the leaf layer and is explicit Future Work — the MVP records simple Birth/Death/Continuation/Merge transitions inline as gardening runs, without the global optimization step.

## Constraints & limitations

### Forward-only rollout

There is no first-class historical backfill. Sessions completed before the worker started running are invisible. Re-enqueuing `taxonomy:observeSession` for historical sessions works mechanically (admin script) but is operational, not productized.

### Cold-start window

Until a project has accumulated `TAXONOMY_GARDENING_MIN_OBSERVATIONS` observations (initial: 50) within the gardening lookback (initial: 7d), no clusters exist and every session lands in noise. The product surface shows an empty state ("Not enough observations yet") for cold-start projects. The next gardening sweep after the threshold is crossed produces the first taxonomy.

### Single-assignment

An observation belongs to exactly one leaf cluster (or noise). A session that legitimately spans multiple behaviors ("user asked about pricing, then changed topic to feature requests") is forced into one assignment. Multi-label and in-session segmentation are Future Work.

### One global summary model

`TAXONOMY_SUMMARY_MODEL` is one constant. Tenants with very different content distributions may want different models. Subscription-plan knobs (per-tier model resolution, same shape as the trace-search Future Work) cover this; not in MVP.

### Python engine availability is a hard dependency

The noise-sweep births step calls out to `@platform/op-taxonomy-engine` over RPC. If the engine is unreachable, that step fails — the rest of the gardening run (merge, death, reassignment, hierarchy, naming) still has no useful work to do without fresh births, so the whole run writes `status = 'failed'` and the next sweep retries. This is the same fate-sharing op-gepa already accepts. Worth flagging because it adds one new SPOF compared to the rest of the worker stack, which is pure TS + Postgres + ClickHouse + Redis.

### Per-project gardening is sequential

Each project's gardening run is a single BullMQ task and runs to completion before the next sweep enqueue lands inside its throttle window. Two thousand projects with hourly throttles and 6h sweeps means at most ~333 active gardening runs per hour per worker pod, easy at the sweep batch size. No parallel intra-project gardening because cluster state is mutated globally per project.

### Naming model determinism

LLM-generated names drift across runs even when the underlying cluster contents change negligibly. We cap the renaming frequency via `TAXONOMY_NAMING_REFRESH_OBSERVATIONS` (initial: 25 new observations between renames), but a small linguistic re-roll per refresh is expected and intended — the cluster name is a label, not a stable identifier. The stable identifier is the cluster id.

### No Temporal workflow

Both online and offline pipelines run as BullMQ tasks. Temporal would buy retry semantics and visibility but adds workflow-versioning headache (see `temporal-developer` skill). The MVP picks BullMQ for the same reason `issues:refresh` and `trace-search:refreshTrace` do.

## Future work

In rough priority order. None on the near-term roadmap; documented here so the MVP design doesn't accidentally foreclose them.

### Extract shared centroid core

`@domain/issues` and `@domain/taxonomy` duplicate `createCentroid` / `updateCentroid` / `normalizeCentroid` byte-for-byte modulo the constants. Once both surfaces are stable, hoist the math into `@domain/shared` (or a thin `@domain/clustering`) and have both packages re-export shaped helpers. This is the right design; it's deferred because the cost of duplicating ~120 lines of well-tested math is lower than the cost of breaking issue discovery during taxonomy MVP delivery.

### Hungarian + secondary-link lineage

The MVP records lineage rows inline as births/merges happen during gardening. The fuller version is a 3-pass match against the old-vs-new centroid cosine matrix: Hungarian 1:1 matching for continuations, row scan for splits, column scan for merges. This produces a globally optimal continuation graph and surfaces splits (one old cluster → two new) cleanly. Worth implementing once we have a benchmark corpus of human-labeled transitions to tune the secondary-link threshold against.

### Intra-session segmentation

Multi-behavior sessions ("billing question → feature request → praise") produce one diluted observation today. Segmenting by cosine drift between adjacent message-window embeddings gives finer-grained taxonomy resolution. Implementation: emit multiple observation rows per session with `segment_index` as part of the ReplacingMergeTree dedup key, otherwise identical to the current shape.

### Per-tier model + threshold knobs

`TAXONOMY_SUMMARY_MODEL`, `TAXONOMY_EMBEDDING_MODEL`, the absolute/relative gates, and the centroid half-life are good candidates for per-subscription-tier resolution (same shape as the trace-search subscription-plan knobs Future Work). The MVP keeps them as single constants until customer scale demands tiering.

### Bayesian threshold tuning loop

A held-out human-labeled set (or a richer human-confirmed transition log) supports automated retuning of every threshold via Optuna or Effect-friendly equivalent. The MVP relies on the seeded Acme corpus + manual inspection; the production loop materializes once the metric set and the human-labeled pool are large enough.

### Adaptive gardening cadence

The MVP uses three fixed triggers — the 6h cron sweep, the 1h activity throttle, and the 5-min noise-pressure throttle. This bounds the noise pool correctly and is materially fine for the seeded Acme corpus and small/medium customer scale, but two inefficiencies remain at the edges:

- **Mature/dormant projects** keep getting swept every 6h by the cron path even when nothing has changed — wasted gardening cycles for a no-op outcome.
- **Cold-starting whales** fire the noise-pressure path every ~4 hours during the first ~week of convergence (the 30k trigger gives HDBSCAN enough data per pass that re-birth churn is much reduced versus the previous 8k design, but it's still not zero — clusters born early may still merge or rename in subsequent passes during convergence, churning the lineage table and burning some LLM naming cost on short-lived clusters).

A neat self-tuning answer is to replace the fixed activity throttle with a **per-project adaptive interval** that reacts to each run's observed productivity (`clusters_born + clusters_merged + clusters_deprecated + noise_reassignment_rate`):

- **Productive run** (≥ N structural changes *or* ≥ X% of clusters touched): halve the interval (or snap to floor).
- **Quiet run** (0 structural changes): double the interval, up to a ceiling.
- Floor ≈ 1h, ceiling ≈ 24h. State persisted as `next_eligible_at` on the project's taxonomy state row; the cron sweep picks projects whose timer has expired instead of fanning out unconditionally. The noise-pressure path keeps its own short throttle independent of the adaptive interval — it remains the correctness valve against overshooting the noise-sweep working ceiling.

The behavior falls out naturally for the mature/dormant case: a mature project drifts toward the ceiling and only snaps back when a new behavior burst produces a productive run.

The companion fix on the cost side is **deferred naming** — don't pay LLM naming cost on a cluster until it has survived one gardening pass without being merged (or has accumulated ≥ N observations). Short-lived clusters from the convergence phase (whether driven by the noise-pressure path or by the adaptive activity path) never pay the naming bill. The data model already supports this via `name = "Pending"`; the change is only in the naming-pass selection criteria.

Both are deferred because the MVP triggers are correct and adequate; this only becomes a real efficiency lever once XL-scale onboarding is a regular occurrence (deferred naming) or once dormant-project sweep waste shows up in real cost reporting (adaptive interval).

### N-level hierarchy

The MVP hard-codes a 2-level hierarchy because the product mockup shows 2 levels and recursive depth-aware schedules are real complexity. Once 2 levels show their limits in real customer data (broad categories like "Billing" containing hundreds of leaves), recursive Category → Subcategory → Cluster hierarchy is the next step. The data model carries `parent_category_id` already; extending requires `parent_subcategory_id` or a self-referential model on a single node table.

### Cross-project taxonomy (templates)

Today's taxonomies are project-scoped and independent. There's a real product wish for "this customer's taxonomy looks like a generic customer-support taxonomy; let me prefill it." That's a templating layer over the existing data model: an org-scoped (or globally-shared) "starter taxonomy" that seeds cluster names + centroids, with the live pipeline doing assignment from sentence one. Out of scope for MVP; the data model accommodates it.

### Observability dashboards

The MVP ships metrics but not dashboards. A "Taxonomy Health" page (gardening run times, observations-to-noise ratio, top-1 confidence histogram, cluster churn rate) lives in the observability epic.

### HNSW for whale projects

Same reasoning as trace-search Future Work. Mirror the size-gated planner once a project crosses the threshold where exact pgvector scan over `taxonomy_clusters` stops being instant.

---

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Foundations (data model, package skeleton)

Lays the storage and the bounded-context skeleton. Nothing user-visible. Single PR.

- [ ] **P1-1**: Create `packages/domain/taxonomy/` with the standard layout (`entities/`, `ports/`, `use-cases/`, `testing/`, `helpers.ts`, `helpers.test.ts`, `errors.ts`, `constants.ts`, `index.ts`). Mirror `packages/domain/issues/src/` file naming exactly.
- [ ] **P1-2**: Define entity schemas in `entities/`: `cluster.ts` (`taxonomyClusterSchema`, `taxonomyCentroidSchema`), `category.ts` (`taxonomyCategorySchema`), `observation.ts` (`taxonomyObservationSchema`), `lineage.ts` (`taxonomyClusterLineageSchema`, `taxonomyRunSchema`). Zod-first per `0001-domain-entity-schema-style.md`.
- [ ] **P1-3**: Define ports in `ports/`: `taxonomy-cluster-repository.ts`, `taxonomy-category-repository.ts`, `taxonomy-lineage-repository.ts`, `taxonomy-run-repository.ts`, `behavior-observation-repository.ts`, `taxonomy-lock-repository.ts`.
- [ ] **P1-4**: Centralize every tunable from this spec's [Configuration reference](#configuration-reference) in `constants.ts`, with the documented seed values. No inline literals in use-cases or repository code.
- [ ] **P1-5**: Define `errors.ts` with `Data.TaggedError` classes per the issues reference pattern (`TaxonomyClusterNotFoundError`, `TaxonomyClusterLockUnavailableError`, `TaxonomyEmbeddingDimensionMismatchError`, `TaxonomyCentroidModelMismatchError`, etc.).
- [ ] **P1-6**: Implement the centroid helpers in `helpers.ts` (`createTaxonomyCentroid`, `updateTaxonomyCentroid`, `applyDecay`, `normalizeTaxonomyCentroid`, `validateVector`). Port from `@domain/issues/src/helpers.ts` line-for-line with the constants substitution. Co-locate exhaustive `helpers.test.ts`.
- [ ] **P1-7**: Postgres migration (Drizzle Kit) for `taxonomy_clusters`, `taxonomy_categories`, `taxonomy_cluster_lineage`, `taxonomy_runs`. Generated `search_document` columns + indexes per [Data model](#data-model). No FK constraints per repo rule.
- [ ] **P1-8**: ClickHouse migration via `pnpm --filter @platform/db-clickhouse ch:create behavior_observations`. Fill both the `unclustered/` and `clustered/` variants per the DDL in [Data model](#data-model).
- [ ] **P1-9**: Pure-TS helpers in `helpers.ts`: `agglomerativeCluster(centroids, { metric: "cosine", linkage: "average", k })` (used **only** for the 5–15-category roll-up; not for the noise sweep — that's the Python engine in Phase 4), `farthestPointSample(embeddings, budget)`, `softmax(values, temperature)`. Each with co-located tests.
- [ ] **P1-10**: `testing/fake-*-repository.ts` in-memory adapters per the `@domain/issues/testing/` shape. Export through `testing/index.ts`.

**Exit gate:** All taxonomy types, constants, helpers, ports, errors, and migrations compile and tests pass. No worker yet; no repository impls yet. `pnpm --filter @domain/taxonomy test` and `pnpm --filter @domain/taxonomy typecheck` are green.

### Phase 2 — Platform adapters (Postgres + ClickHouse repositories)

Implements the ports against real storage. Still no online pipeline. Single PR.

- [ ] **P2-1**: Drizzle schema in `packages/platform/db-postgres/src/schema/` for the four PG tables. Mirror `issues.ts` shape (jsonb + vector + generated tsvector + indexes).
- [ ] **P2-2**: `TaxonomyClusterRepositoryLive` in `packages/platform/db-postgres/src/repositories/taxonomy-cluster-repository.ts`. Implements `findById`, `listByIds`, `listActiveByProject`, `listNearestActive(orgId, projectId, queryVector, k)` (inlined `vector` literal per node-postgres limitation), `hybridSearch(orgId, projectId, queryVector, queryText, ...)`, `save` (materializes `centroid_embedding` from JSONB centroid), `bulkUpdateParentCategory`, `markMerged`, `markDeprecated`.
- [ ] **P2-3**: `TaxonomyCategoryRepositoryLive` similarly. Includes `listByProject`, `findBestMatchByVector`, `save`, `markDeprecated`.
- [ ] **P2-4**: `TaxonomyLineageRepositoryLive` (append-only) + `TaxonomyRunRepositoryLive` (CRUD).
- [ ] **P2-5**: `TaxonomyLockRepositoryLive` — Redis `SET NX EX` + token comparison on release. Project-scoped keys `org:${organizationId}:taxonomy:cluster:${clusterId}` and `org:${organizationId}:taxonomy:garden:${projectId}`. Mirror `IssueDiscoveryLockRepository`.
- [ ] **P2-6**: `BehaviorObservationRepositoryLive` in `packages/platform/db-clickhouse/src/repositories/`. Implements `upsert`, `listNoiseByProject(orgId, projectId, sinceTs)`, `listByCluster(orgId, projectId, clusterId, { cursor, pageSize })`, `getCounts(orgId, projectId)`, `findBySessionAndSummaryHash`. JSONEachRow inserts, parameterized SELECTs per CH skill rules.
- [ ] **P2-7**: Composition wiring in `apps/workers/src/server.ts` is deferred to Phase 3; this phase ships only the live layers and their unit tests against the testkit PGlite / chdb fakes.

**Exit gate:** All repository tests pass against the testkit fakes; integration tests against PGlite/chdb green; `pnpm --filter @platform/db-postgres test` and `pnpm --filter @platform/db-clickhouse test` green for taxonomy paths.

### Phase 3 — Online observation pipeline

The user-visible "live" half. Single PR; adds the `taxonomy:observeSession` worker and the trace-end hook.

- [ ] **P3-1**: Use-case `summarizeBehaviorUseCase` in `@domain/taxonomy/src/use-cases/summarize-behavior.ts`. Builds the prompt + schema described in [Online observation pipeline §4](#observesession-handler-step-by-step), calls `AI.generate`, returns the parsed object. Per-organization telemetry metadata.
- [ ] **P3-2**: Use-case `embedBehaviorSummaryUseCase`. Mirrors `embedScoreFeedbackUseCase` exactly.
- [ ] **P3-3**: Use-case `findNearestClustersUseCase`. Wraps `TaxonomyClusterRepository.listNearestActive`.
- [ ] **P3-4**: Use-case `decideClusterAssignmentUseCase`. Pure function over the top-K result, returns `{ method, clusterId, confidence }`. Tests cover both gates passing/failing in every combination.
- [ ] **P3-5**: Use-case `assignObservationToClusterUseCase`. Acquires per-cluster lock, re-reads cluster, folds embedding into centroid, persists via `TaxonomyClusterRepository.save`, increments `observation_count` and `last_observed_at`, releases lock. Mirror `assignScoreToIssueUseCase`.
- [ ] **P3-6**: Orchestration use-case `recordSessionObservationUseCase`. End-to-end: load session, build document, summarize, embed, find nearest, decide, assign-or-noise, write observation row. Co-located test against testkit fakes covers every branch.
- [ ] **P3-7**: Worker module `apps/workers/src/workers/taxonomy.ts`. `createTaxonomyWorker(deps)` subscribes to topic `"taxonomy"` with `observeSession` task (later tasks added in P4). `runObserveSessionJob` composes the layers exactly as `trace-search.ts` does; `Effect.withSpan("taxonomy.observeSession")` + `Effect.orElseSucceed(() => undefined)` at the boundary.
- [ ] **P3-8**: Hook into `runTraceEndJob`: after the existing `trace-search:refreshTrace` publish, add a sibling `publisher.publish("taxonomy", "observeSession", payload, { dedupeKey, debounceMs: TAXONOMY_OBSERVATION_DEBOUNCE_MS })`. Wrap in the same `.map(() => true).catch(...)` shape as `deterministic-flaggers:run` so failures only log.
- [ ] **P3-9**: Wire the new worker into `apps/workers/src/server.ts` alongside existing worker registrations.
- [ ] **P3-10**: End-to-end test: feed a seeded session through the worker (testkit), verify observation row appears in chdb with the expected `assignment_method`. Cover both cold-start (no clusters → noise) and assignment-against-existing-cluster paths.

**Exit gate:** Live worker runs end-to-end against a seeded Acme project: new sessions produce observation rows; observations match an existing cluster when one exists, otherwise fall to noise. `pnpm --filter @apps/workers typecheck` and the worker integration tests pass.

### Phase 4 — Python clustering engine (`@platform/op-taxonomy-engine`)

The sidecar that runs UMAP + HDBSCAN for the noise-sweep births step. Mirrors `@platform/op-gepa` end-to-end: Python `op_taxonomy_engine` package + TS client + RPC protocol + container. Single PR; lands before Phase 5 because the gardening worker depends on it.

- [ ] **P4-1**: Scaffold `packages/platform/op-taxonomy-engine/python/` with `pyproject.toml` (uv-managed), `op_taxonomy_engine` package layout copied from `op_gepa_engine`. Pin `numpy`, `umap-learn`, `hdbscan`, `scikit-learn`. Reuse the existing `rpc/server.py` + `rpc/protocol.py` patterns; no need to invent a new transport.
- [ ] **P4-2**: Implement the `noiseSweep` handler in `op_taxonomy_engine/core/`. Inputs: `embeddings: list[list[float]]`, `minClusterSize: int`, `minSamples: int`, `umapNComponents: int`, `umapNNeighbors: int`, `umapMinDist: float`, `randomSeed: int`. Pipeline: `UMAP(n_components, n_neighbors, min_dist, random_state=randomSeed).fit_transform(embeddings)` → `HDBSCAN(min_cluster_size, min_samples, metric="euclidean", cluster_selection_method="eom").fit(reduced)`. Outputs: `assignments: list[int]` (HDBSCAN labels, -1 for noise) and `outlierScores: list[float]`. Deterministic given the same input + seed; assert this in a test.
- [ ] **P4-3**: TS client `packages/platform/op-taxonomy-engine/src/`: `client.ts`, `protocol.ts`, `constants.ts`, `index.ts`. Mirror `@platform/op-gepa` shape exactly. Single exported port `TaxonomyEngineClient` with `noiseSweep(request)` method. Co-located protocol tests.
- [ ] **P4-4**: Container + deploy lane: Dockerfile, container image, pin to op-gepa's deployment shape. Health check + ready endpoint per the existing RPC server pattern.
- [ ] **P4-5**: Integration test against the running container: synthetic 2-cluster embeddings (two Gaussian blobs in 2048-dim space) → assert two cluster labels emerge with the right member counts and the expected handful of noise points.

**Exit gate:** Engine container starts, RPC client connects, deterministic synthetic-data test passes against the engine.

### Phase 5 — Offline gardening pipeline

The "live" half. Multiple PRs possible (one per major activity), but the easier path is one PR landing all gardening activities behind the same worker. Each activity is independently testable.

- [ ] **P5-1**: Cron-sweep handler `taxonomy:gardenSweep`. Admin Postgres path, enumerates projects with ≥`TAXONOMY_GARDENING_MIN_OBSERVATIONS` observations in the lookback, publishes one `taxonomy:gardenProject` per project with the throttle key. Mirror `sweep-escalating-issues.ts` shape.
- [ ] **P5-2**: `queuePublisher.scheduleRepeatable` registration in `apps/workers/src/server.ts` for the cron. Idempotent by `TAXONOMY_GARDENING_CRON_KEY`.
- [ ] **P5-3**: Per-project orchestrator `runGardenProjectJob` in the taxonomy worker. Acquires per-project lock, inserts `taxonomy_runs` row, runs activities A→G in order, closes the run, releases the lock. Time-capped at `TAXONOMY_GARDENING_MAX_RUNTIME_MS`.
- [ ] **P5-4**: Activity A — `sweepNoiseAndBirthClustersUseCase` per [§A](#a-noise-sweep-cluster-births). Computes `minClusterSize`, calls `TaxonomyEngineClient.noiseSweep`, runs the absorption check on each engine-returned cluster, writes births. Failure on the engine RPC propagates and fails the run (see [Python engine availability is a hard dependency](#python-engine-availability-is-a-hard-dependency)).
- [ ] **P5-5**: Activity B — `mergeNearDuplicateClustersUseCase` per [§B](#b-merge-pass).
- [ ] **P5-6**: Activity C — `deprecateInactiveClustersUseCase` per [§C](#c-death-pass).
- [ ] **P5-7**: Activity D — `reassignNoiseToCurrentClustersUseCase` per [§D](#d-reassignment-pass-catch-up-for-the-noise-floor).
- [ ] **P5-8**: Activity E — `rebuildCategoryHierarchyUseCase` per [§E](#e-hierarchy-rebuild-categories). TS agglomerative average-linkage on cluster centroids (helper from P1-9), K selection, continuation matching, `parent_category_id` batch update.
- [ ] **P5-9**: Activity F — `nameClusterUseCase` and `nameCategoryUseCase` per [§F](#f-naming-pass). FPS sampling helper, map+reduce LLM calls, Zod schemas inline. Tests use a stubbed `AI` adapter that returns deterministic names.
- [ ] **P5-10**: Activity G — `emitLineageUseCase`. Pure-PG writes; one row per transition emitted by activities A/B/C.
- [ ] **P5-11**: Manual-trigger use-case `triggerProjectGardeningUseCase` (admin-only) that publishes a `taxonomy:gardenProject` with the throttle key. Wired into the `backoffice` skill convention if applicable; otherwise lives as a domain use-case for now.
- [ ] **P5-12**: End-to-end test: seed a project with synthetic noise; run gardening against the running engine container; assert births, names, lineage rows, category assignments. Cover a follow-up run that produces a merge (two near-duplicate clusters in seed).

**Exit gate:** Gardening produces a coherent 2-level taxonomy from a seeded project. Lineage rows match the visible transitions. Re-running gardening with no new data is a no-op (idempotency). `pnpm --filter @apps/workers test` covers the worker; the seeded Acme corpus produces hand-recognizable categories.

### Phase 6 — Read use-cases

Domain read paths consumed later by `apps/web`. No frontend; just the domain surface plus tests.

- [ ] **P6-1**: `listCategoriesUseCase`.
- [ ] **P6-2**: `listClustersInCategoryUseCase`, `listClustersUseCase`.
- [ ] **P6-3**: `getClusterDetailsUseCase`, `getCategoryDetailsUseCase`.
- [ ] **P6-4**: `listObservationsInClusterUseCase`.
- [ ] **P6-5**: `getTaxonomyAnalyticsUseCase`, `getLastRunUseCase`.
- [ ] **P6-6**: Hybrid search inside `listClustersUseCase` — `IssueRepository.hybridSearch`-equivalent over `taxonomy_clusters`. Reuses the same Voyage embed (cached) for `inputType: "query"`.
- [ ] **P6-7**: Integration tests against PGlite + chdb fakes for every read use-case.

**Exit gate:** Read use-cases return the right shape against seeded data. `apps/web` can call them through composed server functions when the frontend lands; no `apps/web` changes are part of this phase.

### Phase 7 — Observability, ops, docs

Polish + the durable knowledge handoff. Single PR.

- [ ] **P7-1**: Structured logging tags and metrics enumerated in [Observability](#observability), including engine RPC latency + error-rate metrics on the new `@platform/op-taxonomy-engine` boundary. Effect spans on every use-case via `withTracing`.
- [ ] **P7-2**: Admin script `scripts/taxonomy/rerun-project.ts` to re-enqueue all sessions in a project through `taxonomy:observeSession` (for ops / corpus tuning).
- [ ] **P7-3**: `dev-docs/taxonomy.md`. Promote durable knowledge from this spec: data model, lifecycle, online + offline pipelines, engine boundary, configuration reference, decisions. Trim spec-only or task-tracking sections. Cross-link from `dev-docs/spans.md` (trace-end hook) and `dev-docs/issues.md` (shared centroid lineage).
- [ ] **P7-4**: Update the skill glossary in `CLAUDE.md` if a new taxonomy-specific skill emerges from implementation; otherwise no AGENTS.md change.
- [ ] **P7-5**: Manual tuning pass against seeded Acme corpus per [Tuning](#tuning-and-the-benchmark-corpus). Document any threshold adjustments back into `constants.ts` with a short comment per change.
- [ ] **P7-6**: Delete this spec (`specs/live-taxonomy.md`) once `dev-docs/taxonomy.md` is authoritative and the MVP has shipped to staging.

**Exit gate:** Documentation captures the durable design; metrics + logs are present; the seeded corpus produces a hand-recognizable, sensible taxonomy; this spec can be deleted.
