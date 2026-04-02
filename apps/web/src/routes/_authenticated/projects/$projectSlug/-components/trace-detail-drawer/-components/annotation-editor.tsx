/**
 * Shared inline UI for an existing annotation (draft or published).
 * Draft (`isDraftAnnotation`) only gates **mutations** (thumbs, comment save, issue link, delete semantics).
 * Compact vs expanded is mostly **`listStartsCompact`** (trace list density). **Drafts with no real comment yet**
 * (whitespace-only feedback from create) still open **expanded** so you can add a description after picking thumbs.
 */

import type { AnnotationAnchor } from "@domain/scores"
import { Button, Icon, Modal, Text, Textarea, Tooltip } from "@repo/ui"
import { PencilIcon, TrashIcon, XIcon } from "lucide-react"
import { useLayoutEffect, useState } from "react"
import {
  useDeleteAnnotation,
  useUpdateAnnotation,
} from "../../../../../../../domains/annotations/annotations.collection.ts"
import {
  type AnnotationRecord,
  isDraftAnnotation,
} from "../../../../../../../domains/annotations/annotations.functions.ts"
import { useListIssues } from "../../../../../../../domains/issues/issues.collection.ts"
import { AnnotationThumbToggle } from "./annotation-thumb-toggle.tsx"
import { IssueSelector } from "./issue-selector.tsx"

export function AnnotationEditor({
  annotation,
  projectId,
  traceId,
  anchor,
  allowCompactSummary = true,
  listStartsCompact = false,
}: {
  readonly annotation: AnnotationRecord
  readonly projectId: string
  readonly traceId: string
  readonly anchor?: AnnotationAnchor | undefined
  /**
   * When true (default), list rows may show a compact summary until Edit is used.
   * Set false for contexts that should always show the full form (e.g. popovers).
   */
  readonly allowCompactSummary?: boolean
  /**
   * Trace + message list rows: start **compact** when there is real feedback (or published). **New drafts**
   * with only placeholder feedback open **expanded** so comment entry isn’t skipped after create.
   */
  readonly listStartsCompact?: boolean
}) {
  const isEditable = isDraftAnnotation(annotation)
  const [localComment, setLocalComment] = useState(annotation.feedback?.trim() ?? "")
  const [localIssueId, setLocalIssueId] = useState<string | null>(annotation.issueId)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [expanded, setExpanded] = useState(() => {
    if (!allowCompactSummary) return true
    const hasReadableFeedback = (annotation.feedback?.trim() ?? "").length > 0
    const draftNeedsDescription = isEditable && !hasReadableFeedback
    return !listStartsCompact || draftNeedsDescription
  })

  const updateMutation = useUpdateAnnotation()
  const deleteMutation = useDeleteAnnotation()
  const isLoading = updateMutation.isPending || deleteMutation.isPending

  const isDirty = localComment.trim() !== (annotation.feedback?.trim() ?? "")

  const { data: issues = [] } = useListIssues({
    projectId,
    enabled: allowCompactSummary && annotation.passed === false && annotation.issueId !== null,
  })
  const linkedIssueName = annotation.issueId ? issues.find((i) => i.id === annotation.issueId)?.name : undefined

  // Mirror server fields after refetch; useLayoutEffect avoids flash before paint (controlled fields + draft state).
  useLayoutEffect(() => {
    setLocalComment(annotation.feedback?.trim() ?? "")
    setLocalIssueId(annotation.issueId)
  }, [annotation.feedback, annotation.id, annotation.issueId])

  function buildUpdatePayload(overrides?: { passed?: boolean; issueId?: string | null }) {
    const nextPassed = overrides?.passed ?? annotation.passed
    const nextIssueId =
      nextPassed === true ? null : ((overrides?.issueId !== undefined ? overrides.issueId : localIssueId) ?? null)

    return {
      scoreId: annotation.id,
      projectId,
      traceId,
      value: overrides?.passed !== undefined ? (overrides.passed ? 1 : 0) : annotation.value,
      passed: nextPassed,
      feedback: localComment.trim() || " ",
      issueId: nextIssueId ?? undefined,
      ...(anchor ? { anchor } : {}),
    }
  }

  function handleSaveComment() {
    if (!isEditable || isLoading || !isDirty) return
    updateMutation.mutate(buildUpdatePayload())
  }

  function handleThumbClick(newPassed: boolean) {
    if (!isEditable || isLoading) return
    if (newPassed) {
      setLocalIssueId(null)
    }
    updateMutation.mutate(buildUpdatePayload({ passed: newPassed }))
  }

  function handleIssueChange(issueId: string | null) {
    if (!isEditable || isLoading) return
    setLocalIssueId(issueId)
    updateMutation.mutate(buildUpdatePayload({ issueId }))
  }

  function handleDelete() {
    deleteMutation.mutate({ scoreId: annotation.id, projectId }, { onSuccess: () => setDeleteModalOpen(false) })
  }

  function handleCollapseSummary() {
    setLocalComment(annotation.feedback?.trim() ?? "")
    setLocalIssueId(annotation.issueId)
    setExpanded(false)
  }

  const showExpanded = !allowCompactSummary || expanded
  const summaryFeedback = annotation.feedback?.trim() ?? ""

  if (!showExpanded) {
    return (
      <div className="flex gap-2 items-center">
        <AnnotationThumbToggle
          passed={annotation.passed}
          disabled
          editable={false}
          onThumbUp={() => {}}
          onThumbDown={() => {}}
        />
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          {summaryFeedback ? (
            <span className="min-w-0 block" title={summaryFeedback}>
              <Text.H6 color="foregroundMuted" lineClamp={2} wordBreak="words">
                {summaryFeedback}
              </Text.H6>
            </span>
          ) : (
            <span className="min-w-0 block">
              <Text.H6 color="foregroundMuted" italic display="block">
                No comment
              </Text.H6>
            </span>
          )}
          {annotation.passed === false && annotation.issueId ? (
            <span className="min-w-0 block" title={linkedIssueName ?? "Issue linked"}>
              <Text.H6 color="foregroundMuted" className="truncate block">
                {linkedIssueName ?? "Issue linked"}
              </Text.H6>
            </span>
          ) : null}
        </div>
        <Tooltip
          asChild
          trigger={
            <button
              type="button"
              aria-expanded={false}
              aria-label={isEditable ? "Edit annotation" : "View full annotation"}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setExpanded(true)}
            >
              <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
            </button>
          }
        >
          {isEditable ? "Edit annotation" : "View full annotation"}
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full items-center gap-1">
        <AnnotationThumbToggle
          passed={annotation.passed}
          disabled={!isEditable || isLoading}
          editable={isEditable}
          onThumbUp={() => handleThumbClick(true)}
          onThumbDown={() => handleThumbClick(false)}
        />
        <div className="flex items-center gap-1 ml-auto">
          {allowCompactSummary ? (
            <Tooltip
              asChild
              trigger={
                <button
                  type="button"
                  aria-expanded
                  aria-label={isEditable ? "Cancel editing" : "Close"}
                  disabled={isLoading}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  onClick={handleCollapseSummary}
                >
                  <Icon icon={XIcon} size="sm" color="foregroundMuted" />
                </button>
              }
            >
              {isEditable ? "Cancel" : "Close"}
            </Tooltip>
          ) : null}
          <button
            type="button"
            disabled={isLoading}
            onClick={() => setDeleteModalOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:text-destructive transition-colors"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isEditable ? (
        <>
          <Textarea
            value={localComment}
            onChange={(e) => setLocalComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
          />
          {isDirty && (
            <div className="flex">
              <Button size="sm" isLoading={updateMutation.isPending} disabled={isLoading} onClick={handleSaveComment}>
                Save
              </Button>
            </div>
          )}
        </>
      ) : annotation.feedback?.trim() ? (
        <Text.H6 color="foregroundMuted" wordBreak="words">
          {annotation.feedback.trim()}
        </Text.H6>
      ) : null}

      {annotation.passed === false &&
        (isEditable ? (
          <IssueSelector projectId={projectId} value={localIssueId} onChange={handleIssueChange} />
        ) : annotation.issueId ? (
          <Text.H6 color="foregroundMuted" wordBreak="words">
            {linkedIssueName ?? "Issue linked"}
          </Text.H6>
        ) : null)}

      <Modal
        dismissible
        size="small"
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete annotation"
        description={
          isEditable
            ? "Are you sure you want to delete this annotation?"
            : "This annotation has been published and cannot be recovered after deletion."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" isLoading={deleteMutation.isPending} onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  )
}
