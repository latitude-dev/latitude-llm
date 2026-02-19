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
   - `prompt_path` - Links to prompt manager (if enabled)
4. **N-dimensional targeting**: Both evaluations and annotation queues target spans across these dimensions

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
  evaluation_id BIGINT NOT NULL REFERENCES evaluations_v2(id) ON DELETE CASCADE,
  name VARCHAR(256) NOT NULL,
  description TEXT,
  filters JSONB,           -- Stored dynamic filters (N-dimensional targeting)
  sample_rate INTEGER DEFAULT 100,  -- 0-100 percentage
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Evaluation Linking

Annotation queues link to project-scoped evaluations. Unlike document-scoped evaluations in the prompt manager, annotation queue evaluations:

- Are **project-scoped**: Target spans across the entire project, not tied to a specific document
- Use **Human Evaluation** type: Annotations are human-provided scores/feedback
- Have **no draft versioning**: Single branch of changes with warnings when editing a running evaluation
- Generate **project-scoped issues**: Annotations that indicate problems create issues at the project level

```
Project
  └── Annotation Queue: "Support QA"
        └── Human Evaluation (project-scoped)
              └── Evaluation Results (annotations → project issues)
  └── prompts/ (optional - if prompt manager enabled)
        └── support-bot.promptl
        └── sales-assistant.promptl
```

This design ensures annotation queues work for:
- Spans from SDK/API telemetry (no prompt manager)
- Spans with `prompt_path` attribute (prompt manager enabled)
- Mixed spans across multiple sources

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
  span_id VARCHAR(64) NOT NULL,  -- References span in ClickHouse
  trace_id VARCHAR(64) NOT NULL, -- For grouping related spans
  status VARCHAR(32) NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed
  completed_at TIMESTAMP,
  completed_by_membership_id BIGINT REFERENCES memberships(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(annotation_queue_id, span_id)
);
```

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

Each message in a span can have **N annotations** (no limit):

```
Span (span_id, with attributes: tags, session_id, user_id, prompt_path)
  └── Message (message_index within span)
        └── Evaluation Result (annotation 1) → Project Issue
        └── Evaluation Result (annotation 2)
        └── ... N evaluation results
        └── Highlight Annotation (start_offset, end_offset)
              └── ... N evaluation results per selection
  └── Global Annotation (no specific target)
        └── ... N evaluation results per span
```

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

This filter schema mirrors how evaluations target spans, ensuring consistency across the platform.

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
SELECT span_id, trace_id
FROM spans
WHERE workspace_id = {workspaceId}
  AND project_id = {projectId}
  -- Dimension filters (N-dimensional targeting)
  AND hasAny(tags, {filterTags})           -- tags filter
  AND session_id = {sessionId}             -- session filter
  AND user_id = {userId}                   -- user filter
  AND prompt_path LIKE {promptPathPattern} -- prompt path filter (if prompt manager enabled)
  -- Metric filters
  AND cost < {maxCost}
  AND total_tokens BETWEEN {minTokens} AND {maxTokens}
ORDER BY started_at DESC
LIMIT {limit}
```

### 7.3 Sample Rate Implementation

```typescript
function shouldIncludeSpan(sampleRate: number): boolean {
  return Math.random() * 100 < sampleRate
}
```

Note: Random sampling is sufficient since we only evaluate new spans once and the unique constraint `(annotation_queue_id, span_id)` prevents duplicates.

### 7.4 Consistency with Evaluations

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

- `create.ts` - Create queue with name, description, members, filters + creates linked project-scoped Human Evaluation
- `update.ts` - Update queue metadata, members, filters (with warnings for running queues)
- `destroy.ts` - Delete queue and all items (evaluation results preserved)
- `addSpans.ts` - Manually add spans to queue
- `updateItemStatus.ts` - Mark span as completed/in_progress
- `evaluateFilters.ts` - Check if span matches queue filters (N-dimensional)

### 9.2 Annotation Services

Annotations use the existing evaluation system via `annotateEvaluationV2`:

```typescript
// Creating an annotation in a queue
await annotateEvaluationV2({
  workspace,
  project,      // Project-scoped (no commit/document)
  evaluation,   // The project-scoped Human Evaluation linked to the queue
  span,
  resultScore,
  resultMetadata: {
    reason: 'User annotation content here',
    annotationQueueId: queue.id,
    annotationQueueItemId: queueItem.id,
    targetType: 'message',
    targetSpanId: span.id,
    targetMessageIndex: 2,
  },
})
```

This automatically:
- Creates an `evaluation_result_v2` record
- Publishes `evaluationResultV2Created` event
- Triggers **project-scoped issue** discovery if the annotation indicates a problem

### 9.3 Background Jobs

- `populateQueueJob.ts` - Process dynamic filters for new spans
- Triggered by `spanCreated` event
- Checks all queues with filters for the workspace/project
- Evaluates span attributes against N-dimensional filters
- Adds matching spans respecting sample rate

## 10. Queries

### 10.1 PostgreSQL Queries (`packages/core/src/queries/annotationQueues/`)

- `findByProject.ts` - List queues for a project with stats and active filter badges
- `findByUuid.ts` - Get single queue with members and linked evaluation
- `findItems.ts` - Get spans in a queue with pagination
- `findNextItem.ts` - Get next pending span (for keyboard navigation)
- `getProgress.ts` - Get queue completion statistics
- `findAnnotationsByQueueItem.ts` - Get evaluation results with annotation queue metadata

### 10.2 ClickHouse Queries (`packages/core/src/queries/clickhouse/`)

- `getSpansByProject.ts` - Fetch spans by project_id with N-dimensional filters
- `getSpansByIds.ts` - Fetch span details for queue items
- `evaluateQueueFilters.ts` - Find spans matching N-dimensional filter criteria
- `getFilterAutocomplete.ts` - Get known values for dimension autocomplete (tags, session_ids, user_ids, prompt_paths)

## 11. Implementation Phases

### Phase 1: Foundation
- [ ] Database schema + migrations (PostgreSQL tables)
- [ ] Feature flag setup
- [ ] Project-scoped evaluation support (no document dependency)
- [ ] Core services (CRUD for queues, items)
- [ ] PostgreSQL queries
- [ ] ClickHouse query for project-level spans with dimension attributes

### Phase 2: Basic UI
- [ ] Project-level `/traces` page with N-dimensional filters
- [ ] Span selection with floating action bar
- [ ] Basic modal (create queue, add spans)
- [ ] Annotation queues list page with filter badges
- [ ] Queue detail page (basic)

### Phase 3: Annotations
- [ ] Extend `EvaluationResultMetadata` type for annotation queue fields
- [ ] Create project-scoped evaluation on queue creation
- [ ] Annotation creation via `annotateEvaluationV2` with extended metadata
- [ ] Query annotations by queue item from evaluation results
- [ ] Annotations sidebar UI (global, message, highlight)
- [ ] Project-scoped issue generation from annotations

### Phase 4: Dynamic Filters (N-Dimensional)
- [ ] Filter builder UI component with dimension sections
- [ ] Autocomplete for known dimension values
- [ ] Filter storage in queue
- [ ] N-dimensional filter evaluation logic
- [ ] Sample rate implementation
- [ ] Background job for auto-population via `spanCreated` event
- [ ] Edit warnings for running queues

### Phase 5: Polish
- [ ] Keyboard navigation (←/→)
- [ ] Progress tracking UI
- [ ] Queue statistics by dimension
- [ ] Performance optimization
- [ ] Prompt manager correlation via `prompt_path` attribute

## 12. Open Questions

1. **Evaluation Metric for Annotations**: Should annotation queues use Binary (pass/fail) or Rating (1-5 scale) human evaluation metric? Or allow configuration per queue?
   Binary by default. Question for you how are this evaluation created?

2. **Concurrent Annotation**: Multiple annotators can add their own annotations to the same message (N annotations per target). Should we show real-time updates when another annotator adds an annotation?
   Not a priority for initial implementation. Can be added later if needed.

3. **Annotation Queue Evaluation Lifecycle**: When a queue is deleted, what happens to its linked evaluation and evaluation results? Options:
   - Keep evaluation results (orphaned but queryable)
   - Soft-delete evaluation (preserve history)
   - Hard-delete all (clean but loses data)

4. **Cross-Project Queues**: Should annotation queues be project-scoped only, or should there be workspace-level queues that span multiple projects?

5. **Dimension Value Discovery**: How should we populate autocomplete for dimension values (tags, session_ids, user_ids, prompt_paths)? Options:
   - Query ClickHouse for distinct values (performance considerations)
   - Cache common values
   - Allow freeform input with validation

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
