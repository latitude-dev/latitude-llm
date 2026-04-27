import { Button, cn, Icon, Select, type SelectOption, Text, Textarea, ThumbButton, Tooltip } from "@repo/ui"
import { InfoIcon, SparklesIcon } from "lucide-react"
import { memo, useRef, useState } from "react"
import { useDebounce } from "react-use"
import { HotkeyBadge } from "../../../../../../components/hotkey-badge.tsx"
import { useIssue, useIssues } from "../../../../../../domains/issues/issues.collection.ts"

const SAVE_HOTKEY = "Mod+Enter"

const ISSUE_SELECTOR_BATCH_SIZE = 50
const ISSUE_SELECTOR_SEARCH_DEBOUNCE_MS = 300

interface AnnotationInputProps {
  readonly projectId: string
  readonly isLoading?: boolean
  readonly initialPassed?: boolean | null
  readonly initialComment?: string
  readonly initialIssueId?: string | null
  readonly cancellable?: boolean
  readonly autoFocus?: boolean
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
      placeholderIcon={<Icon icon={SparklesIcon} size="sm" />}
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
  autoFocus = false,
  onSave,
  onCancel,
}: AnnotationInputProps) {
  const [passed, setPassed] = useState<boolean | null>(initialPassed)
  const [comment, setComment] = useState(initialComment)
  const [issueId, setIssueId] = useState<string | null>(initialIssueId)
  const [ratingError, setRatingError] = useState(false)
  const [commentError, setCommentError] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSave() {
    if (isLoading) return
    const trimmedComment = comment.trim()
    if (passed === null || trimmedComment.length === 0) {
      setRatingError(passed === null)
      setCommentError(trimmedComment.length === 0)
      return
    }
    onSave({ passed, comment: trimmedComment, issueId })
    setPassed(initialPassed)
    setComment(initialComment)
    setIssueId(initialIssueId)
    setRatingError(false)
    setCommentError(false)
  }

  function handleThumbUp() {
    setPassed(true)
    setIssueId(null)
    setRatingError(false)
    textareaRef.current?.focus()
  }

  function handleThumbDown() {
    setPassed(false)
    setRatingError(false)
    textareaRef.current?.focus()
  }

  function handleCommentChange(value: string) {
    setComment(value)
    if (commentError && value.trim().length > 0) {
      setCommentError(false)
    }
  }

  const commentPlaceholder =
    passed === true ? "What did the AI do well?" : passed === false ? "What could be improved?" : "How did the AI do?"

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-2 bg-background transition-colors",
        "border-input focus-within:border-ring",
      )}
    >
      <div className="p-3">
        <Textarea
          ref={textareaRef}
          unstyled
          minRows={2}
          value={comment}
          onChange={(e) => handleCommentChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && onCancel) {
              e.preventDefault()
              onCancel()
              return
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleSave()
            }
          }}
          placeholder={commentPlaceholder}
          disabled={isLoading}
          autoFocus={autoFocus}
        />
        {commentError && <Text.H6 color="destructiveMutedForeground">Add some feedback first</Text.H6>}
      </div>

      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <div className="flex items-center gap-1 min-w-0">
          <ThumbButton selected={passed === true} variant="up" onClick={handleThumbUp} disabled={isLoading} />
          <ThumbButton selected={passed === false} variant="down" onClick={handleThumbDown} disabled={isLoading} />
          {passed === null && (
            <Text.H6 color={ratingError ? "destructiveMutedForeground" : "foregroundMuted"}>How did the AI do?</Text.H6>
          )}
          {passed === false && (
            <>
              <div className="w-48 shrink-0">
                <IssueSelector projectId={projectId} value={issueId} onChange={setIssueId} />
              </div>
              <Tooltip
                asChild
                trigger={
                  <button
                    type="button"
                    aria-label="About issue linking"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon icon={InfoIcon} size="sm" />
                  </button>
                }
              >
                The system will cluster your feedback to the most relevant issue, or it will create a new one. You can
                manually select an issue to override this.
              </Tooltip>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {cancellable && onCancel && (
            <Button variant="ghost" size="sm" disabled={isLoading} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button variant="default" size="sm" isLoading={isLoading} onClick={handleSave}>
            Save
            <HotkeyBadge hotkey={SAVE_HOTKEY} />
          </Button>
        </div>
      </div>
    </div>
  )
}
