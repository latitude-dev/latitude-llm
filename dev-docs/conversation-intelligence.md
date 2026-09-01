# Conversation Intelligence

Conversation intelligence turns raw session telemetry into semantic structure: **session analyses**, **session semantic moments**, **session moment labels** (signals like escalation or frustration), and **session-level taxonomy observations** that feed the topic tree documented in [`./taxonomy.md`](./taxonomy.md). It is the session-analysis half of the behaviours product; the clustering half lives in the taxonomy domain.

Domain code: `packages/domain/conversation-intelligence`. ClickHouse adapters: `packages/platform/db-clickhouse/src/repositories/conversation-intelligence-repositories.ts`. Orchestration: `apps/workflows/src/workflows/analyze-session-workflow.ts` + `apps/workflows/src/activities/analyze-session-activities.ts`, started from the `session-end` worker (fed by trace-end, see [`./spans.md`](./spans.md)) with the deterministic workflow id `org:${organizationId}:conversation-intelligence:analyzeSession:${projectId}:${sessionId}`.

### Triggering, debounce, and re-analysis

The `session-end` worker triggers analysis with **`signalWithStart`**, not a plain start: it targets the stable per-session workflow id, sends the `traceCompleted` signal, and uses `workflowIdReusePolicy: "ALLOW_DUPLICATE"` so a session whose previous analysis workflow already *completed* can be analyzed again when a later trace arrives. Because the workflow id is per session, every trace in a session converges on one workflow execution. The settle debounce lives in the `session-end` queue job (`SESSION_END_DEBOUNCE_MS`, 5 min, last-write-wins per session); the workflow's old internal debounce was patched out.

The workflow registers a `traceCompleted` signal handler on entry (so a signal delivered to an already-running execution is handled, never rejected as unknown), then:

1. Runs one analysis pass (`runAnalyzeSessionPass`: load → hash → eligibility → embed → persist).
2. If a `traceCompleted` signal arrived *during or after* a pass, runs one more deterministic pass; the next pass reloads the latest session state before hashing, so it picks up traces that landed mid-analysis. The loop exits when a pass completes with no pending rerun. Each pass is independently idempotent, so the loop is safe under Temporal retry/replay.

The persist activity also chains the **flagger screening pass** (see [`./flaggers.md`](./flaggers.md)): it publishes `flagger-screening` for every recorded generation — including `skipped_*`/`failed` analyses — with a dedupe key that embeds the `analysis_hash`. Flaggers deliberately run after moments so labels can serve as detection hints.

## Design stance: embedding candidates, contextual precision gate

Analyzing every turn with an LLM is not economically viable at telemetry volume. Semantic segmentation, label candidate generation, topic projection, and cluster routing therefore use embeddings and deterministic math. The label anchors are a cheap recall stage: sessions with no candidate incur no generation call. When candidates exist, one batched MiniMax call validates all selected candidates against the indexed conversation context before any label is persisted.

The taxonomy and signal gates intentionally use fixed constants. This keeps QA tractable and prevents hidden per-project threshold drift; corpus-specific quality work happens through bounded gardening, naming, and evaluation rather than runtime threshold tuning.

## Pipeline

The Temporal workflow is split into deterministic orchestration plus cache warm-up activities. `loadAnalyzeSessionActivity`, `hashAnalyzeSessionActivity`, and `checkAnalyzeSessionEligibilityActivity` decide whether work is needed; for ordinary trace-completed runs the workflow then warms the turn-embedding and label-anchor caches before calling `persistAnalyzeSessionActivity`. The persisted state is still produced by the full `analyzeSessionUseCase`, so backfill/manual runs and trace-completed runs share the same write path:

```
SessionRepository ──► session conversation (latest responsive span window)
        │
        ▼
turn extraction (tool telemetry stripped)
        │
        ▼
resolve turn embeddings (shared message_embeddings store, voyage-4-large, 2048 dims)
        │
        ▼
semantic segmentation ──► semantic moments (full-exchange minimum unit)
        │
        ├──► moment-label candidates (anchor cosine vs static per-kind gates)
        │             ▼
        │     contextual MiniMax validation (one batch, candidate-bearing sessions only)
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

### Session conversation and turn extraction

Messages come from `SessionRepository.findBySessionId` (a `SessionDetail`); the analyzer builds the conversation with `sessionConversationMessages` (`@domain/spans`): system instructions + the **latest responsive span's input window** + its output — the exact message list the session drawer renders. This is deliberate: label/segment message indices must address the same positions the UI anchors badges to (`data-message-index`), so a consolidated cross-trace spine (which would renumber messages) is rejected. The flagger domain builds its conversation from the same helper, so flagger `messageIndex` anchors share this index space.

Mid-session context compaction is handled implicitly, by construction: `lastInputMessages` is the model's context window at the last turn, so after a compaction the analyzed conversation is the compaction summary plus the post-compaction turns — exactly what the model was given. Pre-compaction turns are not re-fetched, and a summary message is embedded, segmented, and label-eligible like any other message.

Tool-role messages and tool-call telemetry inside assistant messages are **stripped before any embedding** — tool names like `get_customer_by_phone` otherwise dominate moment embeddings and produce false labels. Empty-text messages are dropped. When a session has no 32-char trace id, moments reference a stable 32-hex surrogate hashed from the triggering id instead of failing schema validation.

### Semantic segmentation (`semantic-segmentation.ts`)

Turns group into **semantic moments** by cosine continuity against the running moment centroid:

- The smallest moment unit is a **full exchange**: boundaries are only considered before a *user* turn, and never before the open moment holds at least one user and one assistant turn — an assistant response always belongs to the moment of the user turn it answers. (Single-message moments produced degenerate topics like "Affirmative Confirmation"; this rule is the fix.)
- A bare acknowledgement ("ok", "thanks") never opens a moment of its own, but it must not glue the *following* user turn onto the old moment — the next substantive turn is judged on similarity like any other.
- The continuity threshold is per-session: `median - 1.5*MAD` of adjacent-turn similarities, clamped to the static continuity threshold band; sessions with fewer than 6 adjacent pairs use the static default.
- A max-length cap splits runaway moments; the last segment keeps its genuine boundary reason (`max_length`, `semantic_drift`, `session_start`) rather than being overwritten.

### Moment labels (signals)

`MOMENT_KINDS` (constants.ts): `escalation`, `hesitation`, `abandonment`, `user_frustration`, `user_satisfaction`, `resolution`, `policy_refusal`, `clarification_loop`, `user_correction` (the user asserts the assistant got it wrong or restates lost information — distinct from `clarification_loop`, which anchors to an assistant's repeated request), and `stalling` (explicit assistant deferral, waiting, or ongoing checking/processing without progress; information requests, even redundant ones, are not stalling). New kinds must be semantically distinct from the existing set (separable anchor sets), and adding one bumps `CONVERSATION_INTELLIGENCE_DETECTOR_VERSION` so sessions re-analyze on their next trace. Kinds flow automatically into the flagger hint union as `moment:<kind>` hints (declare positive kinds in the flaggers domain).

Each kind has a set of positive and contrast anchor phrases plus a role filter (`anchors.ts`), embedded once per process and detector version. A turn nominates a kind when its cosine to the kind's best positive anchor clears that kind's static gate (threshold + margin over the contrast anchors).

The analyzer sorts candidates deterministically by confidence and validates at most 24 in one structured `MOMENT_CLASSIFIER` generation (`amazon-bedrock` / `minimax.minimax-m2.5` by default). The prompt carries original message indices, bounded surrounding context, the relevant positive/contrast definitions, and compact candidate ids. The model can only accept or reject nominated ids; it cannot create, relabel, or mutate a candidate. Each candidate's indexed evidence and rendered role must anchor the label correctly. Context may establish multi-turn facts such as repetition, but it cannot transfer a neighboring turn's behavior onto the candidate. Generic acknowledgements require contextual proof of satisfaction/resolution, clarification loops require repeated assistant requests, stalling requires deferral without progress, ordinary edits do not establish abandonment, and ordinary help requests do not establish escalation. Unknown or duplicate returned ids and provider/schema failures fail the analysis closed so Temporal can retry; unconfirmed candidates never persist. Prompt data is delimited, escaped, and treated as untrusted.

Accepted labels attach to the semantic moment containing their message range, falling back to the nearest moment by index distance — never blindly the session's first moment.

Labels are **behavioral signals, not topics**. They feed the Signals columns, the sessions-table moments filter, per-cluster intelligence rollups, and the flagger hint catalog (as `moment:<kind>` hints — [`./flaggers.md`](./flaggers.md)); they intentionally do not create taxonomy clusters or scores.

### Topic projection and routing

Each analyzed conversation emits at most one taxonomy observation: the full user/assistant conversation text is middle-truncated to `CONVERSATION_INTELLIGENCE_LLM_MAX_DOCUMENT_CHARS`, embedded (`moment_text_embedding` remains the historical projection method name), normalized, and routed into the cluster tree with `routeToDeepestClusterUseCase` (deepest-fit descent — see taxonomy doc). The observation's `moment_id` is a synthetic session-topic id, not one of the semantic segment ids. Labels and process signals remain separate from the topic projection; routine verification or greeting steps do not get their own taxonomy dimension.

Taxonomy observations are always ingested when a session produces a taxonomy projection. They use the same 30-day horizon as semantic-search embeddings (`TAXONOMY_OBSERVATION_RETENTION_DAYS`) so the taxonomy follows live semantic traffic instead of freezing at a one-time project sample. The analyzer still persists the full `session_semantic_moments` and `session_moment_labels` outputs on the broader conversation-retention horizon. Gardening is the bounded part: it rebuilds the whole tree from a day-stratified sample of up to `TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX` observations across the lookback window with a single top-down divisive clustering pass, then names the clusters. Observations that clear no online cluster gate persist as `noise`, but the rebuild samples every member regardless of current assignment and reassigns it to a leaf, so noise is reabsorbed at the next pass rather than swept incrementally. See [`./taxonomy.md`](./taxonomy.md) for the build algorithm.

**This is the Topics lens only.** The projection above (transcript embedding, online-routed) is what the default **Topics** behavior clusters. Other behaviors — **facets** ("user goal", "outcome", a custom question) — do not touch this live path: their projection is an LLM-extracted one-sentence answer to the facet's question, embedded and clustered **at gardening time**, sample-bounded and cached in `taxonomy_facet_projections` (`extractFacetProjectionsUseCase`). So the live analysis path stays embeddings-only per the design stance above; the only generative per-session work for facets runs in the batch garden, not here. See [`./taxonomy.md`](./taxonomy.md#behaviors-views-and-facets-lenses).

## Data model (ClickHouse)

All four tables are `ReplacingMergeTree(indexed_at)` partitioned by month, sorted by `(organization_id, project_id, …)` so every read is tenant- and project-pruned.

| Table | Key (after org/project) | Holds |
|---|---|---|
| `session_analyses` | `session_id` | One row per session: `analysis_hash`, status, status reason, trace ids |
| `session_semantic_moments` | `session_id, analysis_hash, moment_id` | Segmentation output: message index range, boundary reason, coherence |
| `session_moment_labels` | `session_id, analysis_hash, label_id` | Signal kind, confidence, evidence, message range, `moment_id` |
| `taxonomy_observations` | `observation_id` | Topic projections: stable session-level `observation_id`, synthetic session-topic `moment_id`, embedding, `assigned_cluster_id`, assignment method/confidence, `analysis_hash`, `projection_hash`, JSON `projection_metadata` |

### Analysis generations and the pinning rule

`analysis_hash` is a content hash of the session's analyzable messages plus segmentation/anchor versioning. Re-analysis after a session grows produces a **new generation** with a new hash. Moment and label ids hash the generation hash (`makeMomentId`, `labelId = hash(analysisHash\0label\0momentId)`), so each generation gets a fresh set and superseded moments/labels **accumulate** one set per generation — the analyses table itself collapses to one row per session.

The **taxonomy observation id is the exception**: it hashes only `org\0project\0session\0dimension\0method`, *not* the generation hash, so it is **stable across generations**. Re-analysis therefore reuses the same `observation_id`; because `taxonomy_observations` is keyed by `(organization_id, project_id, observation_id)`, `FINAL` returns the newest projection by `indexed_at` even when the assignment moved to another cluster. The row still carries `analysis_hash`, so joined read paths pin to the current analysis generation before combining taxonomy observations with trace ids or moment labels.

**Every read of generationed moment/label data, and every join that combines taxonomy observations with moment labels or trace ids, must pin to the session's current generation.** The canonical, FINAL-free form:

```sql
AND (x.session_id, x.analysis_hash) IN (
  SELECT session_id, argMax(analysis_hash, indexed_at)
  FROM session_analyses
  WHERE organization_id = {org} AND project_id = {project}
  GROUP BY session_id
)
```

Unpinned moment/label reads return the union of all generations — duplicated moments, stale labels, and wrong denominators in behavior rates. Repository methods that read only taxonomy observations use `FINAL` over the stable observation id; web and session-filter paths that join observations to labels pin both sides to the current `analysis_hash`.

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

- **Session drawer** (`listSessionMomentIntelligenceUseCase`): moments + labels + observations for one session, defaulting to the latest analysis generation; the conversation tab anchors moment pills to message ranges, and the conversation timeline places the same labels as event markers (see [`./conversation-timeline.md`](./conversation-timeline.md)).
- **Sessions table filters** (`session-repository.ts`): `moments` (any-of label kinds) and `topics` (any-of subtree cluster ids) compile to `session_id IN (subquery)` with the argMax pin. When the view has a time window, its **lower bound** propagates into the subqueries for partition pruning — the always-safe direction, since analyses index after sessions start; an upper bound is not safe.
- **Cluster intelligence rollups** (`taxonomy-cluster-intelligence-repository.ts`): per-cluster signal distributions and rates over source sessions, observation side pinned to current generations.

## Trade-off decisions

- **Candidate-gated generation**: embeddings keep recall cheap across all sessions; a single contextual generation cost is paid only for sessions with nominated labels. The 24-candidate cap bounds cost and may drop lower-confidence candidates in unusually long/noisy sessions.
- **Full-exchange moment unit**: coarser than per-message moments, deliberately — topic embeddings need the user ask *and* the agent response to carry intent.
- **Generations are append-only**: re-analysis never deletes prior rows (cheap writes, replayable history) at the cost of the pinning discipline on every read.

## Future work

- **Superseded-generation reclamation**: a TTL or gardening sweep for non-current `analysis_hash` rows would shrink read costs and remove the pinning foot-gun at the storage layer.
- **Ritual suppression for handoff exchanges**: "let me talk to a human" moments are behavioral, not topical, yet currently form a cross-domain topic cluster (escalation is already a first-class label); transfer-request ritual anchors would keep them out of the tree.
- **Topic projection boilerplate suppression**: fixed thresholds make QA simpler, but repeated support rituals can still influence embeddings; future work can use deterministic text weighting or extraction to downweight cross-topic boilerplate without reintroducing threshold tuning.
- **`needs_answer` outcome segment** (spec'd, unimplemented) and richer outcome classification.
