# RFC: Annotation Queues

Status: Draft
Owners: Core Platform
Feature Flag: `annotationQueues`

> **Important**: This feature reads `spans` and `evaluation_results` exclusively from **ClickHouse**.
> PostgreSQL is only used for annotation queue metadata (queues, members, items).
> No changes to the PostgreSQL `evaluation_results_v2` table are required.

## 1. Problem Statement

Teams need a way to organize and distribute trace review work among team members. Currently, there's no structured way to:
- Group traces for review based on span attributes (tags, session IDs, user IDs, prompt paths)
- Assign traces to specific team members (annotators)
- Track annotation progress across a queue of traces
- Filter and automatically collect traces matching certain criteria

## 2. Goals

- Provide a project-level view of all spans with filtering across N dimensions
- Enable creation of annotation queues that target spans by attributes (tags, session_id, user_id, prompt_path, etc.)
- Support dynamic filtering to auto-populate queues with matching spans
- Allow detailed annotation of conversations (message-level, highlight-level, global)
- Track completion status of spans in queues
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
3. **Span attributes**: Users enrich spans with attributes:
   - `tags` - Custom labels for categorization
   - `session_id` - Groups related interactions
   - `user_id` - Identifies the end user
   - `prompt_path` - Creates a "prompt bucket" concept (works with or without prompt manager)

**Note on prompt_path**: Users can set `prompt_path` as a span attribute to create logical groupings even without enabling the prompt manager. This acts as a "bucket" to organize spans by prompt type (e.g., `/chat/support`, `/onboarding/welcome`).

### 4.2 Required Schema Change

**Current state**: `evaluationVersions.documentUuid` is NOT NULL, requiring all evaluations to be document-scoped.

**Required change for this RFC**: Make `documentUuid` NULLABLE in `evaluationVersions`. This allows:
- Project-level evaluations (documentUuid = NULL)
- Annotation queues to link to evaluations without document association

This is a **prerequisite task** for annotation queues to work.

### 4.2 Data Storage

**PostgreSQL** for annotation queue metadata:
- `annotation_queues` - queue definitions, filters, settings
- `annotation_queue_members` - annotator assignments
- `annotation_queue_items` - spans in queue with status

Rationale: Relational data with foreign keys, ACID transactions for status changes.

**ClickHouse** for span and annotation data (read + write):
- `spans` - span data with attributes (tags, session_id, user_id, prompt_path)
- `evaluation_results` - annotations stored as evaluation results

Rationale: High-volume analytics queries, existing evaluation infrastructure.

### 4.3 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Project-Level /traces Page                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Filters: Tags | SessionId | UserId | PromptPath | Cost | Tokens    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [ ] Span 1    │ Cost: $0.02  │ Tags: support │ User: u_123        │   │
│  │  [x] Span 2    │ Cost: $0.05  │ Tags: billing │ Session: s_456     │   │
│  │  [x] Span 3    │ Cost: $0.01  │ PromptPath: /chat/support          │   │
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
│  │  Description: [Review spans from support bot...]                     │   │
│  │  Annotators: [Alice] [Bob] [x] [+ Add member]                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Dynamic Filters (auto-add matching spans):                          │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ [PromptPath] [equals] [/chat/support]           [x Remove]  │    │   │
│  │  │ [Tags]       [contains] [billing]               [x Remove]  │    │   │
│  │  │ [Cost]       [less_than] [0.10]                 [x Remove]  │    │   │
│  │  │ [+ Add filter]                                              │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │  Sample Rate: [====|----] 25% of matching spans                     │   │
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
  name VARCHAR(256) NOT NULL,
  description TEXT,
  -- Inline evaluation config (no FK to evaluations_v2)
  evaluation_config JSONB NOT NULL DEFAULT '{"metric": "binary"}',
  filters JSONB,           -- Stored dynamic filters
  sample_rate INTEGER DEFAULT 100,  -- 0-100 percentage
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**evaluation_config schema:**
```typescript
type AnnotationQueueEvaluationConfig = {
  metric: 'binary' | 'rating'
  ratingScale?: number  // For rating: 1-5, 1-10, etc.
}
```

**Why inline config instead of FK to evaluations_v2?**
- `evaluationVersions` requires `documentUuid` and `commitId` - doesn't work for project-scoped queues
- Annotation queues have simpler evaluation needs (binary pass/fail or rating)
- Avoids complex migration to make evaluations document-optional

#### Evaluation Configuration

Annotation queues store their evaluation configuration inline (not via FK to `evaluations_v2`). This allows project-scoped annotation without document dependency.

**Why not link to evaluations_v2?**
- `evaluationVersions` requires `documentUuid` and `commitId`
- Annotation queues target traces/spans across the project, not specific documents
- Simpler model for human annotation use case

**Evaluation types supported:**
- **Binary** (pass/fail): Simple yes/no annotation
- **Rating** (1-N scale): Configurable scale (e.g., 1-5 stars)

**Issue generation:**
- Failed annotations (binary=fail, rating below threshold) generate **project-scoped issues**
- Issues are linked to the project, not a specific document

```
Project
  └── Annotation Queue: "Support QA"
        └── evaluation_config: { metric: "rating", ratingScale: 5 }
        └── Items (traces to review)
              └── Evaluation Results (annotations → project issues)
  └── prompts/ (optional - if prompt manager enabled)
        └── support-bot.promptl
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
  trace_id VARCHAR(64) NOT NULL,       -- Primary identifier (conversation)
  span_id VARCHAR(64),                 -- Optional: specific span within trace
  status VARCHAR(32) NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed
  completed_at TIMESTAMP,
  completed_by_membership_id BIGINT REFERENCES memberships(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(annotation_queue_id, trace_id)  -- One queue item per trace
);
```

**Note**: `trace_id` is the primary identifier since it represents the full conversation. `span_id` is optional for cases where we want to focus on a specific part of the trace.

### 5.2 Annotations as Evaluation Results

**Annotations are stored as evaluation results**, not a separate table. This integrates with the existing evaluation system:

- **Project-scoped issue generation** works automatically via `evaluationResultV2Created` event
- Analytics and reporting include annotation data
- Single source of truth for all evaluation/annotation data

#### How it works

1. **Annotation Queue → Project-Scoped Human Evaluation**: Each annotation queue is linked to a Human Evaluation that is project-scoped (not document-scoped)
2. **Annotation → Evaluation Result**: Each annotation creates an `evaluation_result_v2` record
3. **No Draft Versioning**: The linked evaluation follows a single branch of changes with warnings when editing

#### Annotation Target Hierarchy

**Traces vs Spans**:
- A **trace** (`trace_id`) groups all spans in a conversation/session - it's a virtual grouping, not a physical record
- A **span** (`span_id`) is one operation in the trace (prompt, completion, tool call, step, etc.)
- **Completion spans** contain the actual conversation messages in their metadata

Annotations target a **trace** (to capture full conversation context) but reference specific messages within **completion spans**:

```
Trace (trace_id) - virtual grouping of spans
  └── Prompt Span (span_id, type=prompt)
        └── Completion Span (span_id, type=completion)
              └── metadata.input/output = conversation messages
                    └── Message (message_index within completion)
                          └── Annotation (evaluation_result)
                          └── Highlight (start_offset, end_offset)
                                └── Annotation (evaluation_result)
  └── Global Annotation (trace-level, no specific message)
        └── Evaluation Result
```

**Why trace-level targeting?**
- Traces represent the full user interaction
- A trace can have multiple completion spans (multi-turn, tool calls)
- Annotations should capture the full context, not just one span

**Queue items reference**:
- `trace_id` (required) - identifies the conversation
- `span_id` (optional) - can filter to specific spans within trace

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

Filters are stored as JSONB in `annotation_queues.filters`. The filter schema supports **N-dimensional targeting** across span attributes, matching the evaluation system's capabilities.

```typescript
// Primary dimensions for targeting (span attributes)
type DimensionProperty =
  | 'tags'           // Custom labels (array)
  | 'sessionId'      // Groups related interactions
  | 'userId'         // End user identifier
  | 'promptPath'     // Links to prompt manager (if enabled)

// Additional filter properties
type MetricProperty =
  | 'cost'
  | 'tokens'
  | 'duration'       // Span duration in ms

type IdentifierProperty =
  | 'traceId'
  | 'spanId'

type StringComparator = 'equals' | 'contains' | 'does_not_contain'
type ArrayComparator = 'contains' | 'contains_all' | 'contains_any'
type NumberComparator = 'equals' | 'not_equals' | 'less_than' | 'less_than_or_equal' | 'greater_than' | 'greater_than_or_equal' | 'between'

type Filter =
  // Dimension filters (N-dimensional targeting)
  | { property: 'tags'; comparator: ArrayComparator; value: string[] }
  | { property: 'sessionId' | 'userId' | 'promptPath'; comparator: StringComparator; value: string }
  // Metric filters
  | { property: 'cost' | 'tokens' | 'duration'; comparator: NumberComparator; value: number | { min: number; max: number } }
  // Identifier filters
  | { property: 'traceId' | 'spanId'; comparator: StringComparator; value: string }

type FiltersConfig = {
  filters: Filter[]
  sampleRate: number  // 0-100
}
```

Example stored filters (targeting support spans from a specific user):

```json
{
  "filters": [
    { "property": "tags", "comparator": "contains_any", "value": ["support", "billing"] },
    { "property": "userId", "comparator": "equals", "value": "u_12345" },
    { "property": "promptPath", "comparator": "contains", "value": "/chat/" },
    { "property": "cost", "comparator": "less_than", "value": 0.10 }
  ],
  "sampleRate": 25
}
```

### 5.4 URL Query String Representation

Filters translate to URL query parameters for shareable links and browser navigation:

```
# Single filter
/projects/123/traces?tags=support,billing&tags_op=contains_any

# Multiple filters
/projects/123/traces?userId=u_12345&userId_op=eq&promptPath=/chat/&promptPath_op=contains&cost=0.10&cost_op=lt

# Range filter (between)
/projects/123/traces?tokens_min=100&tokens_max=5000
```

**Query Parameter Schema:**

| Filter Type | URL Format | Example |
|-------------|-----------|---------|
| String equals | `{prop}={value}&{prop}_op=eq` | `userId=u_123&userId_op=eq` |
| String contains | `{prop}={value}&{prop}_op=contains` | `promptPath=/chat/&promptPath_op=contains` |
| Array contains_any | `{prop}={csv}&{prop}_op=contains_any` | `tags=support,billing&tags_op=contains_any` |
| Number less_than | `{prop}={value}&{prop}_op=lt` | `cost=0.10&cost_op=lt` |
| Number between | `{prop}_min={min}&{prop}_max={max}` | `tokens_min=100&tokens_max=5000` |

**Operator abbreviations**: `eq`, `neq`, `contains`, `not_contains`, `contains_any`, `contains_all`, `lt`, `lte`, `gt`, `gte`

## 6. UI Components

### 6.1 Project-Level Traces Page (`/projects/[projectId]/traces`)

A new project-level page showing all spans across the project with N-dimensional filtering.

**Features:**
- Filter bar supporting all dimension and metric filters
- Checkbox selection for spans
- Floating action bar when spans selected → "Add to Annotation Queue"
- Pagination with keyset cursor

**Filters (N-Dimensional Targeting):**

| Property | Type | Comparators | UI Component |
|----------|------|-------------|--------------|
| **Dimensions** | | | |
| Tags | string[] | contains, contains_all, contains_any | Multi-select / Tag input |
| Session ID | string | equals, contains, does_not_contain | Text input / Dropdown |
| User ID | string | equals, contains, does_not_contain | Text input / Dropdown |
| Prompt Path | string | equals, contains, does_not_contain | Text input / Autocomplete |
| **Metrics** | | | |
| Cost | number | equals, less_than, greater_than, between | Number input / Range slider |
| Tokens | number | equals, less_than, greater_than, between | Number input / Range slider |
| Duration | number | equals, less_than, greater_than, between | Number input / Range slider |
| **Identifiers** | | | |
| Trace ID | string | equals, contains, does_not_contain | Text input |
| Span ID | string | equals, contains, does_not_contain | Text input |

**Note**: If the prompt manager is enabled, users can use `promptPath` to correlate spans to prompts via the `prompt_path` span attribute.

### 6.2 Annotation Queues List Page (`/projects/[projectId]/annotation-queues`)

Lists all annotation queues for the project.

**Columns:**
- Name
- Description (truncated)
- Annotators (avatar stack)
- Active Filters (dimension badges: tags, session, user, prompt path)
- Progress (pending / in_progress / completed counts)
- Created date
- Actions (Edit, Delete)

**Edit Behavior**: Editing a running queue shows a warning that changes will affect future span matching but not existing items.

### 6.3 Annotation Queue Detail Page (`/projects/[projectId]/annotation-queues/[uuid]`)

The main annotation interface with a split-pane layout:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Queue: Customer Support Reviews                    Progress: 12/50 (24%)   │
│  Filters: [tags:support] [userId:u_123] [promptPath:/chat/*]                │
├───────────────────────────────────────────┬─────────────────────────────────┤
│                                           │                                 │
│  ┌─────────────────────────────────────┐  │  Annotations                    │
│  │ User: How do I reset my password?   │  │  ─────────────────────────────  │
│  └─────────────────────────────────────┘  │                                 │
│                                           │  📌 Global Annotation           │
│  ┌─────────────────────────────────────┐  │  "Overall good response but..." │
│  │ Assistant: To reset your password,  │  │  → Creates project issue        │
│  │ please follow these steps:          │  │  [Edit] [Delete]                │
│  │ 1. Go to Settings > Account         │◄─┼── 📍 Message #2                 │
│  │ 2. Click "Reset Password"           │  │  "Step 2 is incorrect for..."   │
│  │ 3. Enter your email...              │  │  [Edit] [Delete]                │
│  └─────────────────────────────────────┘  │                                 │
│                                           │  📍 Highlight: "Reset Password" │
│  ┌─────────────────────────────────────┐  │  "This button was renamed..."   │
│  │ User: Thanks, that worked!          │  │  [Edit] [Delete]                │
│  └─────────────────────────────────────┘  │                                 │
│                                           │  [+ Add Global Annotation]      │
│                                           │                                 │
├───────────────────────────────────────────┴─────────────────────────────────┤
│  [← Previous]  Span 5 of 50  [Next →]               [Mark as Completed ✓]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Features:**

1. **Span Context Header**
   - Shows active dimension filters as badges
   - Displays span attributes (tags, session_id, user_id, prompt_path)

2. **Conversation Display (Left Pane)**
   - Full conversation thread with all messages
   - Clickable messages to add message-level annotations
   - Text selection to create highlight annotations
   - Visual indicators for annotated messages/highlights

3. **Annotations Sidebar (Right Pane)**
   - Lists all annotations for current span
   - Three types of annotations:
     - **Global**: Span-level annotation (form shown directly)
     - **Message**: Linked to specific message index (click scrolls to message)
     - **Highlight**: Linked to text selection within a message (click scrolls and highlights)
   - **N annotations per target**: Each message, highlight, or global level can have unlimited annotations
   - Different annotators can add their own annotations to the same message
   - Edit/Delete actions per annotation (only own annotations or admin)
   - **Issue indicator**: Shows when an annotation has generated a project-scoped issue

4. **Navigation**
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
   - Dynamic filters builder (N-dimensional targeting)
   - Sample rate slider (0-100%)

**Filter Builder UI:**
- Dimension filters shown as grouped sections
- Autocomplete for known values (existing tags, session IDs, user IDs, prompt paths)
- Preview of matching span count
- Warning when editing existing queue: "Changes will affect future span matching"

## 7. Dynamic Filters (N-Dimensional Targeting)

### 7.1 How Dynamic Filters Work

Annotation queues use the same N-dimensional targeting as evaluations:

1. **Initial Population**: Spans matching filters are added when queue is created
2. **Continuous Population**: A background job monitors new spans via `spanCreated` event
3. **Sample Rate**: Only `sampleRate`% of matching spans are added
4. **Deduplication**: Spans already in queue are not re-added

### 7.2 Filter Evaluation

Filters are evaluated against ClickHouse spans data using dimension attributes:

```sql
SELECT DISTINCT trace_id, span_id
FROM spans
WHERE workspace_id = {workspaceId}
  AND project_id = {projectId}
  -- String filters (indexed)
  AND session_id = {sessionId}             -- session filter
  AND user_id = {userId}                   -- user filter
  AND prompt_path LIKE {promptPathPattern} -- prompt path filter
  -- Metric filters
  AND cost < {maxCost}
  AND total_tokens BETWEEN {minTokens} AND {maxTokens}
ORDER BY started_at DESC
LIMIT {limit}
```

### 7.3 ClickHouse Array Filtering (Tags)

**Note**: The current ClickHouse `spans` table does NOT have a `tags` column. This would need to be added via migration.

ClickHouse supports efficient array operations:

```sql
-- Array column definition
tags Array(String)

-- Contains any (OR): hasAny()
WHERE hasAny(tags, ['support', 'billing'])

-- Contains all (AND): hasAll()
WHERE hasAll(tags, ['support', 'billing'])

-- Single tag: has()
WHERE has(tags, 'support')
```

**Performance considerations**:
- `hasAny()` and `hasAll()` are O(n*m) where n=array size, m=filter size
- For small arrays (typical: 1-10 tags), performance is excellent
- Add bloom filter index for large-scale filtering:
  ```sql
  INDEX idx_tags tags TYPE bloom_filter(0.01) GRANULARITY 1
  ```
- Alternative: use `arrayExists()` with lambda for complex predicates

**Recommendation**: Start without tags filtering in Phase 1. Add `tags` column to spans table in a later phase when the use case is validated.

### 7.4 Sample Rate Implementation

```typescript
function shouldIncludeTrace(sampleRate: number): boolean {
  return Math.random() * 100 < sampleRate
}
```

Note: Random sampling is sufficient since we only evaluate new traces once and the unique constraint `(annotation_queue_id, trace_id)` prevents duplicates.

### 7.5 Consistency with Evaluations (Future)

The filter schema and evaluation logic mirrors how evaluations target spans:
- Same dimension properties (tags, session_id, user_id, prompt_path)
- Same comparators and value types
- Same ClickHouse query patterns

This ensures users have a consistent mental model across evaluations and annotation queues.

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

- `create.ts` - Create queue with name, description, members, evaluation config
- `update.ts` - Update queue metadata, members, filters
- `destroy.ts` - Delete queue and all items (annotations preserved in ClickHouse)
- `addTraces.ts` - Manually add traces to queue (by trace_id)
- `updateItemStatus.ts` - Mark item as pending/in_progress/completed
- `evaluateFilters.ts` - Check if trace matches queue filters

### 9.2 Evaluation Linking to Annotation Queues

**Current architecture challenge**: `evaluationVersions` requires `documentUuid` and `commitId`. This doesn't work for project-wide annotation queues that target spans without document association.

**Proposed solution**: Create a new `annotation_queue_evaluations` approach that bypasses document-scoped evaluations:

```typescript
// Option A: Store evaluation config directly in annotation_queue
type AnnotationQueueEvaluationConfig = {
  metric: 'binary' | 'rating'  // Human evaluation metric
  ratingScale?: number         // For rating metric (e.g., 5)
  labels?: string[]            // Optional custom labels
}

// annotation_queues table includes:
evaluation_config JSONB  // Instead of evaluation_id FK
```

```typescript
// Option B: Create project-scoped evaluations (new table)
CREATE TABLE annotation_queue_evaluations (
  id BIGSERIAL PRIMARY KEY,
  annotation_queue_id BIGINT REFERENCES annotation_queues(id),
  workspace_id BIGINT REFERENCES workspaces(id),
  project_id BIGINT REFERENCES projects(id),
  -- No documentUuid, no commitId
  metric VARCHAR(128) NOT NULL,  -- 'binary' | 'rating'
  configuration JSONB NOT NULL,
  ...timestamps()
);
```

**Recommendation**: Option A is simpler for MVP. Store evaluation config inline with the queue. We can always migrate to Option B later if we need more flexibility.

### 9.3 Annotation Services

Annotations create evaluation results directly in ClickHouse:

```typescript
// Creating an annotation in a queue
await createAnnotationResult({
  workspace,
  project,
  annotationQueue: queue,
  traceId: queueItem.traceId,
  spanId: completionSpan.id,  // The completion span with messages
  score: resultScore,
  metadata: {
    reason: 'User annotation content here',
    annotationQueueId: queue.id,
    annotationQueueItemId: queueItem.id,
    targetType: 'message',
    targetMessageIndex: 2,
  },
})
```

This automatically:
- Creates an `evaluation_result` record in ClickHouse
- Publishes `annotationCreated` event (new event type)
- Triggers **project-scoped issue** discovery if the annotation indicates a problem

### 9.4 Background Jobs

- `populateQueueJob.ts` - Process dynamic filters for new traces
- Triggered by `spanCreated` event (for main span types)
- Checks all queues with filters for the workspace/project
- Evaluates trace against filter criteria
- Adds matching traces respecting sample rate

## 10. Queries

### 10.1 PostgreSQL Queries (`packages/core/src/queries/annotationQueues/`)

- `findByProject.ts` - List queues for a project with stats
- `findByUuid.ts` - Get single queue with members
- `findItems.ts` - Get queue items (traces) with pagination
- `findNextItem.ts` - Get next pending item (for keyboard navigation)
- `getProgress.ts` - Get queue completion statistics
- `findAnnotationsByQueueItem.ts` - Get annotations for a queue item

### 10.2 ClickHouse Queries

- `getTracesByProject.ts` - Fetch traces by project_id with filters
- `getTraceDetails.ts` - Fetch full trace with all spans and messages
- `evaluateQueueFilters.ts` - Find traces matching filter criteria
- `getAnnotationsByQueue.ts` - Get evaluation results for a queue

## 11. Implementation Phases

### Phase 1a: PostgreSQL Schema
- [ ] Feature flag setup (`annotationQueues`)
- [ ] PostgreSQL migrations:
  - [ ] `annotation_queues` table
  - [ ] `annotation_queue_members` table
  - [ ] `annotation_queue_items` table
- [ ] Core services (CRUD for queues, items, members)
- [ ] PostgreSQL queries for queue management

### Phase 1b: Manual Queue Management (Backoffice)
- [ ] Backoffice page to list annotation queues
- [ ] Backoffice page to create/edit annotation queues
- [ ] Backoffice action to manually add traces to queues (by trace_id)
- [ ] Queue detail page (basic) - list items, show status
- [ ] **Goal**: Experience the annotation workflow without filters/traces page

### Phase 2: Annotation Interface
- [ ] Queue detail page with conversation display
- [ ] Annotation creation (global, message-level)
- [ ] ClickHouse: Add `annotation_queue_id` column to `evaluation_results`
- [ ] Store annotations as evaluation results
- [ ] Annotations sidebar UI
- [ ] Mark as completed functionality
- [ ] Navigation (previous/next)

### Phase 3: Project-Level Traces Page
- [ ] `/projects/[projectId]/traces` page
- [ ] Basic filters (trace_id, cost, tokens, duration)
- [ ] Trace selection with checkbox
- [ ] "Add to Annotation Queue" modal
- [ ] Pagination

### Phase 4: Dynamic Filters
- [ ] Filter builder UI component
- [ ] Filter storage in queue (JSONB)
- [ ] Filter evaluation logic against ClickHouse
- [ ] Sample rate implementation
- [ ] Background job for auto-population via `spanCreated` event

### Phase 5: ClickHouse Schema (Optional)
- [ ] Add dimension columns to `spans` table:
  - [ ] `tags Array(String)`
  - [ ] `session_id String`
  - [ ] `user_id String`
  - [ ] `prompt_path String`
- [ ] Add indexes for dimension filtering
- [ ] Update span ingestion to populate new columns
- [ ] N-dimensional filter support in traces page

### Phase 6: Polish
- [ ] Keyboard navigation (←/→)
- [ ] Highlight annotations (text selection)
- [ ] Progress tracking UI
- [ ] Queue statistics
- [ ] Performance optimization

## 12. Open Questions

1. **Evaluation Metric for Annotations**: ✅ **Resolved** - Binary by default, configurable per queue.
   
   **How evaluations are created**: The evaluation config is stored inline in `annotation_queues.evaluation_config` (JSONB), not as a separate evaluation record. When creating an annotation queue:
   ```typescript
   await createAnnotationQueue({
     name: 'Support QA',
     projectId: project.id,
     evaluationConfig: { metric: 'binary' },  // or { metric: 'rating', ratingScale: 5 }
     // ...
   })
   ```
   Annotations are stored in ClickHouse `evaluation_results` with `annotation_queue_id` to link them back.

2. **Concurrent Annotation**: ✅ **Resolved** - Not a priority for initial implementation.

3. **Annotation Queue Deletion**: When a queue is deleted, what happens to evaluation results? Options:
   - Keep evaluation results (orphaned but queryable via `annotation_queue_id`)
   - Soft-delete queue (preserve history, hide from UI)
   - Hard-delete all (clean but loses data)

4. **Cross-Project Queues**: Should annotation queues be project-scoped only, or workspace-level?

5. **Dimension Columns in ClickHouse**: Should we add `tags`, `session_id`, `user_id`, `prompt_path` columns to the `spans` table? Current spans table doesn't have these. Options:
   - Add columns via migration (Phase 5)
   - Extract from existing `metadata` JSON
   - Start without dimension filtering, add later

## 13. Prompt Manager Integration

When users have the prompt manager enabled, annotation queues gain additional capabilities:

### Prompt Path Correlation

The `prompt_path` span attribute links telemetry spans to managed prompts:

```typescript
// SDK automatically sets prompt_path when running managed prompts
latitude.run('chat/support', { userMessage: '...' })
// → span.attributes.prompt_path = '/chat/support'
```

### Annotation Queue Filters with Prompt Path

```json
{
  "filters": [
    { "property": "promptPath", "comparator": "equals", "value": "/chat/support" }
  ]
}
```

This enables:
- **Prompt-specific annotation workflows**: Review all spans from a specific prompt
- **Cross-prompt analysis**: Compare annotation quality across different prompts
- **Version tracking**: Filter by prompt version via additional span attributes

### Without Prompt Manager

Users using only telemetry (SDK without prompt manager) can still use annotation queues effectively:
- Filter by `tags`, `session_id`, `user_id`, and other span attributes
- All annotation features work identically
- Issues are project-scoped regardless of prompt manager usage

## 14. Future Considerations

- Export annotations for training data
- Annotation templates/presets
- Inter-annotator agreement metrics
- Bulk annotation operations
- Annotation search and filtering by dimension
- Dimension-based analytics (e.g., annotation quality by user_id, session patterns)
- Prompt-specific annotation workflows when prompt manager is enabled
- Automated annotation suggestions based on similar spans
