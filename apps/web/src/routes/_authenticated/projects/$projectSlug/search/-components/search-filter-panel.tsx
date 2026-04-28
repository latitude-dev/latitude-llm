import type { FilterCondition, FilterSet } from "@domain/shared"
import { Input, Text } from "@repo/ui"
import { type KeyboardEvent, type ReactNode, type Ref, useRef } from "react"
import { DateRangeFilter } from "../../../../../../components/filters-builder/date-range-filter.tsx"
import { MetadataFilter } from "../../../../../../components/filters-builder/metadata-filter/metadata-filter.tsx"
import { useMetadataFilter } from "../../../../../../components/filters-builder/metadata-filter/use-metadata-filter.ts"
import { MultiSelectFilter } from "../../../../../../components/filters-builder/multi-select-filter.tsx"
import { NumberRangeFilter } from "../../../../../../components/filters-builder/number-range-filter.tsx"
import type { DistinctColumn } from "../../../../../../components/filters-builder/types.ts"
import {
  getInValues,
  getRangeValues,
  getTextFilterValue,
  setFieldConditions,
} from "../../../../../../components/filters-builder/utils.ts"
import { SearchFilterPills } from "./search-filter-pills.tsx"
import { SearchInput } from "./search-input.tsx"

interface SearchFilterPanelProps {
  readonly projectId: string
  readonly filters: FilterSet
  readonly onFiltersChange: (next: FilterSet) => void
  readonly onPillRemove: (field: string) => void
  readonly query: string
  readonly onQueryChange: (next: string) => void
  readonly onQuerySubmit: (next: string) => void
  readonly inputRef: Ref<HTMLInputElement>
}

interface RowDefinition {
  readonly field: string
  readonly label: string
  readonly editor:
    | { readonly type: "text"; readonly placeholder: string }
    | { readonly type: "multiSelect"; readonly column: DistinctColumn }
    | { readonly type: "numberRange" }
    | { readonly type: "date" }
    | { readonly type: "metadata" }
}

const ROW_DEFINITIONS: readonly RowDefinition[] = [
  { field: "tags", label: "Tags", editor: { type: "multiSelect", column: "tags" } },
  { field: "startTime", label: "Time", editor: { type: "date" } },
  { field: "models", label: "Models", editor: { type: "multiSelect", column: "models" } },
  { field: "serviceNames", label: "Service", editor: { type: "multiSelect", column: "serviceNames" } },
  { field: "providers", label: "Providers", editor: { type: "multiSelect", column: "providers" } },
  { field: "userId", label: "User ID", editor: { type: "text", placeholder: "Filter by user…" } },
  { field: "cost", label: "Cost", editor: { type: "numberRange" } },
  { field: "duration", label: "Duration", editor: { type: "numberRange" } },
  { field: "spanCount", label: "Span count", editor: { type: "numberRange" } },
  { field: "errorCount", label: "Error count", editor: { type: "numberRange" } },
  { field: "tokensInput", label: "Tokens in", editor: { type: "numberRange" } },
  { field: "tokensOutput", label: "Tokens out", editor: { type: "numberRange" } },
  { field: "ttft", label: "TTFT", editor: { type: "numberRange" } },
  { field: "name", label: "Name", editor: { type: "text", placeholder: "Filter by name…" } },
  { field: "traceId", label: "Trace ID", editor: { type: "text", placeholder: "Filter by trace…" } },
  { field: "sessionId", label: "Session ID", editor: { type: "text", placeholder: "Filter by session…" } },
  { field: "simulationId", label: "Simulation ID", editor: { type: "text", placeholder: "Filter by simulation…" } },
  { field: "metadata", label: "Metadata", editor: { type: "metadata" } },
]

export function SearchFilterPanel({
  projectId,
  filters,
  onFiltersChange,
  onPillRemove,
  query,
  onQueryChange,
  onQuerySubmit,
  inputRef,
}: SearchFilterPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement[]>([])
  const hasActiveFilters = Object.keys(filters).length > 0
  const { entries: metadataEntries, handleChange: handleMetadataChange } = useMetadataFilter(filters, onFiltersChange)

  const setField = (field: string, conditions: FilterCondition[]) => {
    onFiltersChange(setFieldConditions(filters, field, conditions))
  }

  const registerRow = (index: number) => (element: HTMLDivElement | null) => {
    if (element) {
      rowsRef.current[index] = element
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return

    const active = document.activeElement
    if (!active) return

    const isInsideInput = containerRef.current?.querySelector("[data-search-panel-input]")?.contains(active)
    const rows = rowsRef.current
    const currentRowIndex = rows.findIndex((row) => row?.contains(active))

    if (event.key === "ArrowDown") {
      if (isInsideInput) {
        event.preventDefault()
        focusFirstFocusable(rows[0])
        return
      }
      if (currentRowIndex >= 0 && currentRowIndex < rows.length - 1) {
        event.preventDefault()
        focusFirstFocusable(rows[currentRowIndex + 1])
      }
      return
    }

    if (event.key === "ArrowUp") {
      if (currentRowIndex === 0) {
        event.preventDefault()
        const inputEl = containerRef.current?.querySelector(
          "[data-search-panel-input] input",
        ) as HTMLInputElement | null
        inputEl?.focus()
        return
      }
      if (currentRowIndex > 0) {
        event.preventDefault()
        focusFirstFocusable(rows[currentRowIndex - 1])
      }
    }
  }

  return (
    <search ref={containerRef} className="flex flex-col" onKeyDown={handleKeyDown}>
      <div data-search-panel-input className="px-4 pt-4 pb-3">
        <SearchInput value={query} onChange={onQueryChange} onSubmit={onQuerySubmit} inputRef={inputRef} autoFocus />
      </div>

      {hasActiveFilters ? (
        <div className="border-t px-4 py-3">
          <SearchFilterPills filters={filters} interactive onRemove={onPillRemove} />
        </div>
      ) : null}

      <div className="flex max-h-[60vh] flex-col overflow-y-auto border-t py-2">
        {ROW_DEFINITIONS.map((row, index) => (
          <FilterRow
            key={row.field}
            ref={registerRow(index)}
            label={row.label}
            alignTop={row.editor.type === "metadata"}
          >
            <RowEditor
              row={row}
              filters={filters}
              onFiltersChange={onFiltersChange}
              setField={setField}
              projectId={projectId}
              portalContainer={containerRef}
              metadataEntries={metadataEntries}
              onMetadataChange={handleMetadataChange}
            />
          </FilterRow>
        ))}
      </div>
    </search>
  )
}

interface FilterRowProps {
  readonly ref: Ref<HTMLDivElement>
  readonly label: string
  readonly children: ReactNode
  readonly alignTop?: boolean
}

function FilterRow({ ref, label, children, alignTop }: FilterRowProps) {
  return (
    <div
      ref={ref}
      className={alignTop ? "flex flex-row items-start gap-3 px-4 py-2" : "flex flex-row items-center gap-3 px-4 py-2"}
    >
      <Text.H6 color="foregroundMuted" className="w-32 shrink-0">
        {label}
      </Text.H6>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

interface RowEditorProps {
  readonly row: RowDefinition
  readonly filters: FilterSet
  readonly onFiltersChange: (next: FilterSet) => void
  readonly setField: (field: string, conditions: FilterCondition[]) => void
  readonly projectId: string
  readonly portalContainer: Ref<HTMLDivElement>
  readonly metadataEntries: ReturnType<typeof useMetadataFilter>["entries"]
  readonly onMetadataChange: ReturnType<typeof useMetadataFilter>["handleChange"]
}

function RowEditor({
  row,
  filters,
  onFiltersChange,
  setField,
  projectId,
  portalContainer,
  metadataEntries,
  onMetadataChange,
}: RowEditorProps) {
  if (row.editor.type === "text") {
    const value = getTextFilterValue(filters, row.field)
    return (
      <Input
        size="sm"
        placeholder={row.editor.placeholder}
        value={value}
        onChange={(event) => {
          const next = event.target.value
          setField(row.field, next ? [{ op: "contains", value: next }] : [])
        }}
      />
    )
  }

  if (row.editor.type === "multiSelect") {
    const selected = getInValues(filters, row.field)
    return (
      <MultiSelectFilter
        projectId={projectId}
        column={row.editor.column}
        selected={selected}
        portalContainer={portalContainer as React.RefObject<HTMLElement | null>}
        onChange={(values) => setField(row.field, values.length > 0 ? [{ op: "in", value: values }] : [])}
      />
    )
  }

  if (row.editor.type === "numberRange") {
    const range = getRangeValues(filters, row.field)
    return (
      <NumberRangeFilter
        minValue={range.min}
        maxValue={range.max}
        onMinChange={(min) => {
          const conditions: FilterCondition[] = []
          if (min !== undefined) conditions.push({ op: "gte", value: min })
          if (range.max !== undefined) conditions.push({ op: "lte", value: range.max })
          onFiltersChange({ ...filters, [row.field]: conditions })
        }}
        onMaxChange={(max) => {
          const conditions: FilterCondition[] = []
          if (range.min !== undefined) conditions.push({ op: "gte", value: range.min })
          if (max !== undefined) conditions.push({ op: "lte", value: max })
          onFiltersChange({ ...filters, [row.field]: conditions })
        }}
      />
    )
  }

  if (row.editor.type === "date") {
    return <DateRangeFilter filters={filters} onChange={onFiltersChange} />
  }

  return <MetadataFilter entries={metadataEntries} onChange={onMetadataChange} />
}

function focusFirstFocusable(element: HTMLElement | undefined) {
  if (!element) return
  const focusable = element.querySelector<HTMLElement>(
    'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  focusable?.focus()
}
