import { Button, cn, Icon, Select, type SelectOption, Textarea } from "@repo/ui"
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { useState } from "react"
import { useListIssues } from "../../../../../../domains/issues/issues.collection.ts"

interface AnnotationInputProps {
  readonly projectId: string
  readonly isLoading?: boolean
  readonly initialPassed?: boolean | null
  readonly initialComment?: string
  readonly initialIssueId?: string | null
  readonly cancellable?: boolean
  readonly onSave: (data: { passed: boolean; comment: string; issueId: string | null }) => void
  readonly onCancel?: (() => void) | undefined
}

export function AnnotationInput({
  projectId,
  isLoading = false,
  initialPassed = null,
  initialComment = "",
  initialIssueId = null,
  cancellable = false,
  onSave,
  onCancel,
}: AnnotationInputProps) {
  const [passed, setPassed] = useState<boolean | null>(initialPassed)
  const [comment, setComment] = useState(initialComment)
  const [issueId, setIssueId] = useState<string | null>(initialIssueId)

  const { data: issues = [], isLoading: isIssuesLoading } = useListIssues({
    projectId,
    enabled: passed === false,
  })

  const issueOptions: SelectOption<string>[] = issues.map((issue) => ({
    label: issue.name,
    value: issue.id,
  }))

  function handleSave() {
    if (passed === null || isLoading) return
    onSave({ passed, comment: comment.trim(), issueId })
    setPassed(initialPassed)
    setComment(initialComment)
    setIssueId(initialIssueId)
  }

  function handleThumbUp() {
    setPassed(true)
    setIssueId(null)
  }

  function handleThumbDown() {
    setPassed(false)
  }

  const canSave = passed !== null && comment.trim().length > 0 && !isLoading

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-background transition-colors",
        "border-input focus-within:border-ring",
      )}
    >
      <div className="p-3">
        <Textarea
          unstyled
          minRows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Leave a note about AI performance"
          disabled={isLoading}
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <div className="flex items-center gap-1">
          <ThumbButton selected={passed === true} variant="up" onClick={handleThumbUp} disabled={isLoading} />
          <ThumbButton selected={passed === false} variant="down" onClick={handleThumbDown} disabled={isLoading} />
        </div>

        <div className="flex items-center gap-1 min-w-0">
          {passed === false && (
            <div className="min-w-0 max-w-40">
              <Select<string>
                name="issue"
                placeholder="Issue"
                options={issueOptions}
                value={issueId ?? undefined}
                loading={isIssuesLoading && issues.length === 0}
                searchable
                searchPlaceholder="Search issues…"
                searchableEmptyMessage="No issues found"
                removable
                onChange={(id) => setIssueId(id ?? null)}
                side="top"
                size="small"
              />
            </div>
          )}
          {cancellable && onCancel && (
            <Button variant="ghost" size="sm" disabled={isLoading} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button variant="default" size="sm" disabled={!canSave} isLoading={isLoading} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function ThumbButton({
  selected,
  variant,
  onClick,
  disabled,
}: {
  readonly selected: boolean
  readonly variant: "up" | "down"
  readonly onClick: () => void
  readonly disabled?: boolean
}) {
  const isUp = variant === "up"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? isUp
            ? "bg-success-muted text-success-muted-foreground"
            : "bg-destructive-muted text-destructive-muted-foreground"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      <Icon icon={isUp ? ThumbsUpIcon : ThumbsDownIcon} size="sm" />
    </button>
  )
}
