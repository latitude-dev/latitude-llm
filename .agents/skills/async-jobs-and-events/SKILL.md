# Background jobs, domain events, and side effects

**When to use:** Queues and workers, domain event publishers, async notifications or projections, or **not** doing that work inside HTTP handlers.

## Side effects and eventing

- Domain code emits **domain events** through **domain-level publisher** abstractions (ports), not ad-hoc calls from use-cases to email/HTTP/Slack.
- **Workers** handle notifications, integrations, projections, and other I/O **asynchronously**.
- **Do not** orchestrate side effects (fan-out integrations, “fire and forget” HTTP, etc.) inside HTTP handlers — enqueue / publish and return.

## Async and background tasks

- Put **IDs** (and small immutable facts) in job payloads — not full mutable aggregates.
- **Re-fetch** authoritative state inside the worker before acting.
- Make **stale or deleted** entities an explicit outcome (skip, dead-letter, or record failure) instead of assuming rows still exist.

## New infrastructure dependencies

When adding a new external system the product talks to:

1. Define a **capability interface** in `packages/platform/*-core`.
2. Add an implementation package `packages/platform/*-<provider>`.
3. **Wire** it in the app composition root from **environment-driven** config.
4. Change **domain** only if **business rules** change — not for every new adapter.

For env var naming when wiring config, see [env-configuration](../env-configuration/SKILL.md). For layer rules, see [architecture-boundaries](../architecture-boundaries/SKILL.md).
