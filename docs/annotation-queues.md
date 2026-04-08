# Annotation Queues

Annotation queues are the managed workflow surface for fast human review over traces.

They exist to aggregate telemetry into a focused annotation UX with as little distraction as possible.

## Queue Types

Queue concepts:

- a queue is conceptually `manual` when it has no filter configured and queue membership is created by explicit insertion rather than by stored filter materialization, always materialized as a trace id
- a queue is conceptually `live` when it has a filter configured and is populated incrementally over time from that filter plus optional sampling

The filter field reuses the shared `FilterSet` described in `docs/filters.md`, applied against the shared trace field registry also used by evaluation triggers.

## System Queue Scaffolding

System annotation queues are provisioned automatically for every project. This section describes the infrastructure that makes that possible, from project creation through trace assignment.

### Project Provisioning

When a project is created:

1. **Domain Event**: `createProjectUseCase` emits a `ProjectCreated` domain event to the Outbox table
2. **Event Routing**: The `domain-events` worker observes the event and enqueues a `projects:provision` task
3. **Queue-Based Provisioning**: The `projects` worker handles idempotent queue creation via BullMQ (not Temporal—provisioning must complete before traces arrive)
4. **Idempotency**: Uses `ON CONFLICT (organization_id, project_id, slug) DO NOTHING` to handle replays safely
5. **Soft-Delete Aware**: Excludes trashed queues (`deleted_at IS NULL`) when checking existence
6. **Cache Eviction**: After provisioning, evicts the Redis cache entry for the project's system queues

The system queues are created with fixed slugs (`jailbreaking`, `refusal`, `frustration`, `forgetting`, `laziness`, `nsfw`, `tool-call-errors`, `resource-outliers`) derived from their names, enabling slug-based routing throughout the pipeline.

### Caching

Project system queue state is cached in Redis with a read-through pattern:

- **Key**: `project:{projectId}:system-queues`
- **TTL**: 5 minutes
- **Invalidation**: Triggered after provisioning, manual queue edits, or deletions
- **Cache Miss**: Falls back to repository query and repopulates the cache

The cache stores the full list of system queues for a project, making fan-out operations fast and reducing database load.

### Trace Routing: Fan-Out Pattern

When a trace ends, the system uses a fan-out pattern to route it to system queues:

**Fan-Out (`system-annotation-queues:fanOut`)**:

1. Triggered by `TraceEnded` domain event
2. Reads all active system queues for the project (cached or from DB)
3. Applies deterministic sampling for each queue
4. Starts one `systemQueueFlaggerWorkflow` per sampled queue

The fan-out job stores which workflow IDs it has already started for a trace, so a retry can resume safely without re-enqueueing workflows that were already launched.

**Deterministic Sampling**:

```typescript
// Sampling check applied to all queues
// - Deterministic-rule queues: sampling = 100% (always pass)
// - LLM-classified queues: sampling = 5% (default, controls LLM spend)
hash(traceId) % 100 < sampling
```

- **Queues with `sampling = 0%`**: Excluded entirely (disabled)
- **Queues with deterministic rules**: Provisioned with `sampling = 100%` to ensure all traces are evaluated
- **LLM-classified queues**: Default `sampling = 5%` to control costs
- Non-sampled traces skip the flagger workflow and are not flagged

### System Queue Flagger Workflow

The Temporal workflow orchestrates trace classification for both deterministic and LLM-based queues:

**Workflow**: `systemQueueFlaggerWorkflow`
- Input: `(projectId, traceId, queueSlug, traceContext)`
- Output: Flag decision per queue

**Activities**:

1. **`fetchTraceContext`**: Loads limited context (last N messages) from the trace
2. **`evaluateQueueMatch`**: 
   - For deterministic-rule queues (`Tool Call Errors`, `Resource Outliers`): evaluates rules without LLM
   - For LLM-classified queues: sends queue context to a low-cost flagger LLM
   - Returns boolean decision
   - Currently stubbed for future implementation

**Retry Policy**:
- Initial interval: 1s
- Maximum attempts: 3
- Non-retryable errors: Invalid queue slug, missing trace context

### Trace Assignment Flow

Complete flow from trace ingestion to queue assignment:

```
TraceEnded (domain event)
    ↓
domain-events worker
    ↓
system-annotation-queues:fanOut (list queues, apply sampling)
    ↓
systemQueueFlaggerWorkflow (Temporal - queue classification)
    ↓
flagger activity (placeholder)
    ↓
If flagged:
    annotation activity (validate + draft annotation)
    ↓
Create annotation_queue_items row (trace added to queue)
```

### Key Infrastructure Files

- **Domain**: `packages/domain/annotation-queues/src/use-cases/`
  - `provision-system-queues.ts` - Idempotent queue creation
  - `get-project-system-queues.ts` - Cached queue listing
  - `evict-project-system-queues.ts` - Cache invalidation

- **Workers**: `apps/workers/src/workers/`
  - `projects.ts` - BullMQ-based provisioning
  - `system-annotation-queues.ts` - Fan-out routing
  - `domain-events.ts` - Event dispatch

- **Workflows**: `apps/workflows/src/workflows/`
  - `system-queue-flagger-workflow.ts` - Temporal workflow
  - `activities/flagger.ts` - Placeholder LLM activity

- **Repository**: `packages/platform/db-postgres/src/repositories/annotation-queue-repository.ts`
  - `findSystemQueueBySlugInProject` - Slug-based lookup
  - `listSystemQueuesByProject` - System queue listing

### Routing Identities

All routing uses slugs rather than IDs:

- Provisioning creates queues with fixed canonical slugs
- Fan-out and workflow start use `queueSlug` in routing identities
- Repository methods support `findBySlugInProject` for lookups
- This enables durable routing even if queue rows are replaced

## System-Created Default Queues

Every project starts with these system-created manual queues:

### Jailbreaking

- description: attempts to bypass system or safety constraints
- instructions: use this queue for prompt injection, instruction hierarchy attacks, policy-evasion attempts, tool abuse intended to bypass guardrails, role or identity escape attempts, or assistant behavior that actually follows those bypass attempts. Do not use it for harmless roleplay or ordinary unsafe requests that the assistant correctly refuses.

### Refusal

- description: the assistant refuses a request it should handle
- instructions: use this queue when the assistant declines, deflects, or over-restricts even though the request is allowed and answerable within product policy and system capabilities. Do not use it when the refusal is correct because the request is unsafe, unsupported, or missing required context or permissions.

### Frustration

- description: the conversation shows clear user frustration or dissatisfaction
- instructions: use this queue when the user expresses annoyance, disappointment, repeated dissatisfaction, loss of trust, or has to restate/correct themselves because the assistant is not helping. Do not use it for neutral clarifications or isolated terse replies without real evidence of frustration.

### Forgetting

- description: the assistant forgets earlier conversation context or instructions
- instructions: use this queue when the assistant loses relevant session memory, repeats already-settled questions, contradicts previously established facts, or ignores earlier constraints/preferences from the same conversation. Do not use it for ambiguity that was never resolved or context that the user never provided.

### Laziness

- description: the assistant avoids doing the requested work
- instructions: use this queue when the assistant gives a shallow partial answer, stops early without justification, refuses to inspect provided context, or pushes work back onto the user that the assistant should have done itself. Do not use it when the task is genuinely blocked by missing access, missing context, or policy constraints.

### NSFW

- description: sexual or otherwise not-safe-for-work content appears
- instructions: use this queue when the trace contains sexual content, explicit erotic material, or other clearly NSFW content that should be reviewed. Do not use it for benign anatomy or health discussion, mild romance, or safety-oriented policy discussion that is not itself NSFW.

### Tool Call Errors

- description: a tool call failed or returned an error state
- instructions: use this queue when a tool span errored, a tool execution failed, a malformed tool interaction occurred, or the conversation includes a tool-result message that clearly indicates failure. This queue is primarily matched through deterministic rules rather than the low-cost flagger model.

### Resource Outliers

- description: the trace has unusually high latency, cost, or usage
- instructions: use this queue when latency, token usage, or cost materially exceeds project norms. This queue is primarily matched through deterministic outlier checks against project medians and configured thresholds rather than the low-cost flagger model.

## Population Flows

### User-Managed Manual Queues

- manual queues are populated from the trace dashboard table and the sessions dashboard table
- the trace dashboard table exposes row checkboxes plus a bulk action to add selected traces to an annotation queue
- that trace bulk action creates one `annotation_queue_items` row per selected `(queue_id, trace_id)` pair
- the sessions dashboard table exposes row checkboxes plus a bulk action to add selected sessions to an annotation queue
- that session bulk action resolves each selected session to its newest trace and creates one `annotation_queue_items` row per `(queue_id, latest_trace_id)` pair
- new manual queue items are created with `completedAt = null`
- if the same trace is added to the same queue again, the unique `(organization_id, project_id, queue_id, trace_id)` constraint turns that pair into a no-op rather than duplicating it

### System-Created Manual Queues

- system-created queues are still manual queues: they have no `settings.filter`, they are marked with `system = true`, and their membership is inserted explicitly by the system rather than by live filter materialization
- whenever a `TraceEnded` domain event is observed for a project, the `domain-events` dispatcher publishes `system-annotation-queues:fanOut` for that trace
- `system-annotation-queues:fanOut` lists all non-deleted `system = true` queues in that project, applies each queue's `settings.sampling`, and starts one workflow per sampled queue
- queues with deterministic rules are provisioned at `100%`, while LLM-classified queues default to `5%`
- the fan-out job records each started workflow ID so BullMQ retries can resume without duplicating earlier workflow starts
- when sampling passes, `systemQueueFlaggerWorkflow` evaluates that queue for the trace
- the workflow handles both deterministic queue rules, including `Tool Call Errors` and `Resource Outliers`, and LLM-based classification for the remaining system queues
- the workflow returns a boolean decision per queue; a trace may match none of the system-created queues, or several of them
- for every flagged queue, the workflow runs a separate annotation activity to validate the match and create the draft annotation
- only if that annotation activity confirms the match does the system both create the draft annotation and add the trace to the queue
- system-created queue sampling is stored in `annotation_queues.settings.sampling`, seeded from a named default constant when the queue is provisioned, and can later be edited by the user

### Live Queues

- a queue becomes live when `settings.filter` is present
- live queues are incremental: they grow as new matching traces arrive
- whenever a `TraceEnded` domain event is observed for a project, the `domain-events` dispatcher publishes `live-annotation-queues:curate` for that trace
- `live-annotation-queues:curate` lists all non-deleted live queues in that project
- queue selection order is `settings.filter` first, then `settings.sampling`
- if both pass, `live-annotation-queues:curate` batch inserts the matching `annotation_queue_items` rows for that `(queue_id, trace_id)` pair with `completedAt = null`
- `live-annotation-queues:curate` is separate from `live-evaluations:enqueue` and does not fan out per-queue execution tasks
- when a live queue is created with `settings.filter` and no explicit sampling, `settings.sampling` is initialized from a named constant in `packages/domain/annotation-queues`; the initial default is `10`
- live queues do not need a full historical rescan on every read; they materialize queue items incrementally as traces arrive

## Canonical Model

```typescript
import type { FilterSet } from "@domain/shared"

type AnnotationQueueSettings = {
  filter?: FilterSet // shared trace filter set; omit when the queue is manual
  sampling?: number // optional percentage [0, 100], used by live queues and by system queues, with defaults seeded on queue creation/provisioning
}
```

The main queue row stores:

- `system`
- `name`
- `description`
- `instructions`
- `settings`
- `assignees`
- `totalItems`
- `completedItems`
- `deletedAt`

The queue model is backed by two Postgres tables:

- `annotation_queues`: queue definition and review instructions
- `annotation_queue_items`: materialized queue membership plus completion state

### Queue Definition

`annotation_queues` fields:

- `system`: boolean marker for system-created queues
- `name`: unique within the project among non-deleted queues
- `description`: short summary for the queue list
- `instructions`: reviewer guidance shown in the focused annotation screen and reused as classifier/validator context for system-created queues
- `settings.filter`: shared `FilterSet` over the trace field registry for live queues; it stays absent and read-only for system queues
- `settings.sampling`: optional queue sampling percentage `[0, 100]`; live queues use it after filter matching, and system queues use it before any deterministic or LLM flagging work. When omitted on queue creation/provisioning, initialize it from named constants with initial defaults of `10`
- `assignees`: array of existing Latitude user ids from the same organization
- `totalItems`: denormalized count of queue items; maintained by item insert/delete operations
- `completedItems`: denormalized count of completed queue items; maintained by item complete/uncomplete/delete operations
- `deletedAt`: soft delete marker

Required Postgres indexes:

- soft-delete-aware unique btree on `(organization_id, project_id, name, deleted_at)` with nulls-not-distinct semantics
- btree on `(organization_id, project_id, deleted_at, created_at)` for project-scoped queue listing
- do not add GIN/array indexes on `assignees`, do not add GIN/JSONB indexes on `settings`, and do not add text indexes on `description` or `instructions` until queue filtering/search workloads are clearer

### Queue Items

`annotation_queue_items` materialize the actual review backlog for both manual and live queues.

Fields:

- `queue_id`
- `trace_id`: queued trace id; when a session is manually queued, store the newest trace id of that session
- `completedAt`: set when the reviewer marks the item as fully annotated

Creation rules:

- manual queue insertion creates the row from the trace dashboard bulk action
- manual session insertion creates the row from the sessions dashboard bulk action after resolving the session to its newest trace
- system-created queue insertion creates the row only after the workflow's annotation activity confirms the match and creates the draft annotation
- live queue insertion creates the row when a new trace passes the queue filter and then the queue sampling check
- all paths create queue items with `completedAt = null`

Required Postgres indexes:

- btree on `(organization_id, project_id, queue_id, completed_at, created_at, trace_id)` for progress queries, pending-item navigation, and deterministic review order
- unique btree on `(organization_id, project_id, queue_id, trace_id)` to avoid duplicate queue membership for the same trace

## Queue Invariants

- queues always work with traces; when session context matters, it is derived from related traces sharing the current trace's `session_id`
- when a user manually adds a session to a queue, resolve that session to its newest trace and store only that `trace_id`
- a queue is conceptually `manual` when `settings.filter` is absent
- a queue is conceptually `live` when `settings.filter` is present
- empty filter sets should be normalized to absent `settings.filter` so manual/live queue semantics stay unambiguous
- every project has a default set of system-created manual queues from the start
- system-created default queues are manual queues with `system = true` even though the system inserts their members automatically
- `system = true` queues keep their canonical `name`, `description`, `instructions`, and `settings.filter` non-editable, but they may still be deleted and their `settings.sampling` may still be edited
- `settings.filter` is only editable for `system = false` queues
- `settings.sampling` is valid for live queues and for `system = true` queues
- when a live queue is created with no explicit sampling, `settings.sampling` is initialized from a named constant with initial default `10%`
- when a system queue is provisioned, `settings.sampling` is initialized from a named constant with initial default `10%`
- progress is derived from the denormalized `totalItems` and `completedItems` counters on the queue row, avoiding per-queue aggregation on list pages
- `totalItems` and `completedItems` are maintained by the use-cases that add, remove, or complete queue items; any code path that mutates `annotation_queue_items` must also update these counters on the parent queue
- completion is queue-item state, not annotation-row state
- `assignees` behaves as a set of unique same-organization user ids and is validated in application/domain logic
- `annotation_queue_items` stores `trace_id` only; it does not store `session_id`, because the newest trace of a session already contains the full incremental conversation context
- manual queue insertion, system-created queue insertion, and live queue materialization all create queue items with `completedAt = null`
- system-created queue insertion happens only after a separate full-context validation/annotation task confirms the match and writes the pending-review annotation
- live queue materialization is incremental on `TraceEnded` and evaluates `filter` before `sampling`
- queue review order is derived from deterministic query order (`created_at ASC`, then `trace_id ASC`), not from a persisted position column

## Project Page

Each project has an `Annotation Queues` page showing all non-deleted queues.

Table columns:

- `Name`: truncated, with a `system` tag when `system = true` and a `live` tag when `settings.filter` is configured
- `Description`: truncated to two lines
- `Progress`: percentage bar showing total queue items versus completed queue items
- `Assignees`: rounded profile pictures for assigned users
- `Created at`: queue creation timestamp
- `Quick actions`: edit and delete

Interactions:

- create button opens the queue creation modal
- edit opens the queue settings modal
- delete opens a confirmation modal
- row click navigates to the focused queue review screen
- the create modal edits `name`, `description`, `instructions`, `assignees`, and the optional `settings.filter` / `settings.sampling` fields for user-created queues, using the shared trace-filter builder rather than a free-form text field
- the edit modal keeps `name`, `description`, `instructions`, and `settings.filter` read-only for `system = true` queues while still allowing `assignees` and `settings.sampling` updates
- when a queue is created with `settings.filter` and no explicit sampling, the UI/server path initializes `settings.sampling` from the named default constant
- when a system queue is provisioned for a project, the UI/server path initializes `settings.sampling` from the named default constant and later lets users tune that sampling per queue
- manual queue insertion entry points live in both the trace dashboard table and the sessions dashboard table
- the list includes both user-created queues and the project's default system-created queues

Pagination:

- keyset pagination follow implementation details on dataset list.

## Focused Review Screen

The queue review screen is intentionally optimized for annotation speed.

The left sidebar stays collapsed.

The screen operates on one queued trace at a time.

### Bottom Bar

- add current trace to a dataset
- show current index position inside the queue, derived from the paginated query position rather than a persisted queue-item position field
- previous / next queue-item navigation
- mark current item as fully annotated

Every action must also have a visible hotkey label. Introduce hotkeys using
https://tanstack.com/hotkeys/latest initial hotkeys. Implement
`QUEUE_REVIEW_HOTKEYS`. After real hotkeys is done remove that constant.

### Main Layout

The screen has three vertical sections:

1. `Metadata`
   - timestamp
   - duration
   - tokens
   - cost
   - current related scores grouped by `source_id`, read from canonical Postgres scores so drafts on the current trace are visible immediately
2. `Conversation`
   - full message list for the current trace
   - message-level or text-range selection to create annotations
   - persisted highlights after annotation creation
   - clicking a persisted highlight focuses the matching annotation card
3. `Annotations`
   - queue name and instructions at the top
   - list of annotations for the current trace
   - button to create a conversation-level annotation

Conversation-level annotations omit the anchor coordinates entirely. Message/text selections persist `messageIndex`, `partIndex`, and text offsets against the raw `allMessages` / `parts[]` conversation structure rather than against any UI-only grouping.

Annotation cards show:

- linked issue name or pending-discovery state
- annotator name
- annotation feedback text
- green thumbs-up when `score.value >= 0.5`
- red thumbs-down when `score.value < 0.5`

If no queue items remain pending annotation, show a congratulations empty state.

## Relationship To Annotations

Queues do not replace the annotation model:

- annotations are still canonical scores
- queue provenance is carried through `source_id = <annotation-queue-cuid>` when the annotation came from a queue
- annotations created directly in managed UI or public API still use `source_id = "UI" | "API"`
- system-created queue hits create draft annotation scores with `draftedAt` set, so they remain excluded from issue discovery until a human reviews or finalizes them
- queue completion is tracked on `annotation_queue_items.completedAt`, not on the annotation score row

## Still Pending Precise Definition

- exact human approval/edit/replacement flow for system-created draft annotations after they appear in queue review
- moderation/approval flows beyond the core queue review workflow
