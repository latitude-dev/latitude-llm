import { Loader2, Search } from "lucide-react"
import { type KeyboardEvent, type ReactNode, type UIEvent, useCallback, useMemo, useState } from "react"

import { cn } from "../../utils/cn.ts"
import { Text } from "../text/text.tsx"

interface SearchableOption<V = unknown> {
  label: string
  value: V
  icon?: ReactNode
  disabled?: boolean
}

interface SearchableSelectListProps<V = unknown> {
  options: readonly SearchableOption<V>[]
  selectedValue?: V | undefined
  onChange: (value: string) => void
  onSearchChange?: (search: string) => void
  searchMode?: "client" | "server"
  searchPlaceholder?: string
  searchableEmptyMessage?: string
  loading?: boolean
  wrapOptionText?: boolean
  infiniteScroll?: {
    hasMore: boolean
    isLoadingMore: boolean
    onLoadMore: () => void
  }
}

export function SearchableSelectList<V = unknown>({
  options,
  onChange,
  onSearchChange,
  searchMode = "client",
  searchPlaceholder = "Search...",
  searchableEmptyMessage = "No results found.",
  loading = false,
  wrapOptionText = false,
  infiniteScroll,
}: SearchableSelectListProps<V>) {
  const [search, setSearch] = useState("")
  const focusInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus()
  }, [])

  const handleSearch = (value: string) => {
    setSearch(value)
    onSearchChange?.(value)
  }

  const stopEventPropagation = (event: { stopPropagation(): void }) => {
    event.stopPropagation()
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" || event.key === "Tab") {
      return
    }

    // Prevent Radix Select typeahead from stealing keystrokes from the search input.
    event.stopPropagation()
  }

  const filtered = useMemo(() => {
    if (searchMode === "server" || !search) return options
    const lower = search.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(lower))
  }, [options, search, searchMode])

  const handleOptionsScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!infiniteScroll || !infiniteScroll.hasMore || infiniteScroll.isLoadingMore || loading) {
      return
    }

    const target = event.currentTarget
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    if (distanceToBottom < 40) {
      infiniteScroll.onLoadMore()
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-4 w-4 shrink-0 opacity-50" />
        <input
          ref={focusInputRef}
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          onPointerDown={stopEventPropagation}
          onPointerUp={stopEventPropagation}
          onMouseDown={stopEventPropagation}
          onMouseUp={stopEventPropagation}
          onClick={stopEventPropagation}
          onKeyDown={handleInputKeyDown}
          placeholder={searchPlaceholder}
          className="flex h-7 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <div className="max-h-60 overflow-y-auto p-1" onScroll={handleOptionsScroll}>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin opacity-50" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <Text.H6 color="foregroundMuted">{searchableEmptyMessage}</Text.H6>
          </div>
        ) : (
          <>
            {filtered.map((option) => {
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => onChange(String(option.value))}
                  className={cn(
                    "relative flex w-full cursor-default select-none rounded-md py-1.5 px-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                    {
                      "items-start": wrapOptionText,
                      "items-center": !wrapOptionText,
                    },
                    option.disabled && "pointer-events-none opacity-50",
                  )}
                >
                  {option.icon && <span className="pr-2">{option.icon}</span>}
                  <Text.H5
                    className={cn({
                      "text-left whitespace-normal break-words": wrapOptionText,
                    })}
                    {...(wrapOptionText ? {} : { noWrap: true, ellipsis: true })}
                  >
                    {option.label}
                  </Text.H5>
                </button>
              )
            })}
            {infiniteScroll?.isLoadingMore ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin opacity-50" />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
