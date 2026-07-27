import {
  DEFAULT_VARIANT_RANGE_SECONDS,
  ENTITY_TOP_LIST_DESCRIPTIONS,
  EXPERIMENT_METRICS,
  type ExperimentMetricDef,
  type ExperimentMetricKey,
  HEADLINE_METRIC_KEYS,
  METRIC_ENTITIES,
  type MetricEntity,
  type VariantComparison,
} from "@domain/experiments"
import type { FilterSet } from "@domain/shared"
import {
  AnimatedBorder,
  Badge,
  Button,
  cn,
  type DateRange,
  DateRangePicker,
  type DateRangePickerPreset,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Text,
  Tooltip,
  useMountEffect,
} from "@repo/ui"
import { Link } from "@tanstack/react-router"
import {
  BaselineIcon,
  BookmarkPlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  DollarSignIcon,
  EllipsisVerticalIcon,
  type LucideIcon,
  MessagesSquareIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UsersRoundIcon,
} from "lucide-react"
import { Fragment, type ReactNode, useRef, useState } from "react"
import { FilterBuilder } from "../../../../../../components/filters-builder/filter-builder.tsx"
import type {
  ExperimentVariantRecord,
  VariantPatch,
} from "../../../../../../domains/experiments/experiments.collection.ts"
import { topicBehaviourClusterLink } from "../../../../../../domains/taxonomy/topic-behaviour-link.ts"
import { SearchInput } from "../../-components/search-input.tsx"
import { TIME_PRESETS } from "../../-components/time-filter-dropdown.tsx"
import { serializeFilters } from "../../-components/trace-page-state.ts"
import { ENTITY_ICON, ENTITY_LABEL, formatMetricValue, MetricDelta } from "./metric-format.tsx"
import {
  VariantBaselineConfirmModal,
  VariantImportFromSearchModal,
  VariantRemoveConfirmModal,
  VariantRenameModal,
} from "./variant-modals.tsx"

const METRIC_BY_KEY = new Map<string, ExperimentMetricDef>(EXPERIMENT_METRICS.map((metric) => [metric.key, metric]))

const HEADLINE_ICON: Record<string, LucideIcon> = {
  "sessions.count": MessagesSquareIcon,
  "sessions.users": UsersRoundIcon,
  "sessions.cost_total": DollarSignIcon,
  "sessions.duration_median": ClockIcon,
}

/** Below this per-variant width the table stops dividing space equally and overflows horizontally. */
const MIN_COLUMN_PX = 320
/** The page's right-side gutter. The left gutter splits into the scroll container's `ml-4` plus
 * `SHADER_BLEED_PX` of padding: scrolled content clips near the sticky baseline column's edge
 * instead of showing through a padding strip, while the shader's outer bleed keeps headroom. */
const GUTTER_PX = 24
/** `AnimatedBorder`'s outer glow reach — the scrollable headroom kept around the frame. */
const SHADER_BLEED_PX = 8

const startOfLocalDay = (date: Date): Date => {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}
const endOfLocalDay = (date: Date): Date => {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

interface VariantActions {
  readonly renameVariant: (variantId: string, name: string) => Promise<void>
  readonly setBaseline: (variantId: string) => Promise<void>
  readonly removeVariant: (variantId: string) => Promise<void>
  readonly updateVariant: (variantId: string, patch: VariantPatch) => Promise<void>
  readonly importFromSearch: (
    variantId: string,
    filterSet: FilterSet,
    query: string | null,
    timeRange: ExperimentVariantRecord["timeRange"],
  ) => Promise<void>
}

interface ComparisonEntry {
  readonly variant: ExperimentVariantRecord
  readonly comparison: VariantComparison
}

/** Elevation cast over the columns sliding beneath the pinned baseline: a gradient strip (not a
 * box-shadow) so adjacent cells' strips tile seamlessly. `-bottom-px` bridges the row border. */
const STUCK_SHADOW =
  "after:pointer-events-none after:absolute after:top-0 after:-bottom-px after:left-full after:w-3 after:bg-gradient-to-r after:from-black/5 after:to-transparent"

/** Opaque strip over the shader-bleed headroom left of the pinned column, so sliding content
 * doesn't show through it. Only applied while scrolled — at rest it would sit on empty gutter
 * (and over the frame's border), and the bleed it replaces only shows at rest anyway. */
const STUCK_LEFT_MASK =
  "before:pointer-events-none before:absolute before:top-0 before:-bottom-px before:right-full before:w-2 before:bg-background"

/**
 * Baseline column (always first): sticky-left over the horizontal scroll, so it needs an opaque
 * background; the other columns scroll beneath it. `isLastRow` swaps the row border for the
 * frame's own bottom edge and rounds the sticky cell's corner so it doesn't overpaint the frame.
 */
function bodyCellClass({
  column,
  count,
  scrolled,
  isLastRow = false,
}: {
  column: number
  count: number
  scrolled: boolean
  isLastRow?: boolean
}): string {
  return cn(
    "p-0 align-top",
    !isLastRow && "border-b",
    column < count - 1 && "border-r",
    column === 0 && "sticky left-2 z-10 bg-background",
    column === 0 && scrolled && cn(STUCK_SHADOW, STUCK_LEFT_MASK),
    isLastRow && column === 0 && "rounded-bl-xl",
  )
}

/** Header cells stick to the top so each column stays labelled with its variant while the metrics
 * scroll; the baseline cell also pins sticky-left, sitting above the other header cells at the corner
 * (z-30 > z-20) and above the sticky baseline body column (z-10). Every cell is opaque so scrolled
 * rows don't show through. */
function headerCellClass({ column, count, scrolled }: { column: number; count: number; scrolled: boolean }): string {
  return cn(
    "sticky top-0 border-b bg-background p-0 align-top",
    column < count - 1 && "border-r",
    column === 0 ? "left-2 z-30 rounded-tl-xl" : "z-20",
    column === 0 && scrolled && cn(STUCK_SHADOW, STUCK_LEFT_MASK),
  )
}

/**
 * The variant comparison as one table: a supercolumn per variant (the baseline — the one flagged
 * `baseline: true` — sorted to the front and pinned sticky-left),
 * shared rows for the header / population editors / headline summaries, then a collapsible header
 * row per metric entity spanning every supercolumn with one aligned row per metric beneath it.
 * Columns divide the available width equally and floor at `MIN_COLUMN_PX`, overflowing to the
 * right past that. The frame div can't clip (`overflow-hidden` would break sticky against the
 * page scroll container), so corner cells with backgrounds round themselves.
 */
export function ComparisonTable({
  projectId,
  projectSlug,
  entries,
  actions,
  openEntities,
  onToggleEntity,
  initialFiltersExpanded = false,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly entries: readonly ComparisonEntry[]
  readonly actions: VariantActions
  /** Expanded metric sections, shared across all supercolumns so sections toggle in lockstep. */
  readonly openEntities: ReadonlySet<string>
  readonly onToggleEntity: (entity: string) => void
  /** Start every variant's filter section expanded on mount (the post-creation redirect). */
  readonly initialFiltersExpanded?: boolean
}) {
  const count = entries.length
  const tableMinWidth = count * MIN_COLUMN_PX

  // Whether the table is horizontally scrolled, i.e. the baseline column is pinned over the
  // other columns and casts the stuck shadow.
  const gutterRef = useRef<HTMLDivElement | null>(null)
  const [scrolled, setScrolled] = useState(false)
  // Vertically scrolled: the header is pinned over the body rows, so the baseline shader ring (which
  // spans the definition rows scrolling away beneath it) is hidden, same as when scrolled sideways.
  const [scrolledY, setScrolledY] = useState(false)
  useMountEffect(() => {
    const scroller = gutterRef.current?.parentElement
    if (!scroller) return
    const onScroll = () => {
      setScrolled(scroller.scrollLeft > 0)
      setScrolledY(scroller.scrollTop > 0)
    }
    onScroll()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => scroller.removeEventListener("scroll", onScroll)
  })

  // The baseline shader ring spans the header + editors + summaries rows, but those are three
  // separate cells, so the overlay lives in the header cell and is sized to the measured span.
  const headerRowRef = useRef<HTMLTableRowElement | null>(null)
  const summariesRowRef = useRef<HTMLTableRowElement | null>(null)
  const [shaderHeight, setShaderHeight] = useState<number | null>(null)
  useMountEffect(() => {
    const headerRow = headerRowRef.current
    const summariesRow = summariesRowRef.current
    if (!headerRow || !summariesRow) return
    const measure = () => {
      const next = Math.round(summariesRow.getBoundingClientRect().bottom - headerRow.getBoundingClientRect().top)
      setShaderHeight((prev) => (prev === next ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    // The editors row sits between the two: its resizes shift the summaries row without resizing
    // it, so observe the whole tbody (any row change moves its height) plus both anchor rows.
    if (headerRow.parentElement) observer.observe(headerRow.parentElement)
    observer.observe(headerRow)
    observer.observe(summariesRow)
    return () => observer.disconnect()
  })

  return (
    <div
      ref={gutterRef}
      className="pt-2 pr-6 pb-6 pl-2"
      style={{ minWidth: `${tableMinWidth + GUTTER_PX + SHADER_BLEED_PX + 2}px` }}
    >
      <div className="rounded-xl border" style={{ minWidth: `${tableMinWidth + 2}px` }}>
        <table
          className="w-full table-fixed border-separate border-spacing-0"
          style={{ minWidth: `${tableMinWidth}px` }}
        >
          <tbody>
            <tr ref={headerRowRef}>
              {entries.map((entry, column) => (
                <VariantHeaderCell
                  key={entry.variant.id}
                  projectId={projectId}
                  projectSlug={projectSlug}
                  entry={entry}
                  actions={actions}
                  column={column}
                  count={count}
                  scrolled={scrolled}
                  scrolledY={scrolledY}
                  shaderHeight={shaderHeight}
                />
              ))}
            </tr>

            <tr>
              {entries.map((entry, column) => (
                <td key={entry.variant.id} className={bodyCellClass({ column, count, scrolled })}>
                  <div className="flex flex-col gap-3 p-3">
                    <VariantTimeRangePicker
                      timeRange={entry.variant.timeRange}
                      resolvedRange={entry.comparison.resolvedRange}
                      onChange={(timeRange) => void actions.updateVariant(entry.variant.id, { timeRange })}
                    />
                    <div className="flex flex-col gap-1">
                      <Text.H6 color="foregroundMuted">Search</Text.H6>
                      <SearchQueryInput
                        key={entry.variant.query ?? ""}
                        value={entry.variant.query ?? ""}
                        approximate={entry.comparison.approximate}
                        onCommit={(next) =>
                          void actions.updateVariant(entry.variant.id, { query: next.trim() ? next.trim() : null })
                        }
                      />
                    </div>
                    <FilterBuilder
                      mode="sessions"
                      projectId={projectId}
                      value={entry.variant.filterSet}
                      onChange={(next) => void actions.updateVariant(entry.variant.id, { filterSet: next })}
                      collapsible
                      initialExpanded={initialFiltersExpanded}
                    />
                  </div>
                </td>
              ))}
            </tr>

            <tr ref={summariesRowRef}>
              {entries.map((entry, column) => (
                <td key={entry.variant.id} className={bodyCellClass({ column, count, scrolled })}>
                  <div className="grid grid-cols-2 gap-2 p-3">
                    {HEADLINE_METRIC_KEYS.map((key) => (
                      <HeadlinePanel
                        key={key}
                        metricKey={key}
                        comparison={entry.comparison}
                        isBaseline={entry.comparison.baseline}
                      />
                    ))}
                  </div>
                </td>
              ))}
            </tr>

            {METRIC_ENTITIES.map((entity, index) => (
              <MetricEntityRows
                key={entity}
                entity={entity}
                entries={entries}
                projectSlug={projectSlug}
                open={openEntities.has(entity)}
                onToggle={() => onToggleEntity(entity)}
                isLastEntity={index === METRIC_ENTITIES.length - 1}
                scrolled={scrolled}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VariantHeaderCell({
  projectId,
  projectSlug,
  entry,
  actions,
  column,
  count,
  scrolled,
  scrolledY,
  shaderHeight,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly entry: ComparisonEntry
  readonly actions: VariantActions
  readonly column: number
  readonly count: number
  readonly scrolled: boolean
  readonly scrolledY: boolean
  /** Measured span of the header + editors + summaries rows the baseline shader ring wraps. */
  readonly shaderHeight: number | null
}) {
  const [modal, setModal] = useState<"rename" | "baseline" | "remove" | "import" | null>(null)
  const { variant, comparison } = entry
  const isBaseline = variant.baseline

  const sessionsSearch = {
    tab: "sessions",
    ...(variant.query ? { query: variant.query } : {}),
    ...(() => {
      const filters: FilterSet = {
        ...variant.filterSet,
        startTime: [
          { op: "gte", value: comparison.resolvedRange.fromIso },
          { op: "lte", value: comparison.resolvedRange.toIso },
        ],
      }
      const serialized = serializeFilters(filters)
      return serialized ? { filters: serialized } : {}
    })(),
  }

  return (
    <td className={headerCellClass({ column, count, scrolled })}>
      {/* The animated brand-gradient ring around the baseline's definition rows. The cell is the
          sticky containing block, so the ring pins with the column over horizontal scroll. Only
          the top-left corner is rounded, matching the supercolumn's actual border. The cover div
          crops the ring's interior within this row (the editors/summaries rows crop their own
          region with their opaque backgrounds), leaving the hairline + outer glow — the same
          subtle treatment the old baseline card got from its opaque surface. */}
      {isBaseline && shaderHeight !== null ? (
        <>
          {/* Once pinned in either direction the ring can't track the rows it wraps, so hide it
              instantly and fade it back in at rest — the stuck shadow / sticky header take over. */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 left-0 w-full",
              scrolled || scrolledY ? "opacity-0" : "opacity-100 transition-opacity duration-300",
            )}
            style={{ height: shaderHeight }}
          >
            <AnimatedBorder radiusPx={[12, 0, 0, 0]} intensity={1} />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-tl-xl bg-background" />
        </>
      ) : null}
      <div className="relative flex items-center gap-2 p-3">
        <Tooltip
          asChild
          side="bottom"
          trigger={
            <Link
              to="/projects/$projectSlug"
              params={{ projectSlug }}
              search={sessionsSearch}
              className="flex min-w-0 items-center hover:underline"
              aria-label={`Open ${variant.name} in the session dashboard`}
            >
              <Text.H5M noWrap ellipsis className="min-w-0">
                {variant.name}
              </Text.H5M>
            </Link>
          }
        >
          Open in session dashboard
        </Tooltip>
        {isBaseline ? (
          <Badge variant="default" size="small" className="shrink-0">
            BASELINE
          </Badge>
        ) : null}
        <div className="ml-auto shrink-0">
          <DropdownMenuRoot modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label="Variant actions">
                <Icon icon={EllipsisVerticalIcon} size="sm" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={() => setModal("rename")}>
                  <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
                  <Text.H5>Rename</Text.H5>
                </DropdownMenuItem>
                {!isBaseline ? (
                  <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={() => setModal("baseline")}>
                    <Icon icon={BaselineIcon} size="sm" color="foregroundMuted" />
                    <Text.H5>Set as baseline</Text.H5>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={() => setModal("import")}>
                  <Icon icon={BookmarkPlusIcon} size="sm" color="foregroundMuted" />
                  <Text.H5>Import from search</Text.H5>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={() => setModal("remove")}>
                  <Icon icon={Trash2Icon} size="sm" color="destructive" />
                  <Text.H5 color="destructive">Remove</Text.H5>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </div>
      </div>

      {modal === "rename" ? (
        <VariantRenameModal
          currentName={variant.name}
          onRename={(name) => actions.renameVariant(variant.id, name)}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === "baseline" ? (
        <VariantBaselineConfirmModal onConfirm={() => actions.setBaseline(variant.id)} onClose={() => setModal(null)} />
      ) : null}
      {modal === "remove" ? (
        <VariantRemoveConfirmModal onConfirm={() => actions.removeVariant(variant.id)} onClose={() => setModal(null)} />
      ) : null}
      {modal === "import" ? (
        <VariantImportFromSearchModal
          projectId={projectId}
          onImport={(filterSet, query, timeRange) => actions.importFromSearch(variant.id, filterSet, query, timeRange)}
          onClose={() => setModal(null)}
        />
      ) : null}
    </td>
  )
}

/**
 * One entity section: a collapsible header row spanning every supercolumn (its label pinned
 * sticky-left so the open section is always identifiable while scrolled), then a row per metric
 * and, for ranked entities, a closing top-list row.
 */
function MetricEntityRows({
  entity,
  entries,
  projectSlug,
  open,
  onToggle,
  isLastEntity,
  scrolled,
}: {
  readonly entity: MetricEntity
  readonly entries: readonly ComparisonEntry[]
  readonly projectSlug: string
  readonly open: boolean
  readonly onToggle: () => void
  readonly isLastEntity: boolean
  readonly scrolled: boolean
}) {
  const count = entries.length
  const metrics = (EXPERIMENT_METRICS as readonly ExperimentMetricDef[]).filter(
    (metric) => metric.entity === entity && !metric.headlineOnly,
  )
  const topLists = entries.map((entry) => topListFor(entity, entry.comparison))
  const hasTopList = topLists.some((list) => list.length > 0)
  const topDescription = ENTITY_TOP_LIST_DESCRIPTIONS[entity as keyof typeof ENTITY_TOP_LIST_DESCRIPTIONS]
  const topLabel = `Top ${ENTITY_LABEL[entity].toLowerCase()}`
  const headerIsLastRow = isLastEntity && !open

  return (
    <Fragment>
      <tr>
        <td colSpan={count} className={cn("p-0", !headerIsLastRow && "border-b")}>
          <button
            type="button"
            className={cn(
              "flex w-full cursor-pointer items-center p-3 text-left hover:bg-muted/50",
              headerIsLastRow && "rounded-b-xl",
            )}
            onClick={onToggle}
            aria-expanded={open}
          >
            {/* Pinned inside the full-span cell so the section label never scrolls out of view;
                left-5 lines it up with the pinned baseline cells' inner padding. */}
            <span className="sticky left-5 flex w-max items-center gap-2">
              <Icon icon={open ? ChevronDownIcon : ChevronRightIcon} size="sm" color="foregroundMuted" />
              <Icon icon={ENTITY_ICON[entity]} size="sm" color="foregroundMuted" />
              <Text.H5M>{ENTITY_LABEL[entity]}</Text.H5M>
            </span>
          </button>
        </td>
      </tr>
      {open
        ? metrics.map((metric, metricIndex) => {
            const isLastRow = isLastEntity && !hasTopList && metricIndex === metrics.length - 1
            return (
              <tr key={metric.key} className="group/metric">
                {entries.map((entry, column) => {
                  const value = entry.comparison.metrics.values[metric.key as ExperimentMetricKey]
                  const delta = entry.comparison.deltas[metric.key as ExperimentMetricKey]
                  return (
                    <td
                      key={entry.variant.id}
                      className={cn(
                        bodyCellClass({ column, count, scrolled, isLastRow }),
                        "group-hover/metric:bg-secondary",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <Tooltip
                          asChild
                          side="top"
                          trigger={
                            <span className="flex min-w-0 cursor-default">
                              <Text.H6 color="foregroundMuted" noWrap ellipsis className="min-w-0">
                                {metric.label}
                              </Text.H6>
                            </span>
                          }
                        >
                          {metric.description}
                        </Tooltip>
                        <Tooltip
                          asChild
                          side="top"
                          trigger={
                            <div className="flex shrink-0 items-baseline gap-1.5 cursor-default">
                              {!entry.comparison.baseline ? (
                                <MetricDelta change={delta} direction={metric.direction} />
                              ) : null}
                              <Text.H5M noWrap className="tabular-nums">
                                {formatMetricValue(value, metric.unit)}
                              </Text.H5M>
                            </div>
                          }
                        >
                          {metric.description}
                        </Tooltip>
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })
        : null}
      {open && hasTopList ? (
        <tr>
          {entries.map((entry, column) => {
            const topList = topLists[column] ?? []
            return (
              <td
                key={entry.variant.id}
                className={bodyCellClass({ column, count, scrolled, isLastRow: isLastEntity })}
              >
                <div className="flex flex-col gap-1 px-3 py-2">
                  {topDescription ? (
                    <Tooltip
                      asChild
                      side="top"
                      trigger={
                        <span className="flex w-max cursor-default">
                          <Text.H6 color="foregroundMuted">{topLabel}</Text.H6>
                        </span>
                      }
                    >
                      {topDescription}
                    </Tooltip>
                  ) : (
                    <Text.H6 color="foregroundMuted">{topLabel}</Text.H6>
                  )}
                  {topList.length === 0 ? (
                    <Text.H6 color="foregroundMuted">—</Text.H6>
                  ) : (
                    topList.map((item) => (
                      <TopListRow key={item.key} entity={entity} projectSlug={projectSlug} item={item}>
                        <Text.H6 noWrap ellipsis className="min-w-0 group-hover:underline">
                          {item.label}
                        </Text.H6>
                        <Text.H6 color="foregroundMuted" noWrap>
                          {item.value.toLocaleString()}
                        </Text.H6>
                      </TopListRow>
                    ))
                  )}
                </div>
              </td>
            )
          })}
        </tr>
      ) : null}
    </Fragment>
  )
}

function topListFor(entity: MetricEntity, comparison: VariantComparison) {
  switch (entity) {
    case "tools":
      return comparison.metrics.topTools
    case "signals":
      return comparison.metrics.topSignals
    case "behaviours":
      return comparison.metrics.topBehaviours
    default:
      return []
  }
}

/**
 * The variant's time-range editor: the session dashboard's `DateRangePicker` (preset select +
 * calendar menu). A preset maps to a live relative range; a custom calendar range maps to a fixed
 * absolute window (normalized to local-day bounds, mirroring the dashboard); clearing resets to the
 * default window (`null`). `value` comes from the already-resolved window so the label and calendar
 * reflect exactly what the server computed.
 */
function VariantTimeRangePicker({
  timeRange,
  resolvedRange,
  onChange,
}: {
  readonly timeRange: ExperimentVariantRecord["timeRange"]
  readonly resolvedRange: VariantComparison["resolvedRange"]
  readonly onChange: (next: ExperimentVariantRecord["timeRange"]) => void
}) {
  const now = Date.now()
  const presets: readonly DateRangePickerPreset[] = TIME_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    range: { from: new Date(now - preset.seconds * 1000), to: new Date(now) },
  }))
  const value: DateRange = { from: new Date(resolvedRange.fromIso), to: new Date(resolvedRange.toIso) }
  const activeSeconds =
    timeRange === null ? DEFAULT_VARIANT_RANGE_SECONDS : timeRange.type === "relative" ? timeRange.seconds : null
  const selectedPresetId =
    activeSeconds === null ? undefined : TIME_PRESETS.find((preset) => preset.seconds === activeSeconds)?.id

  return (
    <DateRangePicker
      value={value}
      presets={presets}
      selectedPresetId={selectedPresetId}
      placeholder="Select range"
      clearLabel="Reset to default"
      fullWidth
      onChange={({ range, source, presetId }) => {
        if (source === "clear" || !range) {
          onChange(null)
          return
        }
        if (source === "preset") {
          const preset = TIME_PRESETS.find((entry) => entry.id === presetId)
          onChange(preset ? { type: "relative", seconds: preset.seconds } : null)
          return
        }
        const from = range.from ? startOfLocalDay(range.from) : undefined
        const end = range.to ?? range.from
        const to = end ? endOfLocalDay(end) : undefined
        onChange(from && to ? { type: "absolute", fromIso: from.toISOString(), toIso: to.toISOString() } : null)
      }}
    />
  )
}

function SearchQueryInput({
  value,
  approximate,
  onCommit,
}: {
  readonly value: string
  readonly approximate: boolean
  readonly onCommit: (next: string) => void
}) {
  const field = (
    <div
      className={cn(
        "flex h-9 min-w-0 items-center overflow-hidden rounded-lg border border-input bg-background transition-colors focus-within:ring-1 focus-within:ring-ring",
        { "border-warning-muted-foreground focus-within:ring-warning-muted-foreground": approximate },
      )}
    >
      <SearchInput key={value} initialValue={value} onSubmit={onCommit} placeholder="e.g. checkout errors" />
      {approximate ? (
        <Icon icon={TriangleAlertIcon} size="xs" color="warningMutedForeground" className="mr-2 shrink-0" />
      ) : null}
    </div>
  )
  if (!approximate) return field
  return (
    <Tooltip asChild trigger={field}>
      Population is approximate because the query includes a semantic search.
    </Tooltip>
  )
}

function HeadlinePanel({
  metricKey,
  comparison,
  isBaseline,
}: {
  readonly metricKey: ExperimentMetricKey
  readonly comparison: VariantComparison
  readonly isBaseline: boolean
}) {
  const def = METRIC_BY_KEY.get(metricKey)
  if (!def) return null
  const value = comparison.metrics.values[metricKey]
  const delta = comparison.deltas[metricKey]
  const flagged = !isBaseline && comparison.deviatingPopulationKeys.includes(metricKey)
  const panel = (
    <div
      className={cn("flex flex-col gap-1 rounded-md border p-2", { "border-destructive bg-destructive/5": flagged })}
    >
      <div className="flex items-center gap-1">
        <Icon icon={HEADLINE_ICON[metricKey] ?? MessagesSquareIcon} size="xs" color="foregroundMuted" />
        <Text.H6 color="foregroundMuted" noWrap ellipsis className="min-w-0">
          {def.label}
        </Text.H6>
        {flagged ? <Icon icon={TriangleAlertIcon} size="xs" color="destructive" className="ml-auto shrink-0" /> : null}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <Text.H4M noWrap>{formatMetricValue(value, def.unit)}</Text.H4M>
        {!isBaseline ? <MetricDelta change={delta} direction={def.direction} /> : null}
      </div>
    </div>
  )
  if (!flagged) return panel
  return (
    <Tooltip asChild trigger={panel}>
      Population differs by more than 25% from the baseline.
    </Tooltip>
  )
}

/**
 * One clickable "Top {tools,signals,behaviours}" row, linking to that entity's detail page.
 * `item.key` is the route identity (tool name / signal id / cluster id). `sessions`/`users` have
 * no top list, so they fall through to a plain row.
 */
function TopListRow({
  entity,
  projectSlug,
  item,
  children,
}: {
  readonly entity: MetricEntity
  readonly projectSlug: string
  readonly item: { readonly key: string }
  readonly children: ReactNode
}) {
  const className = "group flex items-center justify-between gap-2"
  if (entity === "tools") {
    return (
      <Link
        to="/projects/$projectSlug/tools/$toolName"
        params={{ projectSlug, toolName: item.key }}
        className={className}
      >
        {children}
      </Link>
    )
  }
  if (entity === "signals") {
    // For the signals entity `item.key` is the signal slug (see the experiments relabel).
    return (
      <Link
        to="/projects/$projectSlug/signals/$signalSlug"
        params={{ projectSlug, signalSlug: item.key }}
        className={className}
      >
        {children}
      </Link>
    )
  }
  if (entity === "behaviours") {
    return (
      <Link {...topicBehaviourClusterLink(projectSlug, item.key)} className={className}>
        {children}
      </Link>
    )
  }
  return <div className={className}>{children}</div>
}
