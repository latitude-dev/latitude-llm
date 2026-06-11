import { Button, Icon, Input, type TabOption, Tabs, Text, useValueWithDefault } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { BellPlusIcon, LockIcon, SearchIcon, ShieldAlertIcon, TextSearchIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useRegisterCommands } from "../../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../../components/command-palette/types.ts"
import { useHasFeatureFlag } from "../../../../../../domains/feature-flags/feature-flags.collection.ts"
import { useMonitor, useMonitors } from "../../../../../../domains/monitors/monitors.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { useDebounce } from "../../../../../../lib/hooks/useDebounce.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { MonitorCreateModal } from "./monitor-create-modal.tsx"
import { MonitorDetailDrawer, MonitorDetailDrawerSkeleton } from "./monitor-detail-drawer.tsx"
import { MonitorsEmptyState } from "./monitors-empty-state.tsx"
import { DEFAULT_MONITORS_SORTING, type MonitorsTableSorting, MonitorsView, sortMonitorRows } from "./monitors-view.tsx"

const MONITORS_SEARCH_DEBOUNCE_MS = 300

const SORT_COLUMNS = ["name", "status", "lastIncident"] as const satisfies readonly MonitorsTableSorting["column"][]
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly MonitorsTableSorting["direction"][]
const SORT_PARAM_PATTERN = /^(name|status|lastIncident):(asc|desc)$/

type MonitorsTab = "search" | "issues"

const MONITORS_TABS: readonly TabOption<MonitorsTab>[] = [
  { id: "search", label: "Search monitors", icon: <TextSearchIcon className="w-4 h-4" /> },
  { id: "issues", label: "Issue monitors", icon: <ShieldAlertIcon className="w-4 h-4" /> },
]

function serializeSorting(sorting: MonitorsTableSorting): string {
  return `${sorting.column}:${sorting.direction}`
}

function parseSorting(raw: string): MonitorsTableSorting {
  const [column, direction] = raw.split(":")
  if (
    SORT_COLUMNS.includes(column as MonitorsTableSorting["column"]) &&
    SORT_DIRECTIONS.includes(direction as MonitorsTableSorting["direction"])
  ) {
    return {
      column: column as MonitorsTableSorting["column"],
      direction: direction as MonitorsTableSorting["direction"],
    }
  }
  return DEFAULT_MONITORS_SORTING
}

export function MonitorsBreadcrumb() {
  return <BreadcrumbText variant="current">Monitors</BreadcrumbText>
}

/**
 * Shared monitors listing, one route per tab: `/monitors/search` lists
 * user-created saved-search monitors (`system: false`) and `/monitors/issues`
 * lists the system-managed issue-event monitors (`system: true`).
 */
export function MonitorsListPage({ system }: { readonly system: boolean }) {
  const monitorsEnabled = useHasFeatureFlag("monitors")

  if (!monitorsEnabled) {
    return (
      <Layout>
        <Layout.Content>
          <FeatureFlagOffSplash />
        </Layout.Content>
      </Layout>
    )
  }

  return <MonitorsPageContent system={system} />
}

function MonitorsTabs({ system, projectSlug }: { readonly system: boolean; readonly projectSlug: string }) {
  const navigate = useNavigate()
  const active: MonitorsTab = system ? "issues" : "search"

  return (
    <Tabs<MonitorsTab>
      variant="bordered"
      size="sm"
      options={MONITORS_TABS}
      active={active}
      onSelect={(tab) => {
        if (tab === active) return
        void navigate({
          to: tab === "issues" ? "/projects/$projectSlug/monitors/issues" : "/projects/$projectSlug/monitors/search",
          params: { projectSlug },
        })
      }}
    />
  )
}

function MonitorsPageContent({ system }: { readonly system: boolean }) {
  const project = useRouteProject()
  const [monitorSlug, setMonitorSlug] = useParamState("monitorSlug", "")
  const [searchQuery, setSearchQuery] = useParamState("monitorsSearch", "")
  const [searchInput, setSearchInput] = useValueWithDefault(searchQuery)
  const [createOpen, setCreateOpen] = useState(false)
  const [rawSorting, setRawSorting] = useParamState("monitorsSort", serializeSorting(DEFAULT_MONITORS_SORTING), {
    validate: (value): value is string => SORT_PARAM_PATTERN.test(value),
  })
  const sorting = useMemo(() => parseSorting(rawSorting), [rawSorting])
  const setSorting = useCallback((next: MonitorsTableSorting) => setRawSorting(serializeSorting(next)), [setRawSorting])

  // Registered only while this page is mounted, so it's implicitly gated to the
  // monitors flag. Creation is search-tab only (issue monitors are system-provisioned).
  const paletteCommands = useMemo<readonly PaletteCommand[]>(
    () =>
      system
        ? []
        : [
            {
              id: "monitor:create",
              title: "Create monitor",
              icon: BellPlusIcon,
              section: "context",
              group: "Monitors",
              keywords: "create monitor new add alert",
              perform: () => setCreateOpen(true),
            },
          ],
    [system],
  )
  useRegisterCommands(paletteCommands)

  useDebounce(
    () => {
      const normalized = searchInput.trim()
      if (normalized !== searchQuery) {
        setSearchQuery(normalized)
      }
    },
    MONITORS_SEARCH_DEBOUNCE_MS,
    [searchInput, searchQuery, setSearchQuery],
  )

  const { rows, totalCount, isLoading, isReloading, infiniteScroll } = useMonitors({
    projectId: project.id,
    system,
    ...(searchQuery ? { searchQuery } : {}),
  })

  const sortedRows = useMemo(() => sortMonitorRows(rows, sorting), [rows, sorting])
  const monitors = useMemo(() => sortedRows.map((row) => row.monitor), [sortedRows])

  const listedMonitor = monitorSlug ? monitors.find((monitor) => monitor.slug === monitorSlug) : undefined
  // Each tab lists only its own kind; deep links to the other kind (command
  // palette, notifications) still open the drawer through a point lookup by slug.
  const { data: fetchedMonitor, isLoading: isFetchingActiveMonitor } = useMonitor({
    projectId: project.id,
    slug: monitorSlug,
    enabled: Boolean(monitorSlug) && !listedMonitor && !isLoading,
  })
  const activeMonitor = listedMonitor ?? fetchedMonitor ?? undefined
  const activeIndex = activeMonitor ? monitors.findIndex((monitor) => monitor.slug === activeMonitor.slug) : -1
  const prevMonitor = activeIndex > 0 ? monitors[activeIndex - 1] : undefined
  const nextMonitor = activeIndex >= 0 ? monitors[activeIndex + 1] : undefined

  const hasMonitors = totalCount > 0
  const hasActiveFilters = Boolean(searchQuery)
  // Only the search tab invites creation; issue monitors are system-provisioned.
  const showEmptyState = !system && !isLoading && !hasMonitors && !hasActiveFilters

  const createModal = createOpen ? (
    <MonitorCreateModal
      projectId={project.id}
      projectSlug={project.slug}
      onClose={() => setCreateOpen(false)}
      onCreated={(slug) => setMonitorSlug(slug)}
    />
  ) : null

  if (showEmptyState) {
    return (
      <Layout>
        <Layout.Content>
          <Layout.Actions>
            <Layout.ActionsRow>
              <Layout.ActionRowItem>
                <MonitorsTabs system={system} projectSlug={project.slug} />
              </Layout.ActionRowItem>
            </Layout.ActionsRow>
          </Layout.Actions>
          <MonitorsEmptyState onCreate={() => setCreateOpen(true)} />
          {createModal}
        </Layout.Content>
      </Layout>
    )
  }

  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem>
              <MonitorsTabs system={system} projectSlug={project.slug} />
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <div className="relative">
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search monitors"
                  size="sm"
                  className="w-64 pl-8 rounded-lg"
                />
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              {!system ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Icon icon={BellPlusIcon} size="sm" />
                  Monitor
                </Button>
              ) : null}
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <MonitorsView
          rows={sortedRows}
          isLoading={isLoading || isReloading}
          infiniteScroll={infiniteScroll}
          activeMonitorSlug={monitorSlug || undefined}
          onActiveMonitorChange={(slug) => setMonitorSlug(slug ?? "")}
          projectId={project.id}
          projectSlug={project.slug}
          showWatching={!system}
          sorting={sorting}
          onSortChange={setSorting}
        />
        {createModal}
      </Layout.Content>
      {activeMonitor ? (
        <Layout.Aside>
          <MonitorDetailDrawer
            key={activeMonitor.slug}
            projectId={project.id}
            projectSlug={project.slug}
            monitor={activeMonitor}
            onClose={() => setMonitorSlug("")}
            {...(nextMonitor ? { onNext: () => setMonitorSlug(nextMonitor.slug) } : {})}
            {...(prevMonitor ? { onPrev: () => setMonitorSlug(prevMonitor.slug) } : {})}
            canNavigateNext={nextMonitor !== undefined}
            canNavigatePrev={prevMonitor !== undefined}
          />
        </Layout.Aside>
      ) : monitorSlug && (isLoading || isFetchingActiveMonitor) ? (
        // Deep link / refresh: skeleton until the list (or the by-slug fallback) resolves.
        <Layout.Aside>
          <MonitorDetailDrawerSkeleton onClose={() => setMonitorSlug("")} />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}

function FeatureFlagOffSplash() {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={LockIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>Monitors aren't available yet</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            This feature is rolling out gradually. Reach out to support if you'd like early access for your
            organization.
          </Text.H5>
        </div>
      </div>
    </div>
  )
}
