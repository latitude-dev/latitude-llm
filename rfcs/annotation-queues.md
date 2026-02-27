# RFC: Annotation Queues

Status: Draft
Owners: Core Platform
Feature Flag: `annotationQueues`

> **Important**: This feature reads `spans` and `evaluation_results` exclusively from **ClickHouse**.
> PostgreSQL is only used for annotation queue metadata (queues, members, items).
> No changes to the PostgreSQL `evaluation_results_v2` table are required.

## 1. Problem Statement

Teams need a way to organize and distribute conversation review work among team members. Currently, there's no structured way to:

- Group traces for review
- Assign traces to specific team members (annotators)
- Track annotation progress across a queue of traces
- Filter and automatically collect traces matching metric criteria (cost, tokens, duration)

## 2. Goals

- Provide a project-level view of all traces with metric-based filtering
- Enable creation of annotation queues that target traces by metrics (cost, tokens, duration)
- Support dynamic filtering to auto-populate queues with matching traces
- Allow detailed annotation of conversations (message-level, global)
- Track completion status of traces in queues
- Generate project-scoped issues from annotations
- Support multi-turn conversations when `session_id` is provided (expand to show full session)

## 3. Non-Goals

- Real-time collaborative annotation (single annotator per trace at a time)
- Automated annotation suggestions (future phase)
- Draft-based versioning for annotation configurations (single branch with edit warnings)

This is a **prerequisite task** for annotation queues to work.

### 4 Data Storage

**PostgreSQL** for annotation queue metadata:

- `annotation_queues` - queue definitions, filters, settings
- `annotation_queue_members` - annotator assignments (join table: queue ↔ membership)

Rationale: Low-volume relational data with FK to projects/workspaces/memberships. Members belong to queues, not items, so the join table stays in PG with proper FK constraints.

**ClickHouse** for high-volume data (read + write):

- `spans` - span data with `session_id` for grouping traces into conversations
- `evaluation_results` - annotations stored as evaluation results
- `annotation_queue_items` - links queues to trace_ids with status tracking

Rationale for items in ClickHouse:

1. **Volume**: Items grow proportionally to traces. With dynamic filters across many queues, this can reach millions of rows.
2. **Co-location**: Items reference `trace_id` which lives in ClickHouse `spans`. Filter evaluation, dedup checks, and trace metric display all happen in one DB without cross-DB joins.
3. **Write pattern**: Mostly append-only inserts (new items) with occasional status updates—fits `ReplacingMergeTree` well.
4. **Less PG pressure**: High-churn status updates won't cause PostgreSQL vacuum bloat.

Tradeoffs:

- **No ACID status transitions**: Can't atomically `UPDATE WHERE status = 'pending'`. Acceptable since concurrent annotation is a non-goal (Section 3).
- **No FK integrity**: Orphaned items can exist if a queue is deleted from PG. Cleanup handled via a delete-from-CH step when destroying a queue.
- **Eventual dedup**: `ReplacingMergeTree` deduplicates on merge; queries use `FINAL` or `argMax` for accurate reads.

**Note**: `annotation_queue_members` remains in PostgreSQL because members belong to queues, not items. The join table is small, benefits from FK constraints to `memberships`, and doesn't need to be co-located with the high-volume items data. The ClickHouse items table uses `user_id` strings (not `membership_id` FKs) for `completed_by` since that's a cross-DB reference.

### 4.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Project-Level /traces Page                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Filters: Cost | Tokens | Duration | Time Range                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [ ] Trace abc123  │ Cost: $0.12  │ Tokens: 1.2k │ Duration: 45s    │   │
│  │  [x] Trace def456  │ Cost: $0.05  │ Tokens: 0.8k │ Duration: 12s    │   │
│  │  [x] Trace ghi789  │ Cost: $0.31  │ Tokens: 3.1k │ Duration: 2m     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [Add to Annotation Queue]  ← Floating action bar when selected     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Add to Annotation Queue Modal                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ○ Create new queue                                                  │   │
│  │  ○ Add to existing queue: [Dropdown: Select queue...]               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Name: [Customer Support Reviews        ]                            │   │
│  │  Description: [Review conversations from support bot...]             │   │
│  │  Annotators: [Alice] [Bob] [x] [+ Add member]                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Dynamic Filters (auto-add matching traces):                         │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ [Cost]       [less_than] [0.50]                 [x Remove]  │    │   │
│  │  │ [Duration]   [greater_than] [30s]               [x Remove]  │    │   │
│  │  │ [+ Add filter]                                              │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │  Sample Rate: [====|----] 25% of matching traces                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                          [Cancel] [Create Queue]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 5. Data Model

### 5.1 PostgreSQL Tables

#### `annotation_queues`

```sql
CREATE TABLE annotation_queues (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  evaluation_uuid UUID NOT NULL,  -- Links to evaluation_versions.evaluation_uuid
  name VARCHAR(256) NOT NULL,
  description TEXT,
  filters JSONB,           -- Stored dynamic filters
  sample_rate INTEGER DEFAULT 100,  -- 0-100 percentage
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `annotation_queue_members`

```sql
CREATE TABLE annotation_queue_members (
  id BIGSERIAL PRIMARY KEY,
  annotation_queue_id BIGINT NOT NULL REFERENCES annotation_queues(id) ON DELETE CASCADE,
  membership_id BIGINT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(annotation_queue_id, membership_id)
);
```

**Evaluation Linking:**

- Each annotation queue links to ONE `evaluation_version` via `evaluation_uuid`
- When creating an annotation queue, we find-or-create a project-level evaluation with:
  - `documentUuid = NULL` (project-scoped)
  - `metric = 'human_rating'` (HITL rating by default)
- This uses the existing evaluation system - no new tables needed

#### Evaluation Linking

Annotation queues use the **existing evaluation system**. The only change required is making `documentUuid` nullable in `evaluationVersions`.

**How it works:**

1. When creating an annotation queue, find-or-create a project-level evaluation:
   - `documentUuid = NULL` (project-scoped, not document-scoped)
   - `type = 'human'`
   - `metric = 'rating'` (HITL rating by default)
2. Link the annotation queue to this evaluation via `evaluation_uuid`
3. Annotations are stored as `evaluation_results` - all existing evaluation infrastructure works

**Issue generation:**

- Uses existing `evaluationResultV2Created` event handlers
- Issues are project-scoped (since documentUuid is NULL)

```
Project
  └── Evaluation (documentUuid=NULL, metric=rating)
        └── Annotation Queue: "Support QA"
              └── Items in ClickHouse (sessions/traces to review)
              └── Evaluation Results in ClickHouse (annotations)
```

### 5.2 ClickHouse Tables

#### `annotation_queue_items`

```sql
CREATE TABLE annotation_queue_items (
  workspace_id UInt64,
  annotation_queue_id UInt64,
  trace_id FixedString(32),
  status LowCardinality(String) DEFAULT 'pending',  -- pending | in_progress | completed
  assigned_user_id String DEFAULT '',                -- user_id of assigned annotator
  completed_at Nullable(DateTime64(3, 'UTC')),
  completed_by_user_id String DEFAULT '',            -- user_id who completed
  created_at DateTime64(3, 'UTC') DEFAULT now64(3),
  updated_at DateTime64(3, 'UTC') DEFAULT now64(3),

  INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_status status TYPE set(0) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (workspace_id, annotation_queue_id, trace_id);
```

**Key design decisions:**

- **`ReplacingMergeTree(updated_at)`**: Status updates insert a new row with a newer `updated_at`. ClickHouse keeps the latest version per `(workspace_id, annotation_queue_id, trace_id)` key.
- **`ORDER BY (workspace_id, annotation_queue_id, trace_id)`**: Acts as the dedup key. The tuple `(queue_id, trace_id)` is unique per workspace, replacing the PostgreSQL `UNIQUE` constraint.
- **`user_id` strings instead of `membership_id` FKs**: Since we can't FK across databases, items store the `user_id` string directly. This is the same `users.id` value stored in `annotation_queues.member_user_ids`.
- **`PARTITION BY toYYYYMM(created_at)`**: Monthly partitions match the spans and evaluation_results tables.

**Querying with dedup** — use `FINAL` or `argMax`:

```sql
-- Option A: FINAL (simpler, slightly slower)
SELECT * FROM annotation_queue_items FINAL
WHERE workspace_id = {workspaceId}
  AND annotation_queue_id = {queueId}
ORDER BY created_at DESC;

-- Option B: argMax (more control)
SELECT
  annotation_queue_id,
  trace_id,
  argMax(status, updated_at) AS status,
  argMax(completed_at, updated_at) AS completed_at,
  argMax(completed_by_user_id, updated_at) AS completed_by_user_id,
  min(created_at) AS created_at
FROM annotation_queue_items
WHERE workspace_id = {workspaceId}
  AND annotation_queue_id = {queueId}
GROUP BY workspace_id, annotation_queue_id, trace_id;
```

**Status updates** — insert a new row rather than UPDATE:

```sql
INSERT INTO annotation_queue_items
  (workspace_id, annotation_queue_id, trace_id, status, completed_at, completed_by_user_id, created_at, updated_at)
VALUES
  ({workspaceId}, {queueId}, {traceId}, 'completed', now64(3), {userId}, {originalCreatedAt}, now64(3));
```

**Cleanup on queue deletion** — when a queue is deleted from PostgreSQL, also delete its items from ClickHouse:

```sql
ALTER TABLE annotation_queue_items
  DELETE WHERE workspace_id = {workspaceId}
    AND annotation_queue_id = {queueId};
```

**Co-located filter evaluation** — dynamic filter queries can check existing items in the same query:

```sql
SELECT s.trace_id
FROM spans s
LEFT JOIN annotation_queue_items FINAL AS aqi
  ON aqi.workspace_id = s.workspace_id
  AND aqi.annotation_queue_id = {queueId}
  AND aqi.trace_id = s.trace_id
WHERE s.workspace_id = {workspaceId}
  AND s.project_id = {projectId}
  AND aqi.trace_id IS NULL  -- Not already in queue
GROUP BY s.trace_id
HAVING SUM(s.cost) > {minCost}
```

**Note**: `trace_id` is the stored reference. When displaying, we check if the trace has a `session_id` and expand to show the full multi-turn conversation if available.

### 5.3 Annotations as Evaluation Results

**Annotations are stored as evaluation results**, not a separate table. This integrates with the existing evaluation system:

- **Project-scoped issue generation** works automatically via `evaluationResultV2Created` event
- Analytics and reporting include annotation data
- Single source of truth for all evaluation/annotation data

#### How it works

1. **Annotation Queue → Project-Scoped Human Evaluation**: Each annotation queue is linked to a Human Evaluation that is project-scoped (not document-scoped)
2. **Annotation → Evaluation Result**: Each annotation creates an `evaluation_result_v2` record
3. **No Draft Versioning**: The linked evaluation follows a single branch of changes with warnings when editing

#### Conversation Model

**Hierarchy:**

- **Trace** (`trace_id`) - One request/response cycle (stored in queue items)
- **Session** (`session_id`) - Optional grouping of traces into multi-turn conversation
- **Span** (`span_id`) - One operation within a trace (prompt, completion, tool, etc.)

```
Trace (trace_id) - Stored in annotation_queue_items
  └── Spans (prompt, completion, tools...)
        └── Messages (from completion span metadata)
  └── session_id (optional) - If present, can expand to full conversation
        └── Other traces with same session_id
```

**Annotation queue items reference `trace_id`**:

- `trace_id` always exists - no migration needed
- When displaying, check if trace has `session_id`
- If `session_id` exists, expand to show full multi-turn conversation
- If no `session_id`, show just that trace (single-turn)

**Benefits of this approach:**

- Works with existing data immediately
- No ClickHouse schema changes required as prerequisite
- Multi-turn conversations work when `session_id` is provided
- Graceful fallback for traces without `session_id`

#### Schema Changes to ClickHouse `evaluation_results`

Add two new columns to the ClickHouse `evaluation_results` table:

```sql
ALTER TABLE evaluation_results
  ADD COLUMN annotation_queue_id Nullable(UInt64),
  ADD COLUMN annotation_queue_item_id Nullable(UInt64);
```

#### Extended Metadata Schema

The `metadata` JSONB field stores annotation target information:

```typescript
type AnnotationQueueResultMetadata = {
  // Standard human evaluation fields
  reason?: string

  // Target specification (for message/highlight annotations)
  targetType: 'global' | 'message' | 'highlight'
  targetSpanId?: string // For message/highlight annotations
  targetMessageIndex?: number // Index within span's messages array
  targetStartOllffset?: number // For highlight annotations (character offset)
  targetEndOffset?: number // For highlight annotations (character offset)
}
```

#### Querying Annotations

To get all annotations for a queue item (ClickHouse):

```sql
SELECT * FROM evaluation_results
WHERE workspace_id = {workspaceId}
  AND annotation_queue_item_id = {queueItemId}
ORDER BY created_at ASC;
```

#### Benefits of This Approach

1. **Project-Scoped Issues**: Annotations that indicate problems generate project-scoped issues (not document-scoped)
2. **Analytics**: All evaluation dashboards include annotation data
3. **Consistency**: Single evaluation result model for both automated and human evaluations
4. **Existing UI**: Evaluation result views work for annotations too
5. **No Document Dependency**: Works with spans from SDK/API telemetry without prompt manager

### 5.4 Filter Schema (JSONB)

Filters are stored as JSONB in `annotation_queues.filters`. Filters target **traces**.

```typescript
// Trace-level metrics (aggregated across all spans in trace)
type MetricProperty =
  | 'cost' // Total cost of trace
  | 'tokens' // Total tokens in trace
  | 'duration' // Duration of trace (ms)

type NumberComparator =
  | 'equals'
  | 'not_equals'
  | 'less_than'
  | 'less_than_or_equal'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'between'

type Filter = {
  property: 'cost' | 'tokens' | 'duration'
  comparator: NumberComparator
  value: number | { min: number; max: number }
}

type FiltersConfig = {
  filters: Filter[]
  sampleRate: number // 0-100
}
```

Example stored filters (targeting expensive traces):

```json
{
  "filters": [
    { "property": "cost", "comparator": "greater_than", "value": 0.1 },
    { "property": "duration", "comparator": "less_than", "value": 300000 }
  ],
  "sampleRate": 25
}
```

### 5.5 URL Query String Representation

Filters translate to URL query parameters for shareable links and browser navigation:

```
# Single filter
/projects/123/traces?cost=0.10&cost_op=gt

# Multiple filters
/projects/123/traces?cost=0.10&cost_op=gt&duration=60000&duration_op=lt

# Range filter (between)
/projects/123/traces?tokens_min=100&tokens_max=5000
```

**Query Parameter Schema:**

| Filter Type         | URL Format                          | Example                          |
| ------------------- | ----------------------------------- | -------------------------------- |
| Number less_than    | `{prop}={value}&{prop}_op=lt`       | `cost=0.10&cost_op=lt`           |
| Number greater_than | `{prop}={value}&{prop}_op=gt`       | `duration=60000&duration_op=gt`  |
| Number between      | `{prop}_min={min}&{prop}_max={max}` | `tokens_min=100&tokens_max=5000` |

**Operator abbreviations**: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`

## 6. UI Components

### 6.1 Project-Level Traces Page (`/projects/[projectId]/traces`)

A new project-level page showing all traces.

**Features:**

- Traces table with aggregated metrics per trace
- Filter bar for trace-level metrics
- Checkbox selection for traces
- Floating action bar when traces selected → "Add to Annotation Queue"
- Pagination with keyset cursor

**Table Columns:**

| Column     | Description                         |
| ---------- | ----------------------------------- |
| Trace ID   | Identifier (truncated)              |
| Cost       | Total cost of trace                 |
| Tokens     | Total tokens in trace               |
| Duration   | Time from start to end              |
| Started At | Timestamp                           |
| Session    | Badge if part of multi-turn session |

**Filters:**

| Property | Type   | Comparators     | UI Component                |
| -------- | ------ | --------------- | --------------------------- |
| Cost     | number | lt, gt, between | Number input / Range slider |
| Tokens   | number | lt, gt, between | Number input / Range slider |
| Duration | number | lt, gt, between | Number input / Range slider |

### 6.2 Annotation Queues List Page (`/projects/[projectId]/annotation-queues`)

Lists all annotation queues for the project.

**Columns:**

- Name
- Description (truncated)
- Annotators (avatar stack)
- Active Filters (metric badges if configured)
- Progress (pending / in_progress / completed counts)
- Created date
- Actions (Edit, Delete)

**Edit Behavior**: Editing a running queue shows a warning that changes will affect future trace matching but not existing items.

### 6.3 Annotation Queue Detail Page (`/projects/[projectId]/annotation-queues/[uuid]`)

The main annotation interface with a split-pane layout:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Queue: Customer Support Reviews                    Progress: 12/50 (24%)   │
│  [Session: 3 turns] ← shown if trace has session_id                         │
├───────────────────────────────────────────┬─────────────────────────────────┤
│                                           │                                 │
│  ┌─────────────────────────────────────┐  │  Annotations                    │
│  │ User: How do I reset my password?   │  │  ─────────────────────────────  │
│  └─────────────────────────────────────┘  │                                 │
│                                           │  📌 Global Annotation           │
│  ┌─────────────────────────────────────┐  │  "Overall good response..."     │
│  │ Assistant: To reset your password,  │  │  [Edit] [Delete]                │
│  │ please follow these steps:          │◄─┼── 📍 Message #2                 │
│  │ 1. Go to Settings > Account         │  │  "Step 2 is incorrect..."       │
│  │ 2. Click "Reset Password"           │  │  [Edit] [Delete]                │
│  └─────────────────────────────────────┘  │                                 │
│                                           │                                 │
│  ┌─────────────────────────────────────┐  │                                 │
│  │ User: Thanks, that worked!          │  │                                 │
│  └─────────────────────────────────────┘  │                                 │
│                                           │  [+ Add Global Annotation]      │
│  ┌─────────────────────────────────────┐  │                                 │
│  │ Assistant: You're welcome! ...      │  │                                 │
│  └─────────────────────────────────────┘  │                                 │
│                                           │                                 │
├───────────────────────────────────────────┴─────────────────────────────────┤
│  [← Previous]  Trace 5 of 50  [Next →]              [Mark as Completed ✓]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Features:**

1. **Conversation Display (Left Pane)**
   - If trace has `session_id`: show full multi-turn conversation (all traces in session)
   - If no `session_id`: show just this trace's conversation
   - Clickable messages to add message-level annotations
   - Visual indicators for annotated messages

2. **Annotations Sidebar (Right Pane)**
   - Lists all annotations for current trace/conversation
   - Two types of annotations:
     - **Global**: Trace/conversation-level annotation
     - **Message**: Linked to specific message (click scrolls to message)
   - **N annotations per target**: Unlimited annotations per message
   - Different annotators can add their own annotations
   - Edit/Delete actions per annotation (own annotations or admin)

3. **Navigation**
   - Previous/Next buttons for queue navigation
   - Keyboard shortcuts: `←` / `→` for navigation
   - Progress indicator
   - "Mark as Completed" button

### 6.4 Add to Queue Modal

Appears when user clicks "Add to Annotation Queue" from traces page.

**Two modes:**

1. **Add to existing queue** - Dropdown to select queue
2. **Create new queue** - Full form with:
   - Name (required)
   - Description (optional)
   - Annotators multi-select
   - Dynamic filters builder (metric-based)
   - Sample rate slider (0-100%)

**Filter Builder UI:**

- Metric filters with comparators and values
- Preview of matching trace count
- Warning when editing existing queue: "Changes will affect future trace matching"

## 7. Dynamic Filters

### 7.1 How Dynamic Filters Work

1. **Initial Population**: Traces matching filters are added when queue is created
2. **Continuous Population**: A background job monitors new traces
3. **Sample Rate**: Only `sampleRate`% of matching traces are added
4. **Deduplication**: Traces already in queue are not re-added

### 7.2 Filter Evaluation

Filters are evaluated against trace data from ClickHouse:

```sql
SELECT
  trace_id,
  SUM(cost) as total_cost,
  SUM(tokens_prompt + tokens_completion) as total_tokens,
  MAX(ended_at) - MIN(started_at) as duration
FROM spans
WHERE workspace_id = {workspaceId}
  AND project_id = {projectId}
  AND type IN ('prompt', 'external', 'chat')  -- Main span types
GROUP BY trace_id
HAVING
  total_cost > {minCost}
ORDER BY MAX(started_at) DESC
LIMIT {limit}
```

### 7.3 Sample Rate Implementation

```typescript
function shouldIncludeTrace(sampleRate: number): boolean {
  return Math.random() * 100 < sampleRate
}
```

Note: Random sampling is sufficient since we only evaluate new traces once and the unique constraint `(annotation_queue_id, trace_id)` prevents duplicates.

## 8. Routes Structure

```
/projects/[projectId]/traces                     # Project-level spans page (with N-dimensional filters)
/projects/[projectId]/annotation-queues          # Queues list page
/projects/[projectId]/annotation-queues/new      # Create queue page
/projects/[projectId]/annotation-queues/[uuid]   # Queue detail (annotation view)
/projects/[projectId]/annotation-queues/[uuid]/edit  # Edit queue settings (with warnings)
```

## 9. Services

### 9.1 Core Services (`packages/core/src/services/annotationQueues/`)

- `create.ts` - Create queue + find-or-create project-level evaluation
- `update.ts` - Update queue metadata, members, filters
- `destroy.ts` - Delete queue from PG (cascades members) + delete items from ClickHouse (evaluation and results preserved)
- `addTraces.ts` - Insert items into ClickHouse (by trace_id)
- `removeTraces.ts` - Delete items from ClickHouse
- `updateItemStatus.ts` - Insert new row in ClickHouse with updated status (ReplacingMergeTree handles dedup)
- `evaluateFilters.ts` - Check if trace matches queue filters (ClickHouse query, co-located with items for dedup)

### 9.2 Annotation Services

Annotations use the **existing evaluation system** - no new services needed for result creation:

```typescript
// Creating an annotation queue
const headCommit = await getHeadCommit(project) // HEAD of merged branch

const evaluation = await findOrCreateProjectEvaluation({
  workspace,
  project,
  commitId: headCommit.id, // Always HEAD of main
  type: 'human',
  metric: 'rating',
  name: `Annotation: ${queueName}`,
  documentUuid: null, // Project-scoped (requires schema change)
})

const queue = await createAnnotationQueue({
  workspace,
  project,
  evaluationUuid: evaluation.uuid,
  name: queueName,
  // ...
})
```

```typescript
// Creating an annotation (uses existing service)
await createEvaluationResultV2({
  evaluation,
  span, // The completion span from the trace
  commit: headCommit, // Same HEAD commit
  workspace,
  value: { score, normalizedScore, hasPassed },
  // metadata includes annotation-specific fields
})
```

This automatically uses existing infrastructure:

- Creates `evaluation_result` in ClickHouse (+ PostgreSQL for the evaluation version)
- Publishes `evaluationResultV2Created` event
- Triggers issue discovery via existing handlers
- The `annotation_queue_id` and item `trace_id` are stored in the evaluation result's metadata or dedicated columns, linking annotations back to queue items without cross-DB FKs

### 9.3 Background Jobs

- `populateQueueJob.ts` - Process dynamic filters for new traces
- Triggered by `spanCreated` event (for main span types)
- Checks all queues with filters for the workspace/project
- Evaluates trace metrics against filters
- Adds matching traces respecting sample rate

## 10. Queries

### 10.1 PostgreSQL Queries (`packages/core/src/queries/annotationQueues/`)

- `findByProject.ts` - List queues for a project with members and linked evaluation
- `findByUuid.ts` - Get single queue with members and linked evaluation

### 10.2 ClickHouse Queries

- `getTracesByProject.ts` - Fetch traces with metrics (optionally grouped by session_id)
- `getTraceConversation.ts` - Assemble conversation (expand to session if session_id exists)
- `evaluateQueueFilters.ts` - Find traces matching filter criteria, excluding already-enqueued items (single-DB join)
- `getAnnotationsByTrace.ts` - Get evaluation results for a trace
- `findItems.ts` - Get queue items with pagination (uses `FINAL` for dedup)
- `findNextItem.ts` - Get next pending item for keyboard navigation
- `getProgress.ts` - Queue completion statistics (count by status with `argMax`)

## 11. Implementation Phases

### Phase 1a: Schema

- [x] Feature flag setup (`annotationQueues`)
- [x] PostgreSQL migrations:
  - [x] `annotation_queues` table (with `evaluation_uuid` FK)
  - [x] `annotation_queue_members` table (join table: queue ↔ membership)
- [x] ClickHouse migration (clustered + unclustered): -[ ] `annotation_queue_items` table (`ReplacingMergeTree`, keyed on `workspace_id, annotation_queue_id, trace_id`)

### Phase 1b: Manual Queue Management (Backoffice)
- [x] Core services (ADD for queues, members, items) in backoffice. During BETA an easy way
      of creating queues in a project and add traces to it.
- [x] Backoffice action to manually create a queue in a project
- [x] Backoffice action to manually add traces to a queue (by trace_id)

# Phase 2: Annotation Interface
- [x] Queue detail page (basic) - list items, show status. Ask developer for an
      image of it in Figma.
- [ ] Queue detail page with conversation display
  - [ ] Assemble conversation from trace spans
  - [ ] If trace has `session_id` (currently called `documentLogUuid`), expand to show full session
- [ ] Annotation creation (global, message-level, highlight)
- [ ] Try not to change anything related with existing annotations.
- [ ] Store annotations using existing `createEvaluationResultV2`
- [ ] Annotations sidebar UI
- [ ] Mark as completed functionality
- [ ] Navigation (previous/next)

### Phase 4: Dynamic Filters

- [ ] Filter builder UI component
- [ ] Filter storage in queue (JSONB)
- [ ] Filter evaluation logic against ClickHouse (session aggregates)
- [ ] Sample rate implementation
- [ ] Background job for auto-population

### Phase 5: Polish

- [ ] Keyboard navigation (←/→)
- [ ] Highlight annotations (text selection)
- [ ] Progress tracking UI
- [ ] Queue statistics
- [ ] Performance optimization

## 12. Open Questions

1. **Evaluation Metric for Annotations**: ✅ **Resolved** - HITL Rating by default.

   When creating an annotation queue, we find-or-create a project-level evaluation:
   - `documentUuid = NULL` (project-scoped)
   - `type = 'human'`, `metric = 'rating'`
   - Linked via `annotation_queues.evaluation_uuid`

2. **Concurrent Annotation**: ✅ **Resolved** - Not a priority for initial implementation.

3. **Annotation Queue Deletion**: When a queue is deleted, what happens to the linked evaluation and results? Options:
   - Keep evaluation and results (orphaned but queryable)
   - Soft-delete queue (preserve history, hide from UI)
   - Delete queue, keep evaluation (results remain valid)

4. **Cross-Project Queues**: Should annotation queues be project-scoped only, or workspace-level?

5. **Session Expansion Behavior**: When a trace has `session_id`, should we:
   - Always expand to show full session conversation
   - Show a toggle to expand/collapse
   - Let the user choose in queue settings

6. **Commit Strategy for Project Evaluations**: See detailed discussion in section 4.2. Key questions:
   - How do we create evaluations on merged commits?
   - Should `commitId` be nullable for project-level evaluations?
   - Does the commit system make sense for telemetry-only users?
   - `issueHistograms` also requires `documentUuid` and `commitId` - need to handle for project-scoped issues

## 13. Future Considerations

- Export annotations for training data (RLHF, fine-tuning)
- Annotation templates/presets for common review patterns
- Inter-annotator agreement metrics (Cohen's kappa, etc.)
- Bulk annotation operations
- Annotation search and filtering
- Session-based analytics (annotation quality trends over time)
- Automated annotation suggestions based on similar sessions
