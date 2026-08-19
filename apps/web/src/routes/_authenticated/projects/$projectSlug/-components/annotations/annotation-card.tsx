import { canUpdateAnnotation, getAnnotationProvenance } from "@domain/annotations"
import { Avatar, Badge, Button, DropdownMenu, Icon, LatitudeLogo, ThumbButton, type MenuOption, Text, Tooltip } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Link, useParams } from "@tanstack/react-router"
import { EllipsisIcon, GlobeIcon, ShieldAlertIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useDeleteAnnotation } from "../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { useProjectMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import { pickUserFromMembersMap } from "../../../../../../domains/members/pick-users-from-members.ts"
import { useSignal } from "../../../../../../domains/signals/signals.collection.ts"
import { FlaggerBadge } from "../flaggers/flagger-badge.tsx"
import { ScoreEntryCard, ScoreEntryCardBody, ScoreEntryCardHeader, ScoreEntryCardSection } from "../scores/score-entry-card.tsx"
import { AnnotationApprovalPopover } from "./annotation-approval-popover.tsx"
import { AnnotationInput } from "./annotation-input.tsx"
import { EnrichmentPopover } from "./enrichment-popover.tsx"

interface AnnotationCardProps {
  readonly annotation: AnnotationRecord
  readonly projectId: string
  readonly isGlobal?: boolean
  readonly isUpdateLoading?: boolean
  readonly onUpdate: (data: { passed: boolean; comment: string; signalId: string | null }) => void
  readonly onDelete?: (() => void) | undefined
  readonly className?: string
}

export function AnnotationCard({
  annotation,
  projectId,
  isGlobal = false,
  isUpdateLoading = false,
  onUpdate,
  onDelete,
  className,
}: AnnotationCardProps) {
  const { projectSlug } = useParams({ strict: false })
  const [isEditing, setIsEditing] = useState(false)
  const memberByUserId = useProjectMemberByUserIdMap()
  const annotator = pickUserFromMembersMap(memberByUserId, annotation.annotatorId)
  const deleteMutation = useDeleteAnnotation()
  const { data: linkedSignal } = useSignal({
    projectId,
    signalId: annotation.signalId ?? "",
    enabled: annotation.signalId !== null,
  })

  const linkedSignalName = linkedSignal?.name ?? null
  const linkedSignalSlug = linkedSignal?.slug ?? null
  const linkedSignalDescription = linkedSignal?.description?.trim()
  const provenance = getAnnotationProvenance(annotation)
  const flaggerSlug = (annotation.metadata as { flaggerSlug?: string })?.flaggerSlug?.trim() || undefined
  const isEditable = canUpdateAnnotation(annotation)
  const isDraft = annotation.draftedAt !== null
  const isAgentDraft = provenance === "agent" && isDraft

  const menuOptions: MenuOption[] = useMemo(
    () => [
      {
        label: "Edit",
        disabled: !isEditable,
        onClick: () => setIsEditing(true),
      },
      {
        label: "Remove",
        type: "destructive",
        onClick: () =>
          deleteMutation.mutate({ scoreId: annotation.id, projectId }, onDelete ? { onSuccess: onDelete } : undefined),
      },
    ],
    [annotation.id, projectId, deleteMutation, onDelete, isEditable],
  )

  function handleSave(data: { passed: boolean; comment: string; signalId: string | null }) {
    onUpdate(data)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div data-no-navigate>
        <AnnotationInput
          projectId={projectId}
          isLoading={isUpdateLoading}
          initialPassed={annotation.passed}
          initialComment={annotation.feedback ?? ""}
          initialSignalId={annotation.signalId}
          onSave={handleSave}
          cancellable
          autoFocus
          onCancel={() => setIsEditing(false)}
        />
      </div>
    )
  }

  const isPublished = !isDraft
  const rawFeedback = (annotation.metadata as { rawFeedback?: string })?.rawFeedback?.trim()
  const humanFeedback = annotation.feedback?.trim()
  const showRawFeedback =
    rawFeedback &&
    (provenance === "agent" || ((provenance === "human" || provenance === "api") && isPublished)) &&
    rawFeedback !== humanFeedback
  const linkedSignalBadge =
    linkedSignalName &&
    (() => {
      const isNavigable = Boolean(projectSlug && annotation.signalId)
      const badge = (
        <Badge
          variant="outline"
          size="small"
          ellipsis
          {...(isNavigable ? { className: "cursor-pointer hover:bg-muted" } : {})}
          iconProps={{
            icon: ShieldAlertIcon,
            color: "foregroundMuted",
            placement: "start",
            className: "stroke-[2.5]",
          }}
        >
          {linkedSignalName}
        </Badge>
      )
      const trigger =
        projectSlug && linkedSignalSlug ? (
          <Link
            data-no-navigate
            to="/projects/$projectSlug/signals/$signalSlug"
            params={{ projectSlug, signalSlug: linkedSignalSlug }}
            aria-label={`Open issue ${linkedSignalName}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex min-w-0"
          >
            {badge}
          </Link>
        ) : (
          badge
        )
      return linkedSignalDescription ? (
        <Tooltip asChild trigger={trigger}>
          <span className="block max-w-xs whitespace-pre-wrap text-left">{linkedSignalDescription}</span>
        </Tooltip>
      ) : (
        trigger
      )
    })()

  return (
    <ScoreEntryCard dataAttributeName="data-annotation-card-id" id={annotation.id} className={className}>
      <ScoreEntryCardHeader
        meta={
          <>
            {provenance === "human" && annotator ? (
              <>
                <Avatar name={annotator.name} imageSrc={annotator.imageSrc} size="xs" />
                <Text.H6 weight="bold">{annotator.name}</Text.H6>
              </>
            ) : null}
            {provenance === "agent" ? (
              <div className="flex items-center gap-1.5">
                <LatitudeLogo className="h-4 w-4" />
                <Text.H6 weight="bold">Latitude</Text.H6>
                <Badge variant="secondary" size="small">
                  Agent
                </Badge>
              </div>
            ) : null}
            {provenance === "api" ? (
              <Badge variant="outline" size="small">
                API
              </Badge>
            ) : null}
            <Text.H6 color="foregroundMuted">{relativeTime(new Date(annotation.createdAt))}</Text.H6>
          </>
        }
        trailing={
          <div className="flex items-center gap-x-1">
            {isGlobal && (
              <Tooltip
                asChild
                trigger={
                  <div className="flex h-8 w-8 items-center justify-center rounded-md transition-colors">
                    <Icon icon={GlobeIcon} size="xs" color="foregroundMuted" />
                  </div>
                }
              >
                Applies to the entire conversation
              </Tooltip>
            )}
            {showRawFeedback ? <EnrichmentPopover annotationId={annotation.id} rawFeedback={rawFeedback} /> : null}
            <ThumbButton
              selected
              readOnly
              variant={annotation.passed ? "up" : "down"}
              appearance="icon"
              onClick={() => undefined}
            />
            <div data-no-navigate>
              <DropdownMenu
                options={menuOptions}
                align="end"
                trigger={() => (
                  <Button variant="ghost" size="icon">
                    <Icon icon={EllipsisIcon} size="xs" color="foregroundMuted" />
                  </Button>
                )}
              />
            </div>
          </div>
        }
        supporting={
          flaggerSlug || linkedSignalBadge ? (
            <div className="flex flex-wrap items-center gap-2">
              {flaggerSlug ? (
                <FlaggerBadge projectId={projectId} projectSlug={projectSlug} slug={flaggerSlug} />
              ) : null}
              {linkedSignalBadge}
            </div>
          ) : null
        }
      />

      {humanFeedback ? (
        <ScoreEntryCardBody>
          <Text.H5 className="whitespace-pre-wrap leading-relaxed">{humanFeedback}</Text.H5>
        </ScoreEntryCardBody>
      ) : null}

      {isAgentDraft && (
        <ScoreEntryCardSection>
          <div className="ml-auto">
            <AnnotationApprovalPopover annotationId={annotation.id} onAction={onDelete} />
          </div>
        </ScoreEntryCardSection>
      )}
    </ScoreEntryCard>
  )
}
