import { Check, Loader2, Search } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"

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
  searchPlaceholder?: string
  searchableEmptyMessage?: string
  loading?: boolean
}

export function SearchableSelectList<V = unknown>({
  options,
  selectedValue,
  onChange,
  onSearchChange,
  searchPlaceholder = "Search...",
  searchableEmptyMessage = "No results found.",
  loading = false,
}: SearchableSelectListProps<V>) {
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSearch = (value: string) => {
    setSearch(value)
    onSearchChange?.(value)
  }

  const filtered = useMemo(() => {
    if (!search) return options
    const lower = search.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(lower))
  }, [options, search])

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-4 w-4 shrink-0 opacity-50" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="flex h-7 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <div className="max-h-60 overflow-y-auto p-1">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin opacity-50" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <Text.H6 color="foregroundMuted">{searchableEmptyMessage}</Text.H6>
          </div>
        ) : (
          filtered.map((option) => {
            const isSelected = String(option.value) === String(selectedValue)
            return (
              <button
                key={String(option.value)}
                type="button"
                disabled={option.disabled}
                onClick={() => onChange(String(option.value))}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                  option.disabled && "pointer-events-none opacity-50",
                )}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  {isSelected && <Check className="h-4 w-4" />}
                </span>
                {option.icon && <span className="pr-2">{option.icon}</span>}
                <Text.H5>{option.label}</Text.H5>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
