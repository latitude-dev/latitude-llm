import { Button, cn, Icon, Select, type SelectOption, Textarea } from "@repo/ui"
import { SparklesIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { memo, useState } from "react"
import { useDebounce } from "react-use"
import { useIssue, useIssues } from "../../../../../../domains/issues/issues.collection.ts"

const ISSUE_SELECTOR_BATCH_SIZE = 50
const ISSUE_SELECTOR_SEARCH_DEBOUNCE_MS = 300

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

const IssueSelector = memo(function IssueSelector({
  projectId,
  value,
  onChange,
}: {
  readonly projectId: string
  readonly value: string | null
  readonly onChange: (id: string | null) => void
}) {
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const { data: selectedIssue } = useIssue({
    projectId,
    issueId: value ?? "",
    enabled: value !== null,
  })
  const {
    data: issues = [],
    isLoading: isIssuesLoading,
    infiniteScroll,
  } = useIssues({
    projectId,
    limit: ISSUE_SELECTOR_BATCH_SIZE,
    ...(searchQuery ? { searchQuery } : {}),
  })

  useDebounce(
    () => {
      const normalizedSearchQuery = searchInput.trim()
      if (normalizedSearchQuery !== searchQuery) {
        setSearchQuery(normalizedSearchQuery)
      }
    },
    ISSUE_SELECTOR_SEARCH_DEBOUNCE_MS,
    [searchInput, searchQuery],
  )

  const issueOptionsById = new Map<string, SelectOption<string>>()
  if (selectedIssue) {
    issueOptionsById.set(selectedIssue.id, {
      label: selectedIssue.name,
      value: selectedIssue.id,
    })
  }
  for (const issue of issues) {
    if (!issueOptionsById.has(issue.id)) {
      issueOptionsById.set(issue.id, {
        label: issue.name,
        value: issue.id,
      })
    }
  }
  const issueOptions = [...issueOptionsById.values()]

  return (
    <Select<string>
      name="issue"
      placeholderIcon={<Icon icon={SparklesIcon} />}
      placeholder="Discover issue"
      options={issueOptions}
      value={value ?? undefined}
      searchable
      searchPlaceholder="Search issues…"
      searchableEmptyMessage="No issues found"
      searchLoading={isIssuesLoading}
      onSearch={setSearchInput}
      infiniteScroll={infiniteScroll}
      contentClassName="w-80"
      wrapSearchableOptionText
      removable
      onChange={(id) => onChange(id ?? null)}
      side="top"
      size="small"
    />
  )
})

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
            <div className="w-48 shrink-0">
              <IssueSelector projectId={projectId} value={issueId} onChange={setIssueId} />
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
