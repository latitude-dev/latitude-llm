import { MOMENT_KINDS } from "@domain/conversation-intelligence"
import type { FilterCondition, FilterSet, TraceFilterGroupId } from "@domain/shared"
import { Button, cn, Input, Switch, Tabs, Text, Tooltip } from "@repo/ui"
import { ChevronDown, ChevronUp, InfoIcon, SearchIcon, XIcon } from "lucide-react"
import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { useProjectMembersCollection } from "../../domains/members/members.collection.ts"
import { isHasLlmActivityFilterOn } from "../../domains/sessions/sessions.collection.ts"
import { useTopicFilterOptions } from "../../domains/taxonomy/taxonomy.collection.ts"
import { authClient } from "../../lib/auth-client.ts"
import { useDebounce } from "../../lib/hooks/useDebounce.ts"
import {
  getMultiSelectFieldsForMode,
  getTextFieldsForMode,
  NUMBER_RANGE_FIELDS,
  type PercentileFieldName,
  STATUS_FIELDS,
} from "./constants.ts"
import { groupFilterSections } from "./group-sections.ts"
import { MetadataFilter } from "./metadata-filter/metadata-filter.tsx"
import { type FilterMode, MultiSelectFilter, type StaticFilterItem } from "./multi-select-filter.tsx"
import { PercentileFilter } from "./percentile-filter.tsx"
import { StatusFilter, type StatusFilterValue } from "./status-filter.tsx"
import type { DistinctColumn } from "./types.ts"

export type { FilterMode }

interface FiltersBuilderFieldsProps {
  readonly mode: FilterMode
  readonly projectId: string
  readonly filters: FilterSet
  readonly onFiltersChange: (filters: FilterSet) => void
  /** Field keys to omit from the builder (e.g. custom behaviors exclude `topics`). */
  readonly excludeFields?: readonly string[]
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

function toDisplayUnit(value: number | undefined, displayScale: number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!displayScale) return value
  return value / displayScale
}

function toWireUnit(value: number | undefined, displayScale: number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!displayScale) return value
  // Round to avoid float drift on conversions like 123.45 × 100_000_000.
  return Math.round(value * displayScale)
}

function getPercentileValue(filters: FilterSet, field: string): number | undefined {
  const cond = filters[field]?.find((c) => c.op === "gtePercentile")
  return typeof cond?.value === "number" ? cond.value : undefined
}

const ANNOTATOR_FIELD = "score.annotatorId"

/**
 * The "Has annotations" toggle stores a single `annotator_id != ''` condition on
 * the shared `score.annotatorId` field. `annotator_id` is non-empty only for human
 * annotations (evaluation/flagger/custom rows leave it blank), so this alone means
 * "has at least one human annotation" — no source filter needed. It coexists with
 * the people picker's `in` condition on the same field; both are AND'd in the score
 * rollup subquery, and each control edits only its own condition op.
 */
function getHasAnnotationsOn(filters: FilterSet): boolean {
  return (filters[ANNOTATOR_FIELD] ?? []).some((c) => c.op === "neq")
}

const STATUS_VALUES: readonly StatusFilterValue[] = ["ok", "error"]

function getStatusValues(filters: FilterSet, field: string): readonly StatusFilterValue[] {
  const cond = filters[field]?.find((c) => c.op === "in")
  const raw = Array.isArray(cond?.value) ? cond.value.map(String) : []
  return raw.filter((v): v is StatusFilterValue => (STATUS_VALUES as readonly string[]).includes(v))
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
  step,
}: {
  readonly minValue: number | undefined
  readonly maxValue: number | undefined
  readonly onMinChange: (v: number | undefined) => void
  readonly onMaxChange: (v: number | undefined) => void
  readonly minPlaceholder?: string
  readonly maxPlaceholder?: string
  /** HTML `step` for both inputs; defaults to integer step when omitted. */
  readonly step?: number
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
        step={step ?? 1}
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
        step={step ?? 1}
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
  readonly percentileField: PercentileFieldName | undefined
  readonly projectId: string
  readonly mode: FilterMode
  readonly minValue: number | undefined
  readonly maxValue: number | undefined
  readonly percentileValue: number | undefined
  readonly onRangeChange: (min: number | undefined, max: number | undefined) => void
  readonly onPercentileChange: (percentile: number | undefined) => void
  readonly step?: number
}

function NumberFilterSection({
  label,
  field,
  tooltip,
  percentileField,
  projectId,
  mode,
  minValue,
  maxValue,
  percentileValue,
  onRangeChange,
  onPercentileChange,
  step,
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
          mode={mode}
        />
      ) : (
        <NumberRangeFilter
          minValue={minValue}
          maxValue={maxValue}
          onMinChange={(min) => onRangeChange(min, maxValue)}
          onMaxChange={(max) => onRangeChange(minValue, max)}
          {...(step !== undefined ? { step } : {})}
        />
      )}
    </CollapsibleSection>
  )
}

const humanizeKind = (kind: string) => kind.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase())

const MOMENT_FILTER_ITEMS: readonly StaticFilterItem[] = MOMENT_KINDS.map((kind) => ({
  value: kind,
  label: humanizeKind(kind),
}))

interface FilterSectionEntry {
  readonly group: TraceFilterGroupId
  readonly label: string
  readonly node: ReactNode
}

/**
 * The full session/trace filter builder body, minus any surrounding chrome. Both
 * the Sessions/Traces `FiltersSidebar` and the custom-behavior modal render this;
 * the consumer supplies its own scroll container. `excludeFields` drops fields the
 * consumer must not offer (custom behaviors hide `topics`).
 *
 * Sections render under the functional headings of `TRACE_FILTER_GROUPS`, in that
 * order; a group with no visible section (mode, `excludeFields`, or the search box)
 * drops its heading too. Within a group, order follows the control type: status,
 * text, multi-select, number range, then the UI-only controls.
 */
export function FiltersBuilderFields({
  mode,
  projectId,
  filters,
  onFiltersChange,
  excludeFields,
}: FiltersBuilderFieldsProps) {
  const [search, setSearch] = useState("")
  const isExcluded = useCallback((field: string) => excludeFields?.includes(field) ?? false, [excludeFields])

  // Topic options come from the taxonomy tree, parents before children;
  // depth renders as an indent marker so the hierarchy stays readable.
  const { data: topicOptions = [] } = useTopicFilterOptions(projectId, mode === "sessions" && !isExcluded("topics"))
  const topicFilterItems = useMemo(
    (): readonly StaticFilterItem[] =>
      topicOptions.map((topic) => ({
        value: topic.id,
        label: topic.depth > 0 ? `${"— ".repeat(topic.depth)}${topic.name}` : topic.name,
      })),
    [topicOptions],
  )
  const staticItemsByField: Readonly<Record<string, readonly StaticFilterItem[]>> = useMemo(
    () => ({ moments: MOMENT_FILTER_ITEMS, topics: topicFilterItems }),
    [topicFilterItems],
  )

  const setField = useCallback(
    (field: string, conditions: FilterCondition[]) => {
      onFiltersChange(setFieldConditions(filters, field, conditions))
    },
    [filters, onFiltersChange],
  )

  const setContainsFilter = useCallback(
    (field: string, value: string) => {
      const normalized = value.trim()
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
    (field: string, percentile: number | undefined) => {
      setField(field, percentile !== undefined ? [{ op: "gtePercentile", value: percentile }] : [])
    },
    [setField],
  )

  const textFields = getTextFieldsForMode(mode).filter((f) => !isExcluded(f.field))

  const setHasLlmActivity = useCallback(
    (on: boolean) => {
      setField("hasLlmActivity", on ? [] : [{ op: "eq", value: false }])
    },
    [setField],
  )

  // Read the current user from the auth client (not the `/_authenticated` route
  // loader) so the score filters work in the sandbox shell too, where a dev can
  // create scores via the API. `meId` is undefined until the session resolves.
  const { data: session } = authClient.useSession()
  const meId = session?.user.id
  const { data: members } = useProjectMembersCollection()
  const annotatorItems = useMemo<readonly StaticFilterItem[]>(() => {
    const active = (members ?? []).filter((m) => m.status === "active" && m.userId)
    const others = active
      .filter((m) => m.userId !== meId)
      .map((m) => ({ value: m.userId as string, label: m.name?.trim() || m.email }))
      .sort((a, b) => a.label.localeCompare(b.label))
    // Current user pinned on top as "Your scores" once the session resolves.
    return meId ? [{ value: meId, label: "Your scores" }, ...others] : others
  }, [members, meId])

  const setAnnotatedBy = useCallback(
    (values: string[]) => {
      const others = (filters[ANNOTATOR_FIELD] ?? []).filter((c) => c.op !== "in")
      setField(ANNOTATOR_FIELD, values.length > 0 ? [{ op: "in", value: values }, ...others] : [...others])
    },
    [filters, setField],
  )

  const setHasAnnotations = useCallback(
    (on: boolean) => {
      const others = (filters[ANNOTATOR_FIELD] ?? []).filter((c) => c.op !== "neq")
      setField(ANNOTATOR_FIELD, on ? [...others, { op: "neq", value: "" }] : [...others])
    },
    [filters, setField],
  )

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

  const entries: FilterSectionEntry[] = []

  for (const { label, field, group } of STATUS_FIELDS.filter(({ field }) => !isExcluded(field))) {
    const selected = getStatusValues(filters, field)
    entries.push({
      group,
      label,
      node: (
        <CollapsibleSection key={field} label={label} defaultOpen={selected.length > 0}>
          <StatusFilter
            selected={selected}
            onChange={(values) => setField(field, values.length > 0 ? [{ op: "in", value: [...values] }] : [])}
          />
        </CollapsibleSection>
      ),
    })
  }

  for (const { label, field, placeholder, group } of textFields) {
    const value = getTextFilterValue(filters, field)
    const selectedValues = getInValues(filters, field)
    if (field === "userId") {
      const selected = selectedValues.length > 0 ? selectedValues : value ? [value] : []
      entries.push({
        group,
        label,
        node: (
          <CollapsibleSection key={field} label={label} defaultOpen={selected.length > 0}>
            <MultiSelectFilter
              mode={mode}
              projectId={projectId}
              column={field as DistinctColumn}
              selected={selected}
              onChange={(values) => setField(field, values.length > 0 ? [{ op: "in", value: values }] : [])}
              placeholder={placeholder}
            />
          </CollapsibleSection>
        ),
      })
      continue
    }
    entries.push({
      group,
      label,
      node: (
        <CollapsibleSection key={field} label={label} defaultOpen={!!value}>
          <DebouncedInput
            placeholder={placeholder}
            size="sm"
            value={value}
            onDebouncedChange={(nextValue) => setContainsFilter(field, nextValue)}
          />
        </CollapsibleSection>
      ),
    })
  }

  for (const { label, field, group } of getMultiSelectFieldsForMode(mode).filter(({ field }) => !isExcluded(field))) {
    const selectedValues = getInValues(filters, field)
    const staticItems = staticItemsByField[field]
    entries.push({
      group,
      label,
      node: (
        <CollapsibleSection key={field} label={label} defaultOpen={selectedValues.length > 0}>
          <MultiSelectFilter
            mode={mode}
            projectId={projectId}
            column={field as DistinctColumn}
            selected={selectedValues}
            onChange={(values) => setField(field, values.length > 0 ? [{ op: "in", value: values }] : [])}
            {...(staticItems ? { staticItems } : {})}
          />
        </CollapsibleSection>
      ),
    })
  }

  for (const { label, field, group, tooltip, percentile, displayScale, displayStep } of NUMBER_RANGE_FIELDS.filter(
    ({ field }) => !isExcluded(field),
  )) {
    const range = getRangeValues(filters, field)
    entries.push({
      group,
      label,
      node: (
        <NumberFilterSection
          key={field}
          label={label}
          field={field}
          tooltip={tooltip}
          percentileField={percentile?.field}
          projectId={projectId}
          mode={mode}
          minValue={toDisplayUnit(range.min, displayScale)}
          maxValue={toDisplayUnit(range.max, displayScale)}
          percentileValue={getPercentileValue(filters, field)}
          onRangeChange={(min, max) =>
            setRangeFilter(field, toWireUnit(min, displayScale), toWireUnit(max, displayScale))
          }
          onPercentileChange={(p) => setPercentileFilter(field, p)}
          {...(displayStep !== undefined ? { step: displayStep } : {})}
        />
      ),
    })
  }

  if (!isExcluded(ANNOTATOR_FIELD)) {
    entries.push({
      group: "scores",
      label: "Scored by",
      node: (
        <CollapsibleSection
          key={ANNOTATOR_FIELD}
          label="Scored by"
          defaultOpen={getInValues(filters, ANNOTATOR_FIELD).length > 0}
        >
          <MultiSelectFilter
            mode={mode}
            projectId={projectId}
            column={"annotatorId" as DistinctColumn}
            selected={getInValues(filters, ANNOTATOR_FIELD)}
            onChange={setAnnotatedBy}
            staticItems={annotatorItems}
            placeholder="Search members..."
          />
        </CollapsibleSection>
      ),
    })
    entries.push({
      group: "scores",
      label: "Has scores",
      node: (
        <CollapsibleSection key="hasScores" label="Has scores" defaultOpen={getHasAnnotationsOn(filters)}>
          <div className="flex items-center justify-between gap-2">
            <Text.H7 color="foregroundMuted">
              {getHasAnnotationsOn(filters)
                ? "Showing only items with a human score."
                : "Showing all items, scored or not."}
            </Text.H7>
            <Switch
              checked={getHasAnnotationsOn(filters)}
              onCheckedChange={(next) => setHasAnnotations(next === true)}
            />
          </div>
        </CollapsibleSection>
      ),
    })
  }

  if (!isExcluded("metadata")) {
    entries.push({
      group: "custom",
      label: "Metadata",
      node: (
        <CollapsibleSection key="metadata" label="Metadata" defaultOpen={metadataEntries.length > 0}>
          <MetadataFilter entries={metadataEntries} onChange={handleMetadataChange} />
        </CollapsibleSection>
      ),
    })
  }

  if (mode === "sessions" && !isExcluded("hasLlmActivity")) {
    entries.push({
      group: "status",
      label: "Has LLM activity",
      node: (
        <CollapsibleSection
          key="hasLlmActivity"
          label="Has LLM activity"
          defaultOpen={filters.hasLlmActivity !== undefined && !isHasLlmActivityFilterOn(filters)}
        >
          <div className="flex items-center justify-between gap-2">
            <Text.H7 color="foregroundMuted">
              {isHasLlmActivityFilterOn(filters)
                ? "Hiding sessions without any LLM call."
                : "Including orphan fragments."}
            </Text.H7>
            <Switch
              checked={isHasLlmActivityFilterOn(filters)}
              onCheckedChange={(next) => setHasLlmActivity(next === true)}
            />
          </div>
        </CollapsibleSection>
      ),
    })
  }

  const groups = groupFilterSections(entries, search)

  return (
    <>
      <div className="sticky top-0 z-10 bg-background pt-3 pb-1">
        <div className="relative">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search filters"
            size="sm"
            className="pl-8 rounded-lg"
          />
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {groups.every((group) => group.hidden) && (
        <Text.H6 color="foregroundMuted" className="py-3">
          No filter matches “{search.trim()}”.
        </Text.H6>
      )}
      {groups.map((group) => (
        <div key={group.id} className={cn("flex flex-col", group.hidden && "hidden")}>
          <Text.H6 color="foregroundMuted" weight="medium" className="pt-3 pb-0.5 uppercase tracking-wide">
            {group.label}
          </Text.H6>
          {group.sections.map((section) => (
            <div key={section.label} className={cn(section.hidden && "hidden")}>
              {section.node}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
