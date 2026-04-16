import { canUpdateAnnotation, getAnnotationProvenance } from "@domain/annotations"
import {
  Avatar,
  Badge,
  Button,
  DropdownMenu,
  Icon,
  LatitudeLogo,
  type MenuOption,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
  Tooltip,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useNavigate, useParams } from "@tanstack/react-router"
import {
  EllipsisIcon,
  GlobeIcon,
  InfoIcon,
  ShieldAlertIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react"
import { type MouseEvent, useMemo, useState } from "react"
import {
  useApproveSystemAnnotation,
  useDeleteAnnotation,
  useRejectSystemAnnotation,
} from "../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { useIssue } from "../../../../../../domains/issues/issues.collection.ts"
import { useMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import { pickUserFromMembersMap } from "../../../../../../domains/members/pick-users-from-members.ts"
import { AnnotationInput } from "./annotation-input.tsx"

interface AnnotationApprovalButtonsProps {
  readonly annotationId: string
  readonly onAction?: (() => void) | undefined
}

function AnnotationApprovalButtons({ annotationId, onAction }: AnnotationApprovalButtonsProps) {
  const approveMutation = useApproveSystemAnnotation()
  const rejectMutation = useRejectSystemAnnotation()
  const isDisabled = approveMutation.isPending || rejectMutation.isPending

  function handleApprove(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    approveMutation.mutate(annotationId, onAction ? { onSuccess: onAction } : undefined)
  }

  function handleReject(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    rejectMutation.mutate(annotationId, onAction ? { onSuccess: onAction } : undefined)
  }

  return (
    <div className="flex items-center gap-2" data-no-navigate data-annotation-approval-buttons={annotationId}>
      <Tooltip
        asChild
        trigger={
          <span className="inline-flex items-center text-muted-foreground">
            <Icon icon={InfoIcon} size="xs" color="foregroundMuted" />
          </span>
        }
      >
        This annotation was automatically created with AI and requires review
      </Tooltip>
      <Button
        variant="destructive-soft"
        size="sm"
        onClick={handleReject}
        disabled={isDisabled}
        isLoading={rejectMutation.isPending}
      >
        Reject
      </Button>
      <Button
        variant="default-soft"
        size="sm"
        onClick={handleApprove}
        disabled={isDisabled}
        isLoading={approveMutation.isPending}
      >
        Approve
      </Button>
    </div>
  )
}

interface AnnotationCardProps {
  readonly annotation: AnnotationRecord
  readonly projectId: string
  readonly isGlobal?: boolean
  readonly isUpdateLoading?: boolean
  readonly onUpdate: (data: { passed: boolean; comment: string; issueId: string | null }) => void
  readonly onDelete?: (() => void) | undefined
}

export function AnnotationCard({
  annotation,
  projectId,
  isGlobal = false,
  isUpdateLoading = false,
  onUpdate,
  onDelete,
}: AnnotationCardProps) {
  const navigate = useNavigate()
  const { projectSlug } = useParams({ strict: false })
  const [isEditing, setIsEditing] = useState(false)
  const memberByUserId = useMemberByUserIdMap()
  const annotator = pickUserFromMembersMap(memberByUserId, annotation.annotatorId)
  const deleteMutation = useDeleteAnnotation()
  const { data: linkedIssue } = useIssue({
    projectId,
    issueId: annotation.issueId ?? "",
    enabled: annotation.issueId !== null,
  })

  const linkedIssueName = linkedIssue?.name ?? null
  const linkedIssueDescription = linkedIssue?.description?.trim()
  const provenance = getAnnotationProvenance(annotation)
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

  function handleSave(data: { passed: boolean; comment: string; issueId: string | null }) {
    onUpdate(data)
    setIsEditing(false)
  }

  function openLinkedIssue(event: { stopPropagation: () => void; preventDefault?: () => void }) {
    if (!annotation.issueId || !projectSlug) {
      return
    }

    event.stopPropagation()
    event.preventDefault?.()
    void navigate({
      to: "/projects/$projectSlug/issues",
      params: { projectSlug },
      search: {
        issueId: annotation.issueId,
      },
    })
  }

  if (isEditing) {
    return (
      <div data-no-navigate>
        <AnnotationInput
          projectId={projectId}
          isLoading={isUpdateLoading}
          initialPassed={annotation.passed}
          initialComment={annotation.feedback ?? ""}
          initialIssueId={annotation.issueId}
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

  return (
    <div
      data-annotation-card-id={annotation.id}
      tabIndex={-1}
      className="flex flex-col gap-1 m-1 p-1 rounded-lg outline-none"
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
            <Badge variant="secondary" size="small">
              Agent
            </Badge>
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
          {showRawFeedback && (
            <div data-no-navigate>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Icon icon={SparklesIcon} size="xs" color="foregroundMuted" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="max-w-md">
                  <div className="flex flex-col gap-0.5">
                    <Text.H6 color="foregroundMuted" className="mb-1">
                      This feedback has been enriched with AI
                    </Text.H6>
                    <Text.H6 className="whitespace-pre-wrap">{rawFeedback}</Text.H6>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
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

      {humanFeedback && <Text.H5 className="whitespace-pre-wrap">{humanFeedback}</Text.H5>}

      {(linkedIssueName || isAgentDraft) && (
        <div className="flex items-center gap-2 pt-1">
          {linkedIssueName &&
            (() => {
              const issueLinkBadge = (
                <Badge
                  data-no-navigate
                  variant="outline"
                  size="small"
                  ellipsis
                  role="button"
                  tabIndex={0}
                  aria-label={`Open issue ${linkedIssueName}`}
                  className="cursor-pointer hover:bg-muted"
                  iconProps={{
                    icon: ShieldAlertIcon,
                    color: "foregroundMuted",
                    placement: "start",
                    className: "stroke-[2.5]",
                  }}
                  onClick={openLinkedIssue}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      openLinkedIssue(event)
                    }
                  }}
                >
                  {linkedIssueName}
                </Badge>
              )
              return linkedIssueDescription ? (
                <Tooltip asChild trigger={issueLinkBadge}>
                  <span className="block max-w-xs whitespace-pre-wrap text-left">{linkedIssueDescription}</span>
                </Tooltip>
              ) : (
                issueLinkBadge
              )
            })()}
          {isAgentDraft && (
            <div className="ml-auto">
              <AnnotationApprovalButtons annotationId={annotation.id} onAction={onDelete} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
