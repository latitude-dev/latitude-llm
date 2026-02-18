# RFC: Annotation Queues

Status: Draft
Owners: Core Platform
Feature Flag: `annotationQueues`

## 1. Problem Statement

Teams need a way to organize and distribute trace review work among team members. Currently, there's no structured way to:
- Group traces for review
- Assign traces to specific team members (annotators)
- Track annotation progress across a queue of traces
- Filter and automatically collect traces matching certain criteria

## 2. Goals

- Provide a project-level view of all traces across all documents and versions
- Enable creation of annotation queues with assigned team members
- Support dynamic filtering to auto-populate queues with matching traces
- Allow detailed annotation of conversations (message-level, highlight-level, global)
- Track completion status of traces in queues

## 3. Non-Goals

- Integration with existing evaluation/annotation system (this is independent)
- Real-time collaborative annotation (single annotator per trace at a time)
- Automated annotation suggestions (future phase)

## 4. Architecture Overview

### 4.1 Data Storage

PostgreSQL for all annotation queue data (not ClickHouse) because:
- Relational data with foreign keys (queues → members, queues → items)
- Low write volume (queue management, status updates)
- ACID transactions needed for status changes
- ClickHouse is for analytics, not transactional workflows

### 4.2 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Project-Level /traces Page                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Filters: Version | Prompt | TraceId | Experiment | Cost | Tokens   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [ ] Trace 1    │ Cost: $0.02  │ Tokens: 1.2k │ Version: main      │   │
│  │  [x] Trace 2    │ Cost: $0.05  │ Tokens: 3.1k │ Version: main      │   │
│  │  [x] Trace 3    │ Cost: $0.01  │ Tokens: 0.8k │ Version: feature-x │   │
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
│  │  Description: [Review traces from support bot...]                    │   │
│  │  Annotators: [Alice] [Bob] [x] [+ Add member]                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Dynamic Filters (auto-add matching traces):                         │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ [Prompt] [equals] [support-bot-v2]              [x Remove]  │    │   │
│  │  │ [Cost]   [less_than] [0.10]                     [x Remove]  │    │   │
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

#### `annotation_queue_items`

```sql
CREATE TABLE annotation_queue_items (
  id BIGSERIAL PRIMARY KEY,
  annotation_queue_id BIGINT NOT NULL REFERENCES annotation_queues(id) ON DELETE CASCADE,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trace_id VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed
  completed_at TIMESTAMP,
  completed_by_membership_id BIGINT REFERENCES memberships(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(annotation_queue_id, trace_id)
);
```

#### `trace_annotations`

Each message in a trace can have **N annotations** (no limit). The annotation target hierarchy is:

```
Trace (trace_id)
  └── Span (span_id) 
        └── Message (message_index within span)
              └── Annotation 1
              └── Annotation 2
              └── ... N annotations
              └── Highlight Annotation (start_offset, end_offset)
                    └── ... N highlight annotations per selection
  └── Global Annotation (no specific target)
        └── ... N global annotations per trace
```

```sql
CREATE TABLE trace_annotations (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  annotation_queue_item_id BIGINT NOT NULL REFERENCES annotation_queue_items(id) ON DELETE CASCADE,
  created_by_membership_id BIGINT NOT NULL REFERENCES memberships(id) ON DELETE SET NULL,
  
  -- Annotation target (one of these patterns)
  target_type VARCHAR(32) NOT NULL,  -- 'global' | 'message' | 'highlight'
  target_span_id VARCHAR(16),        -- For message/highlight annotations (references span in ClickHouse)
  target_message_index INTEGER,      -- Index within the span's messages array
  target_start_offset INTEGER,       -- For highlight annotations (character offset)
  target_end_offset INTEGER,         -- For highlight annotations (character offset)
  
  -- Annotation content
  content TEXT NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- No unique constraint on (queue_item_id, span_id, message_index) - allows N annotations per message
-- Index for efficient lookups
CREATE INDEX idx_trace_annotations_target ON trace_annotations(annotation_queue_item_id, target_type, target_span_id, target_message_index);
```

### 5.2 Filter Schema (JSONB)

Filters are stored as JSONB in `annotation_queues.filters`:

```typescript
type FilterProperty =
  | 'commitUuid'       // Version ID
  | 'documentUuid'     // Prompt UUID
  | 'traceId'
  | 'experimentUuid'
  | 'cost'
  | 'tokens'
  | 'spanId'           // Event ID

type StringComparator = 'equals' | 'contains' | 'does_not_contain'
type NumberComparator = 'equals' | 'not_equals' | 'less_than' | 'less_than_or_equal' | 'greater_than' | 'greater_than_or_equal' | 'between'

type Filter = 
  | { property: 'commitUuid' | 'documentUuid' | 'traceId' | 'experimentUuid' | 'spanId'
      comparator: StringComparator
      value: string }
  | { property: 'cost' | 'tokens'
      comparator: NumberComparator
      value: number | { min: number, max: number } }  // 'between' uses {min, max}

type FiltersConfig = {
  filters: Filter[]
  sampleRate: number  // 0-100
}
```

Example stored filters:

```json
{
  "filters": [
    { "property": "documentUuid", "comparator": "equals", "value": "abc-123" },
    { "property": "cost", "comparator": "less_than", "value": 0.10 },
    { "property": "tokens", "comparator": "between", "value": { "min": 100, "max": 5000 } }
  ],
  "sampleRate": 25
}
```

## 6. UI Components

### 6.1 Project-Level Traces Page (`/projects/[projectId]/traces`)

A new project-level page showing all traces across all documents and versions.

**Features:**
- Filter bar with all filter properties
- Checkbox selection for traces
- Floating action bar when traces selected → "Add to Annotation Queue"
- Pagination with keyset cursor

**Filters (Properties):**

| Property | Type | Comparators | UI Component |
|----------|------|-------------|--------------|
| Version ID (`commitUuid`) | string | equals, contains, does_not_contain | Text input / Dropdown |
| Prompt UUID (`documentUuid`) | string | equals, contains, does_not_contain | Text input / Dropdown |
| Trace ID (`traceId`) | string | equals, contains, does_not_contain | Text input |
| Experiment UUID (`experimentUuid`) | string | equals, contains, does_not_contain | Text input / Dropdown |
| Cost | number | equals, less_than, greater_than, between | Number input / Range slider |
| Tokens | number | equals, less_than, greater_than, between | Number input / Range slider |
| Event ID (`spanId`) | string | equals, contains, does_not_contain | Text input |

### 6.2 Annotation Queues List Page (`/projects/[projectId]/annotation-queues`)

Lists all annotation queues for the project.

**Columns:**
- Name
- Description (truncated)
- Annotators (avatar stack)
- Progress (pending / in_progress / completed counts)
- Created date
- Actions (Edit, Delete)

### 6.3 Annotation Queue Detail Page (`/projects/[projectId]/annotation-queues/[uuid]`)

The main annotation interface with a split-pane layout:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Queue: Customer Support Reviews                    Progress: 12/50 (24%)   │
├───────────────────────────────────────────┬─────────────────────────────────┤
│                                           │                                 │
│  ┌─────────────────────────────────────┐  │  Annotations                    │
│  │ User: How do I reset my password?   │  │  ─────────────────────────────  │
│  └─────────────────────────────────────┘  │                                 │
│                                           │  📌 Global Annotation           │
│  ┌─────────────────────────────────────┐  │  "Overall good response but..." │
│  │ Assistant: To reset your password,  │  │  [Edit] [Delete]                │
│  │ please follow these steps:          │  │                                 │
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
│  [← Previous]  Trace 5 of 50  [Next →]              [Mark as Completed ✓]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Features:**

1. **Conversation Display (Left Pane)**
   - Full conversation thread with all messages
   - Clickable messages to add message-level annotations
   - Text selection to create highlight annotations
   - Visual indicators for annotated messages/highlights

2. **Annotations Sidebar (Right Pane)**
   - Lists all annotations for current trace
   - Three types of annotations:
     - **Global**: Conversation-level annotation (form shown directly)
     - **Message**: Linked to specific span + message index (click scrolls to message)
     - **Highlight**: Linked to text selection within a message (click scrolls and highlights)
   - **N annotations per target**: Each message, highlight, or global level can have unlimited annotations
   - Different annotators can add their own annotations to the same message
   - Edit/Delete actions per annotation (only own annotations or admin)

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
   - Dynamic filters builder
   - Sample rate slider (0-100%)

## 7. Dynamic Filters

### 7.1 How Dynamic Filters Work

When a queue has filters configured:

1. **Initial Population**: Traces matching filters are added when queue is created
2. **Continuous Population**: A background job monitors new traces
3. **Sample Rate**: Only `sampleRate`% of matching traces are added
4. **Deduplication**: Traces already in queue are not re-added

### 7.2 Filter Evaluation

Filters are evaluated against ClickHouse spans data:

```sql
SELECT DISTINCT trace_id
FROM spans
WHERE workspace_id = {workspaceId}
  AND project_id = {projectId}
  -- Dynamic filter conditions built from stored filters
  AND document_uuid = {documentUuid}  -- if filter exists
  AND cost < {maxCost}                -- if filter exists
  -- etc.
ORDER BY started_at DESC
LIMIT {limit}
```

### 7.3 Sample Rate Implementation

```typescript
function shouldIncludeTrace(sampleRate: number): boolean {
  return Math.random() * 100 < sampleRate
}
```

For reproducibility, use trace_id hash:

```typescript
function shouldIncludeTrace(traceId: string, sampleRate: number): boolean {
  const hash = hashString(traceId)
  return (hash % 100) < sampleRate
}
```

## 8. Routes Structure

```
/projects/[projectId]/traces                     # Project-level traces page
/projects/[projectId]/annotation-queues          # Queues list page
/projects/[projectId]/annotation-queues/new      # Create queue page
/projects/[projectId]/annotation-queues/[uuid]   # Queue detail (annotation view)
/projects/[projectId]/annotation-queues/[uuid]/edit  # Edit queue settings
```

## 9. Services

### 9.1 Core Services (`packages/core/src/services/annotationQueues/`)

- `create.ts` - Create queue with name, description, members, filters
- `update.ts` - Update queue metadata, members, filters
- `destroy.ts` - Delete queue and all items
- `addTraces.ts` - Manually add traces to queue
- `removeTraces.ts` - Remove traces from queue
- `updateItemStatus.ts` - Mark trace as completed/in_progress
- `evaluateFilters.ts` - Check if trace matches queue filters

### 9.2 Annotation Services (`packages/core/src/services/traceAnnotations/`)

- `create.ts` - Create annotation (global, message, or highlight)
- `update.ts` - Update annotation content
- `destroy.ts` - Delete annotation
- `findByQueueItem.ts` - Get all annotations for a trace

### 9.3 Background Jobs

- `populateQueueJob.ts` - Process dynamic filters for new traces
- Triggered by `spanCreated` event
- Checks all queues with filters for the workspace
- Adds matching traces respecting sample rate

## 10. Queries

### 10.1 PostgreSQL Queries (`packages/core/src/queries/annotationQueues/`)

- `findByProject.ts` - List queues for a project with stats
- `findByUuid.ts` - Get single queue with members
- `findItems.ts` - Get traces in a queue with pagination
- `findNextItem.ts` - Get next pending trace (for keyboard navigation)
- `getProgress.ts` - Get queue completion statistics

### 10.2 ClickHouse Queries (`packages/core/src/queries/clickhouse/`)

- `getTracesByProject.ts` - Fetch traces by project_id with filters
- `getTracesByIds.ts` - Fetch trace details for queue items
- `evaluateQueueFilters.ts` - Find traces matching filter criteria

## 11. Implementation Phases

### Phase 1: Foundation
- [ ] Database schema + migrations
- [ ] Feature flag setup
- [ ] Core services (CRUD for queues, items)
- [ ] PostgreSQL queries
- [ ] ClickHouse query for project-level traces

### Phase 2: Basic UI
- [ ] Project-level `/traces` page with table
- [ ] Trace selection with floating action bar
- [ ] Basic modal (create queue, add traces)
- [ ] Annotation queues list page
- [ ] Queue detail page (basic)

### Phase 3: Annotations
- [ ] `trace_annotations` table + services
- [ ] Global annotations
- [ ] Message-level annotations
- [ ] Highlight annotations
- [ ] Annotations sidebar UI

### Phase 4: Dynamic Filters
- [ ] Filter builder UI component
- [ ] Filter storage in queue
- [ ] Filter evaluation logic
- [ ] Sample rate implementation
- [ ] Background job for auto-population

### Phase 5: Polish
- [ ] Keyboard navigation (←/→)
- [ ] Progress tracking UI
- [ ] Queue statistics
- [ ] Performance optimization

## 12. Open Questions

1. **Eval Filtering**: How should evaluation results be used as a filter? Need to define the exact schema and comparators for eval-based filtering.

2. **Structured Annotation Types**: Should we support structured annotation types (e.g., ratings, tags, labels) in addition to free-text content? This could be added as optional fields in `trace_annotations`.

3. **Concurrent Annotation**: Multiple annotators can add their own annotations to the same message (N annotations per target). Should we show real-time updates when another annotator adds an annotation?

4. **Filter History**: Should we track filter changes over time to understand which traces were added by which filter version?

## 13. Future Considerations

- Export annotations for training data
- Annotation templates/presets
- Inter-annotator agreement metrics
- Integration with evaluation system
- Bulk annotation operations
- Annotation search and filtering
