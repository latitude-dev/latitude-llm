# Annotations

Annotations are human-reviewed scores.

Human-created annotations are the strongest human signal in the reliability system, and annotations may exist as drafts before they become final scores.

They are used for:

- issue discovery
- evaluation alignment
- reliability feedback loops in Latitude UI or in user-owned apps

## Core Rule

Annotations are not a standalone canonical fact table.

They are canonical scores with:

- `source = "annotation"`
- `source_id = "UI" | "API" | <annotation-queue-cuid>`

## API-First Requirement

Annotation ingestion is a required public API surface.

Rationale:

- many users will build their own feedback UI
- end-user annotations should not depend on Latitude UI
- the contract must stay simple and agent-friendly

## Draft Annotations

Annotations can exist as drafts in two main ways:

- a human is still editing an in-product annotation
- a system-created annotation queue has proposed an annotation that still needs human review

Rules:

- draft annotations still use `source = "annotation"`
- draft state is represented by `draftedAt`, not by a sentinel error value
- human-created drafts are written to Postgres immediately, so they remain visible on refresh while the user is still editing
- human-created drafts finalize on a debounced timeout after the last edit; the initial default is `5 minutes`
- human-created draft finalization is driven by the debounced `annotation-scores:publish` topic task keyed by the canonical score id, not by browser-local timers or persisted due-work scans
- system-created queue drafts still use the queue CUID as `source_id`
- they are created by a separate validation/annotation task that runs after `system-annotation-queues:flag` has flagged the trace for that system queue
- system-created queue drafts do not use the automatic finalization path; they wait for explicit human review
- drafts do not participate in issue discovery or evaluation alignment until `draftedAt` is cleared
- once a draft is finalized, it should no longer be edited; it may still be deleted later
- drafts exist to support immediate managed review without relying on temporary browser-only or Redis-only state

## Manual Issue Selection

When annotations are created through Latitude-managed UI, the annotator can choose one of three issue intents:

- leave issue assignment automatic and let discovery decide
- link the annotation to an existing issue
- create a new issue inline while annotating

Explicit link/create choices are human overrides:

- they bypass similarity-based issue discovery for that annotation score
- they write canonical ownership directly through `scores.issue_id`
- manually created or manually linked issues remain immediately visible

## Managed Queue Review

The main in-product annotation workflow is the focused queue review screen documented in `docs/annotation-queues.md`.

Annotation behavior in that screen must support:

- conversation-level annotations when no specific message/text selection is needed
- message-level or text-range annotations created directly from the conversation view
- existing draft annotations that are already attached to the trace and waiting for finalization or human review
- persisted highlights after the annotation is stored
- clicking a persisted highlight to focus the matching annotation card in the annotation list

Annotation cards in queue review show:

- linked issue name or pending-discovery state
- annotator name
- annotation feedback text
- green thumbs-up when `score.value >= 0.5`
- red thumbs-down when `score.value < 0.5`

## Annotation Metadata

Annotation metadata must preserve everything needed to reopen the annotation in the conversation UI later.

Recommended exact shape:

```typescript
type AnnotationScoreMetadata = {
  rawFeedback: string; // original feedback text before enrichment; human-authored for reviewed annotations, model-authored for system-created drafts
  messageIndex: number; // message index in the conversation being annotated
  partIndex?: number; // optional GenAI `parts[]` index inside the target message
  startOffset?: number; // optional start offset for substring annotations within a textual part
  endOffset?: number; // optional end offset for substring annotations within a textual part
};
```

This preserves:

- the original feedback wording
- message-level anchors
- exact part-level anchors for GenAI `parts[]`
- partial-text anchors inside textual parts

Because conversations are stored as GenAI messages with `parts[]`, the minimal anchor is:

- `messageIndex` for the message
- `partIndex` only when a specific part is selected
- `startOffset` / `endOffset` only when the selection is a substring inside a textual part

Do not store redundant quoted text when the selection can be reconstructed from the conversation plus these indices and offsets.

## Enrichment

User annotations are often too short or vague to cluster well.

Before issue discovery:

- preserve the original human text in metadata
- enrich the canonical `feedback` field with surrounding context
- use the enriched canonical feedback for clustering

This lets the system cluster annotation-derived feedback without losing the raw human signal.

Concrete v1 behavior worth understanding:

- v1 persisted the generalized/enriched reason so later discovery work could reuse it instead of re-running enrichment each time
- the enrichment prompt used surrounding trace/message context, not just the raw annotation text
- v1 also delayed discovery for some editable human results so the annotation could be revised first

Important v2 carry-forward:

- v2 keeps that revision window through Postgres-backed draft rows rather than through temporary cache-only state

## Canonical Flow

1. validate the annotation payload
2. write or update the canonical Postgres score row, keeping `draftedAt` set while the annotation is still a draft
3. preserve raw human text in metadata
4. enrich the canonical feedback when needed
5. while `draftedAt` is still set, keep the score out of issue discovery, evaluation alignment, and ClickHouse projection
6. when the human-editable draft becomes due, the `annotation-scores:publish` task clears `draftedAt`
7. if the annotator linked an existing issue, keep direct `issue_id` ownership on the canonical score row
8. if the annotator created a new issue inline, persist it and keep direct `issue_id` ownership on the canonical score row
9. if the finalized annotation is failed and non-errored with no direct issue ownership, run issue discovery against the enriched canonical score
10. if the finalized annotation is now immutable and eligible for analytics projection, publish it to ClickHouse

## Relationship To Issues

Human-reviewed annotations are the highest-confidence source of truth.

Because of that:

- annotations can create visible issues immediately
- annotations should have the highest centroid weight
- issues with linked annotations should always remain visible in the product
- draft annotations do not create visible issues immediately because `draftedAt` keeps them out of issue discovery

## Relationship To Queues

Annotation queues are the workflow surface for managed review, but the annotation itself remains just a score.

Queue provenance is carried primarily through the annotation score `source_id` when the annotation came from a queue. Queue behavior and UX are documented separately in `docs/annotation-queues.md`.

Queue completion is separate from annotation creation:

- creating one or more annotations on a queued trace does not automatically mark the queue item complete
- system-created queue hits can pre-create draft annotations on the trace before a human opens the queue item
- the explicit "fully annotated" action completes the queue item

## Still Pending Precise Definition

- exact human confirmation/edit/replacement workflow for system-created draft annotations
- moderation/approval features beyond the core annotation model
