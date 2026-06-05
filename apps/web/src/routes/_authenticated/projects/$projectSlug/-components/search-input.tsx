import { Button, cn, Icon, Popover, PopoverTrigger } from "@repo/ui"
import { CircleHelpIcon, SearchIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { useSearchSegments } from "../../../../../lib/hooks/useSearchSegments.ts"
import { SearchSyntaxLegendContent } from "./search-syntax-legend.tsx"

export const SEARCH_QUERY_MAX_LENGTH = 500

/**
 * Segmented search box (semantic words + literal/phrase pills) shared by the project
 * traces/sessions page. Submits the assembled query string via `onSubmit`.
 */
export function SearchInput({
  initialValue,
  onSubmit,
}: {
  readonly initialValue: string
  readonly onSubmit: (value: string) => void
}) {
  const {
    segments,
    registerInput,
    submit,
    updateSegment,
    openPill,
    closePill,
    removeSegment,
    focusSearchEnd,
    focusAdjacentSegment,
  } = useSearchSegments(initialValue, onSubmit, SEARCH_QUERY_MAX_LENGTH)

  const [legendOpen, setLegendOpen] = useState(false)
  const active = segments.some((segment) => segment.text.length > 0) || legendOpen

  return (
    <div
      data-active={active ? "" : undefined}
      className="group/search flex h-full min-w-0 flex-1 items-center bg-transparent pl-1"
    >
      <Popover open={legendOpen} onOpenChange={setLegendOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Search syntax help">
            <Icon
              icon={SearchIcon}
              size="sm"
              color="foregroundMuted"
              className="group-focus-within/search:hidden group-data-active/search:hidden"
            />
            <Icon
              icon={CircleHelpIcon}
              size="sm"
              color="primary"
              className="hidden group-focus-within/search:block group-data-active/search:block"
            />
          </Button>
        </PopoverTrigger>
        <SearchSyntaxLegendContent
          align="start"
          onCloseAutoFocus={(event) => {
            // Radix's default returns focus to the trigger button, which then
            // shows :focus-visible ring after Esc.
            event.preventDefault()
          }}
        />
      </Popover>
      <div className="no-scrollbar flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-3 pl-1 text-sm">
        {segments.map((segment, index) => {
          const isSemantic = segment.kind === "semantic"
          const label = segment.kind === "literal" ? "Literal" : "Phrase"
          const placeholder =
            isSemantic && index === 0 ? 'Search by meaning, "literal text" or `ordered token phrase`' : ""
          return (
            <span
              key={segment.id}
              className={cn(
                "inline-flex min-w-0 shrink-0 items-center",
                isSemantic ? "" : "h-7 gap-1 rounded-full border px-2 text-xs font-medium shadow-sm",
                segment.kind === "literal" ? "border-primary/25 bg-primary/10 text-primary" : "",
                segment.kind === "token" ? "border-phrase/30 bg-phrase/10 text-phrase-foreground" : "",
              )}
            >
              {!isSemantic ? <span className="shrink-0 opacity-70">{label}</span> : null}
              <input
                ref={registerInput(segment.id)}
                value={segment.text}
                onChange={(event) => updateSegment(segment, event.target.value)}
                onKeyDown={(event) => {
                  if (segment.kind === "semantic" && (event.key === '"' || event.key === "`")) {
                    event.preventDefault()
                    openPill(segment, event.key, event.currentTarget)
                    return
                  }
                  if (event.key === "Enter") {
                    event.preventDefault()
                    if (segment.kind === "semantic") submit()
                    else closePill(segment)
                    return
                  }
                  if (event.key === "Backspace" && segment.text.length === 0) {
                    event.preventDefault()
                    removeSegment(segment, true)
                    return
                  }
                  if (event.key === "ArrowLeft" && event.currentTarget.selectionStart === 0) {
                    event.preventDefault()
                    focusAdjacentSegment(segment, "previous")
                    return
                  }
                  if (event.key === "ArrowRight" && event.currentTarget.selectionStart === segment.text.length) {
                    event.preventDefault()
                    focusAdjacentSegment(segment, "next")
                  }
                }}
                placeholder={placeholder}
                maxLength={SEARCH_QUERY_MAX_LENGTH}
                className={cn(
                  "bg-transparent outline-none [field-sizing:content] placeholder:text-muted-foreground",
                  isSemantic ? "h-6 min-w-[1ch] text-sm" : "h-6 min-w-[2ch] font-mono text-xs",
                )}
              />
              {!isSemantic ? (
                <button
                  type="button"
                  aria-label={`Remove ${label.toLowerCase()} search pill`}
                  className="-mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-60 transition-opacity hover:bg-current/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => removeSegment(segment)}
                >
                  <Icon icon={XIcon} size="xs" />
                </button>
              ) : null}
            </span>
          )
        })}
        <button
          type="button"
          aria-label="Continue typing search query"
          className="h-6 min-w-4 flex-1 cursor-text bg-transparent outline-none"
          onMouseDown={(event) => {
            event.preventDefault()
            focusSearchEnd()
          }}
        />
      </div>
    </div>
  )
}
