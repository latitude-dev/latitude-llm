# System Annotation Queue Flagger Scaffolding

## Problem Statement

System annotation queues need project-scoped scaffolding and automated trace routing, but the codebase currently mixes partial queue worker scaffolding with a not-yet-finalized flagger design. The desired implementation has shifted toward an event-driven provisioning flow plus a hot-path routing design that avoids unnecessary Temporal load, reads project queue state from Postgres as the canonical source of truth, and uses Redis as a read-through cache for the minimum runtime data needed to fan out work cheaply.

The immediate problem is not to build the real flagger intelligence yet. The immediate problem is to build the surrounding system so that projects get their default system queues, trace-ended events can cheaply decide whether to start async flagger work, and the system has stable identifiers, idempotent orchestration, and clear extension points for later write-side behavior.

## Solution

Introduce a new `ProjectCreated` domain event published through the transactional outbox and handled asynchronously. That event starts a Temporal provisioning workflow which idempotently creates the default system annotation queues for the project.

At runtime, system queue routing uses project state from Postgres as the canonical source of truth, filtered to active `system = true` queues. The hot path reads that state through a Redis-backed read-through cache that stores only the minimum queue data required for routing: queue slug and effective sampling.

When a trace ends, the dispatcher publishes a lightweight queue task that reads the cached project snapshot, skips queues with `sampling = 0`, and fans out one queue job per remaining system queue. Each per-queue job performs a deterministic sampling decision and, when sampled in, starts one Temporal workflow for that `(traceId, queueSlug)` pair. That workflow runs one async black-box flagger call for the specific queue and trace. For this phase, the flagger result is only `{ matched: boolean }`, and positive matches intentionally stop at a `TODO` until the team decides how queue items and draft annotations should be written.

## User Stories

1. As a product engineer, I want every new project to receive the default system annotation queues automatically, so that reliability review is available immediately.
2. As a platform engineer, I want project provisioning to happen asynchronously from a domain event, so that project creation stays decoupled from downstream setup work.
3. As a platform engineer, I want project provisioning to be driven by the transactional outbox, so that queue setup is not lost when request-time publication fails.
4. As a reliability engineer, I want system queues to have stable slugs, so that workflows, URLs, and cache entries can use durable identifiers.
5. As a product engineer, I want queue slugs to remain reserved even after soft deletion, so that system queue identity does not drift over time.
6. As a user, I want deleting a system queue to be respected, so that background reprovisioning does not silently undo my action.
7. As a platform engineer, I want project runtime queue reads to come from Postgres as the source of truth, so that routing behavior reflects real project state instead of only code constants.
8. As an infrastructure engineer, I want the hot path to use Redis as a read-through cache, so that trace-ended traffic does not repeatedly hit Postgres.
9. As an infrastructure engineer, I want the cache to store only queue slug and sampling, so that the cache stays cheap, compact, and easy to invalidate.
10. As a platform engineer, I want cache entries to expire with TTL and also be explicitly evicted on system queue updates, so that the system self-heals from missed invalidations.
11. As a worker engineer, I want trace-ended handling to skip queues with `sampling = 0` before fan-out, so that paused queues do not generate useless jobs.
12. As a reliability engineer, I want per-queue sampling to happen before Temporal workflow start, so that the system does not clog Temporal with no-op executions.
13. As an infrastructure engineer, I want sampling decisions to be deterministic per `(organizationId, projectId, traceId, queueSlug)`, so that retries and duplicates behave consistently.
14. As a worker engineer, I want one per-queue queue job per candidate system queue, so that routing can be isolated and deduplicated at the queue level.
15. As a workflow engineer, I want one Temporal workflow per `(traceId, queueSlug)`, so that workflow identity matches the unit of async flagger work.
16. As a workflow engineer, I want duplicate workflow-start attempts to resolve as success/no-op, so that queue retries remain safe.
17. As a platform engineer, I want each flagger workflow to use a minimal input contract, so that workflow history stays small and stable.
18. As a flagger implementer, I want a simple black-box async flagger interface, so that real queue-specific logic can be swapped in later without changing orchestration shape.
19. As a product engineer, I want all system queues to use the same flagger contract for now, so that we do not build two routing systems in the same phase.
20. As a platform engineer, I want a failed flagger call for one queue to be logged and skipped, so that one flaky queue does not block the others.
21. As a product engineer, I want the current phase to stop at flagger scaffolding, so that queue-item and draft-annotation write behavior can be decided separately.
22. As a web app engineer, I want queue routes and boundary lookups to use queue slug externally, so that queue URLs and lookup contracts match the new stable identifier.
23. As a persistence engineer, I want internal queue relations to keep using queue ids, so that relational writes and existing score/item contracts do not need a larger migration.
24. As a reviewer, I want the PRD to call out unresolved write-side behavior explicitly, so that future work can pick up from a clear TODO boundary.

## Implementation Decisions

- Add a new `ProjectCreated` domain event and publish it through the transactional outbox by default.
- The `ProjectCreated` payload includes `organizationId`, `projectId`, `name`, and `slug`.
- The domain-events dispatcher starts a Temporal provisioning workflow for `ProjectCreated` rather than performing provisioning inline.
- The provisioning workflow is idempotent and creates the default system annotation queues for the project.
- Provisioning uses the canonical default queue definitions in code, but runtime reads of system queues use Postgres as the canonical source of truth by filtering project queues with `system = true` and excluding soft-deleted rows.
- Annotation queues gain a new immutable `slug` field generated from the queue name.
- Queue slug is the external identifier for routing and app-boundary lookup.
- Queue id remains the internal relational identifier for queue items and annotation score provenance.
- Queue slug is unique within a project across all rows, including soft-deleted rows.
- Queue slug is never regenerated after creation.
- System queue soft deletion is respected by provisioning idempotency; provisioning must not recreate a deleted system queue.
- Queue routes, server functions, and app-boundary lookups should move from queue id to queue slug.
- The trace-ended hot path uses a queue topic rather than starting system-queue workflows directly from the dispatcher.
- The system queue topic contains two tasks: one project-level fan-out task and one per-queue workflow-start gate task.
- The fan-out task reads a project-level Redis cache entry containing the minimal active system queue snapshot for that project.
- The project-level cache entry stores only queue slug and effective sampling.
- The cache is read-through: on miss, the fan-out task queries Postgres for active system queues, writes the minimal snapshot to Redis with TTL, and then proceeds.
- Redis keys must start with the organization namespace, following the repository convention such as `org:${organizationId}:...`.
- Any update to a system annotation queue in a project evicts the project-level system queue snapshot cache entry.
- The fan-out task skips queues whose sampling is `0` and publishes one per-queue gate task for each remaining queue.
- The per-queue gate task payload is minimal: `organizationId`, `projectId`, `traceId`, `queueSlug`, and `sampling`.
- The per-queue gate task performs deterministic sampling using `(organizationId, projectId, traceId, queueSlug)` and the queue sampling percentage.
- When the deterministic sampling check passes, the per-queue gate task starts one Temporal workflow for `(traceId, queueSlug)`.
- Queue jobs and workflows both use the same durable identity pair `(traceId, queueSlug)` for dedupe and idempotency.
- Duplicate workflow-start attempts are treated as success/no-op rather than failure.
- The system queue flagger workflow input is minimal: `organizationId`, `projectId`, `traceId`, and `queueSlug`.
- The precise flagger-facing payload should be revisited later; the first implementation should leave a TODO comment where that contract is assembled.
- The workflow runs one async black-box flagger call for the specific trace and queue.
- The flagger result shape is minimal: `{ matched: boolean }`.
- All system queues use the same flagger contract for now, including queues that may later use deterministic internals.
- If a flagger call fails or times out, the failure is logged and that queue is skipped; one queue failure does not fail unrelated queue work.
- Positive flagger matches intentionally stop at a TODO in this phase; the workflow does not yet decide whether to create queue items, draft annotations, or both.
- The implementation should include structured logs at the main lifecycle points, but it should not add dedicated metrics in this phase.

## Testing Decisions

- Good tests should assert externally visible behavior and durable contracts rather than internal implementation details.
- Good tests should focus on idempotency, lifecycle transitions, cache semantics, routing decisions, and failure handling rather than on exact helper composition.
- Test the new project-created event emission behavior to ensure project creation writes the expected outbox event.
- Test dispatcher behavior to ensure `ProjectCreated` starts the provisioning workflow and `TraceEnded` routes into the system queue fan-out topic.
- Test provisioning workflow behavior for idempotent creation of default queues and for respecting soft-deleted system queues by not recreating them.
- Test annotation queue persistence and lookup behavior around slug creation, slug uniqueness across soft-deleted rows, and slug-based external lookup.
- Test cache read-through behavior to ensure the project-level snapshot is hydrated from Postgres on miss, reused on hit, and evicted on system queue updates.
- Test fan-out behavior to ensure the queue snapshot drives one per-queue job per active system queue, except when sampling is `0`.
- Test deterministic sampling behavior to ensure repeated runs for the same `(organizationId, projectId, traceId, queueSlug)` produce the same decision.
- Test per-queue workflow start behavior to ensure sampled-in queues start workflows and sampled-out queues do not.
- Test duplicate workflow-start handling to ensure existing workflow ids are treated as success/no-op.
- Test flagger workflow behavior to ensure flagger failures are logged and skipped without failing unrelated queue work.
- Prior art should come from the existing repository patterns for repository tests, outbox-driven event publication tests, dispatcher routing tests, queue worker tests, and Temporal workflow starter tests.

## Out of Scope

- Implementing the real flagger intelligence or choosing specific models/prompts.
- Returning richer flagger data such as confidence, explanation, or structured evidence.
- Creating queue items on positive matches.
- Creating system draft annotations on positive matches.
- Deciding the final write-side behavior for positive flagger results.
- Adding special deterministic routing paths that bypass the common flagger contract.
- Adding dedicated metrics/counters instrumentation beyond structured logs.
- Hard-delete behavior for annotation queues.
- Broader annotation queue CRUD work unrelated to the routing and provisioning scaffolding described here.

## Further Notes

- The core runtime invariant is: provisioning uses canonical default queue definitions, while runtime queue reads use Postgres project state as the canonical source of truth.
- The hot path should cache only the minimum runtime data needed to do cheap routing work.
- Positive flagger matches must leave an explicit TODO comment in code where later queue-item or draft-annotation behavior will be decided.
- The first implementation should keep extension points obvious so later work can add richer flagger payloads, write-side behavior, or deterministic internals without replacing the orchestration topology.
