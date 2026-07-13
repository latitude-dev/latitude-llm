import type { FilterSet } from "@domain/shared"
import {
  Button,
  Icon,
  type InfiniteTableSorting,
  type SortDirection,
  Tabs,
  Text,
  Tooltip,
  useMountEffect,
} from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { createFileRoute } from "@tanstack/react-router"
import { FilterIcon, MessagesSquareIcon, TextIcon, XIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { ProjectScopeProvider } from "../../../../domains/projects/project-scope.tsx"
import { useSandboxDefaultApiKey } from "../../../../domains/sandbox/sandbox.collection.ts"
import { rememberLastSandboxProjectSlug } from "../../../../domains/sandbox/sandbox-navigation.functions.ts"
import { useSandboxProjects } from "../../../../domains/sandbox/sandbox-projects.collection.ts"
import { useTracesCount } from "../../../../domains/traces/traces.collection.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../lib/hooks/useParamState.ts"
import { EMPTY_SELECTION, type SelectionState } from "../../../../lib/hooks/useSelectableRows.ts"
import { ColumnsSelector } from "../../../_authenticated/projects/$projectSlug/-components/columns-selector.tsx"
import {
  TRACE_COLUMN_OPTIONS,
  type TraceColumnId,
} from "../../../_authenticated/projects/$projectSlug/-components/project-traces-table.tsx"
import { SessionDetailDrawer } from "../../../_authenticated/projects/$projectSlug/-components/session-detail-drawer.tsx"
import {
  DEFAULT_SESSION_SORTING,
  getSessionColumnOptions,
  type SessionColumnId,
  SessionsView,
} from "../../../_authenticated/projects/$projectSlug/-components/sessions-view.tsx"
import { useTableColumnSettings } from "../../../_authenticated/projects/$projectSlug/-components/table-column-settings.ts"
import { TraceDetailDrawer } from "../../../_authenticated/projects/$projectSlug/-components/trace-detail-drawer.tsx"
import {
  DEFAULT_TRACE_SORTING,
  parseFilters,
  serializeFilters,
} from "../../../_authenticated/projects/$projectSlug/-components/trace-page-state.ts"
import { TracesEmptyOnboarding } from "../../../_authenticated/projects/$projectSlug/-components/traces-empty-onboarding.tsx"
import { TracesView } from "../../../_authenticated/projects/$projectSlug/-components/traces-view.tsx"

/**
 * Sandbox traces — the *production* Traces/Sessions surface (tables, filters,
 * and the trace + session detail drawers), mounted in the sandbox namespace and
 * scoped to the sandbox org via {@link ProjectScopeProvider} (the collections read
 * the scope from context; no forked data layer). Per AGE-128 we drop the search
 * bar and the aggregations panel; annotations are off under a sandbox scope, so
 * the tables hide their annotation columns and the drawers hide their
 * Annotations tab (each surface reads the scope itself).
 */
export const Route = createFileRoute("/sandbox/$sandboxOrgId/projects/$projectSlug")({
  component: SandboxTracesPage,
})

function SandboxTracesPage() {
  const { sandboxOrgId, projectSlug } = Route.useParams()
  return (
    <ProjectScopeProvider scope={{ kind: "sandbox", orgId: sandboxOrgId }}>
      <SandboxTracesContent sandboxOrgId={sandboxOrgId} projectSlug={projectSlug} />
    </ProjectScopeProvider>
  )
}

function SandboxTracesContent({ sandboxOrgId, projectSlug }: { sandboxOrgId: string; projectSlug: string }) {
  const { data: projects, isLoading: projectsLoading } = useSandboxProjects(sandboxOrgId)
  const project = projects?.find((p) => p.slug === projectSlug)

  // Remember this as the sandbox's last-visited project (mirrors Live).
  useMountEffect(() => {
    void rememberLastSandboxProjectSlug({
      data: { sandboxOrgId, slug: projectSlug },
    })
  })

  const [activeTab, setActiveTab] = useParamState("tab", "sessions", {
    validate: (v): v is "traces" | "sessions" => v === "traces" || v === "sessions",
  })
  const [rawFilters, setRawFilters] = useParamState("filters", "")
  const filters = useMemo(() => parseFilters(rawFilters || undefined), [rawFilters])
  const [filtersOpen, setFiltersOpen] = useParamState("filtersOpen", false)
  const [activeTraceId, setActiveTraceId] = useParamState("traceId", "")
  const [activeSessionId, setActiveSessionId] = useParamState("sessionId", "")
  const [, setSelectedSpanId] = useParamState("spanId", "")
  const [, setSelectedSpanTraceId] = useParamState("spanTraceId", "")

  const tabDefaultSorting = activeTab === "sessions" ? DEFAULT_SESSION_SORTING : DEFAULT_TRACE_SORTING
  const [sortBy, setSortBy] = useParamState("sortBy", tabDefaultSorting.column)
  const [sortDirection, setSortDirection] = useParamState("sortDirection", tabDefaultSorting.direction, {
    validate: (v): v is SortDirection => v === "asc" || v === "desc",
  })
  const sorting: InfiniteTableSorting = {
    column: sortBy,
    direction: sortDirection,
  }
  const [detailTab] = useParamState("detailTab", "trace", {
    validate: (v): v is "trace" | "conversation" | "spans" | "scores" | "annotations" =>
      v === "trace" || v === "conversation" || v === "spans" || v === "scores" || v === "annotations",
  })

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const traceIdsRef = useRef<string[]>([])

  const traceColumnSettings = useTableColumnSettings<TraceColumnId>({
    storageKey: "sandbox.traces.columns.v1",
    columns: TRACE_COLUMN_OPTIONS,
  })
  const sessionColumnSettings = useTableColumnSettings<SessionColumnId>({
    storageKey: "sandbox.sessions.columns.v1",
    columns: getSessionColumnOptions(false),
  })

  const projectId = project?.id ?? ""
  const hasActiveFilters = Object.keys(filters).length > 0
  const { totalCount, isLoading: countLoading } = useTracesCount({
    projectId,
    ...(hasActiveFilters ? { filters } : {}),
  })
  // Only fetched while the project has never received a trace (the onboarding case).
  const { data: defaultApiKey } = useSandboxDefaultApiKey(sandboxOrgId, !!project && project.firstTraceAt == null)

  const onSortingChange = (next: InfiniteTableSorting) => {
    setSortBy(next.column)
    setSortDirection(next.direction)
  }

  const onFiltersChange = (next: FilterSet) => {
    setFiltersOpen(true)
    setRawFilters(serializeFilters(next) ?? "")
  }

  const onShowAllSessions = useCallback(() => {
    setRawFilters(serializeFilters({ ...filters, hasLlmActivity: [{ op: "eq", value: false as const }] }) ?? "")
  }, [filters, setRawFilters])

  const closeTraceDrawer = useCallback(() => {
    setActiveTraceId("")
    setSelectedSpanId("")
    setSelectedSpanTraceId("")
  }, [setActiveTraceId, setSelectedSpanId, setSelectedSpanTraceId])

  const onActiveTraceChange = (traceId: string | undefined) => {
    if (!traceId) {
      closeTraceDrawer()
      return
    }
    setActiveTraceId(traceId)
  }

  // Sessions tab: a session-row click opens the panel; a trace reference also
  // sets `traceId` so the panel slides straight into that trace's slot.
  const onOpenSession = useCallback(
    (sessionId: string, traceId?: string) => {
      setActiveSessionId(sessionId)
      setActiveTraceId(traceId ?? "")
      setSelectedSpanId("")
      setSelectedSpanTraceId("")
    },
    [setActiveSessionId, setActiveTraceId, setSelectedSpanId, setSelectedSpanTraceId],
  )

  const closeSessionPanel = useCallback(() => {
    setActiveSessionId("")
    setActiveTraceId("")
    setSelectedSpanId("")
    setSelectedSpanTraceId("")
  }, [setActiveSessionId, setActiveTraceId, setSelectedSpanId, setSelectedSpanTraceId])

  // Next/prev trace navigation off the loaded list (Traces tab drawer).
  const navigateTrace = useCallback(
    (delta: 1 | -1) => {
      const ids = traceIdsRef.current
      if (ids.length === 0) return
      const idx = ids.indexOf(activeTraceId)
      const target = idx < 0 ? ids[0] : ids[idx + delta]
      if (target) setActiveTraceId(target)
    },
    [activeTraceId, setActiveTraceId],
  )
  const onNextTrace = useCallback(() => navigateTrace(1), [navigateTrace])
  const onPrevTrace = useCallback(() => navigateTrace(-1), [navigateTrace])
  const activeTraceIndex = traceIdsRef.current.indexOf(activeTraceId)
  const canNavigateNext =
    traceIdsRef.current.length > 0 && (activeTraceIndex < 0 || activeTraceIndex < traceIdsRef.current.length - 1)
  const canNavigatePrev = traceIdsRef.current.length > 0 && (activeTraceIndex < 0 || activeTraceIndex > 0)

  // Tab switching disabled while a drawer is open; Esc closes the trace drawer
  // on the Traces tab (the session panel owns Esc on the Sessions tab).
  useHotkeys([
    { hotkey: "F", callback: () => setFiltersOpen((prev) => !prev) },
    {
      hotkey: "1",
      callback: () => setActiveTab("sessions"),
      options: { enabled: !activeTraceId && !activeSessionId },
    },
    {
      hotkey: "2",
      callback: () => setActiveTab("traces"),
      options: { enabled: !activeTraceId && !activeSessionId },
    },
    {
      hotkey: "Escape",
      callback: closeTraceDrawer,
      options: {
        enabled: !!activeTraceId && !activeSessionId,
        ignoreInputs: true,
        conflictBehavior: "allow",
      },
    },
  ])

  if (projectsLoading) {
    return (
      <Layout>
        <Layout.Header title="Sessions" />
      </Layout>
    )
  }

  if (!project) {
    return (
      <div className="p-6">
        <Text.H5 color="foregroundMuted">Project not found in this sandbox.</Text.H5>
      </div>
    )
  }

  // Never received a trace → reuse the production onboarding empty state (scoped
  // to the sandbox; it polls for and transitions on the sandbox's first trace).
  if (project && project.firstTraceAt == null && totalCount === 0 && !hasActiveFilters && !countLoading) {
    return (
      <Layout>
        <TracesEmptyOnboarding
          projectId={project.id}
          projectSlug={project.slug}
          orgHasConnectedProjects={false}
          apiKeyToken={defaultApiKey?.token ?? null}
        />
      </Layout>
    )
  }

  return (
    <Layout>
      <Layout.Header title={project?.name ?? "Sessions"} />
      <Layout.Actions>
        <Layout.ActionsRow>
          <Layout.ActionRowItem>
            <Tooltip
              asChild
              trigger={
                <Button
                  variant={filtersOpen ? "outline" : "ghost"}
                  size="default"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                >
                  <FilterIcon className="h-4 w-4" />
                  Filters
                  <kbd className="rounded bg-muted px-1 font-mono text-xs text-muted-foreground">F</kbd>
                  {hasActiveFilters ? (
                    <span className="inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-medium leading-4 text-primary-foreground">
                      {Object.keys(filters).length}
                    </span>
                  ) : null}
                </Button>
              }
            >
              Toggle filters
            </Tooltip>
            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={() => setRawFilters("")}>
                <Icon icon={XIcon} size="sm" />
                Clear all
              </Button>
            ) : null}
          </Layout.ActionRowItem>
          <Layout.ActionRowItem>
            {activeTab === "sessions" ? (
              <ColumnsSelector
                columns={sessionColumnSettings.columns}
                selectedColumnIds={sessionColumnSettings.visibleColumnIds}
                onChange={(next) => sessionColumnSettings.setVisibleColumnIds(next as SessionColumnId[])}
                onOrderChange={(next) => sessionColumnSettings.setColumnIds(next as SessionColumnId[])}
              />
            ) : (
              <ColumnsSelector
                columns={traceColumnSettings.columns}
                selectedColumnIds={traceColumnSettings.visibleColumnIds}
                onChange={(next) => traceColumnSettings.setVisibleColumnIds(next as TraceColumnId[])}
                onOrderChange={(next) => traceColumnSettings.setColumnIds(next as TraceColumnId[])}
              />
            )}
            <Tabs
              variant="bordered"
              size="sm"
              options={[
                {
                  id: "sessions",
                  label: "Sessions",
                  icon: <MessagesSquareIcon className="w-4 h-4" />,
                },
                {
                  id: "traces",
                  label: "Traces",
                  icon: <TextIcon className="w-4 h-4" />,
                },
              ]}
              active={activeTab}
              onSelect={(id) => setActiveTab(id)}
            />
          </Layout.ActionRowItem>
        </Layout.ActionsRow>
      </Layout.Actions>

      {activeTab === "traces" ? (
        <TracesView
          projectId={projectId}
          filters={filters}
          filtersOpen={filtersOpen}
          activeTraceId={activeTraceId || undefined}
          activeDrawerTab={detailTab}
          sorting={sorting}
          onSortingChange={onSortingChange}
          selectionState={selectionState}
          onSelectionChange={setSelectionState}
          totalTraceCount={totalCount}
          onFiltersChange={onFiltersChange}
          onFiltersClose={() => setFiltersOpen(false)}
          onActiveTraceChange={onActiveTraceChange}
          traceIdsRef={traceIdsRef}
          visibleColumnIds={traceColumnSettings.visibleColumnIds}
          selectable={false}
        />
      ) : (
        <SessionsView
          projectId={projectId}
          filters={filters}
          filtersOpen={filtersOpen}
          activeSessionId={activeSessionId || undefined}
          activeTraceId={activeTraceId || undefined}
          sorting={sorting}
          onSortingChange={onSortingChange}
          selectionState={selectionState}
          onSelectionChange={setSelectionState}
          totalTraceCount={totalCount}
          onFiltersChange={onFiltersChange}
          onShowAllSessions={onShowAllSessions}
          onFiltersClose={() => setFiltersOpen(false)}
          onOpenSession={onOpenSession}
          onCloseSession={closeSessionPanel}
          visibleColumnIds={sessionColumnSettings.visibleColumnIds}
          isSearching={false}
          hasUserAppliedFilters={hasActiveFilters}
          selectable={false}
        />
      )}

      {activeTab === "traces" && activeTraceId ? (
        <Layout.Aside>
          <TraceDetailDrawer
            key={activeTraceId}
            traceId={activeTraceId}
            projectId={projectId}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onClose={closeTraceDrawer}
            onNextTrace={onNextTrace}
            onPrevTrace={onPrevTrace}
            canNavigateNext={canNavigateNext}
            canNavigatePrev={canNavigatePrev}
          />
        </Layout.Aside>
      ) : null}

      {activeTab === "sessions" && activeSessionId ? (
        <Layout.Aside>
          <SessionDetailDrawer
            key={activeSessionId}
            projectId={projectId}
            sessionId={activeSessionId}
            onClose={closeSessionPanel}
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}
