import { canUpdateAnnotation, getAnnotationProvenance } from "@domain/annotations"
import { Avatar, Badge, Button, cn, DropdownMenu, Icon, LatitudeLogo, type MenuOption, Text, Tooltip } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Link, useParams } from "@tanstack/react-router"
import { EllipsisIcon, GlobeIcon, ShieldAlertIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useDeleteAnnotation } from "../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { useProjectMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import { pickUserFromMembersMap } from "../../../../../../domains/members/pick-users-from-members.ts"
import { useSignal } from "../../../../../../domains/signals/signals.collection.ts"
import { FlaggerBadge } from "../flaggers/flagger-badge.tsx"
import { AnnotationApprovalPopover } from "./annotation-approval-popover.tsx"
import { AnnotationInput } from "./annotation-input.tsx"
import { EnrichmentPopover } from "./enrichment-popover.tsx"

interface AnnotationCardProps {
  readonly annotation: AnnotationRecord
  readonly projectId: string
  readonly isGlobal?: boolean
  readonly showLinkedSignal?: boolean
  readonly compact?: boolean
  readonly feedbackPrefix?: string
  readonly isUpdateLoading?: boolean
  readonly onUpdate: (data: { passed: boolean; comment: string; signalId: string | null }) => void
  readonly onDelete?: (() => void) | undefined
}

export function AnnotationCard({
  annotation,
  projectId,
  isGlobal = false,
  showLinkedSignal = true,
  compact = false,
  feedbackPrefix,
  isUpdateLoading = false,
  onUpdate,
  onDelete,
}: AnnotationCardProps) {
  const { projectSlug } = useParams({ strict: false })
  const [isEditing, setIsEditing] = useState(false)
  const [showFullFeedback, setShowFullFeedback] = useState(false)
  const memberByUserId = useProjectMemberByUserIdMap()
  const annotator = pickUserFromMembersMap(memberByUserId, annotation.annotatorId)
  const deleteMutation = useDeleteAnnotation()
  const { data: linkedSignal } = useSignal({
    projectId,
    signalId: annotation.signalId ?? "",
    enabled: showLinkedSignal && annotation.signalId !== null,
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
      <div data-no-navigate className={cn({ "px-4 py-3": compact })}>
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
  const feedbackPrefixWithSeparator = feedbackPrefix?.trim() ? `${feedbackPrefix.trim()}:` : undefined
  const displayedFeedback =
    humanFeedback &&
    feedbackPrefixWithSeparator &&
    humanFeedback.toLocaleLowerCase().startsWith(feedbackPrefixWithSeparator.toLocaleLowerCase())
      ? humanFeedback.slice(feedbackPrefixWithSeparator.length).trim()
      : humanFeedback
  const showRawFeedback =
    rawFeedback &&
    (provenance === "agent" || ((provenance === "human" || provenance === "api") && isPublished)) &&
    rawFeedback !== humanFeedback

  if (compact) {
    const author = provenance === "human" ? (annotator?.name ?? "Human") : provenance === "agent" ? "Latitude" : "API"

    return (
      <div data-annotation-card-id={annotation.id} tabIndex={-1} className="flex flex-col gap-2 px-4 py-3 outline-none">
        <div className="flex min-w-0 items-center gap-2">
          {provenance === "human" && annotator ? (
            <Avatar name={annotator.name} imageSrc={annotator.imageSrc} size="xs" />
          ) : null}
          {provenance === "agent" ? <LatitudeLogo className="h-4 w-4 shrink-0" /> : null}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Text.H6 color="foregroundMuted" className="truncate">
              {author}
            </Text.H6>
            {provenance === "agent" && flaggerSlug ? (
              <Text.H6 color="foregroundMuted" className="truncate">
                · {flaggerSlug}
              </Text.H6>
            ) : null}
            <Text.H6 color="foregroundMuted" noWrap>
              {relativeTime(new Date(annotation.createdAt))}
            </Text.H6>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isGlobal ? (
              <Tooltip
                asChild
                trigger={
                  <div className="flex h-7 w-7 items-center justify-center rounded-md">
                    <Icon icon={GlobeIcon} size="xs" color="foregroundMuted" />
                  </div>
                }
              >
                Applies to the entire conversation
              </Tooltip>
            ) : null}
            {showRawFeedback ? <EnrichmentPopover annotationId={annotation.id} rawFeedback={rawFeedback} /> : null}
            <div className="flex h-7 w-7 items-center justify-center">
              <Icon
                icon={annotation.passed ? ThumbsUpIcon : ThumbsDownIcon}
                size="xs"
                color={annotation.passed ? "successMutedForeground" : "destructiveMutedForeground"}
              />
            </div>
            <div data-no-navigate>
              <DropdownMenu
                options={menuOptions}
                align="end"
                trigger={() => (
                  <Button variant="ghost" size="icon-xs">
                    <Icon icon={EllipsisIcon} size="xs" color="foregroundMuted" />
                  </Button>
                )}
              />
            </div>
          </div>
        </div>

        {displayedFeedback ? (
          <div className="flex flex-col items-start gap-1">
            <Text.H6
              className="whitespace-pre-wrap leading-5"
              wordBreak="words"
              {...(!showFullFeedback ? { lineClamp: 3 } : {})}
            >
              {displayedFeedback}
            </Text.H6>
            {displayedFeedback.length > 240 ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 py-0"
                onClick={() => setShowFullFeedback((current) => !current)}
              >
                {showFullFeedback ? "Show less" : "Show more"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {isAgentDraft ? <AnnotationApprovalPopover annotationId={annotation.id} onAction={onDelete} /> : null}
      </div>
    )
  }

  return (
    <div
      data-annotation-card-id={annotation.id}
      tabIndex={-1}
      className="m-1 flex flex-col gap-1 rounded-lg p-1 outline-none"
    >
      <div className="flex items-center gap-2">
        {provenance === "human" && annotator && (
          <>
            <Avatar name={annotator.name} imageSrc={annotator.imageSrc} size="xs" />
            <Text.H6 weight="bold">{annotator.name}</Text.H6>
          </>
        )}
        {provenance === "agent" && (
          <div className="flex items-center gap-1.5">
            <LatitudeLogo className="h-4 w-4" />
            <Text.H6 weight="bold">Latitude</Text.H6>
            {flaggerSlug ? (
              <FlaggerBadge projectId={projectId} projectSlug={projectSlug} slug={flaggerSlug} />
            ) : (
              <Badge variant="secondary" size="small">
                Agent
              </Badge>
            )}
          </div>
        )}
        {provenance === "api" && (
          <Badge variant="outline" size="small">
            API
          </Badge>
        )}
        <Text.H6 color="foregroundMuted">{relativeTime(new Date(annotation.createdAt))}</Text.H6>
        <div className="ml-auto flex items-center gap-x-1">
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
          {showRawFeedback && <EnrichmentPopover annotationId={annotation.id} rawFeedback={rawFeedback} />}
          <div className="flex h-8 w-8 items-center justify-center">
            <Icon
              icon={annotation.passed ? ThumbsUpIcon : ThumbsDownIcon}
              size="xs"
              color={annotation.passed ? "successMutedForeground" : "destructiveMutedForeground"}
            />
          </div>

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
      </div>

      {displayedFeedback ? <Text.H5 className="whitespace-pre-wrap">{displayedFeedback}</Text.H5> : null}

      {((showLinkedSignal && linkedSignalName) || isAgentDraft) && (
        <div className="flex items-center gap-2 pt-1">
          {showLinkedSignal &&
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
            })()}
          {isAgentDraft && (
            <div className="ml-auto">
              <AnnotationApprovalPopover annotationId={annotation.id} onAction={onDelete} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
