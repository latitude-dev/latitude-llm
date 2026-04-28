import { Icon, Input } from "@repo/ui"
import { SearchIcon } from "lucide-react"
import { type Ref, useState } from "react"
import { splitTrailingWord, useTagSuggestion } from "./use-tag-suggestion.ts"

const SEARCH_QUERY_MAX_LENGTH = 500

interface SearchInputProps {
  readonly initialValue: string
  readonly onSubmit: (value: string) => void
  readonly onFocus: () => void
  readonly inputRef: Ref<HTMLInputElement>
  readonly projectId: string
  readonly excludeTags: readonly string[]
  readonly onTagAccepted: (tag: string) => void
}

export function SearchInput({
  initialValue,
  onSubmit,
  onFocus,
  inputRef,
  projectId,
  excludeTags,
  onTagAccepted,
}: SearchInputProps) {
  const [draft, setDraft] = useState(initialValue)
  const suggestion = useTagSuggestion({ projectId, draft, excludeTags })

  const acceptSuggestion = () => {
    if (!suggestion) return
    const { prefix } = splitTrailingWord(draft)
    setDraft(prefix)
    onTagAccepted(suggestion.fullTag)
  }

  return (
    <div className="relative flex-1">
      <div className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
        <Icon icon={SearchIcon} size="sm" color="foregroundMuted" />
      </div>

      {suggestion ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center overflow-hidden whitespace-pre pl-9 pr-4 text-sm leading-5">
          <span className="invisible">{draft}</span>
          <span className="text-muted-foreground/50">{suggestion.suffix}</span>
        </div>
      ) : null}

      <Input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => onFocus()}
        onKeyDown={(event) => {
          if (event.key === "Tab" && suggestion) {
            event.preventDefault()
            acceptSuggestion()
            return
          }
          if (event.key === "Enter") {
            event.preventDefault()
            const next = draft.trim().slice(0, SEARCH_QUERY_MAX_LENGTH)
            onSubmit(next)
          }
        }}
        placeholder="Search"
        size="lg"
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        className="w-full pl-9"
        autoFocus
      />
    </div>
  )
}
