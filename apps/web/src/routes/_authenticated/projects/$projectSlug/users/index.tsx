import { Button, Icon, Input, Text, useValueWithDefault } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { ExternalLinkIcon, SearchIcon, UsersRoundIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { TimeFilterDropdown } from "../../../../../components/time-filter-dropdown.tsx"
import { useProjectUsers, useUsersOverview } from "../../../../../domains/end-users/end-users.collection.ts"
import { allUsersMonitorTarget } from "../../../../../domains/monitors/monitor-target.ts"
import { useAnalyticsTimeWindow } from "../../../../../domains/projects/use-analytics-time-window.ts"
import { useProjectFirstTraceAt, useProjectLastTraceAt } from "../../../../../domains/traces/traces.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useDebounce } from "../../../../../lib/hooks/useDebounce.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { useTableColumnSettings } from "../-components/table-column-settings.ts"
import { useRouteProject } from "../-route-data.ts"
import { AddTargetMonitorButton } from "../monitors/-components/add-target-monitor-button.tsx"
import { pickUserTrendBucketSeconds } from "./-components/user-formatters.ts"
import { UsersAnalyticsPanel } from "./-components/users-analytics-panel.tsx"
import {
  USERS_COLUMN_OPTIONS,
  type UsersColumnId,
  type UsersTableSorting,
  UsersView,
} from "./-components/users-view.tsx"

const DEFAULT_SORTING: UsersTableSorting = { column: "lastSeen", direction: "desc" }
const USER_SEARCH_DEBOUNCE_MS = 300
// Server caps `trendBucketSeconds` at 31 days; clamp so an all-time span never exceeds it.
const USER_TREND_BUCKET_MAX_SECONDS = 31 * 24 * 60 * 60
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
  const { firstTraceAt } = useProjectFirstTraceAt({ projectId: project.id })
  const { lastTraceAt } = useProjectLastTraceAt({ projectId: project.id })
  const tw = useAnalyticsTimeWindow({
    project,
    fromKey: "usersTimeFrom",
    toKey: "usersTimeTo",
    allTimeLowerBoundIso: firstTraceAt,
    lastActivityIso: lastTraceAt,
  })
  const [searchQuery, setSearchQuery] = useParamState("usersSearch", "")
  const [searchInput, setSearchInput] = useValueWithDefault(searchQuery)
  const [rawSorting, setRawSorting] = useParamState("usersSort", serializeSorting(DEFAULT_SORTING), {
    validate: (value): value is string => SORT_PARAM_PATTERN.test(value),
  })
  const sorting = useMemo(() => parseSorting(rawSorting), [rawSorting])
  const [focusedUserId, setFocusedUserId] = useState<string | undefined>()

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

  // The list uses a concrete range ("All time" → [firstTraceAt, now]); its per-user activity
  // sparklines are bucketed over it, so the bucket is capped at the server's 31-day max.
  const range = useMemo(
    () => ({ fromIso: tw.listRange.fromIso ?? tw.trendRange.fromIso, toIso: tw.listRange.toIso }),
    [tw.listRange, tw.trendRange],
  )
  const trendBucketSeconds = useMemo(
    () =>
      Math.min(
        pickUserTrendBucketSeconds(Date.parse(range.toIso) - Date.parse(range.fromIso)),
        USER_TREND_BUCKET_MAX_SECONDS,
      ),
    [range],
  )

  useEffect(() => {
    setFocusedUserId(undefined)
  }, [searchQuery, rawSorting, tw.timeFrom, tw.timeTo])

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

  // The overview's per-day/hour bucketing would blow up over an all-time span, so All time uses the
  // clamped, latest-activity-anchored trend range; an explicit/default range is shown as-is.
  const overviewRange = useMemo(() => (tw.isAllTime ? tw.trendRange : range), [tw.isAllTime, tw.trendRange, range])
  const { data: overview, isLoading: overviewLoading } = useUsersOverview({
    projectId: project.id,
    timeRange: overviewRange,
  })

  const showSkeletons = isLoading

  const hasActiveFilters = searchQuery !== "" || tw.hasExplicitRange
  // `totalCount` is over the All-time default, so 0 means the project has no users at all — a robust
  // empty-state signal (not the best-effort `firstTraceAt`).
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
                {...(tw.pickerStartFrom ? { startTimeFrom: tw.pickerStartFrom } : {})}
                {...(tw.pickerStartTo ? { startTimeTo: tw.pickerStartTo } : {})}
                onChange={tw.onTimeChange}
              />
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
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
                label="Monitor users"
              />
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <div className="px-6">
          <UsersAnalyticsPanel
            overview={overview}
            isLoading={overviewLoading}
            rangeFromIso={overviewRange.fromIso}
            rangeToIso={overviewRange.toIso}
            isAllTime={tw.isAllTime}
            onRangeSelect={tw.onBrushSelect}
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
          focusedUserId={focusedUserId}
          onFocusedUserChange={setFocusedUserId}
        />
      </Layout.Content>
    </Layout>
  )
}
