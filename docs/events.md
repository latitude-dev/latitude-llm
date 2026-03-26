# Event Architecture

This document describes the unified event architecture for the Latitude LLM platform. It covers how domain events flow through the system, when to use different publishing patterns, and how to extend the system with new event types.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Publishing Patterns](#publishing-patterns)
3. [Event Types Reference](#event-types-reference)
4. [Routing Table](#routing-table)
5. [Adding New Events](#adding-new-events)
6. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The event architecture follows a unified, single-path design that eliminates dual-path confusion. All domain events flow through a clear pipeline:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Domain    │────▶│   Outbox    │────▶│   Router    │────▶│  Handlers   │
│  (Web App)  │     │  (Postgres) │     │  (Workers)  │     │(Queues/Temp)│
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WEB APPLICATION                                 │
│  ┌─────────────────┐                                                        │
│  │  Web Handlers   │                                                        │
│  │                 │  Write domain events transactionally                   │
│  │  OutboxWriter   │  (same DB transaction as business logic)              │
│  └────────┬────────┘                                                        │
└───────────┼──────────────────────────────────────────────────────────────────┘
            │
            ▼ INSERT
┌─────────────────────────────────────────────────────────────────────────────┐
│                              POSTGRES (Outbox)                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    latitude.outbox_events table                        │  │
│  │  ┌─────────┬─────────────┬──────────────┬─────────┬─────────────────┐ │  │
│  │  │   id    │ event_name  │ workspace_id │ payload │ published       │ │  │
│  │  ├─────────┼─────────────┼──────────────┼─────────┼─────────────────┤ │  │
│  │  │ uuid    │ EventName   │ orgId        │ JSONB   │ false → true    │ │  │
│  │  └─────────┴─────────────┴──────────────┴─────────┴─────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            │ Poll (FOR UPDATE SKIP LOCKED)
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WORKERS APPLICATION                             │
│                                                                              │
│  ┌─────────────────────┐    ┌──────────────────────────────────────────┐   │
│  │  Outbox Consumer    │───▶│           Event Router                   │   │
│  │                     │    │  ┌────────────────────────────────────┐  │   │
│  │  - Polls every N ms │    │  │  EventHandlerMap                   │  │   │
│  │  - Batch size: M    │    │  │  ┌──────────────────────────────┐  │  │   │
│  │  - Marks published  │    │  │  │ MagicLinkEmailRequested ──┐    │  │  │   │
│  │    after routing    │    │  │  │ UserDeletionRequested ────┼──┐ │  │  │   │
│  └─────────────────────┘    │  │  │ SpanIngested ─────────────┼──┼─┼──┼──┼───┼──▶ QueuePublisher
│                             │  │  │ TraceEnded ───────────────┼──┼─┼──┼──┼───┼──▶ QueuePublisher
│                             │  │  │ ScoreFinalized ───────────┼──┼─┼──┼──┼───┼──▶ WorkflowStarter
│                             │  │  │ OrganizationCreated ──────┼──┘ │  │  │   │
│                             │  │  └──────────────────────────────┘  │  │   │
│                             │  └────────────────────────────────────┘  │   │
│                             └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DOWNSTREAM SYSTEMS                            │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │   BullMQ     │  │   BullMQ     │  │   BullMQ     │  │    Temporal     │ │
│  │   Queues     │  │   Queues     │  │   Queues     │  │   Workflows     │ │
│  │              │  │              │  │              │  │                 │ │
│  │ magic-link   │  │ live-traces  │  │    issues    │  │ issueDiscovery  │ │
│  │ user-deletion│  │ live-eval    │  │  annotation  │  │   Workflow      │ │
│  │ span-ingest  │  │ annotation   │  │     api-keys │  │                 │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| **OutboxWriter** | `@domain/events` | Port for writing events transactionally from web handlers |
| **outbox_events table** | Postgres | Durable, ordered event log with `published` flag |
| **PollingOutboxConsumer** | `@platform/db-postgres` | Polls unpublished events, routes them, marks published |
| **EventRouter** | `apps/workers/src/events` | Maps event types to their handlers |
| **QueuePublisher** | `@domain/queue` | Publishes tasks to BullMQ queues |
| **WorkflowStarter** | `@domain/queue` | Starts Temporal workflows |

### High-Volume Direct Path

For high-volume operational work that doesn't need transactionality, bypass the outbox entirely:

```
Span Ingestion Worker ──▶ QueuePublisher.publish('span-ingestion', ...) ──▶ BullMQ
```

This avoids hot-path writes to the outbox table while keeping the architecture explicit about what's happening.

---

## Publishing Patterns

### When to Use Outbox (Transactional)

**Use `OutboxWriter` when:**

1. **The event represents a business fact** that must be consistent with database state
2. **The event must not be lost** even if the process crashes immediately after
3. **The event is emitted from a web handler** that already has an active database transaction
4. **Ordering matters** - events must be processed in the order they occurred

**Examples:**
- `OrganizationCreated` - Must create API key after org is persisted
- `UserDeletionRequested` - Must delete user data after request is recorded
- `ScoreFinalized` - Must trigger issue discovery after score is saved

**Code Example:**

```typescript
import { OutboxWriter } from "@domain/events"

// In a web handler with access to OutboxWriter
const createOrganization = Effect.gen(function* () {
  const outbox = yield* OutboxWriter
  
  // ... create organization in DB within same transaction ...
  
  // Write event to outbox (same transaction)
  yield* Effect.promise(() => 
    outbox.write({
      eventName: "OrganizationCreated",
      aggregateId: organization.id,
      organizationId: organization.id,
      payload: {
        organizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    })
  )
})
```

### When to Use Direct QueuePublisher

**Use `QueuePublisher` directly when:**

1. **High volume** - Events are emitted at a rate that would overwhelm the outbox table
2. **Operational work** - Not business facts, but operational tasks (span ingestion, exports)
3. **Already in a worker** - The code is already running in a background worker context
4. **Loose ordering acceptable** - Events can be processed out of order or with retries

**Examples:**
- Span ingestion batches (high volume)
- Dataset exports (operational)
- Live trace debouncing (time-sensitive)

**Code Example:**

```typescript
import { QueuePublisher } from "@domain/queue"

// In a worker processing span batches
const processSpanBatch = Effect.gen(function* () {
  const publisher = yield* QueuePublisher
  
  // ... process spans ...
  
  // Publish directly to queue (no outbox)
  yield* publisher.publish("span-ingestion", "ingest", {
    fileKey,
    contentType,
    organizationId,
    projectId,
    apiKeyId,
    ingestedAt,
  })
})
```

### Decision Flowchart

```
Is this a business fact that must be consistent with DB state?
├── YES ──▶ Use OutboxWriter (transactional)
│
└── NO ──▶ Is this high-volume operational work?
    ├── YES ──▶ Use QueuePublisher directly
    │
    └── NO ──▶ Is ordering/correctness critical?
        ├── YES ──▶ Use OutboxWriter
        └── NO ──▶ Use QueuePublisher directly
```

---

## Event Types Reference

All domain events are defined in `packages/domain/events/src/index.ts`.

### EventPayloads Interface

```typescript
export interface EventPayloads {
  MagicLinkEmailRequested: {
    readonly email: string
    readonly magicLinkUrl: string
    readonly emailFlow: string | null
    readonly organizationId: string
    readonly organizationName: string
    readonly inviterName: string | null
    readonly invitationId: string | null
  }
  
  UserDeletionRequested: {
    readonly userId: string
  }
  
  SpanIngested: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
  }
  
  TraceEnded: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
  }
  
  ScoreFinalized: {
    readonly scoreId: string
    readonly issueId: string
  }
  
  OrganizationCreated: {
    readonly organizationId: string
    readonly name: string
    readonly slug: string
  }
}
```

### Event Descriptions

| Event | Description | Emitted When |
|-------|-------------|--------------|
| **MagicLinkEmailRequested** | Request to send magic link email | User requests magic link login |
| **UserDeletionRequested** | Request to delete user data | User initiates account deletion |
| **SpanIngested** | New span data ingested | Span batch successfully written to ClickHouse |
| **TraceEnded** | Trace completed (debounced) | No new spans for trace after debounce window |
| **ScoreFinalized** | Score calculation finalized | Score is computed and saved |
| **OrganizationCreated** | New organization created | Organization successfully persisted |

### DomainEvent Interface

All events follow this structure:

```typescript
export interface DomainEvent<
  TName extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: TName           // Event type name
  readonly organizationId: string  // Multi-tenant scope
  readonly payload: TPayload      // Event-specific data
}
```

### EventEnvelope

When stored in the outbox, events are wrapped:

```typescript
export interface EventEnvelope<TEvent extends DomainEvent = DomainEvent> {
  readonly id: string            // Unique outbox row ID
  readonly event: TEvent          // The domain event
  readonly occurredAt: Date     // When the event occurred
}
```

---

## Routing Table

The event router (`apps/workers/src/events/event-router.ts`) maps each event type to its handlers.

### Current Routing Configuration

| Event | Handler(s) | Destination | Options |
|-------|-----------|-------------|---------|
| **MagicLinkEmailRequested** | `queuePublisher.publish('magic-link-email', 'send', ...)` | BullMQ: magic-link-email | - |
| **UserDeletionRequested** | `queuePublisher.publish('user-deletion', 'delete', ...)` | BullMQ: user-deletion | - |
| **SpanIngested** | `queuePublisher.publish('live-traces', 'end', ...)` | BullMQ: live-traces | debounceMs: 5min, dedupeKey: trace-specific |
| **TraceEnded** | Multiple publishes:<br>- `queuePublisher.publish('live-evaluations', 'enqueue', ...)`<br>- `queuePublisher.publish('live-annotation-queues', 'curate', ...)`<br>- `queuePublisher.publish('system-annotation-queues', 'flag', ...)` | BullMQ: live-evaluations, live-annotation-queues, system-annotation-queues | Concurrent execution |
| **ScoreFinalized** | Multiple handlers:<br>- `workflowStarter.start('issueDiscoveryWorkflow', ...)`<br>- `queuePublisher.publish('issues', 'refresh', ...)` | Temporal: issueDiscoveryWorkflow<br>BullMQ: issues | debounceMs: 8h, dedupeKey: issue-specific |
| **OrganizationCreated** | `queuePublisher.publish('api-keys', 'create', ...)` | BullMQ: api-keys | - |

### Routing Code Reference

```typescript
// apps/workers/src/events/event-router.ts

export const createEventRouter = (
  queuePublisher: QueuePublisherShape,
  workflowStarter: WorkflowStarterShape,
): EventRouter => {
  const handlers: EventHandlerMap = {
    MagicLinkEmailRequested: (event) => 
      queuePublisher.publish("magic-link-email", "send", event.payload),

    UserDeletionRequested: (event) => 
      queuePublisher.publish("user-deletion", "delete", event.payload),

    SpanIngested: (event) =>
      queuePublisher.publish("live-traces", "end", event.payload, {
        dedupeKey: `live-traces:end:${event.organizationId}:${event.payload.projectId}:${event.payload.traceId}`,
        debounceMs: TRACE_END_DEBOUNCE_MS, // 5 minutes
      }),

    TraceEnded: (event) =>
      Effect.all([
        queuePublisher.publish("live-evaluations", "enqueue", event.payload),
        queuePublisher.publish("live-annotation-queues", "curate", event.payload),
        queuePublisher.publish("system-annotation-queues", "flag", event.payload),
      ], { concurrency: "unbounded" }).pipe(Effect.asVoid),

    ScoreFinalized: (event) =>
      Effect.all([
        workflowStarter.start("issueDiscoveryWorkflow", { ... }),
        queuePublisher.publish("issues", "refresh", { ... }, {
          dedupeKey: `issues:refresh:${event.payload.issueId}`,
          debounceMs: ISSUE_REFRESH_DEBOUNCE_MS, // 8 hours
        }),
      ], { concurrency: "unbounded" }).pipe(Effect.asVoid),

    OrganizationCreated: (event) =>
      queuePublisher.publish("api-keys", "create", {
        organizationId: event.payload.organizationId,
        name: "Default API Key",
      }),
  }

  return (event: DomainEvent) => {
    // ... routing logic
  }
}
```

### Debounce Constants

```typescript
// apps/workers/src/events/event-router.ts

export const TRACE_END_DEBOUNCE_MS = 5 * 60 * 1000      // 5 minutes
export const ISSUE_REFRESH_DEBOUNCE_MS = 8 * 60 * 60 * 1000  // 8 hours
```

---

## Adding New Events

Follow this step-by-step guide to add a new event type to the system.

### Step 1: Define the Event Payload

Add the event to `packages/domain/events/src/index.ts`:

```typescript
export interface EventPayloads {
  // ... existing events ...
  
  YourNewEvent: {
    readonly field1: string
    readonly field2: number
    readonly optionalField?: boolean
  }
}
```

### Step 2: Add the Route Handler

Update `apps/workers/src/events/event-router.ts`:

```typescript
export const createEventRouter = (
  queuePublisher: QueuePublisherShape,
  workflowStarter: WorkflowStarterShape,
): EventRouter => {
  const handlers: EventHandlerMap = {
    // ... existing handlers ...
    
    YourNewEvent: (event) =>
      queuePublisher.publish("target-queue", "task-name", event.payload),
      // OR for multiple handlers:
      // Effect.all([...]).pipe(Effect.asVoid)
      // OR for workflows:
      // workflowStarter.start("workflowName", event.payload, { workflowId: "..." })
  }
  
  return (event: DomainEvent) => {
    // ... existing routing logic (no changes needed) ...
  }
}
```

### Step 3: Emit the Event

From a web handler using `OutboxWriter`:

```typescript
import { OutboxWriter } from "@domain/events"

const yourUseCase = Effect.gen(function* () {
  const outbox = yield* OutboxWriter
  
  // ... your business logic ...
  
  yield* Effect.promise(() =>
    outbox.write({
      eventName: "YourNewEvent",
      aggregateId: someEntity.id,  // The entity this event relates to
      organizationId: orgId,       // Current organization scope
      payload: {
        field1: "value1",
        field2: 42,
        optionalField: true,
      },
    })
  )
})
```

Or from a worker using direct `QueuePublisher` (for high-volume scenarios):

```typescript
import { QueuePublisher } from "@domain/queue"

const yourWorkerTask = Effect.gen(function* () {
  const publisher = yield* QueuePublisher
  
  // ... your processing logic ...
  
  yield* publisher.publish("target-queue", "task-name", {
    field1: "value1",
    field2: 42,
  })
})
```

### Step 4: Add Queue/Task to Topic Registry (if needed)

If routing to a new queue, add it to `packages/domain/queue/src/topic-registry.ts`:

```typescript
const _registry = {
  // ... existing queues ...
  
  "your-new-queue": payloads<{
    "your-task": {
      readonly field1: string
      readonly field2: number
    }
  }>(),
}
```

### Step 5: Write Tests

Test the event flow end-to-end:

```typescript
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { createEventRouter } from "../event-router"

it("routes YourNewEvent to target-queue", async () => {
  const { publisher, published } = createFakeQueuePublisher()
  const router = createEventRouter(publisher, fakeWorkflowStarter)
  
  const event = {
    name: "YourNewEvent",
    organizationId: "org-123",
    payload: { field1: "test", field2: 42 },
  }
  
  await Effect.runPromise(router(event))
  
  expect(published).toHaveLength(1)
  expect(published[0]).toMatchObject({
    queue: "target-queue",
    task: "task-name",
    payload: { field1: "test", field2: 42 },
  })
})
```

### Checklist

- [ ] Event payload added to `EventPayloads` interface
- [ ] Route handler added to `EventHandlerMap`
- [ ] Event emission implemented (OutboxWriter or QueuePublisher)
- [ ] Queue/task registered in `TopicRegistry` (if new)
- [ ] Tests written for routing logic
- [ ] Integration test for full flow (outbox → router → handler)

---

## Troubleshooting

### Common Issues

#### Events Not Being Processed

**Symptoms:** Events are written to outbox but never trigger downstream actions.

**Check:**
1. Is the outbox consumer running? Check worker logs
2. Are events marked `published = false` in the database?
3. Is there a handler registered for the event type in `event-router.ts`?

**Debug Query:**
```sql
SELECT event_name, COUNT(*) 
FROM latitude.outbox_events 
WHERE published = false 
GROUP BY event_name;
```

#### Events Stuck in Outbox

**Symptoms:** Events remain unpublished, consumer logs show errors.

**Check:**
1. Look for `RouteError` in worker logs - handler may be failing
2. Check if event name in outbox matches handler key exactly (case-sensitive)
3. Verify handler doesn't throw unhandled exceptions

**Resolution:**
- Fix the handler code
- Events will be retried automatically on next poll
- For stuck events, investigate and potentially mark published manually after fixing root cause

#### Duplicate Downstream Calls

**Symptoms:** Same task runs multiple times for one event.

**Cause:** Router succeeded but marking row as published failed (network issue, crash).

**Resolution:**
- Ensure downstream handlers are idempotent
- Use `dedupeKey` option in `QueuePublisher.publish()` for automatic deduplication
- Check database connection stability

#### Debounce Not Working

**Symptoms:** Multiple tasks created when debounce expected to coalesce them.

**Check:**
1. Is `dedupeKey` consistent across calls?
2. Is `debounceMs` value reasonable for your use case?
3. Verify BullMQ configuration supports debounce

**Example Fix:**
```typescript
queuePublisher.publish("live-traces", "end", payload, {
  dedupeKey: `live-traces:end:${orgId}:${projectId}:${traceId}`,  // Must be consistent!
  debounceMs: 5 * 60 * 1000,  // 5 minutes
})
```

#### High Outbox Table Volume

**Symptoms:** Outbox table growing too large, queries slowing down.

**Resolution:**
1. Archive or delete old published events:
   ```sql
   DELETE FROM latitude.outbox_events 
   WHERE published = true 
   AND published_at < NOW() - INTERVAL '30 days';
   ```
2. For high-volume scenarios, consider using direct `QueuePublisher` instead of outbox
3. Add appropriate indexes if missing

### Debug Logging

Enable verbose logging in the outbox consumer:

```typescript
// In your worker bootstrap
const consumer = yield* createPollingOutboxConsumer(
  { pool, pollIntervalMs: 1000, batchSize: 10 },
  eventRouter
)

// Logs to watch for:
// - "Processed N events" - successful batch
// - "Failed to route event X" - handler failure
// - "Polling outbox consumer started/stopped" - lifecycle
```

### Testing Event Flow Locally

1. **Write event to outbox:**
   ```typescript
   await outbox.write({
     eventName: "TestEvent",
     aggregateId: "test-123",
     organizationId: "org-123",
     payload: { test: true },
   })
   ```

2. **Verify in database:**
   ```sql
   SELECT * FROM latitude.outbox_events 
   WHERE event_name = 'TestEvent' 
   ORDER BY created_at DESC;
   ```

3. **Start worker and watch logs:**
   ```bash
   pnpm --filter workers dev
   ```

4. **Verify event marked published:**
   ```sql
   SELECT published, published_at 
   FROM latitude.outbox_events 
   WHERE id = '<event-id>';
   ```

### Related Documentation

- [Brainstorm: Unified Event Architecture](./brainstorms/2026-03-26-unified-event-architecture-brainstorm.md) - Original design discussion
- [Plan: Event Architecture Refactor](./plans/2026-03-26-refactor-event-architecture-remove-eventspublisher-plan.md) - Implementation plan
- [Spans](./spans.md) - Span ingestion and trace completion events
- [Reliability](./reliability.md) - Score finalization and issue discovery

---

## Architecture Decision Records

### ADR 1: Single Path for Domain Events

**Decision:** All domain events must flow through the transactional outbox.

**Rationale:**
- Eliminates dual-path confusion
- Ensures consistency between business state and events
- Provides clear audit trail

**Consequences:**
- (+) Simpler mental model
- (+) Guaranteed delivery for business events
- (-) Slight latency increase (acceptable for business events)

### ADR 2: Direct Publishing for High-Volume Paths

**Decision:** High-volume operational work bypasses outbox and publishes directly to queues.

**Rationale:**
- Prevents outbox table from becoming a bottleneck
- Operational work doesn't need the same consistency guarantees
- Keeps architecture explicit about trade-offs

**Consequences:**
- (+) Better performance for high-volume scenarios
- (+) Clear separation of concerns
- (-) Must be careful not to abuse direct publishing for business events

### ADR 3: Router Lives in Workers App

**Decision:** Event-to-handler mapping is defined in `apps/workers`, not in platform packages.

**Rationale:**
- Keeps `@platform/db-postgres` generic
- Workers app owns the business logic of what happens for each event
- Easier to test and modify routing without touching infrastructure

**Consequences:**
- (+) Clean separation between infrastructure and business logic
- (+) Platform packages remain reusable
- (-) Routing changes require workers app deployment
