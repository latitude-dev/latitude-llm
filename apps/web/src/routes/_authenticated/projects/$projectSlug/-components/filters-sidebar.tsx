import type { FilterCondition, FilterSet } from "@domain/shared"
import { Button, Checkbox, Input, Skeleton, Text } from "@repo/ui"
import { ChevronDown, ChevronUp, PlusIcon, Search, Trash2Icon, XIcon } from "lucide-react"
import { type ComponentProps, type ReactNode, useCallback, useLayoutEffect, useMemo, useState } from "react"
import { useDebounce } from "react-use"
import { useSessionDistinctValues } from "../../../../../domains/sessions/sessions.collection.ts"
import { useTraceDistinctValues } from "../../../../../domains/traces/traces.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"

export type FilterMode = "traces" | "sessions"

type DistinctColumn = "tags" | "models" | "providers" | "serviceNames"

const STATUS_OPTIONS = ["ok", "error", "unset"] as const

const MULTI_SELECT_FIELDS: readonly { label: string; field: DistinctColumn }[] = [
  { label: "Tags", field: "tags" },
  { label: "Models", field: "models" },
  { label: "Providers", field: "providers" },
  { label: "Services", field: "serviceNames" },
]

const NUMBER_RANGE_FIELDS = [
  { label: "Cost (microcents)", field: "cost" },
  { label: "Span Count", field: "spanCount" },
  { label: "Error Count", field: "errorCount" },
  { label: "Tokens Input", field: "tokensInput" },
  { label: "Tokens Output", field: "tokensOutput" },
]

interface TextFilterField {
  label: string
  field: string
  placeholder: string
}

const TRACES_TEXT_FIELDS: TextFilterField[] = [
  { label: "Name", field: "name", placeholder: "Enter name..." },
  { label: "Session ID", field: "sessionId", placeholder: "Filter by session..." },
  { label: "Simulation ID", field: "simulationId", placeholder: "Filter by simulation..." },
  { label: "User ID", field: "userId", placeholder: "Filter by user..." },
]

const SESSIONS_TEXT_FIELDS: TextFilterField[] = [
  { label: "Session ID", field: "sessionId", placeholder: "Filter by session..." },
  { label: "Simulation ID", field: "simulationId", placeholder: "Filter by simulation..." },
  { label: "User ID", field: "userId", placeholder: "Filter by user..." },
]

function getTextFieldsForMode(mode: FilterMode): TextFilterField[] {
  return mode === "sessions" ? SESSIONS_TEXT_FIELDS : TRACES_TEXT_FIELDS
}

interface FiltersSidebarProps {
  readonly mode: FilterMode
  readonly projectId: string
  readonly filters: FilterSet
  readonly onFiltersChange: (filters: FilterSet) => void
  readonly onClose: () => void
}

function getInValues(filters: FilterSet, field: string): readonly string[] {
  const cond = filters[field]?.find((c) => c.op === "in")
  return Array.isArray(cond?.value) ? cond.value.map(String) : []
}

function getTextFilterValue(filters: FilterSet, field: string): string {
  const cond = filters[field]?.find((c) => c.op === "contains")
  return typeof cond?.value === "string" ? cond.value : ""
}

function getRangeValues(filters: FilterSet, field: string): { min: number | undefined; max: number | undefined } {
  const conditions = filters[field]
  const minVal = conditions?.find((c) => c.op === "gte")?.value
  const maxVal = conditions?.find((c) => c.op === "lte")?.value
  return {
    min: typeof minVal === "number" ? minVal : undefined,
    max: typeof maxVal === "number" ? maxVal : undefined,
  }
}

function setFieldConditions(filters: FilterSet, field: string, conditions: FilterCondition[]): FilterSet {
  if (conditions.length === 0) {
    const { [field]: _, ...rest } = filters
    return rest
  }
  return { ...filters, [field]: conditions }
}

function CollapsibleSection({
  label,
  defaultOpen = false,
  children,
}: {
  readonly label: string
  readonly defaultOpen?: boolean
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const ChevronIcon = open ? ChevronUp : ChevronDown

  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="flex items-center justify-between py-2 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <Text.H5>{label}</Text.H5>
        <ChevronIcon className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && <div className="flex flex-col gap-2 pb-2">{children}</div>}
    </div>
  )
}

function DebouncedInput({
  value,
  onDebouncedChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  readonly value: string
  readonly onDebouncedChange: (value: string) => void
}) {
  const [local, setLocal] = useState(value)
  const [pendingChange, setPendingChange] = useState<string | null>(null)

  useDebounce(
    () => {
      if (pendingChange === null) return
      onDebouncedChange(pendingChange)
    },
    300,
    [pendingChange, onDebouncedChange],
  )

  useLayoutEffect(() => {
    setLocal(value)
    setPendingChange(null)
  }, [value])

  return (
    <div className="relative">
      <Input
        {...props}
        value={local}
        onChange={(e) => {
          const nextValue = e.target.value
          setLocal(nextValue)
          setPendingChange(nextValue)
        }}
      />
      {local && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={() => {
            setLocal("")
            setPendingChange(null)
            onDebouncedChange("")
          }}
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function useDistinctValues(mode: FilterMode, args: { projectId: string; column: DistinctColumn; search?: string }) {
  const traceResult = useTraceDistinctValues(args)
  const sessionResult = useSessionDistinctValues(args)

  // Both hooks always run (React rules of hooks), but only the active mode's result is used.
  // The inactive query still fires — the data is small and benefits from being pre-cached for tab switches.
  return mode === "sessions" ? sessionResult : traceResult
}

function MultiSelectFilter({
  mode,
  projectId,
  column,
  selected,
  onChange,
}: {
  readonly mode: FilterMode
  readonly projectId: string
  readonly column: DistinctColumn
  readonly selected: readonly string[]
  readonly onChange: (values: string[]) => void
}) {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useDebounce(
    () => {
      setDebouncedSearch(search)
    },
    300,
    [search],
  )

  const { data: initialOptions = [], isLoading: initialLoading } = useDistinctValues(mode, {
    projectId,
    column,
  })
  const needsServerSearch = initialOptions.length >= 50

  const { data: searchedOptions, isLoading: searchLoading } = useDistinctValues(mode, {
    projectId,
    column,
    ...(needsServerSearch && debouncedSearch ? { search: debouncedSearch } : {}),
  })

  const isLoading = initialLoading || (needsServerSearch && debouncedSearch ? searchLoading : false)

  const displayOptions = useMemo(() => {
    if (!search) return initialOptions
    if (needsServerSearch) return searchedOptions ?? initialOptions
    const lower = search.toLowerCase()
    return initialOptions.filter((o) => o.toLowerCase().includes(lower))
  }, [search, initialOptions, needsServerSearch, searchedOptions])

  const toggle = useCallback(
    (value: string) => {
      const next = selected.includes(value) ? selected.filter((s) => s !== value) : [...selected, value]
      onChange(next)
    },
    [selected, onChange],
  )

  return (
    <div className="flex flex-col border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="flex h-6 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-40 overflow-y-auto p-1">
        {isLoading ? (
          <div className="flex flex-col gap-1 p-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1">
                <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
                <Skeleton className="h-4 flex-1 rounded" />
              </div>
            ))}
          </div>
        ) : displayOptions.length === 0 ? (
          <div className="flex items-center justify-center py-2">
            <Text.H6 color="foregroundMuted">{debouncedSearch ? "No matches" : "No values"}</Text.H6>
          </div>
        ) : (
          displayOptions.map((value) => (
            <button
              key={value}
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent cursor-pointer"
              onClick={() => toggle(value)}
            >
              <Checkbox checked={selected.includes(value)} onCheckedChange={() => toggle(value)} />
              <span className="truncate">{value}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function NumberRangeFilter({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
}: {
  readonly minValue: number | undefined
  readonly maxValue: number | undefined
  readonly onMinChange: (v: number | undefined) => void
  readonly onMaxChange: (v: number | undefined) => void
  readonly minPlaceholder?: string
  readonly maxPlaceholder?: string
}) {
  const [localMin, setLocalMin] = useState(minValue?.toString() ?? "")
  const [localMax, setLocalMax] = useState(maxValue?.toString() ?? "")
  const [pendingMin, setPendingMin] = useState<number | undefined | null>(null)
  const [pendingMax, setPendingMax] = useState<number | undefined | null>(null)

  useDebounce(
    () => {
      if (pendingMin === null) return
      onMinChange(pendingMin)
    },
    400,
    [pendingMin, onMinChange],
  )

  useDebounce(
    () => {
      if (pendingMax === null) return
      onMaxChange(pendingMax)
    },
    400,
    [pendingMax, onMaxChange],
  )

  useLayoutEffect(() => {
    setLocalMin(minValue?.toString() ?? "")
    setPendingMin(null)
    setLocalMax(maxValue?.toString() ?? "")
    setPendingMax(null)
  }, [minValue, maxValue])

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        placeholder={minPlaceholder}
        value={localMin}
        onChange={(e) => {
          setLocalMin(e.target.value)
          const n = e.target.value === "" ? undefined : Number(e.target.value)
          setPendingMin(n !== undefined && !Number.isNaN(n) ? n : undefined)
        }}
        className="flex h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <input
        type="number"
        min={0}
        placeholder={maxPlaceholder}
        value={localMax}
        onChange={(e) => {
          setLocalMax(e.target.value)
          const n = e.target.value === "" ? undefined : Number(e.target.value)
          setPendingMax(n !== undefined && !Number.isNaN(n) ? n : undefined)
        }}
        className="flex h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

function MetadataFilter({
  entries: committedEntries,
  onChange,
}: {
  readonly entries: readonly { key: string; value: string }[]
  readonly onChange: (entries: { key: string; value: string }[]) => void
}) {
  const [localEntries, setLocalEntries] = useState<{ key: string; value: string }[]>([...committedEntries])

  useLayoutEffect(() => {
    setLocalEntries([...committedEntries])
  }, [committedEntries])

  const propagate = useCallback(
    (entries: { key: string; value: string }[]) => {
      setLocalEntries(entries)
      const valid = entries.filter((e) => e.key !== "" && e.value !== "")
      onChange(valid)
    },
    [onChange],
  )

  const addEntry = useCallback(() => {
    setLocalEntries((prev) => [...prev, { key: "", value: "" }])
  }, [])

  const removeEntry = useCallback(
    (index: number) => {
      propagate(localEntries.filter((_, i) => i !== index))
    },
    [localEntries, propagate],
  )

  const updateEntry = useCallback(
    (index: number, field: "key" | "value", val: string) => {
      propagate(localEntries.map((e, i) => (i === index ? { ...e, [field]: val } : e)))
    },
    [localEntries, propagate],
  )

  return (
    <div className="flex flex-col gap-2">
      {localEntries.map((entry, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Key"
            value={entry.key}
            onChange={(e) => updateEntry(i, "key", e.target.value)}
            className="flex h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
          />
          <span className="text-xs text-muted-foreground">=</span>
          <input
            type="text"
            placeholder="Value"
            value={entry.value}
            onChange={(e) => updateEntry(i, "value", e.target.value)}
            className="flex h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => removeEntry(i)}
          >
            <Trash2Icon className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        onClick={addEntry}
      >
        <PlusIcon className="h-3 w-3" />
        Add condition
      </button>
    </div>
  )
}

export function FiltersSidebar({ mode, projectId, filters, onFiltersChange, onClose }: FiltersSidebarProps) {
  const setField = useCallback(
    (field: string, conditions: FilterCondition[]) => {
      onFiltersChange(setFieldConditions(filters, field, conditions))
    },
    [filters, onFiltersChange],
  )

  const toggleInValue = useCallback(
    (field: string, value: string) => {
      const current = [...getInValues(filters, field)]
      const next = current.includes(value) ? current.filter((s) => s !== value) : [...current, value]
      setField(field, next.length > 0 ? [{ op: "in", value: next }] : [])
    },
    [filters, setField],
  )

  const setContainsFilter = useCallback(
    (field: string, value: string) => {
      setField(field, value ? [{ op: "contains", value }] : [])
    },
    [setField],
  )

  const setRangeFilter = useCallback(
    (field: string, min: number | undefined, max: number | undefined) => {
      const conditions: FilterCondition[] = []
      if (min !== undefined) conditions.push({ op: "gte", value: min })
      if (max !== undefined) conditions.push({ op: "lte", value: max })
      setField(field, conditions)
    },
    [setField],
  )

  const clearAll = useCallback(() => {
    onFiltersChange({})
  }, [onFiltersChange])

  const hasActiveFilters = Object.keys(filters).length > 0
  const statusValues = getInValues(filters, "status")
  const textFields = getTextFieldsForMode(mode)

  const metadataEntries = useMemo(() => {
    const entries: { key: string; value: string }[] = []
    for (const [field, conditions] of Object.entries(filters)) {
      if (!field.startsWith("metadata.")) continue
      const key = field.slice("metadata.".length)
      for (const cond of conditions) {
        if (cond.op === "eq" && typeof cond.value === "string") {
          entries.push({ key, value: cond.value })
        }
      }
    }
    return entries
  }, [filters])

  const handleMetadataChange = useCallback(
    (entries: { key: string; value: string }[]) => {
      const next: Record<string, readonly FilterCondition[]> = {}
      for (const [key, value] of Object.entries(filters)) {
        if (!key.startsWith("metadata.")) next[key] = value
      }
      for (const entry of entries) {
        next[`metadata.${entry.key}`] = [{ op: "eq", value: entry.value }]
      }
      onFiltersChange(next)
    },
    [filters, onFiltersChange],
  )

  return (
    <Layout.Sidebar>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Text.H5>Filters</Text.H5>
        <div className="flex items-center gap-1">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col px-4 overflow-y-auto flex-1">
        <CollapsibleSection label="Status" defaultOpen={statusValues.length > 0}>
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              type="button"
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => toggleInValue("status", status)}
            >
              <Checkbox
                checked={statusValues.includes(status)}
                onCheckedChange={() => toggleInValue("status", status)}
              />
              <Text.H5 color="foregroundMuted">{status.toUpperCase()}</Text.H5>
            </button>
          ))}
        </CollapsibleSection>

        {textFields.map(({ label, field, placeholder }) => {
          const value = getTextFilterValue(filters, field)
          return (
            <CollapsibleSection key={field} label={label} defaultOpen={!!value}>
              <DebouncedInput
                placeholder={placeholder}
                size="sm"
                value={value}
                onDebouncedChange={(nextValue) => setContainsFilter(field, nextValue)}
              />
            </CollapsibleSection>
          )
        })}

        {MULTI_SELECT_FIELDS.map(({ label, field }) => {
          const selectedValues = getInValues(filters, field)
          return (
            <CollapsibleSection key={field} label={label} defaultOpen={selectedValues.length > 0}>
              <MultiSelectFilter
                mode={mode}
                projectId={projectId}
                column={field}
                selected={selectedValues}
                onChange={(values) => setField(field, values.length > 0 ? [{ op: "in", value: values }] : [])}
              />
            </CollapsibleSection>
          )
        })}

        {NUMBER_RANGE_FIELDS.map(({ label, field }) => {
          const range = getRangeValues(filters, field)
          return (
            <CollapsibleSection key={field} label={label} defaultOpen={!!filters[field]}>
              <NumberRangeFilter
                minValue={range.min}
                maxValue={range.max}
                onMinChange={(min) => setRangeFilter(field, min, range.max)}
                onMaxChange={(max) => setRangeFilter(field, range.min, max)}
              />
            </CollapsibleSection>
          )
        })}

        <CollapsibleSection label="Metadata" defaultOpen={metadataEntries.length > 0}>
          <MetadataFilter entries={metadataEntries} onChange={handleMetadataChange} />
        </CollapsibleSection>
      </div>
    </Layout.Sidebar>
  )
}
