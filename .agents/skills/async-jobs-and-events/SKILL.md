---
name: async-jobs-and-events
description: Queues and workers, domain event publishers, async notifications or projections, or not doing that work inside HTTP handlers.
---

# Background jobs, domain events, and side effects

**When to use:** Queues and workers, domain event publishers, async notifications or projections, or **not** doing that work inside HTTP handlers.

## Side effects and eventing

- Domain code emits **domain events** through **domain-level publisher** abstractions (ports), not ad-hoc calls from use-cases to email/HTTP/Slack.
- **Workers** handle notifications, integrations, projections, and other I/O **asynchronously**.
- **Do not** orchestrate side effects (fan-out integrations, “fire and forget” HTTP, etc.) inside HTTP handlers — enqueue / publish and return.

## Domain event naming and publisher–consumer decoupling

Domain events represent **facts that happened** — state transitions on an aggregate — not instructions for what should happen next. The publisher must never know or care which handlers are subscribed.

### Rules

1. **Name events after what the aggregate did**, not what consumers need to hear. Good: `ScoreCreated`, `ScoreStatusChanged`. Bad: `ScoreDraftSaved` (named to route around a handler), `ScoreReadyForDiscovery` (named after a consumer concern).
2. **Smell test**: if you deleted every event handler, would you still emit this event because it describes a meaningfully different thing that happened? If the answer is no, the event is coupling in disguise.
3. **One canonical event per state transition.** Do not split a single write operation into multiple event types to route to different handlers. If a score is written, emit `ScoreCreated` — regardless of whether the score is a draft or published.
4. **Consumers own their filtering logic.** If a handler only cares about published scores, the handler checks the payload or re-fetches state and skips drafts. The publisher does not pre-filter by emitting different event names.
5. **Dedupe keys must not collide across lifecycle stages.** If the same entity emits the same event at different lifecycle points (e.g., draft save then final publish), include the relevant discriminator in the dedupe key — not in the event name. Example: `issues:discovery:${scoreId}:${status}` instead of splitting into separate event types.
6. **Payload carries facts, not routing hints.** Include the aggregate's current state (or the fields consumers might filter on) in the payload. Let consumers decide relevance from payload data.

### When a new event type IS warranted

A new event type is justified when it represents a **genuinely distinct state transition** that would exist even with zero handlers — for example, `ScoreDeleted` is a different fact from `ScoreCreated`. The test: does the aggregate's lifecycle model include this transition independently of downstream concerns?

### Anti-pattern: conditional event publishing

```ts
// BAD — publisher decides routing based on consumer needs
const eventName = score.draftedAt === null ? “ScorePublished” : “ScoreDraftSaved”
yield* outboxEventWriter.write({ eventName, ... })

// GOOD — one canonical event, consumers filter
yield* outboxEventWriter.write({
  eventName: “ScoreCreated”,
  payload: { scoreId: score.id, organizationId, projectId, status: score.draftedAt === null ? “published” : “draft” },
})

// Consumer side — handler owns its filtering
ScoreCreated: (event) =>
  Effect.all([
    // discovery uses status-aware dedupe key, skips drafts internally
    pub.publish(“issues”, “discovery”, event.payload, {
      dedupeKey: `issues:discovery:${event.payload.scoreId}:${event.payload.status}`,
    }),
    pub.publish(“annotation-scores”, “publishHumanAnnotation”, event.payload, {
      debounceMs: SCORE_PUBLICATION_DEBOUNCE,
    }),
  ])
```

## Async and background tasks

- Put **IDs** or opaque storage keys in job payloads — not full mutable entities.
- **Re-fetch** authoritative state inside the worker before acting.
- Make **stale or deleted** entities an explicit outcome (skip, dead-letter, or record failure) instead of assuming rows still exist.
- For **transactional domain events**, write through the **`OutboxEventWriter`** service (or a plain `OutboxEventWriterShape` from `createOutboxWriter` in `@platform/db-postgres`) instead of inserting outbox rows directly.
- For **high-volume or otherwise non-transactional producers** whose upstream write is already durable, publish directly through **`createEventsPublisher(queuePublisher)`** into `domain-events` instead of persisting an outbox row only to forward it.
- Domain-event consumers should act as **dispatchers**: publish downstream topic tasks or start workflows, but do not run synchronous business logic inline inside the event handler.
- Extend the repo’s existing async rails instead of inventing new ones: BullMQ-backed queue workers live in `apps/workers`, and durable multi-step workflows live in the Temporal-backed `apps/workflows` app.
- Queue topics may own several related **lower-kebab-case** task names; one worker module owns the topic and dispatches by task name.
- Queue publication should expose logical **dedupe/debounce** keyed by the relevant entity identity when the transport supports it.
- Use **queue topics** for single-step tasks and the **workflow abstraction** for long-running or multi-step orchestration.
- For reliability async contracts, include both `organizationId` and `projectId` in domain-event payloads, topic/task payloads, and workflow inputs by default. Exceptions: `MagicLinkEmailRequested`, `InvitationEmailRequested`, `UserDeletionRequested`, the `domain-events` topic payload, the `magic-link-email` topic payload, the `invitation-email` topic payload, and the `user-deletion` topic payload.
- When BullMQ delay is the chosen debounce mechanism, key the delayed job by the logical entity identity so newer writes replace or reschedule the pending job.
- When a delayed queue topic semantically marks a lifecycle edge, let the delayed task publish a domain event through the appropriate rail after the delay elapses: use `OutboxEventWriter` / `OutboxEventWriterShape` for transactional boundaries and direct `EventsPublisher` publication for non-transactional or high-volume worker flows. Downstream side effects should run from the domain-event consumers rather than inline in the delayed task.

## New infrastructure dependencies

When adding a new external system the product talks to:

1. Add a concrete provider package in `packages/platform/*-<provider>`.
2. **Wire** it in the app composition root from **environment-driven** config.
3. Change **domain** only if **business rules** change — not for every new adapter.

For env var naming when wiring config, see [env-configuration](../env-configuration/SKILL.md). For layer rules, see [architecture-boundaries](../architecture-boundaries/SKILL.md).
