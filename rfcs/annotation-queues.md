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

## 4. Architecture Overview

### 4.1 Telemetry Context

Annotation queues build on Latitude's telemetry model:

1. **One-line install**: Users enable telemetry without manual `.capture()` or span wrapping
2. **Automatic observability**: Metrics and traces are captured out of the box
3. **Optional session grouping**: Users can provide `session_id` in telemetry to group related traces into multi-turn conversations
   - When a trace has `session_id`, the annotation UI expands to show the full conversation
   - Traces without `session_id` are displayed as single-turn conversations

### 4.2 Required Schema Change

**Current state**: `evaluationVersions` has two NOT NULL fields that need consideration:
- `documentUuid` - ties evaluation to a specific document
- `commitId` - ties evaluation to a specific commit (for branch-based versioning)

**Required change for this RFC**: Make `documentUuid` NULLABLE in `evaluationVersions`.

---

**⚠️ OPEN DISCUSSION: How should `commitId` work for annotation queues?**

The current evaluation system assumes:
1. Evaluations are created on draft branches
2. Drafts are merged to make evaluations "live"
3. The "live" commit is what runs in production

**Questions for team discussion:**

1. **How do we create a project-level evaluation on a merged commit?**
   - Option A: Create a draft, add the HITL evaluation, merge it
   - Option B: Allow creating evaluations directly on merged commits (bypass draft flow)
   - Option C: Always work with a "draft" version for annotation queues

2. **For telemetry-only users (no prompt manager), versioning is irrelevant:**
   - There are no documents to version
   - There's no concept of "live" vs "draft" for their traces
   - The commit system doesn't map to their mental model
   - Should we abstract this away entirely for project-level evaluations?

3. **The "live" commit concept doesn't apply to telemetry traces:**
   - Telemetry traces come from external systems via SDK
   - They're not associated with a specific commit
   - Pointing to "live" commit for evaluation results feels artificial

4. **Issue histograms also have commit/document dependency:**
   - `issueHistograms` table has `documentUuid` (NOT NULL) and `commitId` (NOT NULL)
   - Issues are project-scoped, but histograms track counts per document per commit
   - For annotation queue issues (project-scoped, no document), how do we track histograms?
   - May need to make `documentUuid` and `commitId` nullable in `issueHistograms` too

5. **Possible approaches:**
   - **Approach A**: Use HEAD of merged branch, accept the mismatch
   - **Approach B**: Make `commitId` nullable for project-level evaluations (bigger change)
   - **Approach C**: Create a special "project commit" that never changes
   - **Approach D**: Rethink - maybe annotation queues shouldn't use `evaluationVersions` at all?
   - **Approach E**: Make both `documentUuid` and `commitId` nullable across evaluation + issue tables

**Current assumption (to be validated):**
We use HEAD of merged branch, but this needs team discussion.

---

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
  trace_id VARCHAR(64) NOT NULL,       -- Reference to trace in ClickHouse
  status VARCHAR(32) NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed
  completed_at TIMESTAMP,
  completed_by_membership_id BIGINT REFERENCES memberships(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(annotation_queue_id, trace_id)  -- One queue item per trace
);
```

**Note**: `trace_id` is the stored reference. When displaying, we check if the trace has a `session_id` and expand to show the full multi-turn conversation if available.

### 5.2 Annotations as Evaluation Results

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

Filters are stored as JSONB in `annotation_queues.filters`. Filters target **traces**.

```typescript
// Trace-level metrics (aggregated across all spans in trace)
type MetricProperty =
  | 'cost'           // Total cost of trace
  | 'tokens'         // Total tokens in trace
  | 'duration'       // Duration of trace (ms)

type NumberComparator = 'equals' | 'not_equals' | 'less_than' | 'less_than_or_equal' | 'greater_than' | 'greater_than_or_equal' | 'between'

type Filter =
  | { property: 'cost' | 'tokens' | 'duration'; comparator: NumberComparator; value: number | { min: number; max: number } }

type FiltersConfig = {
  filters: Filter[]
  sampleRate: number  // 0-100
}
```

Example stored filters (targeting expensive traces):

```json
{
  "filters": [
    { "property": "cost", "comparator": "greater_than", "value": 0.10 },
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
/projects/123/traces?cost=0.10&cost_op=gt&duration=60000&duration_op=lt

# Range filter (between)
/projects/123/traces?tokens_min=100&tokens_max=5000
```

**Query Parameter Schema:**

| Filter Type | URL Format | Example |
|-------------|-----------|---------|
| Number less_than | `{prop}={value}&{prop}_op=lt` | `cost=0.10&cost_op=lt` |
| Number greater_than | `{prop}={value}&{prop}_op=gt` | `duration=60000&duration_op=gt` |
| Number between | `{prop}_min={min}&{prop}_max={max}` | `tokens_min=100&tokens_max=5000` |

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

| Column | Description |
|--------|-------------|
| Trace ID | Identifier (truncated) |
| Cost | Total cost of trace |
| Tokens | Total tokens in trace |
| Duration | Time from start to end |
| Started At | Timestamp |
| Session | Badge if part of multi-turn session |

**Filters:**

| Property | Type | Comparators | UI Component |
|----------|------|-------------|--------------|
| Cost | number | lt, gt, between | Number input / Range slider |
| Tokens | number | lt, gt, between | Number input / Range slider |
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
- `destroy.ts` - Delete queue and all items (evaluation and results preserved)
- `addTraces.ts` - Manually add traces to queue (by trace_id)
- `removeTraces.ts` - Remove traces from queue
- `updateItemStatus.ts` - Mark item as pending/in_progress/completed
- `evaluateFilters.ts` - Check if trace matches queue filters

### 9.2 Annotation Services

Annotations use the **existing evaluation system** - no new services needed for result creation:

```typescript
// Creating an annotation queue
const headCommit = await getHeadCommit(project)  // HEAD of merged branch

const evaluation = await findOrCreateProjectEvaluation({
  workspace,
  project,
  commitId: headCommit.id,  // Always HEAD of main
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
  commit: headCommit,  // Same HEAD commit
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

- `populateQueueJob.ts` - Process dynamic filters for new traces
- Triggered by `spanCreated` event (for main span types)
- Checks all queues with filters for the workspace/project
- Evaluates trace metrics against filters
- Adds matching traces respecting sample rate

## 10. Queries

### 10.1 PostgreSQL Queries (`packages/core/src/queries/annotationQueues/`)

- `findByProject.ts` - List queues for a project with stats
- `findByUuid.ts` - Get single queue with members and linked evaluation
- `findItems.ts` - Get queue items (traces) with pagination
- `findNextItem.ts` - Get next pending item (for keyboard navigation)
- `getProgress.ts` - Get queue completion statistics

### 10.2 ClickHouse Queries

- `getTracesByProject.ts` - Fetch traces with metrics (optionally grouped by session_id)
- `getTraceConversation.ts` - Assemble conversation (expand to session if session_id exists)
- `evaluateQueueFilters.ts` - Find traces matching filter criteria
- `getAnnotationsByTrace.ts` - Get evaluation results for a trace

## 11. Implementation Phases

### Phase 0: Prerequisites (Schema Changes)
- [ ] **Make `documentUuid` nullable in `evaluationVersions`** (PostgreSQL migration)
- [ ] **Make `documentUuid` nullable in `issues`** (PostgreSQL migration)
- [ ] **Make `documentUuid` nullable in `issueHistograms`** (PostgreSQL migration)
- [ ] **Decide on `commitId` strategy** (see discussion in section 4.2) - may need to make nullable too

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
- [ ] Backoffice action to manually add traces to queues (by trace_id)
- [ ] Queue detail page (basic) - list items, show status
- [ ] **Goal**: Experience the annotation workflow without filters/traces page

### Phase 2: Annotation Interface
- [ ] Queue detail page with conversation display
  - [ ] Assemble conversation from trace spans
  - [ ] If trace has `session_id`, expand to show full session
- [ ] Annotation creation (global, message-level)
- [ ] Store annotations using existing `createEvaluationResultV2`
- [ ] Annotations sidebar UI
- [ ] Mark as completed functionality
- [ ] Navigation (previous/next)

### Phase 3: Project-Level Traces Page
- [ ] `/projects/[projectId]/traces` page
- [ ] Basic filters (cost, tokens, duration)
- [ ] Trace selection with checkbox
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
