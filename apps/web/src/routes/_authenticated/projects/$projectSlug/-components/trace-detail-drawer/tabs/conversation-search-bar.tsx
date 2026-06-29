import { Button, cn, Icon } from "@repo/ui"
import { SearchIcon, XIcon } from "lucide-react"
import { startTransition, useCallback, useState } from "react"
import { useDebounce } from "../../../../../../../lib/hooks/useDebounce.ts"

export const CONVERSATION_SEARCH_MAX_LENGTH = 500
const CONVERSATION_SEARCH_DEBOUNCE_MS = 200

export function ConversationSearchBar({
  onDebouncedQueryChange,
  className,
}: {
  readonly onDebouncedQueryChange: (query: string) => void
  readonly className?: string
}) {
  const [value, setValue] = useState("")

  const publishQuery = useCallback(
    (query: string) => {
      startTransition(() => {
        onDebouncedQueryChange(query)
      })
    },
    [onDebouncedQueryChange],
  )

  useDebounce(
    () => {
      const trimmed = value.trim()
      if (trimmed.length > 0) publishQuery(trimmed)
    },
    CONVERSATION_SEARCH_DEBOUNCE_MS,
    [publishQuery, value],
  )

  function handleChange(next: string) {
    setValue(next)
    if (next.trim().length === 0) publishQuery("")
  }

  return (
    <div
      className={cn("flex h-8 min-w-0 items-center gap-2 rounded-md border border-input bg-muted/40 px-2.5", className)}
    >
      <Icon icon={SearchIcon} size="sm" color="foregroundMuted" className="shrink-0" />
      <input
        type="search"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Search in conversation…"
        maxLength={CONVERSATION_SEARCH_MAX_LENGTH}
        aria-label="Search in conversation"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex w-6 shrink-0 items-center justify-center">
        {value.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Clear conversation search"
            onClick={() => handleChange("")}
          >
            <Icon icon={XIcon} size="xs" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
