# Plan: Deterministic Auto Issues

> Source PRD: `specs/deterministic-auto-issues.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: keep the existing ingestion and read surfaces. Spans continue to enter through span ingestion and the `SpanIngested` event rail, canonical scores continue to use `POST /v1/organizations/:organizationId/projects/:projectId/scores`, and issues continue to surface in the project issues UI at `/projects/$projectSlug/issues`.
- **Schema**: keep `scores` as the canonical occurrence record, extended with deterministic detector evidence and a nullable fingerprint. Extend `issues` from a semantic-only shape into a discriminated model that can represent both `semantic` and `detected` issues, with detector identity and fingerprint stored on detected issues.
- **Key models**: a detected occurrence is still a non-draft canonical `custom` score; `span-errors` is the first registry-backed deterministic detector; detected issue grouping is exact-match on `(organizationId, projectId, detectorSlug, fingerprint)`.
- **Authentication / authorization**: preserve existing organization- and project-scoped access patterns across API, web, and workers. No separate detector configuration or per-project enablement surface is introduced in v1.
- **Third-party boundaries**: ClickHouse remains the source for span reads, Postgres remains the source of truth for score and issue ownership, Weaviate remains semantic-only, Redis is an optimization-only cache for detected-issue lookup, and this rail runs through queue/domain-event workers rather than Temporal.

---

## Phase 1: Immediate Span-Error Detection Rail

**User stories**: 2, 3, 4, 5, 8, 9, 18

### What to build

Introduce the separate deterministic detector rail and its registry, then wire `span-errors` into the per-span ingestion path so each durable ingested span can be evaluated immediately. When a span contains one or more `exception` events, the system should create exactly one canonical detector-backed occurrence score for that span and skip the semantic issue-discovery workflow entirely.

### Acceptance criteria

- [ ] The `SpanIngested` execution path carries enough identity to evaluate one specific ingested span without scanning the full trace.
- [ ] A detector registry exists and `span-errors` is enabled in code as the first detector with per-span execution and 100% sampling.
- [ ] A span with at least one `exception` event creates exactly one non-draft canonical `custom` score occurrence, while a span with only error status and no exception event does not.
- [ ] Detector-created scores persist deterministic evidence needed for later exact-match grouping and do not emit `IssueDiscoveryRequested`.
- [ ] End-to-end tests prove the rail is triggered from span ingestion without waiting for the trace-end debounce window.

---

## Phase 2: First Detected Issue From A Deterministic Occurrence

**User stories**: 6, 7, 14, 15, 17

### What to build

Teach the issue domain to create a first-class detected issue directly from a qualifying detector occurrence. The system should derive a stable fingerprint, deterministic title, and deterministic description from the exception identity, then assign the new occurrence to that detected issue without invoking embeddings, reranking, centroid updates, or projection math.

### Acceptance criteria

- [ ] The issue model can represent both semantic issues and detected issues with durable detector identity and fingerprint fields on detected issues.
- [ ] A new qualifying detector occurrence creates a detected issue with a stable deterministic title and description derived from exception type and normalized message.
- [ ] Detected issue creation uses exact-match grouping semantics rather than semantic retrieval.
- [ ] Detected issues bypass semantic-only machinery including vector projection, centroid maintenance, and reranking.
- [ ] Tests prove semantic issue behavior remains intact while detected issues use the new direct-assignment path.

---

## Phase 3: Repeat Occurrence Reuse And Lifecycle-Stable Grouping

**User stories**: 1, 16, 17

### What to build

Extend the detected-issue path so repeated spans with the same deterministic fingerprint always resolve to the same existing detected issue. That grouping must remain stable over time even if the issue has already been resolved or ignored, so the issue history stays coherent and repeated failures continue to aggregate under one operational identity.

### Acceptance criteria

- [ ] A later qualifying span with the same detector fingerprint reuses the same detected issue instead of creating a second issue.
- [ ] A different fingerprint creates a different detected issue.
- [ ] Repeated qualifying spans continue to attach to the same detected issue even after the issue is resolved or ignored.
- [ ] The issue title preserves recognizable exception type and normalized message information across repeated occurrences.
- [ ] Domain-level tests cover same-fingerprint reuse, different-fingerprint separation, and lifecycle-stable grouping behavior.

---

## Phase 4: Idempotent And Concurrency-Safe Ownership

**User stories**: 10, 11, 13

### What to build

Harden the deterministic rail so retries, duplicate deliveries, and parallel workers cannot inflate counts or split ownership. The database should enforce one canonical detector occurrence per qualifying span and one detected issue per exact-match fingerprint, with repository and use-case behavior built around those guarantees.

### Acceptance criteria

- [ ] Detector-created occurrences are idempotent per qualifying span and duplicate deliveries do not create duplicate canonical scores.
- [ ] Detected issue creation is concurrency-safe so racing workers resolving the same new fingerprint converge on one issue.
- [ ] Database uniqueness remains the authority for correctness under retries and concurrency.
- [ ] Repository and worker tests prove duplicate deliveries and racing creates preserve one score occurrence and one detected issue owner.
- [ ] Failures in downstream resolution do not corrupt canonical score-to-issue ownership.

---

## Phase 5: Hot-Path Cache And Semantic Coexistence Guardrails

**User stories**: 12, 13, 14, 15

### What to build

Add Redis-backed read-through caching to the detected issue lookup path so hot fingerprints can be resolved efficiently under high ingest volume, while preserving Postgres as the source of truth. At the same time, finish the coexistence rules so detected issues and semantic issues can live side by side without detected issues entering semantic projection or clustering flows.

### Acceptance criteria

- [ ] Detected issue lookup supports a Redis-backed read-through cache keyed by organization, project, detector, and fingerprint.
- [ ] Cache hits avoid the expensive lookup path, while cache misses or cache failures fall back safely to Postgres.
- [ ] Cache writes occur only after successful canonical detected-issue resolution.
- [ ] Semantic issues continue to use existing semantic discovery and projection behavior, while detected issues remain excluded from that machinery.
- [ ] Tests cover cache hit, cache miss, cache failure fallback, and coexistence of detected and semantic issue types in the same project.
