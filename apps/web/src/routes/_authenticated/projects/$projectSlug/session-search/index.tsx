import type { FilterSet } from "@domain/shared"
import {
  Button,
  cn,
  Icon,
  type InfiniteTableSorting,
  Popover,
  PopoverTrigger,
  type SortDirection,
  Tooltip,
} from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { ArrowLeftIcon, CircleHelpIcon, FilterIcon, SearchIcon, XIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { hasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.functions.ts"
import { useSessionsCount } from "../../../../../domains/sessions/sessions.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { useSearchSegments } from "../../../../../lib/hooks/useSearchSegments.ts"
import { EMPTY_SELECTION, type SelectionState } from "../../../../../lib/hooks/useSelectableRows.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { ColumnsSelector } from "../-components/columns-selector.tsx"
import {
  DEFAULT_SESSION_SORTING,
  SESSION_COLUMN_OPTIONS,
  type SessionColumnId,
  SessionsView,
} from "../-components/sessions-view.tsx"
import { useTableColumnSettings } from "../-components/table-column-settings.ts"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { getTimeFilterValue, parseFilters, serializeFilters } from "../-components/trace-page-state.ts"
import { useRouteProject } from "../-route-data.ts"
import { SearchSyntaxLegendContent } from "../search/-components/search-syntax-legend.tsx"
import { SessionTraceDetailDrawer } from "./-components/session-trace-detail-drawer.tsx"

const SEARCH_QUERY_MAX_LENGTH = 500

/**
 * Temporary parallel `/session-search` route used to A/B the session-rollup
 * search (this page) against the trace-flat search on `/search`. The route is
 * gated by the `session-search-v2` flag; PR 5 of LAT-599 will fold this code
 * into the canonical `/search` route and delete the flag.
 */
export const Route = createFileRoute("/_authenticated/projects/$projectSlug/session-search/")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Session search</BreadcrumbText>,
  },
  // Server-side guard: belt-and-braces with the sidebar visibility check.
  // Direct navigation to `/session-search` while the flag is off lands the
  // user back on the canonical `/search` route instead of a blank page.
  loader: async ({ params }) => {
    const enabled = await hasFeatureFlag({
      data: { identifier: "session-search-v2" },
    })
    if (!enabled) {
      throw redirect({
        to: "/projects/$projectSlug/search",
        params: { projectSlug: params.projectSlug },
      })
    }
    return null
  },
  component: SessionSearchPage,
})

function SessionSearchPage() {
  const { projectSlug } = Route.useParams()
  const project = useRouteProject()
  const projectId = project.id

  const [q, setQ] = useParamState("q", "")

  const [filtersOpen, setFiltersOpen] = useParamState("filtersOpen", false)
  const [activeTraceId, setActiveTraceId] = useParamState("traceId", "")
  const [, setSelectedSpanId] = useParamState("spanId", "")
  const [rawFilters, setRawFilters] = useParamState("filters", "")
  const [sortBy, setSortBy] = useParamState("sortBy", DEFAULT_SESSION_SORTING.column)
  const [sortDirection, setSortDirection] = useParamState("sortDirection", DEFAULT_SESSION_SORTING.direction, {
    validate: (v): v is SortDirection => v === "asc" || v === "desc",
  })
  // Active query lands on Conversation so the lazy-mount fires highlights immediately.
  const defaultTraceDetailTab: "trace" | "conversation" = q.length > 0 ? "conversation" : "trace"
  const [traceDetailTab, setTraceDetailTab] = useParamState("traceDetailTab", defaultTraceDetailTab, {
    validate: (v): v is "trace" | "conversation" | "spans" | "annotations" =>
      v === "trace" || v === "conversation" || v === "spans" || v === "annotations",
  })

  const traceIdsRef = useRef<string[]>([])

  const filters = useMemo(() => parseFilters(rawFilters || undefined), [rawFilters])
  const sessionColumnSettings = useTableColumnSettings<SessionColumnId>({
    // v1 of a NEW storage key, distinct from the project Sessions tab
    // (`projects.sessions.columns.v3`). PR 5 will likely fold this into a
    // search-specific key on `/search`; until then the temp route keeps its
    // own preference so flag-toggle round-trips don't clobber the Sessions
    // tab's saved layout.
    storageKey: "projects.session-search.columns.v1",
    columns: SESSION_COLUMN_OPTIONS,
  })
  const hasSearchQuery = q.length > 0
  const hasActiveFilters = Object.keys(filters).length > 0
  const hasContent = hasSearchQuery || hasActiveFilters
  const timeFrom = getTimeFilterValue(filters, "gte")
  const timeTo = getTimeFilterValue(filters, "lte")
  const sorting: InfiniteTableSorting = {
    column: sortBy,
    direction: sortDirection,
  }

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)

  const { totalCount, matchingTraceCount } = useSessionsCount({
    projectId: hasContent ? projectId : "",
    ...(hasActiveFilters ? { filters } : {}),
    ...(hasSearchQuery ? { searchQuery: q } : {}),
  })

  // `totalTraceCount` feeds the selection adapter inside SessionsView, which
  // maps a session checkbox to its underlying traceIds and uses the total
  // for the "select all" header state. We don't surface a separate trace
  // count anywhere in this UI, so reusing `totalCount` (the session count)
  // is a close-enough cap for the header indeterminate-vs-all logic.
  const totalTraceCount = totalCount

  const onSortingChange = (next: InfiniteTableSorting) => {
    setSortBy(next.column)
    setSortDirection(next.direction)
  }

  const onFiltersChange = (next: FilterSet) => {
    setFiltersOpen(true)
    setRawFilters(serializeFilters(next) ?? "")
  }

  const clearFilters = () => {
    setRawFilters("")
  }

  const closeTraceDrawer = () => {
    setActiveTraceId("")
    setSelectedSpanId("")
    setTraceDetailTab(defaultTraceDetailTab)
  }

  const onActiveTraceChange = (traceId: string | undefined) => {
    if (!traceId) {
      closeTraceDrawer()
      return
    }
    setActiveTraceId(traceId)
  }

  const navigateTrace = (delta: 1 | -1) => {
    const ids = traceIdsRef.current
    if (ids.length === 0) return
    const idx = ids.indexOf(activeTraceId)
    const target = idx < 0 ? ids[0] : ids[idx + delta]
    if (target) setActiveTraceId(target)
  }

  const activeTraceIndex = traceIdsRef.current.indexOf(activeTraceId)
  const canNavigateNext =
    traceIdsRef.current.length > 0 && (activeTraceIndex < 0 || activeTraceIndex < traceIdsRef.current.length - 1)
  const canNavigatePrev = traceIdsRef.current.length > 0 && (activeTraceIndex < 0 || activeTraceIndex > 0)

  useHotkeys([
    {
      hotkey: "F",
      callback: () => setFiltersOpen((prev) => !prev),
      options: { enabled: hasContent },
    },
    {
      hotkey: "Escape",
      callback: closeTraceDrawer,
      options: { enabled: !!activeTraceId, ignoreInputs: true },
    },
  ])

  // Count-string variants (spec §PR4 / "Count string + drawer prev/next"):
  //  - filters-only or no content    → "N sessions"
  //  - active search query           → "N sessions · M matching traces"
  // `matchingTraceCount` is populated only when `searchQuery` was active on
  // the server, so we gate on `hasSearchQuery` rather than the optional being
  // present to avoid showing "· 0 matching traces" during the brief load.
  const countLabel = hasSearchQuery
    ? `${totalCount} sessions · ${matchingTraceCount ?? 0} matching traces`
    : `${totalCount} sessions`

  return (
    <Layout>
      <Layout.Actions>
        <Layout.ActionsRow className="justify-stretch">
          <div className="relative flex w-full items-center gap-2">
            {hasContent ? (
              <Tooltip
                asChild
                trigger={
                  <Button asChild variant="ghost" size="icon">
                    <Link to="/projects/$projectSlug/session-search" params={{ projectSlug }} aria-label="Clear search">
                      <Icon icon={ArrowLeftIcon} size="sm" />
                    </Link>
                  </Button>
                }
              >
                Clear search
              </Tooltip>
            ) : null}
            <SearchInput key={q} initialValue={q} onSubmit={setQ} />
          </div>
        </Layout.ActionsRow>
      </Layout.Actions>

      {hasContent ? (
        <Layout.Actions className="pt-0">
          <Layout.ActionsRow>
            <Layout.ActionRowItem>
              <TimeFilterDropdown
                {...(timeFrom ? { startTimeFrom: timeFrom } : {})}
                {...(timeTo ? { startTimeTo: timeTo } : {})}
                onChange={(from, to) => {
                  const next = { ...filters }
                  if (from || to) {
                    const conditions = [
                      ...(from ? [{ op: "gte" as const, value: from }] : []),
                      ...(to ? [{ op: "lte" as const, value: to }] : []),
                    ]
                    next.startTime = conditions
                  } else {
                    delete next.startTime
                  }
                  setRawFilters(serializeFilters(next) ?? "")
                }}
              />
              <Button
                variant={filtersOpen ? "outline" : "ghost"}
                size="default"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <Icon icon={FilterIcon} size="sm" />
                Filters
                {hasActiveFilters ? (
                  <span className="inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground">
                    {Object.keys(filters).length}
                  </span>
                ) : null}
              </Button>
              {hasActiveFilters ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear all
                </Button>
              ) : null}
              <span className="text-xs text-muted-foreground">{countLabel}</span>
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <ColumnsSelector
                columns={sessionColumnSettings.columns}
                selectedColumnIds={sessionColumnSettings.visibleColumnIds}
                onChange={(nextColumnIds) =>
                  sessionColumnSettings.setVisibleColumnIds(nextColumnIds as SessionColumnId[])
                }
                onOrderChange={(nextColumnIds) =>
                  sessionColumnSettings.setColumnIds(nextColumnIds as SessionColumnId[])
                }
              />
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
      ) : null}

      {hasContent ? (
        <SessionsView
          projectId={projectId}
          filters={filters}
          filtersOpen={filtersOpen}
          activeTraceId={activeTraceId || undefined}
          activeDrawerTab={traceDetailTab}
          sorting={sorting}
          onSortingChange={onSortingChange}
          selectionState={selectionState}
          onSelectionChange={setSelectionState}
          totalTraceCount={totalTraceCount}
          onFiltersChange={onFiltersChange}
          onFiltersClose={() => setFiltersOpen(false)}
          onActiveTraceChange={onActiveTraceChange}
          traceIdsRef={traceIdsRef}
          visibleColumnIds={sessionColumnSettings.visibleColumnIds}
          {...(hasSearchQuery ? { searchQuery: q } : {})}
        />
      ) : null}

      {hasContent && activeTraceId ? (
        <Layout.Aside>
          <SessionTraceDetailDrawer
            key={activeTraceId}
            traceId={activeTraceId}
            projectId={projectId}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onClose={closeTraceDrawer}
            onNextTrace={() => navigateTrace(1)}
            onPrevTrace={() => navigateTrace(-1)}
            canNavigateNext={canNavigateNext}
            canNavigatePrev={canNavigatePrev}
            searchQuery={q}
          />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}

function SearchInput({
  initialValue,
  onSubmit,
}: {
  readonly initialValue: string
  readonly onSubmit: (value: string) => void
}) {
  const {
    segments,
    registerInput,
    submit,
    updateSegment,
    openPill,
    closePill,
    removeSegment,
    focusSearchEnd,
    focusAdjacentSegment,
  } = useSearchSegments(initialValue, onSubmit, SEARCH_QUERY_MAX_LENGTH)

  const [legendOpen, setLegendOpen] = useState(false)
  const active = segments.some((segment) => segment.text.length > 0) || legendOpen

  return (
    <div
      data-active={active ? "" : undefined}
      className="group/search flex h-10 flex-1 items-center rounded-xl border border-input bg-transparent pl-1 transition-colors focus-within:ring-1 focus-within:ring-ring"
    >
      <Popover open={legendOpen} onOpenChange={setLegendOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Search syntax help">
            <Icon
              icon={SearchIcon}
              size="sm"
              color="foregroundMuted"
              className="group-focus-within/search:hidden group-data-active/search:hidden"
            />
            <Icon
              icon={CircleHelpIcon}
              size="sm"
              color="primary"
              className="hidden group-focus-within/search:block group-data-active/search:block"
            />
          </Button>
        </PopoverTrigger>
        <SearchSyntaxLegendContent
          align="start"
          onCloseAutoFocus={(event) => {
            // Radix's default returns focus to the trigger button, which then
            // shows :focus-visible ring after Esc.
            event.preventDefault()
          }}
        />
      </Popover>
      <div className="flex h-full flex-1 items-center gap-1 overflow-x-auto pr-3 pl-1 text-sm">
        {segments.map((segment, index) => {
          const isSemantic = segment.kind === "semantic"
          const label = segment.kind === "literal" ? "Literal" : "Phrase"
          const placeholder =
            isSemantic && index === 0 ? 'Search by meaning. Use "literal text" or `ordered token phrase`.' : ""
          return (
            <span
              key={segment.id}
              className={cn(
                "inline-flex min-w-0 shrink-0 items-center",
                isSemantic ? "" : "h-7 gap-1 rounded-full border px-2 text-xs font-medium shadow-sm",
                segment.kind === "literal" ? "border-primary/25 bg-primary/10 text-primary" : "",
                segment.kind === "token" ? "border-phrase/30 bg-phrase/10 text-phrase-foreground" : "",
              )}
            >
              {!isSemantic ? <span className="shrink-0 opacity-70">{label}</span> : null}
              <input
                ref={registerInput(segment.id)}
                value={segment.text}
                onChange={(event) => updateSegment(segment, event.target.value)}
                onKeyDown={(event) => {
                  if (segment.kind === "semantic" && (event.key === '"' || event.key === "`")) {
                    event.preventDefault()
                    openPill(segment, event.key, event.currentTarget)
                    return
                  }
                  if (event.key === "Enter") {
                    event.preventDefault()
                    if (segment.kind === "semantic") submit()
                    else closePill(segment)
                    return
                  }
                  if (event.key === "Backspace" && segment.text.length === 0) {
                    event.preventDefault()
                    removeSegment(segment, true)
                    return
                  }
                  if (event.key === "ArrowLeft" && event.currentTarget.selectionStart === 0) {
                    event.preventDefault()
                    focusAdjacentSegment(segment, "previous")
                    return
                  }
                  if (event.key === "ArrowRight" && event.currentTarget.selectionStart === segment.text.length) {
                    event.preventDefault()
                    focusAdjacentSegment(segment, "next")
                  }
                }}
                placeholder={placeholder}
                maxLength={SEARCH_QUERY_MAX_LENGTH}
                className={cn(
                  "bg-transparent outline-none [field-sizing:content] placeholder:text-muted-foreground",
                  isSemantic ? "h-6 min-w-[1ch] text-sm" : "h-6 min-w-[2ch] font-mono text-xs",
                )}
              />
              {!isSemantic ? (
                <button
                  type="button"
                  aria-label={`Remove ${label.toLowerCase()} search pill`}
                  className="-mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-60 transition-opacity hover:bg-current/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => removeSegment(segment)}
                >
                  <Icon icon={XIcon} size="xs" />
                </button>
              ) : null}
            </span>
          )
        })}
        <button
          type="button"
          aria-label="Continue typing search query"
          className="h-6 min-w-4 flex-1 cursor-text bg-transparent outline-none"
          onMouseDown={(event) => {
            event.preventDefault()
            focusSearchEnd()
          }}
        />
      </div>
    </div>
  )
}
