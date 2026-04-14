# Annotation UI Identification

> **Context documents:** [docs/annotations.md](../docs/annotations.md) and [docs/annotation-queues.md](../docs/annotation-queues.md)

This PRD covers annotation provenance identification in the UI, edit permission rules, seed data improvements, system queue management restrictions, and approve/reject workflows for system-created draft annotations.

---

## Goal 1: Annotation Provenance Display

Display clear visual identification showing whether an annotation was created by a human, by an agent (system annotation queue), or via the public API.

### 1.1 Domain Layer: `getAnnotationProvenance`

Add a new function to `@domain/annotations` that determines annotation origin.

**File:** `packages/domain/annotations/src/helpers/get-annotation-provenance.ts`

```typescript
import type { AnnotationScore } from "@domain/scores"
import { isCuid } from "@domain/shared"

export const ANNOTATION_PROVENANCE = ["human", "agent", "api"] as const
export type AnnotationProvenance = (typeof ANNOTATION_PROVENANCE)[number]

export function getAnnotationProvenance(annotation: AnnotationScore): AnnotationProvenance {
  const { sourceId, annotatorId } = annotation

  // API annotations: sourceId = "API" (no annotatorId required)
  if (sourceId === "API") return "api"

  // System/agent annotations: sourceId is a CUID (annotation queue id) AND no annotatorId
  // These are created by system annotation queues (e.g., tool-call-errors, refusal)
  if (isCuid(sourceId) && annotatorId === null) return "agent"

  // Human annotations: sourceId = "UI" OR sourceId is a CUID with annotatorId present
  // (queue-based human annotations have queue CUID as sourceId but have annotatorId set)
  return "human"
}
```

**Export from index:** `packages/domain/annotations/src/index.ts`

```typescript
export { getAnnotationProvenance, type AnnotationProvenance, ANNOTATION_PROVENANCE } from "./helpers/get-annotation-provenance.ts"
```

### 1.2 Web UI: AnnotationCard Header Changes

**File:** `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/annotations/annotation-card.tsx`

Replace the current avatar + name logic with provenance-aware rendering:

| Provenance | Avatar | Name | Badge | Tooltip |
|------------|--------|------|-------|---------|
| `human` | User avatar | User name | — | — |
| `agent` | Latitude logo | "Latitude" | `(Agent)` variant="secondary" | "Created automatically by Latitude's {queueName} system queue" |
| `api` | — | — | `API` variant="outline" | "Created via the public API" |

**Implementation details:**

1. Import `getAnnotationProvenance` from `@domain/annotations` (via web's domain re-export)
2. Import `LatitudeLogo` from `@repo/ui` for agent avatar
3. Compute provenance: `const provenance = getAnnotationProvenance(annotation)`
4. Render header based on provenance:

```tsx
function ProvenanceHeader({ annotation, memberByUserId }: { annotation: AnnotationRecord; memberByUserId: Map<string, Member> }) {
  const provenance = getAnnotationProvenance(annotation)

  if (provenance === "human") {
    const annotator = pickUserFromMembersMap(memberByUserId, annotation.annotatorId)
    return annotator ? (
      <>
        <Avatar name={annotator.name} imageSrc={annotator.imageSrc} size="xs" />
        <Text.H6 weight="bold">{annotator.name}</Text.H6>
      </>
    ) : null
  }

  if (provenance === "agent") {
    // TODO: Resolve queue name from sourceId for tooltip
    return (
      <Tooltip
        asChild
        trigger={
          <div className="flex items-center gap-2">
            <LatitudeLogo size="xs" />
            <Text.H6 weight="bold">Latitude</Text.H6>
            <Badge variant="secondary" size="small">Agent</Badge>
          </div>
        }
      >
        Created automatically by a Latitude system queue
      </Tooltip>
    )
  }

  // api
  return (
    <Tooltip asChild trigger={<Badge variant="outline" size="small">API</Badge>}>
      Created via the public API
    </Tooltip>
  )
}
```

### 1.3 Row Feedback Display

System-created annotations store model-generated feedback in `metadata.rawFeedback`. This should be displayed distinctly from human-authored feedback.

**Current state:** The `feedback` field on the score may be enriched (for clustering), while `metadata.rawFeedback` contains the original text.

**UI proposal:**

1. For `agent` provenance annotations, show the `metadata.rawFeedback` value as the primary visible feedback
2. Add a subtle label or different styling to indicate this is system-generated reasoning
3. If the user edits the annotation, their new comment replaces `rawFeedback` and clears any enrichment

**Implementation:**

```tsx
// In AnnotationCard
const displayFeedback = provenance === "agent" 
  ? annotation.metadata?.rawFeedback ?? annotation.feedback
  : annotation.feedback

{displayFeedback?.trim() && (
  <div className="flex flex-col gap-1">
    {provenance === "agent" && (
      <Text.H6 color="foregroundMuted" className="text-xs">System reasoning</Text.H6>
    )}
    <Text.H5 className="whitespace-pre-wrap">{displayFeedback.trim()}</Text.H5>
  </div>
)}
```

### 1.4 Draft Icon

When an annotation has `draftedAt` set (is a draft), show a visual indicator.

**Implementation:**

1. Add a draft indicator after the creation date in the annotation card header
2. Use `FileClockIcon` or similar from lucide-react
3. Add tooltip explaining draft state

```tsx
import { FileClockIcon } from "lucide-react"

// After the createdAt display
{annotation.draftedAt && (
  <Tooltip
    asChild
    trigger={
      <Icon icon={FileClockIcon} size="xs" color="foregroundMuted" />
    }
  >
    Draft annotation being processed. It will be published automatically, or you can edit it while in draft.
  </Tooltip>
)}
```

### 1.5 Text Range Selection Scope

The `TextSelectionProvider` currently listens to the entire document. It should be scoped to a specific container.

**File:** `packages/ui/src/components/genai-conversation/text-selection.tsx`

**Current issue:** Event listeners are added to `document`, causing selection detection across the entire page.

**Fix:**

1. The `containerRef` prop already exists but click-outside detection still uses `document`
2. Modify the `handleSelectStart` and `handleClickOutside` handlers to only process events within or relative to the container
3. The `processSelection` function already checks `containerRef.current?.contains(range.commonAncestorContainer)` — this is correct
4. Update `handleClickOutside` to be more precise about what constitutes "outside"

**Changes needed:**

```typescript
// In useTextSelectionHook
const handleSelectStart = (e: Event) => {
  const target = e.target
  const el = target instanceof Element ? target : (target as Node).parentElement
  // Only start selection tracking if the event originated within our container
  if (el && containerRef.current?.contains(el)) isSelecting = true
}

// handleClickOutside already ignores clicks on popovers/dialogs
// Add check to ignore clicks within the conversation container if selection is active
const handleClickOutside = (e: MouseEvent) => {
  const el = e.target instanceof Element ? e.target : (e.target as Node).parentElement
  if (!el) return
  if (el.closest("[data-selection-popover]") || el.closest('[role="dialog"]')) return
  const tagName = (e.target as Element)?.tagName?.toLowerCase()
  if (tagName === "textarea" || tagName === "input") return
  
  // Clear selection only if click is truly outside the container
  if (containerRef.current && !containerRef.current.contains(el)) clearSelection()
}
```

**Note:** The current implementation already has reasonable scoping. Verify actual behavior before making changes.

---

## Goal 2: Annotation Edit Permissions

Define and enforce when annotations can be updated.

### 2.1 Rules

Based on `docs/annotations.md`:

| Condition | Can Update |
|-----------|------------|
| Draft annotation (`draftedAt` set) created by current user | ✅ Yes |
| Draft annotation (`draftedAt` set) created by system (agent) | ✅ Yes (human review) |
| Published annotation (`draftedAt` null) | ❌ No |
| Annotation without `annotatorId` and published | ❌ No |

**Summary:**
- **Drafts are editable** (regardless of who created them)
- **Published annotations are immutable** (can only be deleted, not edited)

### 2.2 Domain Layer: `canUpdateAnnotation`

**File:** `packages/domain/annotations/src/helpers/can-update-annotation.ts`

```typescript
import type { AnnotationScore } from "@domain/scores"

export function canUpdateAnnotation(annotation: AnnotationScore): boolean {
  // Only draft annotations can be updated
  return annotation.draftedAt !== null
}
```

**Export from index:** `packages/domain/annotations/src/index.ts`

### 2.3 UI Enforcement

**File:** `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/annotations/annotation-card.tsx`

1. Import `canUpdateAnnotation`
2. Conditionally render the Edit option in the dropdown menu
3. If not editable, either hide the option or show it disabled with a tooltip

```tsx
const isEditable = canUpdateAnnotation(annotation)

const menuOptions: MenuOption[] = useMemo(() => {
  const options: MenuOption[] = []
  
  if (isEditable) {
    options.push({
      label: "Edit",
      onClick: () => setIsEditing(true),
    })
  }
  
  options.push({
    label: "Remove",
    type: "destructive",
    onClick: () => deleteMutation.mutate({ scoreId: annotation.id, projectId }, onDelete ? { onSuccess: onDelete } : undefined),
  })
  
  return options
}, [annotation.id, projectId, deleteMutation, onDelete, isEditable])
```

### 2.4 Backend Enforcement

**File:** `packages/domain/annotations/src/use-cases/write-draft-annotation.ts`

The existing `writeDraftAnnotation` use case already handles this correctly — it's designed for draft annotations. Verify that:

1. The update path checks `draftedAt !== null` before allowing edits
2. Returns an appropriate error if trying to update a published annotation

---

## Goal 3: Updated Seed Data

Create a rich seed trace with multiple annotation types to test the UI.

### 3.1 Seed Trace Requirements

Create a single trace with ID `"11111111111111111111111111111111"` (the existing lifecycle trace) that has:

- **Long conversation:** 10+ messages with tool calls to enable scroll testing
- **9 annotations total:**
  - 3 from agent (system queues)
  - 2 from API
  - 4 from human (UI)

### 3.2 Annotation Distribution

| # | Provenance | Anchor Type | sourceId | annotatorId |
|---|------------|-------------|----------|-------------|
| 1 | agent | Global | `SEED_ANNOTATION_QUEUE_SYSTEM_ID` | `null` |
| 2 | agent | Under message (messageIndex: 2) | `SEED_ANNOTATION_QUEUE_SYSTEM_ID` | `null` |
| 3 | agent | Text range (messageIndex: 4, part: 0, offsets) | `SEED_ANNOTATION_QUEUE_SYSTEM_ID` | `null` |
| 4 | api | Global | `"API"` | `null` |
| 5 | api | Under tool call (messageIndex: 3) | `"API"` | `null` |
| 6 | human | Global | `"UI"` | `SEED_OWNER_USER_ID` |
| 7 | human | Under message (messageIndex: 1) | `"UI"` | `SEED_ADMIN_USER_ID` |
| 8 | human | Under tool call (messageIndex: 5) | `SEED_ANNOTATION_QUEUE_WARRANTY_ID` | `SEED_OWNER_USER_ID` |
| 9 | human | Text range (messageIndex: 6, part: 0, offsets) | `"UI"` | `SEED_MEMBER_1_USER_ID` |

### 3.3 Implementation

**File:** `packages/platform/db-postgres/src/seeds/scores/index.ts`

Add new seed score rows targeting the lifecycle trace:

```typescript
const uiPolishAnnotationRows = [
  // Agent annotations (system queue, no annotatorId)
  {
    id: ScoreId("ui01polishagent01global0000"),
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: requiredAt(SEED_LIFECYCLE_TRACE_IDS, 0), // "1111..."
    spanId: null,
    source: "annotation" as const,
    sourceId: SEED_ANNOTATION_QUEUE_SYSTEM_ID,
    simulationId: null,
    issueId: null,
    value: 0.3,
    passed: false,
    feedback: "Tool call returned an error state indicating the requested operation failed.",
    metadata: {
      rawFeedback: "Tool call returned an error state indicating the requested operation failed.",
      // Global annotation: no anchor fields
    },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: createdAtFromDaysAgo(1, 10), // Draft
    annotatorId: null, // Agent
    createdAt: createdAtFromDaysAgo(1, 10),
    updatedAt: createdAtFromDaysAgo(1, 10),
  },
  // ... 8 more similar entries with varying anchor types
]
```

**File:** `packages/platform/db-clickhouse/src/seeds/spans/fixed-traces.ts`

Extend the conversation for the lifecycle trace (`"1111..."`) to include:
- 10+ messages
- Multiple tool calls
- Sufficient text content for text range selection testing

### 3.4 New Seed Constants

**File:** `packages/domain/shared/src/seeds.ts`

Add new score IDs for UI polish annotations:

```typescript
export const SEED_UI_POLISH_SCORE_IDS = {
  AGENT_GLOBAL: ScoreId("ui01polishagent01global0000"),
  AGENT_MESSAGE: ScoreId("ui01polishagent02message000"),
  AGENT_TEXT_RANGE: ScoreId("ui01polishagent03textrang0"),
  API_GLOBAL: ScoreId("ui01polishapi001global0000"),
  API_TOOL_CALL: ScoreId("ui01polishapi002toolcall0"),
  HUMAN_GLOBAL: ScoreId("ui01polishhuman01global000"),
  HUMAN_MESSAGE: ScoreId("ui01polishhuman02message00"),
  HUMAN_TOOL_CALL: ScoreId("ui01polishhuman03toolcall"),
  HUMAN_TEXT_RANGE: ScoreId("ui01polishhuman04textrang"),
} as const
```

---

## Goal 4: System Queue Edit Restrictions

System annotation queues should have restricted editing and cannot be deleted.

### 4.1 Queue List Page Changes

**File:** `apps/web/src/routes/_authenticated/projects/$projectSlug/annotation-queues/index.tsx`

Modify the options column to handle system queues:

```tsx
optionsColumn<AnnotationQueueRecord>({
  getOptions: (q) => {
    if (q.system) {
      return [
        {
          label: "Edit assignees & sampling",
          onClick: () => openEditModal(q),
        },
        {
          label: "Delete",
          type: "destructive",
          disabled: true,
          disabledReason: "System queues cannot be deleted",
        },
      ]
    }
    
    return [
      {
        label: "Edit",
        onClick: () => openEditModal(q),
      },
      {
        label: "Delete",
        type: "destructive",
        onClick: () => openDeleteModal(q),
      },
    ]
  },
}),
```

### 4.2 Queue Detail Page Alert

**File:** `apps/web/src/routes/_authenticated/projects/$projectSlug/annotation-queues/$queueId/index.tsx`

Add an `<Alert>` component when viewing a system queue:

```tsx
import { Alert } from "@repo/ui"

// In the component, after loading queue details
{queue?.system && (
  <Alert variant="info" className="mb-4">
    <Alert.Title>System Queue</Alert.Title>
    <Alert.Description>
      This queue is managed by Latitude and cannot be deleted or have its core settings edited. 
      You can update assignees and sampling rate. To add more context or custom criteria, 
      create a new annotation queue.
    </Alert.Description>
  </Alert>
)}
```

### 4.3 Backend Enforcement

**File:** `packages/domain/annotation-queues/src/use-cases/update-annotation-queue.ts`

Add validation to prevent editing restricted fields on system queues:

```typescript
if (existingQueue.system) {
  // System queues: only allow assignees and sampling updates
  if (input.name !== undefined || input.description !== undefined || input.instructions !== undefined || input.settings?.filter !== undefined) {
    return Effect.fail(new ValidationError({ 
      message: "System queues can only have assignees and sampling updated" 
    }))
  }
}
```

**File:** `packages/domain/annotation-queues/src/use-cases/delete-annotation-queue.ts`

Add validation to prevent deletion:

```typescript
if (existingQueue.system) {
  return Effect.fail(new ForbiddenError({ 
    message: "System queues cannot be deleted" 
  }))
}
```

---

## Goal 5: Approve/Reject for System Draft Annotations

System annotation queues create draft annotations that require human review before publication.

### 5.1 Current State

- System queues create annotations via `persistSystemQueueAnnotationUseCase`
- These annotations have `draftedAt` set and `annotatorId = null`
- They do NOT use the automatic debounced publication path
- They wait for explicit human review

### 5.2 UI: Approve/Reject Buttons

**Location:** In `AnnotationCard` when viewing a system-created draft annotation

**Conditions to show buttons:**
- `annotation.draftedAt !== null` (is a draft)
- `annotation.annotatorId === null` (system-created)
- `getAnnotationProvenance(annotation) === "agent"`

**UI Implementation:**

```tsx
// In AnnotationCard
const isSystemDraft = provenance === "agent" && annotation.draftedAt !== null

{isSystemDraft && (
  <div className="flex gap-2 mt-2 pt-2 border-t border-border">
    <Button
      variant="outline"
      size="sm"
      onClick={() => handleReject(annotation.id)}
      disabled={rejectMutation.isPending}
    >
      <Icon icon={XIcon} size="xs" className="mr-1" />
      Reject
    </Button>
    <Button
      size="sm"
      onClick={() => handleApprove(annotation.id)}
      disabled={approveMutation.isPending}
    >
      <Icon icon={CheckIcon} size="xs" className="mr-1" />
      Approve
    </Button>
  </div>
)}
```

### 5.3 Backend: Approve Use Case

**File:** `packages/domain/annotations/src/use-cases/approve-system-annotation.ts`

```typescript
import { Effect } from "effect"
import type { Score } from "@domain/scores"
import type { ScoreRepository } from "@domain/scores"
import { NotFoundError, ForbiddenError } from "@domain/shared"

export interface ApproveSystemAnnotationInput {
  scoreId: string
  organizationId: string
  projectId: string
}

export const approveSystemAnnotationUseCase = (input: ApproveSystemAnnotationInput) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository

    const score = yield* scoreRepository.findById(input.scoreId)
    if (!score) {
      return yield* Effect.fail(new NotFoundError({ entity: "annotation", id: input.scoreId }))
    }

    // Verify it's a draft annotation
    if (score.draftedAt === null) {
      return yield* Effect.fail(new ForbiddenError({ message: "Annotation is already published" }))
    }

    // Verify it's a system-created annotation (no annotatorId)
    if (score.annotatorId !== null) {
      return yield* Effect.fail(new ForbiddenError({ 
        message: "Only system-created annotations can be approved via this flow" 
      }))
    }

    // Publish: clear draftedAt, which triggers downstream effects
    // (issue discovery, ClickHouse sync, etc.)
    yield* scoreRepository.update(input.scoreId, {
      draftedAt: null,
    })

    // Emit domain event for publication side effects
    // This follows the same path as the debounced publication
    yield* publishAnnotationScore({ scoreId: input.scoreId })

    return { success: true }
  })
```

### 5.4 Backend: Reject Use Case

**File:** `packages/domain/annotations/src/use-cases/reject-system-annotation.ts`

Rejecting means deleting the draft annotation entirely.

```typescript
import { Effect } from "effect"
import type { ScoreRepository } from "@domain/scores"
import { NotFoundError, ForbiddenError } from "@domain/shared"

export interface RejectSystemAnnotationInput {
  scoreId: string
  organizationId: string
  projectId: string
}

export const rejectSystemAnnotationUseCase = (input: RejectSystemAnnotationInput) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository

    const score = yield* scoreRepository.findById(input.scoreId)
    if (!score) {
      return yield* Effect.fail(new NotFoundError({ entity: "annotation", id: input.scoreId }))
    }

    // Verify it's a draft annotation
    if (score.draftedAt === null) {
      return yield* Effect.fail(new ForbiddenError({ message: "Cannot reject a published annotation" }))
    }

    // Verify it's a system-created annotation
    if (score.annotatorId !== null) {
      return yield* Effect.fail(new ForbiddenError({ 
        message: "Only system-created annotations can be rejected via this flow" 
      }))
    }

    // Delete the annotation
    yield* scoreRepository.delete(input.scoreId)

    return { success: true }
  })
```

### 5.5 Server Functions

**File:** `apps/web/src/domains/annotations/annotations.functions.ts`

```typescript
export async function approveSystemAnnotation(input: { scoreId: string; projectId: string }) {
  const { organizationId, projectId } = await requireProjectAccess(input.projectId)
  return runEffect(approveSystemAnnotationUseCase({ 
    scoreId: input.scoreId, 
    organizationId, 
    projectId 
  }))
}

export async function rejectSystemAnnotation(input: { scoreId: string; projectId: string }) {
  const { organizationId, projectId } = await requireProjectAccess(input.projectId)
  return runEffect(rejectSystemAnnotationUseCase({ 
    scoreId: input.scoreId, 
    organizationId, 
    projectId 
  }))
}
```

### 5.6 Collection Hooks

**File:** `apps/web/src/domains/annotations/annotations.collection.ts`

```typescript
export function useApproveSystemAnnotation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: approveSystemAnnotation,
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["annotations", variables.projectId] })
    },
  })
}

export function useRejectSystemAnnotation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: rejectSystemAnnotation,
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["annotations", variables.projectId] })
    },
  })
}
```

---

## Open Questions

### Domain / Architecture

1. **Queue name resolution for agent tooltips:** Should we load the queue name from `sourceId` to show in the tooltip ("Created by Tool Call Errors queue"), or is a generic "Created by a Latitude system queue" sufficient? Loading queue names requires an additional query or pre-fetching queue data.

2. **Human edits to agent annotations:** When a human edits a system-created draft annotation, should:
   - The `annotatorId` be set to the editing user?
   - The `sourceId` remain the queue CUID or change to `"UI"`?
   - The provenance effectively become "human" after edit?

3. **Enrichment on approve:** When a human approves a system annotation without editing, should the existing enriched `feedback` be used, or should we re-run enrichment? The current flow preserves `rawFeedback` and uses enriched `feedback` for clustering.

4. **Delete permissions:** Should humans be allowed to delete published annotations (both human and API-created)? The current UI allows this but the PRD focuses on edit restrictions. Clarify the delete policy.

### UI / UX

5. **Approve with edits:** Should the Approve button also be available after the user edits the annotation (while still in draft), or should editing and approving be separate actions? Consider: Edit → Save (stays draft) → Approve, vs. Edit → Approve (save + publish).

6. **Text range selection container ID:** The PRD mentions passing a `domId` to scope selection. Is the current `containerRef` approach sufficient, or do we need explicit DOM ID attributes? The current implementation already scopes to the ref.

7. **Annotation card actions overflow:** With approve/reject buttons added, the card may become cluttered. Should these be in the dropdown menu instead of inline buttons? Or should we show them prominently for system drafts only?

8. **Draft indicator placement:** Should the draft icon appear in the card header (as proposed) or somewhere else like a badge? Consider mobile/narrow viewport layouts.

### Seed Data

9. **Trace message count:** The PRD says "10+ messages" but what's the exact conversation structure needed? Should it include:
   - User and assistant messages alternating?
   - Multiple tool calls in sequence?
   - A tool call error for the system queue annotation to reference?
   - Enough text content in specific messages for text range testing?

10. **Existing seed disruption:** Adding annotations to `SEED_LIFECYCLE_TRACE_IDS[0]` ("1111...") may affect existing tests or local development flows. Should we use a new dedicated trace ID instead?

### System Queues

11. **Sampling at 0%:** If a user sets a system queue's sampling to 0%, it effectively disables the queue. Should we show a warning or confirmation? Should 0% be prevented entirely?

12. **Alert dismissability:** Should the system queue info alert be dismissable (remembered per user), or always shown? Persistent alerts may become noise for frequent users.
