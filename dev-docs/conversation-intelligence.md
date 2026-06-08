# Conversation Intelligence

Conversation intelligence turns raw session telemetry into semantic structure: **session analyses**, **session semantic moments**, **session moment labels** (signals like escalation or frustration), and **session-level taxonomy observations** that feed the topic tree documented in [`./taxonomy.md`](./taxonomy.md). It is the session-analysis half of the behaviours product; the clustering half lives in the taxonomy domain.

Domain code: `packages/domain/conversation-intelligence`. ClickHouse adapters: `packages/platform/db-clickhouse/src/repositories/conversation-intelligence-repositories.ts`. Orchestration: `apps/workflows/src/workflows/analyze-session-workflow.ts` + `apps/workflows/src/activities/analyze-session-activities.ts`, started from the trace-end boundary (see [`./spans.md`](./spans.md)) with the deterministic workflow id `org:${organizationId}:conversation-intelligence:analyzeSession:${projectId}:${sessionId}`.

### Triggering, debounce, and re-analysis

The trace-end boundary triggers analysis with **`signalWithStart`**, not a plain start: it targets the stable per-session workflow id, sends the `traceCompleted` signal, and uses `workflowIdReusePolicy: "ALLOW_DUPLICATE"` so a session whose previous analysis workflow already *completed* can be analyzed again when a later trace arrives. Because the workflow id is per session, every trace in a session converges on one workflow execution.

The workflow registers a `traceCompleted` signal handler on entry (so a signal delivered to an already-running execution is handled, never rejected as unknown), then:

1. Debounces (`CONVERSATION_INTELLIGENCE_ANALYSIS_DEBOUNCE_MS`) so a burst of trailing traces collapses into one analysis. Signals received *during* the initial debounce need no extra pass — the first load after the debounce already sees the latest session state, so the rerun flag is cleared once before the loop.
2. Runs one analysis pass (`runAnalyzeSessionPass`: load → hash → eligibility → embed → segment → label → persist).
3. If a `traceCompleted` signal arrived *during or after* a pass, runs one more deterministic pass; the next pass reloads the latest session state before hashing, so it picks up traces that landed mid-analysis. The loop exits when a pass completes with no pending rerun. Each pass is independently idempotent, so the loop is safe under Temporal retry/replay.

## Design stance: embeddings-only in the hot path

Analyzing every session with an LLM is not economically viable at telemetry volume. Everything that runs per session — segmentation, labeling, topic projection, cluster routing — uses **embeddings and deterministic math** only. LLM calls are reserved for amortized naming/profile work, never per-session analysis or merge decisions.

The taxonomy and signal gates intentionally use fixed constants. This keeps QA tractable and prevents hidden per-project threshold drift; corpus-specific quality work happens through bounded gardening, naming, and evaluation rather than runtime threshold tuning.

## Pipeline

One session analysis runs as a single Temporal activity wrapping `analyzeSessionUseCase`:

```
SessionRepository/TraceRepository ──► turn extraction (tool telemetry stripped)
        │
        ▼
embed turns (voyage-4-large, 2048 dims, Redis-cached by content hash)
        │
        ▼
semantic segmentation ──► semantic moments (full-exchange minimum unit)
        │
        ├──► moment labels (anchor cosine vs static per-kind gates)
        │
        └──► session topic projection (full conversation embedding)
                 ▼
        deepest-fit tree routing (routeToDeepestClusterUseCase, @domain/taxonomy)
                 │
                 ▼
persist: taxonomy observation (CH, first) ──► centroid increments (PG, retry-gated)
         ──► analysis gate row + moments + labels (CH, last)
```

Sessions that are empty, too short, or not user/agent conversations short-circuit into explicit `skipped_*` statuses before any embedding or model cost. Failures record `analysis_status = 'failed'` with a zeroed hash that can never masquerade as a current analysis.

### Turn extraction

Messages come from trace details (falling back to `session.lastInputMessages` when traces lack detail). Tool-role messages and tool-call telemetry inside assistant messages are **stripped before any embedding** — tool names like `get_customer_by_phone` otherwise dominate moment embeddings and produce false labels. Empty-text messages are dropped; original message indexes are preserved so moments and labels point back into the real message array. When a session has no 32-char trace id, moments reference a stable 32-hex surrogate hashed from the triggering id instead of failing schema validation.

### Semantic segmentation (`semantic-segmentation.ts`)

Turns group into **semantic moments** by cosine continuity against the running moment centroid:

- The smallest moment unit is a **full exchange**: boundaries are only considered before a *user* turn, and never before the open moment holds at least one user and one assistant turn — an assistant response always belongs to the moment of the user turn it answers. (Single-message moments produced degenerate topics like "Affirmative Confirmation"; this rule is the fix.)
- A bare acknowledgement ("ok", "thanks") never opens a moment of its own, but it must not glue the *following* user turn onto the old moment — the next substantive turn is judged on similarity like any other.
- The continuity threshold is per-session: `median - 1.5*MAD` of adjacent-turn similarities, clamped to the static continuity threshold band; sessions with fewer than 6 adjacent pairs use the static default.
- A max-length cap splits runaway moments; the last segment keeps its genuine boundary reason (`max_length`, `semantic_drift`, `session_start`) rather than being overwritten.

### Moment labels (signals)

`MOMENT_KINDS` (constants.ts): `escalation`, `hesitation`, `abandonment`, `user_frustration`, `user_satisfaction`, `resolution`, `policy_refusal`, `clarification_loop`.

Each kind has a set of anchor phrases (`anchors.ts`), embedded once and Redis-cached. A turn fires a kind when its cosine to the kind's best anchor clears that kind's static gate (threshold + margin). Labels attach to the semantic moment containing their message range, falling back to the nearest moment by index distance — never blindly the session's first moment.

Labels are **behavioral signals, not topics**. They feed the Signals columns, the sessions-table moments filter, and per-cluster intelligence rollups; they intentionally do not create taxonomy clusters.

### Topic projection and routing

Each analyzed conversation emits at most one taxonomy observation: the full user/assistant conversation text is embedded (`moment_text_embedding` remains the historical projection method name) and routed into the cluster tree with `routeToDeepestClusterUseCase` (deepest-fit descent — see taxonomy doc). Labels and process signals remain separate from the topic projection; routine verification or greeting steps do not get their own taxonomy dimension.

Taxonomy observations are always ingested when a session produces a taxonomy projection. They use the same 30-day horizon as semantic-search embeddings (`TAXONOMY_OBSERVATION_RETENTION_DAYS`) so the taxonomy follows live semantic traffic instead of freezing at a one-time project sample. The analyzer still persists the full `session_semantic_moments` and `session_moment_labels` outputs on the broader conversation-retention horizon. Gardening is the bounded part: clustering, noise reassignment, naming, and reconciliation operate from the newest taxonomy observation window (`TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX`, currently 100k), ordered newer to older. Observations that clear no cluster gate persist as `noise` and are later swept by gardening into births or reassignments while they remain in the live window.

## Data model (ClickHouse)

All four tables are `ReplacingMergeTree(indexed_at)` partitioned by month, sorted by `(organization_id, project_id, …)` so every read is tenant- and project-pruned.

| Table | Key (after org/project) | Holds |
|---|---|---|
| `session_analyses` | `session_id` | One row per session: `analysis_hash`, status, lens, trace ids |
| `session_semantic_moments` | `session_id, analysis_hash, moment_id` | Segmentation output: message index range, boundary reason, coherence |
| `session_moment_labels` | `session_id, analysis_hash, label_id` | Signal kind, confidence, evidence, message range, `moment_id` |
| `taxonomy_observations` | `assigned_cluster_id, start_time, observation_id` | Topic projections: embedding, `assigned_cluster_id`, assignment method/confidence, `analysis_hash`, `projection_hash` |

### Analysis generations and the pinning rule

`analysis_hash` is a content hash of the session's analyzable messages plus segmentation/anchor versioning. Re-analysis after a session grows produces a **new generation** with a new hash. Moment and label ids hash the generation hash (`makeMomentId`, `labelId = hash(analysisHash\0label\0momentId)`), so each generation gets a fresh set and superseded moments/labels **accumulate** one set per generation — the analyses table itself collapses to one row per session.

The **taxonomy observation id is the exception**: it hashes only `org\0project\0session\0dimension\0method`, *not* the generation hash, so it is **stable across generations**. Re-analysis therefore reuses the same `observation_id`, and the new row generally **replaces** the prior one in ClickHouse (ReplacingMergeTree) rather than accumulating. The row still carries `analysis_hash`, so pinning is still required: if a new generation routes the session to a *different* cluster, the sort key `(assigned_cluster_id, start_time, observation_id)` differs and a second row survives until compaction, and unpinned rate denominators would count both.

**Every read must pin to the session's current generation.** The canonical, FINAL-free form:

```sql
AND (x.session_id, x.analysis_hash) IN (
  SELECT session_id, argMax(analysis_hash, indexed_at)
  FROM session_analyses
  WHERE organization_id = {org} AND project_id = {project}
  GROUP BY session_id
)
```

Unpinned reads return the union of all generations — duplicated moments, stale labels, ghost observations in rate denominators. This bug class surfaced three independent times in adversarial review; treat any new read of these tables without the pin as wrong by default.

### Idempotency and retry semantics

The analyzer is a retried Temporal activity, so every write is either idempotent or retry-gated:

- Moment and label ids are content hashes embedding the generation hash — re-running identical content reproduces identical rows, which ReplacingMergeTree dedups.
- **Centroid updates are not idempotent** (Postgres `observationCount ± 1`, decayed-weighted-sum add/remove). Before writing the new observation rows the analyzer snapshots the session's prior observations (`taxonomyObservations.listBySession`); because the observation id is stable across generations, each new row matches its predecessor. It then decides per row:
  - **Identical retry** — same `assigned_cluster_id`, `analysis_hash`, *and* `projection_hash` as the snapshot → skip entirely. This is the at-most-once guard for activity retries.
  - **Same cluster, changed projection** — the centroid would otherwise count the session twice. `replaceObservationInClusterUseCase` (`@domain/taxonomy`) **removes** the prior embedding's contribution and **adds** the new one under the per-cluster Redis lock with a fresh `findById`, leaving `observationCount` unchanged. This keeps the centroid tracking the latest generation of a re-analyzed session without inflating its count.
  - **New or changed cluster** — `assignObservationToClusterUseCase` increments (+1) as a first observation.

  The new observation rows are written to ClickHouse *first*, so a crash before the Postgres update at worst loses one increment (gardening self-corrects) instead of double-counting forever. `projection_hash` is `hash(analysisHash\0session\0dimension\0method\0projectionText)`.
- The hash-current skip (`analysisStatus !== "failed"` guard) makes unchanged sessions free.

## Read paths

- **Session drawer** (`listSessionMomentIntelligenceUseCase`): moments + labels + observations for one session, defaulting to the latest analysis generation; the conversation tab anchors moment pills to message ranges.
- **Sessions table filters** (`session-repository.ts`): `moments` (any-of label kinds) and `topics` (any-of subtree cluster ids) compile to `session_id IN (subquery)` with the argMax pin. When the view has a time window, its **lower bound** propagates into the subqueries for partition pruning — the always-safe direction, since analyses index after sessions start; an upper bound is not safe.
- **Cluster intelligence rollups** (`taxonomy-cluster-intelligence-repository.ts`): per-cluster signal distributions and rates over source sessions, observation side pinned to current generations.

## Trade-off decisions

- **Embeddings-only per session**: lower per-moment label precision accepted for unit economics; precision is recovered statistically through static anchor thresholds and corpus-level aggregation.
- **Full-exchange moment unit**: coarser than per-message moments, deliberately — topic embeddings need the user ask *and* the agent response to carry intent.
- **Generations are append-only**: re-analysis never deletes prior rows (cheap writes, replayable history) at the cost of the pinning discipline on every read.

## Future work

- **Superseded-generation reclamation**: a TTL or gardening sweep for non-current `analysis_hash` rows would shrink read costs and remove the pinning foot-gun at the storage layer.
- **Ritual suppression for handoff exchanges**: "let me talk to a human" moments are behavioral, not topical, yet currently form a cross-domain topic cluster (escalation is already a first-class label); transfer-request ritual anchors would keep them out of the tree.
- **Topic projection boilerplate suppression**: fixed thresholds make QA simpler, but repeated support rituals can still influence embeddings; future work can use deterministic text weighting or extraction to downweight cross-topic boilerplate without reintroducing threshold tuning.
- **`needs_answer` outcome segment** (spec'd, unimplemented) and richer outcome classification.
