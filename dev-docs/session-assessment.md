# Session assessment

Session assessment is the per-session evidence read model used by the Scores panel, public session-assessment operations, and the Agent Score benchmark. It is resolved on demand from retained telemetry and persisted judgments. It is not a stored score, observation row, or assessment snapshot.

Domain code lives in `packages/domain/agent-score`. Infrastructure adapters live in `packages/platform/db-clickhouse` and `packages/platform/db-postgres`.

## Model

An assessment contains:

- chronological, deduplicated evidence items;
- one or more dimension effects on each item;
- summaries for Outcome, Reliability, Cost, Speed, and Safety;
- reader-level examination coverage;
- authorized anchors and navigation destinations.

It deliberately has no per-session 0–100 score and no generic confidence field. Direction (`positive`, `negative`, or `context`) is separate from measurement state (`observed`, `estimated`, or `notMeasured`). Cost and Speed preserve their native units instead of translating them into generic points.

The public model is Zod-first in `src/entities/session-assessment.ts`. Internal normalized findings and reader facts are defined in `src/entities/session-assessment-input.ts`.

## Resolution pipeline

`readSessionAssessmentSources` converts source-domain facts into `NormalizedSessionAssessmentInput`. It reads deterministic flagger findings, finish reasons, provider errors, scores and linked signals, and conversation moments. It does not run an LLM.

`resolveSessionAssessment` then applies the shared pure pipeline:

1. map each normalized finding to dimension effects;
2. deduplicate automatic evidence by its stable source key while retaining independent human evidence;
3. sort by source chronology and evidence key;
4. derive reader and per-dimension coverage;
5. build all five dimension summaries.

One source event remains one item even when it affects several dimensions. Metric evidence takes precedence when the same event is also represented by a signal, flagger score, or generic score. Merging retains every applicable score id, signal id, anchor, and destination.

## Coverage

Coverage answers whether a reader examined the session, not whether the session was healthy. An examined reader with zero findings is different from a reader that did not run or could not read its input.

Reader states are:

- `examined`, including a finding count that may be zero;
- `partiallyExamined`, with readable and total counts plus a limitation;
- `notExamined`, with a limitation;
- `notApplicable`.

Flagger screening decisions distinguish known sampling loss, rate limiting, execution failure, and pending work. Internal policy reasons such as disabled, suppressed, missing flagger, and missing context all surface as `skipped`. Dimension coverage is derived only from readers relevant to that dimension; there is no assessment-wide completeness flag.

## Source boundaries

Single-session ports in `src/ports/session-assessment-sources.ts` expose conversation telemetry, spans, scores, signals, moments, and screening decisions as source facts. Platform adapters must not assign benchmark meaning.

The benchmark uses separate bulk ports so it never calls an interactive use-case once per session:

- `SessionAssessmentBulkTelemetrySource` reads ClickHouse facts for an organization, project, session-id batch, and calculation cutoff.
- `SessionAssessmentBulkJudgmentSource` reads Postgres scores and linked signals for the same scope after trace ids have been resolved.

`readSessionAssessmentBatch` invokes each bulk port once and feeds every returned session through the same source readers and resolver used by the single-session path.

The ClickHouse adapter performs a bounded set of bulk reads for session details, spans, latest conversation-analysis generations, moments, labels, and screening decisions. It excludes sessions ending after the cutoff, excludes facts indexed after the cutoff, and filters moments and labels to the latest analyzed generation. A newer failed or skipped analysis does not fall back to stale moments.

The Postgres adapter reads scores by both session ids and resolved trace ids so scores attached to orphan traces remain visible. It applies the calculation cutoff to score creation time, loads linked signals once, and groups the results back to their owning assessment session.

Missing requested sessions are omitted from the bulk result. Empty batches perform no source reads.

## Persistence boundary

Deterministic findings are recomputed from telemetry. Persisted scores remain the source for human annotations, evaluations, and model judgments that cannot be reproduced exactly. Flagger screening decisions are stored separately because scores alone cannot distinguish examined-with-no-finding from sampled out, skipped, rate-limited, failed, or pending work.

Loading either the single-session or bulk assessment must not write scores, signals, findings, measurements, or assessment rows.
