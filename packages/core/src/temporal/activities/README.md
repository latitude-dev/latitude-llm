# Temporal Activities

Activities contain the actual business logic that performs side effects.
They are executed by workers and orchestrated by workflows.

## Key Characteristics

- Non-deterministic: CAN use randomness, current time, I/O, etc.
- Retryable: Temporal automatically retries failed activities
- Idempotent (ideally): Should be safe to run multiple times
- Atomic: Each activity should represent one logical unit of work

## What Activities CAN Do

- Database queries and mutations
- HTTP/API calls to external services
- File system operations
- Sending notifications (websockets, emails, etc.)
- Any operation with side effects

## What Activities CANNOT Do

- Call other activities directly (only workflows orchestrate activities)
- Access workflow state or signals

## Structure

Each activity lives in its own folder with two files:

- `handler.ts` — The actual activity implementation with business logic
- `proxy.ts` — A Temporal proxy that workflows use to invoke the activity

## How Proxies Work

Workflows cannot import activity handlers directly. Instead, each activity
exposes a proxy created with `proxyActivities`. The proxy must only import
the handler's **type** (via `import type`), never the handler itself. This
ensures Temporal's determinism constraints are respected.

```typescript
// proxy.ts
import { proxyActivity } from '../../shared'
import type * as handler from './handler'

export const { myActivity } = proxyActivity<typeof handler>({
  queue: 'my-queue',
  startToCloseTimeout: '10 minutes',
})
```

Workflows then import and call the proxy, not the handler.
