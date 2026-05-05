import type { FilterCondition, FilterSet, PercentileTraceFilterField } from "@domain/shared"
import { Button, Icon, Input, Tabs, Text, Tooltip } from "@repo/ui"
import { ChevronDown, ChevronUp, InfoIcon, XIcon } from "lucide-react"
import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { useDebounce } from "react-use"
import {
  getTextFieldsForMode,
  MULTI_SELECT_FIELDS,
  NUMBER_RANGE_FIELDS,
} from "../../../../../components/filters-builder/constants.ts"
import { MetadataFilter } from "../../../../../components/filters-builder/metadata-filter/metadata-filter.tsx"
import { type FilterMode, MultiSelectFilter } from "../../../../../components/filters-builder/multi-select-filter.tsx"
import { PercentileFilter } from "../../../../../components/filters-builder/percentile-filter.tsx"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"

export type { FilterMode }

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

function getPercentileValue(filters: FilterSet, field: string): number | undefined {
  const cond = filters[field]?.find((c) => c.op === "gtePercentile")
  return typeof cond?.value === "number" ? cond.value : undefined
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
  readonly label: ReactNode
  readonly defaultOpen?: boolean
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  // Auto-open when `defaultOpen` flips true (e.g. a filter just got set), but
  // never auto-close — clearing or swapping a filter value should leave the
  // section expanded so the user keeps their place. Manual collapse via the
  // chevron still works because we don't react to `defaultOpen` going false.
  // TODO(frontend-use-effect-policy): one-way sync from external filter activation.
  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

  const ChevronIcon = open ? ChevronUp : ChevronDown

  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="flex items-center justify-between py-2 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <Text.H5 className="w-full">{label}</Text.H5>
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

  // TODO(frontend-use-effect-policy): keep local input state in sync with externally-controlled filter updates.
  useEffect(() => {
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

  // TODO(frontend-use-effect-policy): keep local range inputs in sync with externally-controlled filter updates.
  useEffect(() => {
    setLocalMin(minValue?.toString() ?? "")
    setPendingMin(null)
  }, [minValue])
  // TODO(frontend-use-effect-policy): keep local range inputs in sync with externally-controlled filter updates.
  useEffect(() => {
    setLocalMax(maxValue?.toString() ?? "")
    setPendingMax(null)
  }, [maxValue])

  const hasValue = minValue !== undefined || maxValue !== undefined

  const handleClear = useCallback(() => {
    setLocalMin("")
    setLocalMax("")
    setPendingMin(undefined)
    setPendingMax(undefined)
  }, [])

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
      {hasValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className="h-7 w-7 shrink-0"
          aria-label="Clear filter"
          title="Clear filter"
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

type NumberFilterMode = "range" | "percentile"

interface NumberFilterSectionProps {
  readonly label: ReactNode
  readonly field: string
  readonly tooltip: string | undefined
  readonly percentileField: PercentileTraceFilterField | undefined
  readonly projectId: string
  readonly minValue: number | undefined
  readonly maxValue: number | undefined
  readonly percentileValue: number | undefined
  readonly onRangeChange: (min: number | undefined, max: number | undefined) => void
  readonly onPercentileChange: (percentile: number | undefined) => void
}

function NumberFilterSection({
  label,
  field,
  tooltip,
  percentileField,
  projectId,
  minValue,
  maxValue,
  percentileValue,
  onRangeChange,
  onPercentileChange,
}: NumberFilterSectionProps) {
  const hasRange = minValue !== undefined || maxValue !== undefined
  const hasPercentile = percentileValue !== undefined
  const supportsPercentile = percentileField !== undefined

  // Inferred mode: existing filter state wins. If the user only has the
  // section open with no filter set yet, fall back to whichever mode they
  // last selected (local state).
  const [userMode, setUserMode] = useState<NumberFilterMode>("range")
  const inferredMode: NumberFilterMode = hasPercentile ? "percentile" : hasRange ? "range" : userMode

  const handleModeChange = useCallback(
    (next: NumberFilterMode) => {
      setUserMode(next)
      // Switching modes always clears the *other* mode's filter so the two
      // never coexist on the same field.
      if (next === "range" && hasPercentile) onPercentileChange(undefined)
      if (next === "percentile" && hasRange) onRangeChange(undefined, undefined)
    },
    [hasPercentile, hasRange, onPercentileChange, onRangeChange],
  )

  const labelNode = tooltip ? (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Tooltip
        asChild
        trigger={
          <span className="inline-flex items-center text-muted-foreground">
            <InfoIcon className="h-3.5 w-3.5" />
          </span>
        }
      >
        {tooltip}
      </Tooltip>
    </span>
  ) : (
    label
  )

  return (
    <CollapsibleSection key={field} label={labelNode} defaultOpen={hasRange || hasPercentile}>
      {supportsPercentile && (
        <Tabs<NumberFilterMode>
          variant="secondary"
          size="sm"
          options={[
            { id: "range", label: "Range" },
            { id: "percentile", label: "Percentile" },
          ]}
          active={inferredMode}
          onSelect={handleModeChange}
        />
      )}
      {inferredMode === "percentile" && percentileField ? (
        <PercentileFilter
          projectId={projectId}
          field={percentileField}
          value={percentileValue}
          onChange={onPercentileChange}
        />
      ) : (
        <NumberRangeFilter
          minValue={minValue}
          maxValue={maxValue}
          onMinChange={(min) => onRangeChange(min, maxValue)}
          onMaxChange={(max) => onRangeChange(minValue, max)}
        />
      )}
    </CollapsibleSection>
  )
}

export function FiltersSidebar({ mode, projectId, filters, onFiltersChange, onClose }: FiltersSidebarProps) {
  const setField = useCallback(
    (field: string, conditions: FilterCondition[]) => {
      onFiltersChange(setFieldConditions(filters, field, conditions))
    },
    [filters, onFiltersChange],
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

  const setPercentileFilter = useCallback(
    (field: string, percentile: number | undefined) => {
      setField(field, percentile !== undefined ? [{ op: "gtePercentile", value: percentile }] : [])
    },
    [setField],
  )

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
        <Button variant="ghost" size="icon" onClick={onClose}>
          <Icon icon={XIcon} size="sm" />
        </Button>
      </div>

      <div className="flex flex-col px-4 overflow-y-auto flex-1">
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

        {NUMBER_RANGE_FIELDS.map(({ label, field, tooltip, percentile }) => {
          const range = getRangeValues(filters, field)
          const percentileValue = getPercentileValue(filters, field)
          return (
            <NumberFilterSection
              key={field}
              label={label}
              field={field}
              tooltip={tooltip}
              percentileField={percentile?.field}
              projectId={projectId}
              minValue={range.min}
              maxValue={range.max}
              percentileValue={percentileValue}
              onRangeChange={(min, max) => setRangeFilter(field, min, max)}
              onPercentileChange={(p) => setPercentileFilter(field, p)}
            />
          )
        })}

        <CollapsibleSection label="Metadata" defaultOpen={metadataEntries.length > 0}>
          <MetadataFilter entries={metadataEntries} onChange={handleMetadataChange} />
        </CollapsibleSection>
      </div>
    </Layout.Sidebar>
  )
}
