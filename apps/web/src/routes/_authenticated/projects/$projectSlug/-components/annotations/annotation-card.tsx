import {
  Avatar,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  Icon,
  type MenuOption,
  Text,
  Tooltip,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { EllipsisIcon, GlobeIcon, HashIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useDeleteAnnotation } from "../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { useIssue } from "../../../../../../domains/issues/issues.collection.ts"
import { useMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import { pickUserFromMembersMap } from "../../../../../../domains/members/pick-users-from-members.ts"
import { AnnotationInput } from "./annotation-input.tsx"

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

  const menuOptions: MenuOption[] = useMemo(
    () => [
      {
        label: "Edit",
        onClick: () => setIsEditing(true),
      },
      {
        label: "Remove",
        type: "destructive",
        onClick: () =>
          deleteMutation.mutate({ scoreId: annotation.id, projectId }, onDelete ? { onSuccess: onDelete } : undefined),
      },
    ],
    [annotation.id, projectId, deleteMutation, onDelete],
  )

  function handleSave(data: { passed: boolean; comment: string; issueId: string | null }) {
    onUpdate(data)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <AnnotationInput
        projectId={projectId}
        isLoading={isUpdateLoading}
        initialPassed={annotation.passed}
        initialComment={annotation.feedback ?? ""}
        initialIssueId={annotation.issueId}
        onSave={handleSave}
        cancellable
        onCancel={() => setIsEditing(false)}
      />
    )
  }

  return (
    <div
      data-annotation-card-id={annotation.id}
      tabIndex={-1}
      className="flex flex-col gap-1 m-1 p-1 rounded-lg outline-none"
    >
      <div className="flex items-center gap-2">
        {annotator && (
          <>
            <Avatar name={annotator.name} imageSrc={annotator.imageSrc} size="xs" />
            <Text.H6 weight="bold">{annotator.name}</Text.H6>
          </>
        )}
        <Text.H6 color="foregroundMuted">{relativeTime(new Date(annotation.createdAt))}</Text.H6>

        <div className="ml-auto flex items-center gap-x-1">
          {isGlobal && (
            <Tooltip
              asChild
              trigger={
                <div className="flex h-8 w-8 items-center justify-center rounded-md transition-colors bg-muted">
                  <Icon icon={GlobeIcon} size="xs" color="foregroundMuted" />
                </div>
              }
            >
              Applies to the entire conversation
            </Tooltip>
          )}
          <div className="flex h-8 w-8 items-center justify-center">
            <Icon
              icon={annotation.passed ? ThumbsUpIcon : ThumbsDownIcon}
              size="xs"
              color={annotation.passed ? "successMutedForeground" : "destructiveMutedForeground"}
            />
          </div>

          <DropdownMenu
            options={menuOptions}
            align="end"
            trigger={() => (
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Icon icon={EllipsisIcon} size="xs" color="foregroundMuted" />
                </Button>
              </DropdownMenuTrigger>
            )}
          />
        </div>
      </div>

      {annotation.feedback?.trim() && <Text.H5 className="whitespace-pre-wrap">{annotation.feedback.trim()}</Text.H5>}

      {linkedIssueName && (
        <div className="flex mt-1">
          <Badge
            variant="outline"
            size="small"
            ellipsis
            iconProps={{ icon: HashIcon, color: "foregroundMuted", placement: "start" }}
          >
            {linkedIssueName}
          </Badge>
        </div>
      )}
    </div>
  )
}
