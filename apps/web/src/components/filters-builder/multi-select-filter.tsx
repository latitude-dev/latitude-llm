import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  Text,
} from "@repo/ui"
import { Loader2 } from "lucide-react"
import { type RefObject, useMemo, useRef, useState } from "react"
import { useDebounce } from "react-use"
import { useSessionDistinctValues } from "../../domains/sessions/sessions.collection.ts"
import { useTraceDistinctValues } from "../../domains/traces/traces.collection.ts"
import type { DistinctColumn } from "./types.ts"

export type FilterMode = "traces" | "sessions"

interface MultiSelectFilterProps {
  readonly projectId: string
  readonly column: DistinctColumn
  readonly selected: readonly string[]
  readonly onChange: (values: string[]) => void
  readonly mode?: FilterMode
  readonly disabled?: boolean
  readonly placeholder?: string
  readonly portalContainer?: RefObject<HTMLElement | null>
}

function useDistinctValues(
  mode: FilterMode,
  args: { projectId: string; column: DistinctColumn; search?: string; enabled?: boolean },
) {
  const traceResult = useTraceDistinctValues(args)
  const sessionResult = useSessionDistinctValues(args)
  return mode === "sessions" ? sessionResult : traceResult
}

export function MultiSelectFilter({
  projectId,
  column,
  selected,
  onChange,
  mode = "traces",
  disabled,
  placeholder = "Search...",
  portalContainer,
}: MultiSelectFilterProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  // `hasOpened` latches once the popup has been opened so we keep the cached
  // results around (and don't re-fetch) after the user closes it again.
  const [hasOpened, setHasOpened] = useState(false)

  useDebounce(() => setDebouncedSearch(inputValue), 300, [inputValue])

  const { data: options = [], isFetching } = useDistinctValues(mode, {
    projectId,
    column,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    // Defer fetching until the popup is first opened so opening the filter
    // modal doesn't fire one query per multi-select up front.
    enabled: hasOpened,
  })

  // Cover both the "user typed, debounce hasn't fired yet" gap and the
  // in-flight fetch, so the indicator stays visible across the whole search.
  const isSearching = isFetching || inputValue !== debouncedSearch

  const allItems = useMemo(() => {
    const optionSet = new Set(options)
    const combined = [...selected.filter((s) => !optionSet.has(s)), ...options]
    return combined
  }, [options, selected])

  return (
    <Combobox
      multiple
      autoHighlight
      modal
      filter={null}
      onOpenChange={(open) => {
        if (open) setHasOpened(true)
      }}
      inputValue={inputValue}
      onInputValueChange={(value) => setInputValue(value)}
      value={[...selected]}
      onValueChange={(values: string[]) => {
        onChange(values)
        setInputValue("")
      }}
      items={allItems}
      itemToStringValue={(v) => v}
      isItemEqualToValue={(a, b) => a === b}
      disabled={disabled}
    >
      <ComboboxChips ref={anchorRef}>
        <ComboboxValue>
          {(values: string[]) => (
            <>
              {values.map((v) => (
                <ComboboxChip key={v}>{v}</ComboboxChip>
              ))}
              <ComboboxChipsInput placeholder={placeholder} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef} container={portalContainer?.current}>
        {isSearching ? (
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching…
          </div>
        ) : null}
        <ComboboxEmpty>{isSearching ? null : "No values found."}</ComboboxEmpty>
        <ComboboxList>
          {(value: string) => (
            <ComboboxItem key={value} value={value}>
              <Text.H5>{value}</Text.H5>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
