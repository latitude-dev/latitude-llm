import { Icon, Input } from "@repo/ui"
import { SearchIcon } from "lucide-react"
import { type KeyboardEvent, type Ref, useEffect, useState } from "react"
import { useDebounce } from "react-use"

const SEARCH_QUERY_MAX_LENGTH = 500
const COMMIT_DEBOUNCE_MS = 300

interface SearchInputProps {
  /** The committed value (driven by URL state). */
  readonly value: string
  /** Called on debounce idle or Enter. */
  readonly onCommit: (value: string) => void
  readonly onTagShortcut?: (anchor: HTMLElement) => void
  readonly onArrowDown?: () => void
  readonly inputRef?: Ref<HTMLInputElement>
}

function clamp(input: string): string {
  return input.trim().slice(0, SEARCH_QUERY_MAX_LENGTH)
}

export function SearchInput({ value, onCommit, onTagShortcut, onArrowDown, inputRef }: SearchInputProps) {
  const [draft, setDraft] = useState(value)

  useDebounce(
    () => {
      const next = clamp(draft)
      if (next !== value) onCommit(next)
    },
    COMMIT_DEBOUNCE_MS,
    [draft],
  )

  // TODO(frontend-use-effect-policy): mirror external `value` changes (e.g.
  // back-arrow Link clearing `q`) into the local draft. The debounced commit
  // already keeps `value` in sync with `draft` for self-initiated edits, so
  // this only fires for outside changes.
  useEffect(() => {
    setDraft(value)
  }, [value])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      onCommit(clamp(draft))
      return
    }
    if (event.key === "ArrowDown" && onArrowDown) {
      event.preventDefault()
      onArrowDown()
      return
    }
    if (event.key === "#" && onTagShortcut) {
      event.preventDefault()
      onTagShortcut(event.currentTarget)
    }
  }

  return (
    <div className="relative flex-1">
      <div className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
        <Icon icon={SearchIcon} size="sm" color="foregroundMuted" />
      </div>
      <Input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search traces — type # for tags, ↓ for filters"
        size="lg"
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        className="w-full pl-9"
      />
    </div>
  )
}
