import { Button, Icon, Input, Text, useValueWithDefault } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { BellPlusIcon, LockIcon, SearchIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useRegisterCommands } from "../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../components/command-palette/types.ts"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import { useMonitors } from "../../../../../domains/monitors/monitors.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useDebounce } from "../../../../../lib/hooks/useDebounce.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../-route-data.ts"
import { MonitorCreateModal } from "./-components/monitor-create-modal.tsx"
import { MonitorDetailDrawer, MonitorDetailDrawerSkeleton } from "./-components/monitor-detail-drawer.tsx"
import { MonitorsEmptyState } from "./-components/monitors-empty-state.tsx"
import {
  DEFAULT_MONITORS_SORTING,
  type MonitorsTableSorting,
  MonitorsView,
  sortMonitorRows,
} from "./-components/monitors-view.tsx"

const MONITORS_SEARCH_DEBOUNCE_MS = 300

const SORT_COLUMNS = ["name", "status", "lastIncident"] as const satisfies readonly MonitorsTableSorting["column"][]
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly MonitorsTableSorting["direction"][]
const SORT_PARAM_PATTERN = /^(name|status|lastIncident):(asc|desc)$/

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

function MonitorsBreadcrumb() {
  return <BreadcrumbText variant="current">Monitors</BreadcrumbText>
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/monitors/")({
  staticData: {
    breadcrumb: MonitorsBreadcrumb,
  },
  component: MonitorsPage,
})

function MonitorsPage() {
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

  return <MonitorsPageContent />
}

function MonitorsPageContent() {
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

  // Registered only while this page is mounted, so it's implicitly gated to the monitors flag.
  const paletteCommands = useMemo<readonly PaletteCommand[]>(
    () => [
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
    [],
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
    ...(searchQuery ? { searchQuery } : {}),
  })

  const sortedRows = useMemo(() => sortMonitorRows(rows, sorting), [rows, sorting])
  const monitors = useMemo(() => sortedRows.map((row) => row.monitor), [sortedRows])

  const activeMonitor = monitorSlug ? monitors.find((monitor) => monitor.slug === monitorSlug) : undefined
  const activeIndex = activeMonitor ? monitors.findIndex((monitor) => monitor.slug === activeMonitor.slug) : -1
  const prevMonitor = activeIndex > 0 ? monitors[activeIndex - 1] : undefined
  const nextMonitor = activeIndex >= 0 ? monitors[activeIndex + 1] : undefined

  const hasMonitors = totalCount > 0
  const hasActiveFilters = Boolean(searchQuery)
  const showEmptyState = !isLoading && !hasMonitors && !hasActiveFilters

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
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <Button onClick={() => setCreateOpen(true)}>
                <Icon icon={BellPlusIcon} size="sm" />
                Monitor
              </Button>
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
      ) : monitorSlug && isLoading ? (
        // Deep link / refresh: skeleton until the list resolves and the monitor is found.
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
