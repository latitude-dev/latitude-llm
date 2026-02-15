# Temporal Workflows

Workflows orchestrate activities and define the sequence of your business
logic. They are durable and can run for seconds, hours, days, or even years.

## Key Characteristics

- Deterministic: MUST produce the same result given the same inputs
- Durable: State is persisted; workflows survive crashes and restarts
- Long-running: Can pause and resume without holding resources
- Event-sourced: All state changes are recorded and can be replayed

## Determinism Constraints

Workflows are replayed from history on resume. To ensure consistent replay:

### Forbidden

- `Math.random()`, `Date.now()`, `new Date()`
- `setTimeout`, `setInterval`
- Direct I/O (database, network, file system)
- Non-deterministic libraries or global mutable state

### Allowed

- Calling activities via proxies
- `sleep()` from @temporalio/workflow
- Normal control flow, Promise.all/allSettled/race
- Pure functions and deterministic logic

## Signals and Queries

- **Signals**: Async messages sent TO a workflow (cancellation, updates)
- **Queries**: Sync requests to GET state FROM a workflow (progress, status)

## Importing Activities

Workflows cannot import activity handlers directly. Each activity exposes a
proxy (in its `proxy.ts` file) that uses `proxyActivities` with
`import type` to reference the handler. Workflows import and call these
proxies instead.
