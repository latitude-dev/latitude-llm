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

function useDistinctValues(mode: FilterMode, args: { projectId: string; column: DistinctColumn; search?: string }) {
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

  useDebounce(() => setDebouncedSearch(inputValue), 300, [inputValue])

  const { data: options = [], isLoading } = useDistinctValues(mode, {
    projectId,
    column,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  })

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
      value={[...selected]}
      onValueChange={onChange}
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
              <ComboboxChipsInput
                placeholder={placeholder}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef} container={portalContainer?.current}>
        <ComboboxEmpty>{isLoading ? "Loading..." : "No values found."}</ComboboxEmpty>
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
