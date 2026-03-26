# Event architecture discussion

Notes from a design conversation (2026-03-26) about how domain events, the outbox, BullMQ, and workers fit together, and a proposed simplification.

## Current behavior (summary)

- **Domain event contracts** live in `@domain/events` (`EventPayloads`, `DomainEvent`, `EventEnvelope`, `OutboxWriter`, `EventsPublisher`).
- **Queue vocabulary** lives in `@domain/queue` (`TopicRegistry`, `QueuePublisherShape`, `QueueConsumer`, workflow starter shape).
- **Two ways** messages can reach the `domain-events` BullMQ topic today:
  1. **Outbox**: writers use `OutboxWriter` → `latitude.outbox_events` → `createPollingOutboxConsumer` → `createEventsPublisher` → `domain-events` / `dispatch`.
  2. **Direct**: high-volume paths (e.g. span ingestion after ClickHouse write) call `EventsPublisher.publish` → same `domain-events` / `dispatch` without an outbox row.
- **`apps/workers/src/workers/domain-events.ts`** subscribes to `domain-events`, validates `EventEnvelopeSchema`, and **dispatches** by event name: mostly `QueuePublisher.publish` to other topics or `WorkflowStarterShape.start` (e.g. `ScoreFinalized` → Temporal + `issues:refresh`).
- **Non–domain-event queues** exist for concrete work: `span-ingestion`, `magic-link-email`, `user-deletion`, `api-keys`, `dataset-export`, etc. Ingest uses `QueuePublisher` directly to `span-ingestion` (`ingestSpansUseCase`).

This duplicates a mental model: “domain event” can mean an outbox row *or* a direct enqueue to the same dispatcher topic.

## Proposed direction (agreed directionally)

1. **Single authoring path for domain events**  
   Only **outbox** should define how a “domain event” is emitted from boundaries. Remove **`EventsPublisher`** as a port exposed across apps/platform so there is not a second way to hit `domain-events`.

2. **Performance / volume**  
   Paths where the outbox table would be a **hot path** (telemetry-scale writes) should **not** pretend to be domain events. They should use existing **queue** and **workflow** abstractions explicitly (`QueuePublisher`, `WorkflowStarterShape`, etc.).

3. **Implementation detail**  
   Postgres → BullMQ can remain **inside** the worker stack (e.g. outbox consumer implementation) without surfacing a generic “events publisher” to domain or web code.

**Caveats called out in discussion**

- **Transactional outbox** only helps when the business write and outbox insert share a **transaction**. Flows that call external APIs then `outboxWriter.write` are not automatically atomic; idempotent consumers or tighter transactions may still be needed.
- **Docs vs code**: reliability / spans docs describe `SpanIngested` / `TraceEnded` via `createEventsPublisher`; a refactor should align narrative with “outbox vs queue task” split.
- Optional later refinement: **tighter naming**—types in `EventPayloads` only for outbox-backed facts; queue payloads as separate contracts unless shared on purpose.

## Removing the `domain-events` worker

**Idea:** The outbox consumer could **map each outbox row directly** to downstream `publish` / workflow starts, eliminating the `domain-events` queue and the dedicated dispatcher worker.

**Feasible**, with these points:

- The worker is only a **router**; that routing table can move to a **shared module** invoked from the outbox drain path instead of from a BullMQ subscription.
- **Reliability:** Today rows are marked `published` when enqueue to `domain-events` succeeds, not when downstream handlers complete. Inlining routing allows marking published only after **all** intended downstream publishes (and workflow starts) succeed—**stronger** alignment if implemented deliberately; marking too early recreates the same gap.
- **Non-outbox producers** (e.g. `SpanIngested` emitted from `span-ingestion` without outbox) never hit the outbox consumer. They must call the **same routing helper** (e.g. debounced `live-traces:end`) from that worker, not assume a `domain-events` hop.
- **Layering:** Prefer injecting a `router` from `apps/workers` into `createPollingOutboxConsumer` so `@platform/db-postgres` does not depend on every downstream topic.
- **Scaling:** You lose a separate consumer pool for `domain-events`; usually acceptable because work stays on downstream queues/workflows. Multiple outbox pollers can still run with `SKIP LOCKED`.

## Suggested follow-up work (for implementers)

- [ ] Replace dual rail with: **OutboxWriter-only** for domain events; remove or internalize `EventsPublisher` at the worker boundary.
- [ ] Move **dispatcher map** out of `domain-events` worker; optionally **delete** `domain-events` topic subscription after outbox routes directly.
- [ ] Relocate **high-volume** paths to explicit queue/workflow calls + shared router where the old dispatcher applied.
- [ ] Revisit **docs** (`docs/spans.md`, `docs/reliability.md`, etc.) for consistent vocabulary.
- [ ] Audit **published** semantics on outbox rows after routing changes (when to set `published` / retries).
