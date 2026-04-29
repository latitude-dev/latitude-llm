import type { FilterCondition, FilterSet } from "@domain/shared"
import { Button, cn, Icon, Input, Popover, PopoverAnchor, PopoverContent, Text, useMountEffect } from "@repo/ui"
import {
  ChevronLeftIcon,
  ClockIcon,
  DatabaseIcon,
  DollarSignIcon,
  FileTextIcon,
  HashIcon,
  HourglassIcon,
  LayersIcon,
  type LucideIcon,
  SearchIcon,
  ServerIcon,
  TagIcon,
  TimerIcon,
  TriangleAlertIcon,
  UserIcon,
  WaypointsIcon,
  ZapIcon,
} from "lucide-react"
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { DateRangeFilter } from "../../../../../../components/filters-builder/date-range-filter.tsx"
import { MetadataFilter } from "../../../../../../components/filters-builder/metadata-filter/metadata-filter.tsx"
import {
  type MetadataEntry,
  useMetadataFilter,
} from "../../../../../../components/filters-builder/metadata-filter/use-metadata-filter.ts"
import { MultiSelectFilter } from "../../../../../../components/filters-builder/multi-select-filter.tsx"
import { NumberRangeFilter } from "../../../../../../components/filters-builder/number-range-filter.tsx"
import type { DistinctColumn } from "../../../../../../components/filters-builder/types.ts"
import {
  getInValues,
  getRangeValues,
  getTextFilterValue,
  setFieldConditions,
} from "../../../../../../components/filters-builder/utils.ts"

type FilterDef =
  | { readonly field: string; readonly label: string; readonly icon: LucideIcon; readonly kind: "tags" }
  | { readonly field: string; readonly label: string; readonly icon: LucideIcon; readonly kind: "date" }
  | { readonly field: string; readonly label: string; readonly icon: LucideIcon; readonly kind: "metadata" }
  | {
      readonly field: string
      readonly label: string
      readonly icon: LucideIcon
      readonly kind: "multiSelect"
      readonly column: DistinctColumn
    }
  | {
      readonly field: string
      readonly label: string
      readonly icon: LucideIcon
      readonly kind: "text"
      readonly placeholder: string
    }
  | {
      readonly field: string
      readonly label: string
      readonly icon: LucideIcon
      readonly kind: "numberRange"
    }

const FILTER_DEFS: readonly FilterDef[] = [
  { field: "tags", label: "Tag", icon: HashIcon, kind: "tags" },
  { field: "startTime", label: "Time", icon: ClockIcon, kind: "date" },
  { field: "models", label: "Model", icon: ZapIcon, kind: "multiSelect", column: "models" },
  { field: "serviceNames", label: "Service", icon: ServerIcon, kind: "multiSelect", column: "serviceNames" },
  { field: "providers", label: "Provider", icon: WaypointsIcon, kind: "multiSelect", column: "providers" },
  { field: "userId", label: "User ID", icon: UserIcon, kind: "text", placeholder: "Filter by user…" },
  { field: "cost", label: "Cost", icon: DollarSignIcon, kind: "numberRange" },
  { field: "duration", label: "Duration", icon: HourglassIcon, kind: "numberRange" },
  { field: "spanCount", label: "Span count", icon: LayersIcon, kind: "numberRange" },
  { field: "errorCount", label: "Error count", icon: TriangleAlertIcon, kind: "numberRange" },
  { field: "tokensInput", label: "Tokens in", icon: TagIcon, kind: "numberRange" },
  { field: "tokensOutput", label: "Tokens out", icon: TagIcon, kind: "numberRange" },
  { field: "ttft", label: "TTFT", icon: TimerIcon, kind: "numberRange" },
  { field: "name", label: "Name", icon: FileTextIcon, kind: "text", placeholder: "Filter by name…" },
  { field: "traceId", label: "Trace ID", icon: FileTextIcon, kind: "text", placeholder: "Filter by trace…" },
  { field: "sessionId", label: "Session ID", icon: FileTextIcon, kind: "text", placeholder: "Filter by session…" },
  {
    field: "simulationId",
    label: "Simulation ID",
    icon: FileTextIcon,
    kind: "text",
    placeholder: "Filter by simulation…",
  },
  { field: "metadata", label: "Metadata", icon: DatabaseIcon, kind: "metadata" },
]

const DEFS_BY_FIELD: Record<string, FilterDef> = Object.fromEntries(FILTER_DEFS.map((d) => [d.field, d]))

interface SearchFilterCommandProps {
  readonly open: boolean
  readonly anchor: HTMLElement | null
  /** When set, opens directly to the editor for this field (Level 2). When null, opens the filter list (Level 1). */
  readonly initialField: string | null
  readonly filters: FilterSet
  readonly onFiltersChange: (next: FilterSet) => void
  readonly onClose: () => void
  readonly projectId: string
  /** Where focus returns when the palette is closed via Esc. */
  readonly searchInputRef: { readonly current: HTMLInputElement | null }
}

export function SearchFilterCommand(props: SearchFilterCommandProps) {
  // Wrap the anchor (which can be null while closed) in a stable Measurable
  // ref so Radix is happy. Reading `getBoundingClientRect` lazily means the
  // current anchor is always honored without effects.
  const virtualRef = useRef<{ getBoundingClientRect: () => DOMRect }>({
    getBoundingClientRect: () => new DOMRect(),
  })
  virtualRef.current = {
    getBoundingClientRect: () => props.anchor?.getBoundingClientRect() ?? new DOMRect(),
  }

  // Lifted stage / field state so onEscapeKeyDown can decide whether to
  // navigate "back to Level 1" or close the palette outright.
  const [stage, setStage] = useState<"list" | "editor">(props.initialField ? "editor" : "list")
  const [field, setField] = useState<string | null>(props.initialField)
  const enteredViaList = !props.initialField
  const escapeClosed = useRef(false)

  // TODO(frontend-use-effect-policy): reset the local stage when the palette
  // is reopened with a new context (different anchor / initialField).
  useEffect(() => {
    if (!props.open) return
    setStage(props.initialField ? "editor" : "list")
    setField(props.initialField)
    escapeClosed.current = false
  }, [props.open, props.initialField, props.anchor])

  const def = field ? DEFS_BY_FIELD[field] : undefined

  const goToEditor = (next: string) => {
    setField(next)
    setStage("editor")
  }

  const goBack = () => {
    setStage("list")
    setField(null)
  }

  const commitField = (nextFilters: FilterSet) => {
    props.onFiltersChange(nextFilters)
    props.onClose()
  }

  return (
    <Popover
      open={props.open}
      modal={false}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[360px] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          // Esc inside Level 2 (when we drilled in via Level 1) goes BACK
          // to Level 1 instead of closing.
          if (stage === "editor" && enteredViaList) {
            event.preventDefault()
            goBack()
            return
          }
          // Otherwise let Radix close — and remember it was Esc so we can
          // return focus to the search input.
          escapeClosed.current = true
        }}
        onCloseAutoFocus={(event) => {
          if (escapeClosed.current) {
            event.preventDefault()
            props.searchInputRef.current?.focus()
            escapeClosed.current = false
          }
        }}
      >
        {props.open ? (
          <CommandBody
            stage={stage}
            def={def}
            enteredViaList={enteredViaList}
            filters={props.filters}
            projectId={props.projectId}
            onPick={goToEditor}
            onBack={goBack}
            onApply={commitField}
            onClose={props.onClose}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

interface CommandBodyProps {
  readonly stage: "list" | "editor"
  readonly def: FilterDef | undefined
  readonly enteredViaList: boolean
  readonly filters: FilterSet
  readonly projectId: string
  readonly onPick: (field: string) => void
  readonly onBack: () => void
  readonly onApply: (next: FilterSet) => void
  readonly onClose: () => void
}

function CommandBody({
  stage,
  def,
  enteredViaList,
  filters,
  projectId,
  onPick,
  onBack,
  onApply,
  onClose,
}: CommandBodyProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef} className="flex max-h-[420px] flex-col overflow-hidden">
      {stage === "list" || !def ? (
        <FilterList onPick={onPick} onClose={onClose} />
      ) : (
        <FilterEditor
          def={def}
          filters={filters}
          projectId={projectId}
          portalContainer={containerRef}
          showBack={enteredViaList}
          onBack={onBack}
          onApply={onApply}
        />
      )}
    </div>
  )
}

interface FilterListProps {
  readonly onPick: (field: string) => void
  readonly onClose: () => void
}

function FilterList({ onPick, onClose }: FilterListProps) {
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useMountEffect(() => {
    inputRef.current?.focus()
  })

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase()
    if (!lower) return FILTER_DEFS
    return FILTER_DEFS.filter((def) => def.label.toLowerCase().includes(lower))
  }, [query])

  // TODO(frontend-use-effect-policy): keep the highlighted row inside the
  // visible scroll area as the user arrows through. We need the post-render
  // ref to call `scrollIntoView`.
  useEffect(() => {
    itemRefs.current[highlight]?.scrollIntoView({ block: "nearest" })
  }, [highlight])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlight((prev) => Math.min(prev + 1, Math.max(filtered.length - 1, 0)))
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlight((prev) => Math.max(prev - 1, 0))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const target = filtered[highlight]
      if (target) onPick(target.field)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <>
      <div className="flex flex-row items-center gap-2 border-b border-border/60 px-3">
        <Icon icon={SearchIcon} size="sm" color="foregroundMuted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setHighlight(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Find a filter…"
          className="flex h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex flex-col overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <Text.H6 color="foregroundMuted">No filters match "{query}"</Text.H6>
          </div>
        ) : (
          filtered.map((def, idx) => (
            <button
              type="button"
              key={def.field}
              ref={(el) => {
                itemRefs.current[idx] = el
              }}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => onPick(def.field)}
              className={cn("flex flex-row items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm outline-none", {
                "bg-muted": idx === highlight,
              })}
            >
              <Icon icon={def.icon} size="sm" color="foregroundMuted" />
              <span>{def.label}</span>
            </button>
          ))
        )}
      </div>
    </>
  )
}

interface FilterEditorProps {
  readonly def: FilterDef
  readonly filters: FilterSet
  readonly projectId: string
  readonly portalContainer: { readonly current: HTMLDivElement | null }
  readonly showBack: boolean
  readonly onBack: () => void
  readonly onApply: (next: FilterSet) => void
}

function FilterEditor(props: FilterEditorProps) {
  return (
    <>
      <EditorHeader def={props.def} showBack={props.showBack} onBack={props.onBack} />
      <div className="p-3">{renderEditor(props)}</div>
    </>
  )
}

function EditorHeader({
  def,
  showBack,
  onBack,
}: {
  readonly def: FilterDef
  readonly showBack: boolean
  readonly onBack: () => void
}) {
  return (
    <div className="flex flex-row items-center gap-2 border-b p-2">
      {showBack ? (
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to filter list">
          <Icon icon={ChevronLeftIcon} size="sm" />
        </Button>
      ) : null}
      <Icon icon={def.icon} size="sm" color="foregroundMuted" />
      <Text.H5>{def.label}</Text.H5>
    </div>
  )
}

function renderEditor(props: FilterEditorProps): ReactNode {
  const { def, filters, projectId, portalContainer, onApply } = props

  if (def.kind === "tags" || def.kind === "multiSelect") {
    const column: DistinctColumn = def.kind === "tags" ? "tags" : def.column
    const initial = getInValues(filters, def.field)
    return (
      <MultiSelectEditor
        projectId={projectId}
        column={column}
        portalContainer={portalContainer}
        initial={[...initial]}
        onApply={(values) =>
          onApply(setFieldConditions(filters, def.field, values.length > 0 ? [{ op: "in", value: values }] : []))
        }
      />
    )
  }

  if (def.kind === "text") {
    return (
      <TextEditor
        placeholder={def.placeholder}
        initial={getTextFilterValue(filters, def.field)}
        onApply={(value) => onApply(setFieldConditions(filters, def.field, value ? [{ op: "contains", value }] : []))}
      />
    )
  }

  if (def.kind === "numberRange") {
    const range = getRangeValues(filters, def.field)
    return (
      <NumberRangeEditor
        initialMin={range.min}
        initialMax={range.max}
        onApply={(min, max) => {
          const conditions: FilterCondition[] = []
          if (min !== undefined) conditions.push({ op: "gte", value: min })
          if (max !== undefined) conditions.push({ op: "lte", value: max })
          onApply({ ...filters, [def.field]: conditions })
        }}
      />
    )
  }

  if (def.kind === "date") {
    return <DateRangeFilter filters={filters} onChange={onApply} />
  }

  return <MetadataEditor filters={filters} onApply={onApply} />
}

function TextEditor({
  placeholder,
  initial,
  onApply,
}: {
  readonly placeholder: string
  readonly initial: string
  readonly onApply: (value: string) => void
}) {
  const [draft, setDraft] = useState(initial)
  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        size="sm"
        placeholder={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onApply(draft.trim())
          }
        }}
      />
      <Button variant="default" size="sm" onClick={() => onApply(draft.trim())}>
        Apply
      </Button>
    </div>
  )
}

function NumberRangeEditor({
  initialMin,
  initialMax,
  onApply,
}: {
  readonly initialMin: number | undefined
  readonly initialMax: number | undefined
  readonly onApply: (min: number | undefined, max: number | undefined) => void
}) {
  const [min, setMin] = useState<number | undefined>(initialMin)
  const [max, setMax] = useState<number | undefined>(initialMax)
  return (
    <div className="flex flex-col gap-2">
      <NumberRangeFilter minValue={min} maxValue={max} onMinChange={setMin} onMaxChange={setMax} />
      <Button variant="default" size="sm" onClick={() => onApply(min, max)}>
        Apply
      </Button>
    </div>
  )
}

function MultiSelectEditor({
  projectId,
  column,
  portalContainer,
  initial,
  onApply,
}: {
  readonly projectId: string
  readonly column: DistinctColumn
  readonly portalContainer: { readonly current: HTMLElement | null }
  readonly initial: string[]
  readonly onApply: (values: string[]) => void
}) {
  const [draft, setDraft] = useState(initial)
  return (
    <div className="flex flex-col gap-2">
      <MultiSelectFilter
        projectId={projectId}
        column={column}
        selected={draft}
        portalContainer={portalContainer}
        onChange={setDraft}
      />
      <Button variant="default" size="sm" onClick={() => onApply(draft)}>
        Apply
      </Button>
    </div>
  )
}

function MetadataEditor({
  filters,
  onApply,
}: {
  readonly filters: FilterSet
  readonly onApply: (next: FilterSet) => void
}) {
  const { entries } = useMetadataFilter(filters, () => {})
  const [draft, setDraft] = useState<MetadataEntry[]>([...entries])

  const commit = () => {
    const trimmed = draft.filter((e) => e.key.trim().length > 0 && e.value.trim().length > 0)
    const next: Record<string, FilterCondition[]> = {}
    for (const [key, value] of Object.entries(filters)) {
      if (!key.startsWith("metadata.")) next[key] = [...value]
    }
    for (const entry of trimmed) {
      next[`metadata.${entry.key.trim()}`] = [{ op: "eq", value: entry.value.trim() }]
    }
    onApply(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <MetadataFilter entries={draft} onChange={setDraft} />
      <Button variant="default" size="sm" onClick={commit}>
        Apply
      </Button>
    </div>
  )
}
