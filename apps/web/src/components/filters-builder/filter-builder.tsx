import { MOMENT_KINDS } from "@domain/conversation-intelligence"
import type { FilterCondition, FilterSet } from "@domain/shared"
import { Icon, Input, Select, Switch, Tabs, Text } from "@repo/ui"
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, XIcon } from "lucide-react"
import { type ComponentProps, type RefObject, useCallback, useEffect, useMemo, useState } from "react"
import { isHasLlmActivityFilterOn } from "../../domains/sessions/sessions.collection.ts"
import { useTopicFilterOptions } from "../../domains/taxonomy/taxonomy.collection.ts"
import { useDebounce } from "../../lib/hooks/useDebounce.ts"
import { getMultiSelectFieldsForMode, getTextFieldsForMode, NUMBER_RANGE_FIELDS, STATUS_FIELDS } from "./constants.ts"
import { FilterSection } from "./filter-section.tsx"
import { MetadataFilter } from "./metadata-filter/metadata-filter.tsx"
import { type FilterMode, MultiSelectFilter, type StaticFilterItem } from "./multi-select-filter.tsx"
import { NumberRangeFilter } from "./number-range-filter.tsx"
import { StatusFilter } from "./status-filter.tsx"
import type { DistinctColumn } from "./types.ts"
import { useAnnotatorFilterItems } from "./use-annotator-items.ts"
import {
  ANNOTATOR_FILTER_FIELD,
  applyMetadataEntries,
  getHasAnnotationsOn,
  getInValues,
  getPercentileValue,
  getRangeValues,
  getStatusValues,
  getTextFilterValue,
  hasMetadataFilters,
  metadataEntriesFromFilters,
  removeMetadataFilters,
  setAnnotatedBy,
  setFieldConditions,
  setHasAnnotations,
  toDisplayUnit,
  toWireUnit,
} from "./utils.ts"

const humanizeKind = (kind: string) => kind.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase())
const MOMENT_FILTER_ITEMS: readonly StaticFilterItem[] = MOMENT_KINDS.map((kind) => ({
  value: kind,
  label: humanizeKind(kind),
}))

type FilterKind =
  | "status"
  | "text"
  | "userId"
  | "multiSelect"
  | "numberRange"
  | "metadata"
  | "annotator"
  | "hasScores"
  | "llmActivity"

interface FieldDescriptor {
  readonly kind: FilterKind
  readonly field: string
  readonly label: string
  /** Section identity, for the two annotator controls that share one field. Defaults to `field`. */
  readonly key?: string
  readonly placeholder?: string
  readonly percentile?: boolean
  readonly displayScale?: number
  readonly displayStep?: number
}

const descriptorKey = (descriptor: FieldDescriptor) => descriptor.key ?? descriptor.field

/** The sidebar's Scores group: two controls over the one `score.annotatorId` key. */
const SCORE_DESCRIPTORS: readonly FieldDescriptor[] = [
  { kind: "annotator", field: ANNOTATOR_FILTER_FIELD, label: "Scored by" },
  { kind: "hasScores", field: ANNOTATOR_FILTER_FIELD, key: "hasScores", label: "Has scores" },
]

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
          setLocal(e.target.value)
          setPendingChange(e.target.value)
        }}
      />
      {local ? (
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={() => {
            setLocal("")
            setPendingChange(null)
            onDebouncedChange("")
          }}
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** Plain 0–100 input writing `gtePercentile` — the number-only percentile (no density graph). */
function PercentileNumberInput({
  value,
  onChange,
}: {
  readonly value: number | undefined
  readonly onChange: (p: number | undefined) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Text.H6 color="foregroundMuted" noWrap>
        ≥ P
      </Text.H6>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        placeholder="e.g. 95"
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === "") return onChange(undefined)
          const n = Number(e.target.value)
          if (Number.isNaN(n)) return onChange(undefined)
          onChange(Math.min(100, Math.max(0, n)))
        }}
        className="flex h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

type NumberFilterMode = "range" | "percentile"

function NumberFilterControl({
  supportsPercentile,
  minValue,
  maxValue,
  percentileValue,
  onRangeChange,
  onPercentileChange,
  step,
}: {
  readonly supportsPercentile: boolean
  readonly minValue: number | undefined
  readonly maxValue: number | undefined
  readonly percentileValue: number | undefined
  readonly onRangeChange: (min: number | undefined, max: number | undefined) => void
  readonly onPercentileChange: (p: number | undefined) => void
  readonly step?: number
}) {
  const hasRange = minValue !== undefined || maxValue !== undefined
  const hasPercentile = percentileValue !== undefined
  const [userMode, setUserMode] = useState<NumberFilterMode>("range")
  const inferredMode: NumberFilterMode = hasPercentile ? "percentile" : hasRange ? "range" : userMode

  const handleModeChange = useCallback(
    (next: NumberFilterMode) => {
      setUserMode(next)
      // The two modes never coexist on the same field key: switching clears the other.
      if (next === "range" && hasPercentile) onPercentileChange(undefined)
      if (next === "percentile" && hasRange) onRangeChange(undefined, undefined)
    },
    [hasPercentile, hasRange, onPercentileChange, onRangeChange],
  )

  return (
    <div className="flex flex-col gap-2">
      {supportsPercentile ? (
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
      ) : null}
      {inferredMode === "percentile" ? (
        <PercentileNumberInput value={percentileValue} onChange={onPercentileChange} />
      ) : (
        <NumberRangeFilter
          minValue={minValue}
          maxValue={maxValue}
          onMinChange={(min) => onRangeChange(min, maxValue)}
          onMaxChange={(max) => onRangeChange(minValue, max)}
          {...(step !== undefined ? { step } : {})}
        />
      )}
    </div>
  )
}

interface FilterBuilderProps {
  readonly mode: FilterMode
  readonly projectId: string
  readonly value: FilterSet
  readonly onChange: (filters: FilterSet) => void
  readonly emptyMessage?: string
  /** Field keys to omit (e.g. a signal scope hides `score.*`), matching the sidebar's prop. */
  readonly excludeFields?: readonly string[]
  readonly portalContainer?: RefObject<HTMLElement | null>
  /** Render collapsed by default: a one-row summary of the applied-filter count, expandable via chevron. */
  readonly collapsible?: boolean
  /** When `collapsible`, start expanded on mount rather than collapsed. */
  readonly initialExpanded?: boolean
}

/**
 * A reusable "define a FilterSet" builder: pick fields from an "Add filter" menu, each rendered as a
 * removable section (status / text / multi-select / number range / score / metadata). Adding a field
 * never writes an empty condition — a key only appears in `value` once a real value is set — so the
 * output is always `filterSetSchema`-valid even when the consumer persists on every change.
 *
 * `mode` decides which fields are offered, so a consumer only sees what its query can apply:
 * `sessions` adds the session-only fields (`moments`, `topics`, `hasLlmActivity`) that the trace
 * query drops.
 */
export function FilterBuilder({
  mode,
  projectId,
  value,
  onChange,
  emptyMessage = "No filters yet.",
  excludeFields,
  portalContainer,
  collapsible = false,
  initialExpanded = false,
}: FilterBuilderProps) {
  // Sections the user opened that don't (yet) have a value; kept local so opening one never
  // persists an empty/invalid condition.
  const [openFields, setOpenFields] = useState<ReadonlySet<string>>(new Set())
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [expanded, setExpanded] = useState(initialExpanded)

  const textFields = useMemo(() => getTextFieldsForMode(mode), [mode])
  const multiSelectFields = useMemo(() => getMultiSelectFieldsForMode(mode), [mode])
  const annotatorItems = useAnnotatorFilterItems()

  const { data: topicOptions = [] } = useTopicFilterOptions(projectId, mode === "sessions")
  const staticItemsByField = useMemo<Readonly<Record<string, readonly StaticFilterItem[]>>>(
    () => ({
      moments: MOMENT_FILTER_ITEMS,
      topics: topicOptions.map((topic) => ({
        value: topic.id,
        label: topic.depth > 0 ? `${"— ".repeat(topic.depth)}${topic.name}` : topic.name,
      })),
    }),
    [topicOptions],
  )

  const descriptors = useMemo<FieldDescriptor[]>(() => {
    const list: FieldDescriptor[] = [{ kind: "status", field: "status", label: STATUS_FIELDS[0]?.label ?? "Status" }]
    for (const f of textFields) {
      list.push({
        kind: f.field === "userId" ? "userId" : "text",
        field: f.field,
        label: f.label,
        placeholder: f.placeholder,
      })
    }
    for (const f of multiSelectFields) list.push({ kind: "multiSelect", field: f.field, label: f.label })
    for (const f of NUMBER_RANGE_FIELDS) {
      list.push({
        kind: "numberRange",
        field: f.field,
        label: f.label,
        percentile: f.percentile !== undefined,
        ...(f.displayScale !== undefined ? { displayScale: f.displayScale } : {}),
        ...(f.displayStep !== undefined ? { displayStep: f.displayStep } : {}),
      })
    }
    list.push(...SCORE_DESCRIPTORS)
    // `hasLlmActivity` only resolves on the session query; the trace filter builder drops it.
    if (mode === "sessions") list.push({ kind: "llmActivity", field: "hasLlmActivity", label: "Has LLM activity" })
    list.push({ kind: "metadata", field: "metadata", label: "Metadata" })
    if (excludeFields === undefined) return list
    return list.filter(
      (descriptor) => !excludeFields.includes(descriptor.field) && !excludeFields.includes(descriptorKey(descriptor)),
    )
  }, [textFields, multiSelectFields, mode, excludeFields])

  const showMetadata = metadataOpen || hasMetadataFilters(value)
  const isActive = useCallback(
    (descriptor: FieldDescriptor) => {
      if (descriptor.kind === "metadata") return showMetadata
      if (openFields.has(descriptorKey(descriptor))) return true
      // Both annotator controls live on one field, so each reads only the ops it writes.
      if (descriptor.kind === "annotator") return getInValues(value, descriptor.field).length > 0
      if (descriptor.kind === "hasScores") return getHasAnnotationsOn(value)
      return value[descriptor.field] !== undefined
    },
    [value, openFields, showMetadata],
  )

  const activeFilters = useMemo(() => descriptors.filter(isActive), [descriptors, isActive])
  const availableFilters = useMemo(() => descriptors.filter((d) => !isActive(d)), [descriptors, isActive])

  // Applied filters actually present in `value` (not opened-but-empty sections); all `metadata.*`
  // keys count as one. Drives the collapsed summary row.
  const appliedCount = useMemo(() => {
    let count = 0
    let sawMetadata = false
    for (const field of Object.keys(value)) {
      if (field.startsWith("metadata.")) sawMetadata = true
      else count += 1
    }
    return count + (sawMetadata ? 1 : 0)
  }, [value])

  const setField = useCallback(
    (field: string, conditions: FilterCondition[]) => onChange(setFieldConditions(value, field, conditions)),
    [value, onChange],
  )
  const setContainsFilter = useCallback(
    (field: string, next: string) => {
      const normalized = next.trim()
      setField(field, normalized ? [{ op: "contains", value: normalized }] : [])
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
    (field: string, p: number | undefined) =>
      setField(field, p !== undefined ? [{ op: "gtePercentile", value: p }] : []),
    [setField],
  )

  const addFilter = useCallback((descriptor: FieldDescriptor) => {
    if (descriptor.kind === "metadata") {
      setMetadataOpen(true)
      return
    }
    setOpenFields((prev) => new Set(prev).add(descriptorKey(descriptor)))
    setExpanded(true)
  }, [])

  const removeFilter = useCallback(
    (descriptor: FieldDescriptor) => {
      if (descriptor.kind === "metadata") {
        setMetadataOpen(false)
        onChange(removeMetadataFilters(value))
        return
      }
      setOpenFields((prev) => {
        const next = new Set(prev)
        next.delete(descriptorKey(descriptor))
        return next
      })
      if (descriptor.kind === "annotator") {
        onChange(setAnnotatedBy(value, []))
        return
      }
      if (descriptor.kind === "hasScores") {
        onChange(setHasAnnotations(value, false))
        return
      }
      if (value[descriptor.field] !== undefined) onChange(setFieldConditions(value, descriptor.field, []))
    },
    [value, onChange],
  )

  const renderSection = (descriptor: FieldDescriptor) => {
    const onRemove = () => removeFilter(descriptor)
    if (descriptor.kind === "status") {
      const selected = getStatusValues(value, "status")
      return (
        <FilterSection key={descriptor.field} label={descriptor.label} onRemove={onRemove}>
          <StatusFilter
            selected={selected}
            onChange={(values) => setField("status", values.length > 0 ? [{ op: "in", value: [...values] }] : [])}
          />
        </FilterSection>
      )
    }
    if (descriptor.kind === "userId") {
      const inValues = getInValues(value, descriptor.field)
      const legacy = getTextFilterValue(value, descriptor.field)
      const selected = inValues.length > 0 ? inValues : legacy ? [legacy] : []
      return (
        <FilterSection key={descriptor.field} label={descriptor.label} onRemove={onRemove}>
          <MultiSelectFilter
            mode={mode}
            projectId={projectId}
            column={descriptor.field as DistinctColumn}
            selected={selected}
            onChange={(values) => setField(descriptor.field, values.length > 0 ? [{ op: "in", value: values }] : [])}
            {...(descriptor.placeholder ? { placeholder: descriptor.placeholder } : {})}
            {...(portalContainer ? { portalContainer } : {})}
          />
        </FilterSection>
      )
    }
    if (descriptor.kind === "text") {
      return (
        <FilterSection key={descriptor.field} label={descriptor.label} onRemove={onRemove}>
          <DebouncedInput
            size="sm"
            placeholder={descriptor.placeholder ?? "Enter value…"}
            value={getTextFilterValue(value, descriptor.field)}
            onDebouncedChange={(next) => setContainsFilter(descriptor.field, next)}
          />
        </FilterSection>
      )
    }
    if (descriptor.kind === "multiSelect") {
      const staticItems = staticItemsByField[descriptor.field]
      return (
        <FilterSection key={descriptor.field} label={descriptor.label} onRemove={onRemove}>
          <MultiSelectFilter
            mode={mode}
            projectId={projectId}
            column={descriptor.field as DistinctColumn}
            selected={getInValues(value, descriptor.field)}
            onChange={(values) => setField(descriptor.field, values.length > 0 ? [{ op: "in", value: values }] : [])}
            {...(staticItems ? { staticItems } : {})}
            {...(portalContainer ? { portalContainer } : {})}
          />
        </FilterSection>
      )
    }
    if (descriptor.kind === "numberRange") {
      const range = getRangeValues(value, descriptor.field)
      return (
        <FilterSection key={descriptor.field} label={descriptor.label} onRemove={onRemove}>
          <NumberFilterControl
            supportsPercentile={descriptor.percentile === true}
            minValue={toDisplayUnit(range.min, descriptor.displayScale)}
            maxValue={toDisplayUnit(range.max, descriptor.displayScale)}
            percentileValue={getPercentileValue(value, descriptor.field)}
            onRangeChange={(min, max) =>
              setRangeFilter(
                descriptor.field,
                toWireUnit(min, descriptor.displayScale),
                toWireUnit(max, descriptor.displayScale),
              )
            }
            onPercentileChange={(p) => setPercentileFilter(descriptor.field, p)}
            {...(descriptor.displayStep !== undefined ? { step: descriptor.displayStep } : {})}
          />
        </FilterSection>
      )
    }
    if (descriptor.kind === "annotator") {
      return (
        <FilterSection key={descriptorKey(descriptor)} label={descriptor.label} onRemove={onRemove}>
          <MultiSelectFilter
            mode={mode}
            projectId={projectId}
            column={"annotatorId" as DistinctColumn}
            selected={getInValues(value, descriptor.field)}
            onChange={(values) => onChange(setAnnotatedBy(value, values))}
            staticItems={annotatorItems}
            placeholder="Search members…"
            {...(portalContainer ? { portalContainer } : {})}
          />
        </FilterSection>
      )
    }
    if (descriptor.kind === "hasScores") {
      const on = getHasAnnotationsOn(value)
      return (
        <FilterSection key={descriptorKey(descriptor)} label={descriptor.label} onRemove={onRemove}>
          <div className="flex items-center justify-between gap-2">
            <Text.H6 color="foregroundMuted">
              {on ? "Only items with a human score." : "All items, scored or not."}
            </Text.H6>
            <Switch checked={on} onCheckedChange={(next) => onChange(setHasAnnotations(value, next === true))} />
          </div>
        </FilterSection>
      )
    }
    if (descriptor.kind === "llmActivity") {
      const on = isHasLlmActivityFilterOn(value)
      return (
        <FilterSection key={descriptor.field} label={descriptor.label} onRemove={onRemove}>
          <div className="flex items-center justify-between gap-2">
            <Text.H6 color="foregroundMuted">
              {on ? "Hiding sessions without any LLM call." : "Including orphan fragments."}
            </Text.H6>
            <Switch
              checked={on}
              onCheckedChange={(next) => setField(descriptor.field, next === true ? [] : [{ op: "eq", value: false }])}
            />
          </div>
        </FilterSection>
      )
    }
    return (
      <FilterSection key={descriptor.field} label={descriptor.label} onRemove={onRemove}>
        <MetadataFilter
          entries={metadataEntriesFromFilters(value)}
          onChange={(entries) => onChange(applyMetadataEntries(value, entries))}
        />
      </FilterSection>
    )
  }

  const addFilterPicker =
    availableFilters.length > 0 ? (
      <Select
        name="add-filter"
        searchable
        width="full"
        size="small"
        contentWidth="trigger"
        placeholder="Add a filter"
        placeholderIcon={<Icon icon={PlusIcon} size="sm" color="foregroundMuted" />}
        value={undefined}
        options={availableFilters.map((descriptor) => ({ value: descriptorKey(descriptor), label: descriptor.label }))}
        portalTarget={portalContainer ? "local" : "body"}
        onChange={(key) => {
          const descriptor = availableFilters.find((d) => descriptorKey(d) === key)
          if (descriptor) addFilter(descriptor)
        }}
      />
    ) : null

  const sections = (
    <div className="flex flex-col gap-2">
      {activeFilters.length === 0 ? <Text.H6 color="foregroundMuted">{emptyMessage}</Text.H6> : null}
      {activeFilters.map(renderSection)}
      {addFilterPicker}
    </div>
  )

  if (!collapsible) return sections

  const summary = appliedCount === 0 ? "No filters" : appliedCount === 1 ? "1 filter" : `${appliedCount} filters`
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 py-0.5 text-left cursor-pointer"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <Icon icon={expanded ? ChevronDownIcon : ChevronRightIcon} size="sm" color="foregroundMuted" />
        <Text.H6 color="foregroundMuted">{summary}</Text.H6>
      </button>
      {expanded ? sections : null}
    </div>
  )
}
