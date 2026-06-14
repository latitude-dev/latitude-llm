import { Button, Icon, Input, Text, useValueWithDefault } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { ExternalLinkIcon, SearchIcon, UsersRoundIcon } from "lucide-react"
import { useMemo } from "react"
import { useProjectUsers, useUsersOverview } from "../../../../../domains/end-users/end-users.collection.ts"
import { allUsersMonitorTarget } from "../../../../../domains/monitors/monitor-target.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useDebounce } from "../../../../../lib/hooks/useDebounce.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { ColumnsSelector } from "../-components/columns-selector.tsx"
import { useTableColumnSettings } from "../-components/table-column-settings.ts"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../-route-data.ts"
import { AddTargetMonitorButton } from "../monitors/-components/add-target-monitor-button.tsx"
import { DEFAULT_USERS_RANGE_SECONDS, pickUserTrendBucketSeconds } from "./-components/user-formatters.ts"
import { UsersAnalyticsPanel } from "./-components/users-analytics-panel.tsx"
import {
  USERS_COLUMN_OPTIONS,
  type UsersColumnId,
  type UsersTableSorting,
  UsersView,
} from "./-components/users-view.tsx"

const DEFAULT_SORTING: UsersTableSorting = { column: "lastSeen", direction: "desc" }
const USER_SEARCH_DEBOUNCE_MS = 300
const SORT_PARAM_PATTERN = /^(lastSeen|firstSeen|sessions|errors|tokens|cost|costAvg|costMedian):(asc|desc)$/

function serializeSorting(sorting: UsersTableSorting): string {
  return `${sorting.column}:${sorting.direction}`
}

function parseSorting(raw: string): UsersTableSorting {
  const match = SORT_PARAM_PATTERN.exec(raw)
  if (!match) return DEFAULT_SORTING
  return {
    column: match[1] as UsersTableSorting["column"],
    direction: match[2] as UsersTableSorting["direction"],
  }
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/users/")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Users</BreadcrumbText>,
  },
  component: UsersPage,
})

function UsersEmptyState() {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
        <Icon icon={UsersRoundIcon} size="lg" color="foregroundMuted" />
      </div>
      <div className="flex max-w-md flex-col items-center gap-2">
        <Text.H3 centered>No users yet</Text.H3>
        <Text.H5 color="foregroundMuted" centered>
          Attach user IDs to traces to understand each customer's activity, sessions, and errors.
        </Text.H5>
      </div>
      <a href="https://docs.latitude.so/observability/users" target="_blank" rel="noopener noreferrer">
        <Button>
          <Icon size="sm" icon={ExternalLinkIcon} />
          Read the docs
        </Button>
      </a>
    </div>
  )
}

function UsersPage() {
  const project = useRouteProject()
  const [timeFrom, setTimeFrom] = useParamState("usersTimeFrom", "")
  const [timeTo, setTimeTo] = useParamState("usersTimeTo", "")
  const [searchQuery, setSearchQuery] = useParamState("usersSearch", "")
  const [searchInput, setSearchInput] = useValueWithDefault(searchQuery)
  const [rawSorting, setRawSorting] = useParamState("usersSort", serializeSorting(DEFAULT_SORTING), {
    validate: (value): value is string => SORT_PARAM_PATTERN.test(value),
  })
  const sorting = useMemo(() => parseSorting(rawSorting), [rawSorting])

  useDebounce(
    () => {
      const normalizedSearchQuery = searchInput.trim()
      if (normalizedSearchQuery !== searchQuery) {
        setSearchQuery(normalizedSearchQuery)
      }
    },
    USER_SEARCH_DEBOUNCE_MS,
    [searchInput, searchQuery, setSearchQuery],
  )

  const columnSettings = useTableColumnSettings<UsersColumnId>({
    storageKey: "projects.users.columns.v1",
    columns: USERS_COLUMN_OPTIONS,
  })

  // Recomputed only when the URL params change, so query keys stay stable
  // across re-renders. Defaults to the last 30 days, like the tools section.
  const range = useMemo(() => {
    const toMs = timeTo ? Date.parse(timeTo) : Date.now()
    const fromMs = timeFrom ? Date.parse(timeFrom) : toMs - DEFAULT_USERS_RANGE_SECONDS * 1000
    return {
      fromIso: new Date(fromMs).toISOString(),
      toIso: new Date(toMs).toISOString(),
    }
  }, [timeFrom, timeTo])
  const trendBucketSeconds = useMemo(
    () => pickUserTrendBucketSeconds(Date.parse(range.toIso) - Date.parse(range.fromIso)),
    [range],
  )

  const {
    data: users,
    totalCount,
    activityBucketSeconds,
    costRollup,
    isLoading,
    infiniteScroll,
  } = useProjectUsers({
    projectId: project.id,
    sorting,
    timeRange: range,
    trendBucketSeconds,
    ...(searchQuery ? { searchQuery } : {}),
  })

  const { data: overview, isLoading: overviewLoading } = useUsersOverview({
    projectId: project.id,
    timeRange: range,
  })

  const showSkeletons = isLoading

  const hasActiveFilters = searchQuery !== "" || Boolean(timeFrom || timeTo)
  const showEmptyState = !showSkeletons && totalCount === 0 && !hasActiveFilters

  if (showEmptyState) {
    return (
      <Layout>
        <Layout.Content>
          <UsersEmptyState />
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
              <TimeFilterDropdown
                startTimeFrom={timeFrom || range.fromIso}
                {...(timeTo ? { startTimeTo: timeTo } : {})}
                onChange={(from, to) => {
                  setTimeFrom(from ?? "")
                  setTimeTo(to ?? "")
                }}
              />
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <ColumnsSelector
                columns={columnSettings.columns}
                selectedColumnIds={columnSettings.visibleColumnIds}
                onChange={(nextColumnIds) => columnSettings.setVisibleColumnIds(nextColumnIds as UsersColumnId[])}
                onOrderChange={(nextColumnIds) => columnSettings.setColumnIds(nextColumnIds as UsersColumnId[])}
              />
              <div className="relative">
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by user id or email"
                  size="sm"
                  className="w-64 pl-8 rounded-lg"
                />
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <AddTargetMonitorButton
                projectId={project.id}
                projectSlug={project.slug}
                target={allUsersMonitorTarget()}
                label="Monitor all users"
              />
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <div className="px-6">
          <UsersAnalyticsPanel
            overview={overview}
            isLoading={overviewLoading}
            onRangeSelect={(range) => {
              setTimeFrom(range?.from ?? "")
              setTimeTo(range?.to ?? "")
            }}
          />
        </div>
        <UsersView
          users={users}
          isLoading={showSkeletons}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          totalCount={totalCount}
          activityBucketSeconds={activityBucketSeconds ?? trendBucketSeconds}
          costRollup={costRollup}
          visibleColumnIds={columnSettings.visibleColumnIds}
          onSortChange={(next) => setRawSorting(serializeSorting(next))}
          projectSlug={project.slug}
        />
      </Layout.Content>
    </Layout>
  )
}
