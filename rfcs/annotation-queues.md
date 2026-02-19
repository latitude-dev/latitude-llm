# RFC: Annotation Queues

Status: Draft
Owners: Core Platform
Feature Flag: `annotationQueues`

> **Important**: This feature reads `spans` and `evaluation_results` exclusively from **ClickHouse**.
> PostgreSQL is only used for annotation queue metadata (queues, members, items).
> No changes to the PostgreSQL `evaluation_results_v2` table are required.

## 1. Problem Statement

Teams need a way to organize and distribute conversation review work among team members. Currently, there's no structured way to:
- Group sessions (multi-turn conversations) for review
- Assign sessions to specific team members (annotators)
- Track annotation progress across a queue of sessions
- Filter and automatically collect sessions matching metric criteria (cost, tokens, duration)

## 2. Goals

- Provide a project-level view of all sessions (conversations) with metric-based filtering
- Enable creation of annotation queues that target sessions by aggregated metrics (cost, tokens, duration, turn count)
- Support dynamic filtering to auto-populate queues with matching sessions
- Allow detailed annotation of conversations (message-level, global)
- Track completion status of sessions in queues
- Generate project-scoped issues from annotations

## 3. Non-Goals

- Real-time collaborative annotation (single annotator per trace at a time)
- Automated annotation suggestions (future phase)
- Draft-based versioning for annotation configurations (single branch with edit warnings)

## 4. Architecture Overview

### 4.1 Telemetry Context

Annotation queues build on Latitude's telemetry model:

1. **One-line install**: Users enable telemetry without manual `.capture()` or span wrapping
2. **Automatic observability**: Metrics and traces are captured out of the box
3. **Session-based grouping**: Traces are grouped by `session_id` to form multi-turn conversations
   - Users can provide `session_id` in telemetry to group related traces
   - Traces without `session_id` get a fallback: `session_id = trace_id` (single-turn)

### 4.2 Required Schema Change

**Current state**: `evaluationVersions.documentUuid` is NOT NULL, requiring all evaluations to be document-scoped.

**Required change for this RFC**: Make `documentUuid` NULLABLE in `evaluationVersions`. This allows:
- Project-level evaluations (documentUuid = NULL)
- Annotation queues to link to evaluations without document association

This is a **prerequisite task** for annotation queues to work.

### 4.3 Data Storage

**PostgreSQL** for annotation queue metadata:
- `annotation_queues` - queue definitions, filters, settings
- `annotation_queue_members` - annotator assignments
- `annotation_queue_items` - sessions in queue with status

Rationale: Relational data with foreign keys, ACID transactions for status changes.

**ClickHouse** for span and annotation data (read + write):
- `spans` - span data with `session_id` for grouping traces into conversations
- `evaluation_results` - annotations stored as evaluation results

Rationale: High-volume analytics queries, existing evaluation infrastructure.

### 4.4 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Project-Level /traces Page                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Filters: Cost | Tokens | Duration | Time Range                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [ ] Session 1  │ 3 turns │ Cost: $0.12  │ Duration: 45s            │   │
│  │  [x] Session 2  │ 1 turn  │ Cost: $0.05  │ Duration: 12s            │   │
│  │  [x] Session 3  │ 5 turns │ Cost: $0.31  │ Duration: 2m             │   │
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
│  │  Dynamic Filters (auto-add matching sessions):                       │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ [Cost]       [less_than] [0.50]                 [x Remove]  │    │   │
│  │  │ [Duration]   [greater_than] [30s]               [x Remove]  │    │   │
│  │  │ [+ Add filter]                                              │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │  Sample Rate: [====|----] 25% of matching sessions                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                          [Cancel] [Create Queue]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 5. Data Model (PostgreSQL)

### 5.1 Tables

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
              └── Items (sessions/traces to review)
              └── Evaluation Results (annotations)
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

#### `annotation_queue_items`

```sql
CREATE TABLE annotation_queue_items (
  id BIGSERIAL PRIMARY KEY,
  annotation_queue_id BIGINT NOT NULL REFERENCES annotation_queues(id) ON DELETE CASCADE,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,     -- Groups multi-turn conversations
  status VARCHAR(32) NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed
  completed_at TIMESTAMP,
  completed_by_membership_id BIGINT REFERENCES memberships(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(annotation_queue_id, session_id)  -- One queue item per session
);
```

**Note**: `session_id` is the primary identifier. A session groups multiple traces that form a multi-turn conversation. The full conversation is built by querying all traces with this `session_id`.

### 5.2 Annotations as Evaluation Results

**Annotations are stored as evaluation results**, not a separate table. This integrates with the existing evaluation system:

- **Project-scoped issue generation** works automatically via `evaluationResultV2Created` event
- Analytics and reporting include annotation data
- Single source of truth for all evaluation/annotation data

#### How it works

1. **Annotation Queue → Project-Scoped Human Evaluation**: Each annotation queue is linked to a Human Evaluation that is project-scoped (not document-scoped)
2. **Annotation → Evaluation Result**: Each annotation creates an `evaluation_result_v2` record
3. **No Draft Versioning**: The linked evaluation follows a single branch of changes with warnings when editing

#### Session-Based Conversation Model

**Hierarchy:**
- **Session** (`session_id`) - Groups multiple traces into a multi-turn conversation
- **Trace** (`trace_id`) - One request/response cycle within a session
- **Span** (`span_id`) - One operation within a trace (prompt, completion, tool, etc.)

```
Session (session_id) - Full multi-turn conversation
  └── Trace 1 (trace_id) - First user interaction
        └── Spans (prompt, completion, tools...)
              └── Messages (from completion span metadata)
  └── Trace 2 (trace_id) - Follow-up interaction
        └── Spans...
  └── Trace N...
```

**Annotation queue items reference `session_id`**:
- The full conversation is built by querying all traces with this session_id
- Annotations target messages within the assembled conversation
- No direct link to spans - we build the view from traces

**Fallback session_id:**
- Traces without `session_id` get a generated fallback: `session_id = trace_id`
- This ensures all traces can be grouped, even single-turn ones
- Existing traces without session_id need backfill (see Open Questions)

#### Schema Changes to ClickHouse `evaluation_results`

Add two new columns to the ClickHouse `evaluation_results` table:

```sql
ALTER TABLE evaluation_results
  ADD COLUMN annotation_queue_id Nullable(UInt64),
  ADD COLUMN annotation_queue_item_id Nullable(UInt64);
```

Note: No changes to PostgreSQL `evaluation_results_v2`. All annotation queries run against ClickHouse.

#### Extended Metadata Schema

The `metadata` JSONB field stores annotation target information:

```typescript
type AnnotationQueueResultMetadata = {
  // Standard human evaluation fields
  reason?: string

  // Target specification (for message/highlight annotations)
  targetType: 'global' | 'message' | 'highlight'
  targetSpanId?: string        // For message/highlight annotations
  targetMessageIndex?: number  // Index within span's messages array
  targetStartOffset?: number   // For highlight annotations (character offset)
  targetEndOffset?: number     // For highlight annotations (character offset)
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

### 5.3 Filter Schema (JSONB)

Filters are stored as JSONB in `annotation_queues.filters`. Filters target **sessions** (aggregated from traces).

```typescript
// Session-level metrics (aggregated across all traces in session)
type MetricProperty =
  | 'cost'           // Total cost of session
  | 'tokens'         // Total tokens in session
  | 'duration'       // Total duration of session
  | 'turnCount'      // Number of traces in session

type NumberComparator = 'equals' | 'not_equals' | 'less_than' | 'less_than_or_equal' | 'greater_than' | 'greater_than_or_equal' | 'between'

type Filter =
  | { property: 'cost' | 'tokens' | 'duration' | 'turnCount'; comparator: NumberComparator; value: number | { min: number; max: number } }

type FiltersConfig = {
  filters: Filter[]
  sampleRate: number  // 0-100
}
```

Example stored filters (targeting expensive multi-turn sessions):

```json
{
  "filters": [
    { "property": "cost", "comparator": "greater_than", "value": 0.10 },
    { "property": "turnCount", "comparator": "greater_than", "value": 3 },
    { "property": "duration", "comparator": "less_than", "value": 300000 }
  ],
  "sampleRate": 25
}
```

### 5.4 URL Query String Representation

Filters translate to URL query parameters for shareable links and browser navigation:

```
# Single filter
/projects/123/traces?cost=0.10&cost_op=gt

# Multiple filters
/projects/123/traces?cost=0.10&cost_op=gt&turnCount=3&turnCount_op=gt

# Range filter (between)
/projects/123/traces?tokens_min=100&tokens_max=5000
```

**Query Parameter Schema:**

| Filter Type | URL Format | Example |
|-------------|-----------|---------|
| Number less_than | `{prop}={value}&{prop}_op=lt` | `cost=0.10&cost_op=lt` |
| Number greater_than | `{prop}={value}&{prop}_op=gt` | `turnCount=3&turnCount_op=gt` |
| Number between | `{prop}_min={min}&{prop}_max={max}` | `tokens_min=100&tokens_max=5000` |

**Operator abbreviations**: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`

## 6. UI Components

### 6.1 Project-Level Traces Page (`/projects/[projectId]/traces`)

A new project-level page showing all sessions (conversations) grouped by `session_id`.

**Features:**
- Sessions table with aggregated metrics per session
- Filter bar for session-level metrics
- Checkbox selection for sessions
- Floating action bar when sessions selected → "Add to Annotation Queue"
- Pagination with keyset cursor

**Table Columns:**

| Column | Description |
|--------|-------------|
| Session ID | Identifier (truncated, clickable to expand) |
| Turns | Number of traces in session |
| Total Cost | Sum of cost across all traces |
| Total Tokens | Sum of tokens across all traces |
| Duration | Time from first to last trace |
| Started At | Timestamp of first trace |

**Filters:**

| Property | Type | Comparators | UI Component |
|----------|------|-------------|--------------|
| Cost | number | lt, gt, between | Number input / Range slider |
| Tokens | number | lt, gt, between | Number input / Range slider |
| Duration | number | lt, gt, between | Number input / Range slider |
| Turn Count | number | lt, gt, between | Number input |

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

**Edit Behavior**: Editing a running queue shows a warning that changes will affect future session matching but not existing items.

### 6.3 Annotation Queue Detail Page (`/projects/[projectId]/annotation-queues/[uuid]`)

The main annotation interface with a split-pane layout:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Queue: Customer Support Reviews                    Progress: 12/50 (24%)   │
├───────────────────────────────────────────┬─────────────────────────────────┤
│                                           │                                 │
│  ── Turn 1 ──────────────────────────────│  Annotations                    │
│  ┌─────────────────────────────────────┐  │  ─────────────────────────────  │
│  │ User: How do I reset my password?   │  │                                 │
│  └─────────────────────────────────────┘  │  📌 Global Annotation           │
│                                           │  "Overall good conversation..." │
│  ┌─────────────────────────────────────┐  │  [Edit] [Delete]                │
│  │ Assistant: To reset your password,  │  │                                 │
│  │ please follow these steps:          │◄─┼── 📍 Message #2                 │
│  │ 1. Go to Settings > Account         │  │  "Step 2 is incorrect..."       │
│  │ 2. Click "Reset Password"           │  │  [Edit] [Delete]                │
│  └─────────────────────────────────────┘  │                                 │
│                                           │                                 │
│  ── Turn 2 ──────────────────────────────│                                 │
│  ┌─────────────────────────────────────┐  │                                 │
│  │ User: Thanks, that worked!          │  │                                 │
│  └─────────────────────────────────────┘  │                                 │
│                                           │  [+ Add Global Annotation]      │
│  ┌─────────────────────────────────────┐  │                                 │
│  │ Assistant: You're welcome! ...      │  │                                 │
│  └─────────────────────────────────────┘  │                                 │
│                                           │                                 │
├───────────────────────────────────────────┴─────────────────────────────────┤
│  [← Previous]  Session 5 of 50  [Next →]            [Mark as Completed ✓]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Features:**

1. **Conversation Display (Left Pane)**
   - Full multi-turn conversation assembled from all traces in the session
   - Visual separation between turns (traces)
   - Clickable messages to add message-level annotations
   - Visual indicators for annotated messages

2. **Annotations Sidebar (Right Pane)**
   - Lists all annotations for current session
   - Two types of annotations:
     - **Global**: Session-level annotation
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
- Preview of matching session count
- Warning when editing existing queue: "Changes will affect future session matching"

## 7. Dynamic Filters

### 7.1 How Dynamic Filters Work

1. **Initial Population**: Sessions matching filters are added when queue is created
2. **Continuous Population**: A background job monitors new sessions
3. **Sample Rate**: Only `sampleRate`% of matching sessions are added
4. **Deduplication**: Sessions already in queue are not re-added

### 7.2 Filter Evaluation

Filters are evaluated against aggregated session data from ClickHouse:

```sql
SELECT 
  session_id,
  SUM(cost) as total_cost,
  SUM(tokens_prompt + tokens_completion) as total_tokens,
  MAX(ended_at) - MIN(started_at) as duration,
  COUNT(DISTINCT trace_id) as turn_count
FROM spans
WHERE workspace_id = {workspaceId}
  AND project_id = {projectId}
  AND type IN ('prompt', 'external', 'chat')  -- Main span types
GROUP BY session_id
HAVING 
  total_cost > {minCost}
  AND turn_count > {minTurns}
ORDER BY MAX(started_at) DESC
LIMIT {limit}
```

### 7.3 Sample Rate Implementation

```typescript
function shouldIncludeSession(sampleRate: number): boolean {
  return Math.random() * 100 < sampleRate
}
```

Note: Random sampling is sufficient since we only evaluate new sessions once and the unique constraint `(annotation_queue_id, session_id)` prevents duplicates.

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
- `destroy.ts` - Delete queue and all items (evaluation and results preserved)
- `addSessions.ts` - Manually add sessions to queue (by session_id)
- `removeSessions.ts` - Remove sessions from queue
- `updateItemStatus.ts` - Mark item as pending/in_progress/completed
- `evaluateFilters.ts` - Check if session matches queue filters

### 9.2 Annotation Services

Annotations use the **existing evaluation system** - no new services needed for result creation:

```typescript
// Creating an annotation queue
const evaluation = await findOrCreateProjectEvaluation({
  workspace,
  project,
  commit,  // Head commit of default branch
  type: 'human',
  metric: 'rating',
  name: `Annotation: ${queueName}`,
  documentUuid: null,  // Project-scoped (requires schema change)
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
  span,  // The completion span from the trace
  commit,
  workspace,
  value: { score, normalizedScore, hasPassed },
  // metadata includes annotation-specific fields
})
```

This automatically uses existing infrastructure:
- Creates `evaluation_result` in PostgreSQL + ClickHouse
- Publishes `evaluationResultV2Created` event
- Triggers issue discovery via existing handlers

### 9.3 Background Jobs

- `populateQueueJob.ts` - Process dynamic filters for new sessions
- Triggered by `spanCreated` event (for main span types)
- Checks all queues with filters for the workspace/project
- Aggregates session metrics from traces
- Adds matching sessions respecting sample rate

## 10. Queries

### 10.1 PostgreSQL Queries (`packages/core/src/queries/annotationQueues/`)

- `findByProject.ts` - List queues for a project with stats
- `findByUuid.ts` - Get single queue with members and linked evaluation
- `findItems.ts` - Get queue items (sessions) with pagination
- `findNextItem.ts` - Get next pending item (for keyboard navigation)
- `getProgress.ts` - Get queue completion statistics

### 10.2 ClickHouse Queries

- `getSessionsByProject.ts` - Fetch sessions with aggregated metrics
- `getSessionConversation.ts` - Assemble full conversation from session traces
- `evaluateQueueFilters.ts` - Find sessions matching filter criteria
- `getAnnotationsBySession.ts` - Get evaluation results for a session

## 11. Implementation Phases

### Phase 0: Prerequisites
- [ ] **Make `documentUuid` nullable in `evaluationVersions`** (PostgreSQL migration)
- [ ] **Add `session_id` column to ClickHouse `spans` table**
- [ ] Update span ingestion to:
  - [ ] Accept `session_id` from telemetry
  - [ ] Generate fallback `session_id = trace_id` when not provided
- [ ] Backfill existing spans without `session_id` (set `session_id = trace_id`)

### Phase 1a: PostgreSQL Schema
- [ ] Feature flag setup (`annotationQueues`)
- [ ] PostgreSQL migrations:
  - [ ] `annotation_queues` table (with `evaluation_uuid` FK)
  - [ ] `annotation_queue_members` table
  - [ ] `annotation_queue_items` table (with `session_id`)
- [ ] Core services (CRUD for queues, items, members)
- [ ] Service to find-or-create project-level evaluation (documentUuid=NULL)

### Phase 1b: Manual Queue Management (Backoffice)
- [ ] Backoffice page to list annotation queues
- [ ] Backoffice page to create/edit annotation queues
- [ ] Backoffice action to manually add sessions to queues (by session_id)
- [ ] Queue detail page (basic) - list items, show status
- [ ] **Goal**: Experience the annotation workflow without filters/traces page

### Phase 2: Annotation Interface
- [ ] Queue detail page with conversation display (assembled from session traces)
- [ ] Annotation creation (global, message-level)
- [ ] Store annotations using existing `createEvaluationResultV2`
- [ ] Annotations sidebar UI
- [ ] Mark as completed functionality
- [ ] Navigation (previous/next)

### Phase 3: Project-Level Traces Page
- [ ] `/projects/[projectId]/traces` page (grouped by session_id)
- [ ] Basic filters (cost, tokens, duration, turn count)
- [ ] Session selection with checkbox
- [ ] "Add to Annotation Queue" modal
- [ ] Pagination

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

4. **Session ID Backfill Strategy**: Existing spans don't have `session_id`. Options:
   - **Option A**: Backfill all existing spans with `session_id = trace_id` (one-time migration)
   - **Option B**: Only backfill spans in projects that enable annotation queues
   - **Option C**: Handle NULL session_id in queries (treat as single-turn)
   
   **Recommendation**: Option A is cleanest - ensures consistent data model.

5. **Session ID Generation for New Traces**: When telemetry doesn't provide `session_id`:
   - Generate deterministic fallback: `session_id = trace_id`
   - This ensures every trace belongs to exactly one session
   - Single-turn conversations = session with one trace

6. **Cross-Project Queues**: Should annotation queues be project-scoped only, or workspace-level?

## 13. Future Considerations

- Export annotations for training data (RLHF, fine-tuning)
- Annotation templates/presets for common review patterns
- Inter-annotator agreement metrics (Cohen's kappa, etc.)
- Bulk annotation operations
- Annotation search and filtering
- Session-based analytics (annotation quality trends over time)
- Automated annotation suggestions based on similar sessions
