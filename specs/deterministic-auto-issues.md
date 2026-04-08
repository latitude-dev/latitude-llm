# Deterministic Auto Issues

## Problem Statement

The reliability system can already surface issues from canonical scores, but that path is optimized for semantic clustering and delayed discovery. That is the wrong fit for deterministic operational failures such as span exceptions.

For span-level exceptions, users want Sentry-like behavior:

- detect the failure immediately after the span is durable
- group repeated occurrences of the same error into one issue
- avoid a 5-minute debounce window
- avoid semantic vector clustering for failures that already have a stable machine identity
- preserve a canonical occurrence record that can be inspected later

The current system annotation queue pipeline is also the wrong fit because it is built around draft annotations, human review, and queue items rather than immediate machine-created issues.

## Solution

Introduce a separate deterministic auto-issue detection rail for machine-identifiable failures.

The first detector is `span-errors`:

- it runs at 100% sampling
- it executes once per ingested span, not once per ended trace
- it inspects the span for `exception` events
- it creates exactly one canonical `custom` score per qualifying span
- it computes a deterministic fingerprint from `exception.type + normalized exception.message`
- it bypasses semantic issue discovery and instead assigns the score directly to one exact-match detected issue for that fingerprint

This rail must be designed as a detector registry so future deterministic signals can reuse the same framework without going through system annotation queues.

## User Stories

1. As a reliability engineer, I want repeated copies of the same span exception to land on one issue, so that I do not get duplicate issues for the same failure.
2. As a reliability engineer, I want deterministic span exceptions to appear as issues quickly after ingestion, so that I can react before the normal semantic discovery debounce would complete.
3. As a reliability engineer, I want the system to create one occurrence per failing span, so that counts reflect real operational frequency without double-counting multiple events inside one span.
4. As a reliability engineer, I want each auto-created issue occurrence to be backed by a canonical score, so that issues still have durable evidence records and can reuse score-based projections later where appropriate.
5. As a reliability engineer, I want the first detector to focus only on true exception events, so that v1 avoids noisy status-only errors with poor grouping quality.
6. As a reliability engineer, I want exact-match issues to use deterministic grouping, so that operationally identical errors never depend on embeddings or reranking.
7. As a reliability engineer, I want exact-match issues to have stable deterministic titles and descriptions, so that the system does not rename operational failures unpredictably.
8. As a reliability engineer, I want the detector rail to be separate from annotation queues, so that machine-created issues do not create draft annotations or queue review work.
9. As a reliability engineer, I want future deterministic detectors to plug into the same framework, so that new machine-identifiable signals can create issues without re-architecting the pipeline.
10. As a platform engineer, I want detector execution to be idempotent per span, so that retries and duplicate deliveries do not inflate occurrence counts.
11. As a platform engineer, I want exact-match issue creation to be concurrency-safe, so that two workers racing on the same new fingerprint do not create two issues.
12. As a platform engineer, I want the hot read path for detector issue lookup to be cached, so that the system can handle high-ingest traffic without repeatedly hitting Postgres for the same fingerprint.
13. As a platform engineer, I want the database to remain the source of truth even when cache is present, so that cache misses, stale values, or worker restarts do not corrupt issue ownership.
14. As a product engineer, I want exact-match detected issues and semantic clustered issues to coexist cleanly, so that the system can support both operational failures and fuzzy failure patterns.
15. As a product engineer, I want exact-match issues to skip vector projection and centroid math, so that deterministic issue types do not pretend to be semantic clusters.
16. As a product engineer, I want repeated occurrences of an existing detected issue to attach to that same issue regardless of retries, so that issue history stays coherent over time.
17. As a support engineer, I want the issue to preserve the core exception type and message, so that I can quickly recognize the operational failure from the issue title.
18. As a future feature owner, I want detector definitions to declare their trigger rail and execution behavior, so that some detectors can run per span while others can still run per trace if needed later.

## Implementation Decisions

- Build a new deterministic auto-issue detection rail that is separate from both system annotation queues and semantic issue discovery.
- Represent deterministic detectors through a code-defined registry keyed by detector slug.
- Allow detector definitions to declare their trigger rail, sampling behavior, and execution strategy so the framework can support both per-span and per-trace detectors in the future.
- The first detector is `span-errors` and it is globally enabled in code for v1.
- `span-errors` runs at 100% sampling and is triggered per ingested span rather than per ended trace.
- The span-ingested event contract should be extended to carry `spanId` so downstream deterministic detectors can execute per span without scanning the whole trace.
- This detector should not use a Temporal workflow. It is a fast deterministic single-step path and should run through the queue/task substrate rather than a long-running orchestration layer.
- The detector should load the single span by `(organizationId, traceId, spanId)` and inspect only that span.
- A span qualifies only when it contains at least one `exception` event in its event payload. A span with only `statusCode = error` is not enough for v1.
- The detector creates exactly one canonical occurrence per qualifying span.
- The canonical occurrence is a non-draft `custom` score with `sourceId` equal to the detector slug.
- Detector-created scores for this rail must not go through the normal `IssueDiscoveryRequested` embedding and clustering flow.
- The score should carry deterministic error evidence, including the extracted exception type, normalized exception message, and detector fingerprint.
- Add a first-class nullable fingerprint column on scores.
- Add first-class detector identity and fingerprint fields on issues.
- Split the issue domain into an explicit discriminated union with `kind = semantic | detected`.
- Semantic issues keep centroid and vector-projection behavior.
- Detected issues do not have centroids and do not participate in Weaviate projection, hybrid search, reranking, or centroid updates.
- The first detected-issue grouping rule is `exception.type + normalized exception.message`.
- Stacktrace is intentionally excluded from the grouping key for v1 because it is often noisy and unstable.
- A detected issue must be unique for a given organization, project, detector slug, and fingerprint.
- Detector-created scores must also be unique per organization, project, span, score source, and detector slug so retries cannot create duplicate occurrences.
- The system should use deterministic name and description generation for detected issues rather than an LLM.
- The detected issue title should be derived from the exception type and normalized exception message and truncated safely to existing limits.
- The detected issue description should be a deterministic sentence that identifies the detector and the normalized failure identity rather than a semantic summary.
- Exact-match assignment should use a dedicated detected-issue upsert or resolve path that looks up an existing detected issue by detector slug and fingerprint, creates it if missing, then assigns the score.
- Database uniqueness must remain the authority for correctness under concurrency. Cache is an optimization, not a correctness mechanism.
- Because this is a read-hot path, the issue lookup should use Redis-backed read-through caching keyed by organization, project, detector slug, and fingerprint.
- Cache writes should happen after successful exact-match issue resolution so repeated occurrences can reuse the cached issue id quickly.
- Cache misses and cache failures must fall back to the database path without failing the detector rail.
- Repeated occurrences should continue to assign to the same detected issue even when that issue is already resolved or ignored. The feature should not create a new issue just because the lifecycle state changed.
- The detector registry and exact-match issue rail should be built to support additional deterministic signals later without introducing annotation queues, draft annotations, or semantic discovery for those signals.

## Testing Decisions

- Tests should focus on externally visible behavior: which spans qualify, which scores are written, how issues are grouped, and whether retries stay idempotent.
- Do not test internal helper implementation details when the same behavior can be asserted through domain use cases, workers, repositories, or queue handlers.
- Add focused unit tests for exception extraction, normalization, and fingerprint generation.
- Add domain-level tests for detected issue resolution that prove the same fingerprint reuses one issue and a different fingerprint creates a new issue.
- Add repository tests for new uniqueness constraints and exact-match lookup behavior.
- Add worker or dispatcher tests proving the per-span rail is triggered from span-ingested events without the trace-end debounce.
- Add idempotency tests proving duplicate deliveries for the same span produce only one canonical score occurrence.
- Add cache-path tests proving cache hits avoid the lookup read and cache failures still fall back safely to the database path.
- Add issue-domain tests proving semantic issues still use centroid/projection behavior while detected issues skip that machinery.
- Use existing repository tests, issue-discovery tests, worker tests, and cache-backed use-case tests in the codebase as the behavioral model for style and scope.

## Out of Scope

- Per-project detector configuration, enablement, or custom sampling controls.
- UI work for configuring deterministic detectors.
- Historical backfill of old spans into detected issues.
- Stacktrace-based grouping, frame normalization, or language-specific fingerprinting heuristics.
- Non-exception deterministic detectors beyond the initial `span-errors` detector.
- Merging detected issues with semantic issues.
- Replacing the existing semantic issue-discovery pipeline.
- Automatic evaluation generation from detected issues.

## Further Notes

- The key product reason for this rail is speed and determinism: exact operational failures should be surfaced much faster than the semantic clustering path.
- The feature should preserve the existing philosophy that issues are backed by canonical score occurrences, even when issue grouping is deterministic rather than semantic.
- The detector registry should be shaped so future detectors can choose different trigger rails. The first detector is per-span because span exceptions should be surfaced immediately, but the framework should not assume every future detector is span-scoped.
- The cache design should optimize repeated reads for hot fingerprints while staying simple enough that correctness still comes from the database uniqueness guarantees.
