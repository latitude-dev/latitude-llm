# Background jobs, domain events, and side effects

**When to use:** Queues and workers, domain event publishers, async notifications or projections, or **not** doing that work inside HTTP handlers.

## Side effects and eventing

- Domain code emits **domain events** through **domain-level publisher** abstractions (ports), not ad-hoc calls from use-cases to email/HTTP/Slack.
- **Workers** handle notifications, integrations, projections, and other I/O **asynchronously**.
- **Do not** orchestrate side effects (fan-out integrations, “fire and forget” HTTP, etc.) inside HTTP handlers — enqueue / publish and return.

## Async and background tasks

- Put **IDs** or opaque storage keys in job payloads — not full mutable entities.
- **Re-fetch** authoritative state inside the worker before acting.
- Make **stale or deleted** entities an explicit outcome (skip, dead-letter, or record failure) instead of assuming rows still exist.
- For **transactional domain events**, write through the **`OutboxWriter`** port in `@domain/events` (for example `createOutboxWriter` from `@platform/db-postgres`) instead of inserting outbox rows directly.
- For **high-volume or otherwise non-transactional producers** whose upstream write is already durable, publish directly through **`createEventsPublisher(queuePublisher)`** into `domain-events` instead of persisting an outbox row only to forward it.
- Domain-event consumers should act as **dispatchers**: publish downstream topic tasks or start workflows, but do not run synchronous business logic inline inside the event handler.
- Extend the repo’s existing async rails instead of inventing new ones: BullMQ-backed queue workers live in `apps/workers`, and durable multi-step workflows live in the Temporal-backed `apps/workflows` app.
- Queue topics may own several related **lower-kebab-case** task names; one worker module owns the topic and dispatches by task name.
- Queue publication should expose logical **dedupe/debounce** keyed by the relevant entity identity when the transport supports it.
- Use **queue topics** for single-step tasks and the **workflow abstraction** for long-running or multi-step orchestration.
- For reliability async contracts, include both `organizationId` and `projectId` in domain-event payloads, topic/task payloads, and workflow inputs by default. Exceptions: `MagicLinkEmailRequested`, `UserDeletionRequested`, the `domain-events` topic payload, the `magic-link-email` topic payload, and the `user-deletion` topic payload.
- When BullMQ delay is the chosen debounce mechanism, key the delayed job by the logical entity identity so newer writes replace or reschedule the pending job.
- When a delayed queue topic semantically marks a lifecycle edge, let the delayed task publish a domain event through the appropriate rail after the delay elapses: use `OutboxWriter` for transactional boundaries and direct `EventsPublisher` publication for non-transactional or high-volume worker flows. Downstream side effects should run from the domain-event consumers rather than inline in the delayed task.

## New infrastructure dependencies

When adding a new external system the product talks to:

1. Add a concrete provider package in `packages/platform/*-<provider>`.
2. **Wire** it in the app composition root from **environment-driven** config.
3. Change **domain** only if **business rules** change — not for every new adapter.

For env var naming when wiring config, see [env-configuration](../env-configuration/SKILL.md). For layer rules, see [architecture-boundaries](../architecture-boundaries/SKILL.md).
