import type { FilterSet } from "@domain/shared"
import type { ChartSeries, InfiniteTableSorting } from "@repo/ui"
import {
  Avatar,
  Button,
  Chart,
  CopyableText,
  HistogramSkeleton,
  Icon,
  Label,
  Skeleton,
  Switch,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount } from "@repo/utils"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { ArrowLeftIcon, TextAlignStartIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useUserActivity, useUserProfile } from "../../../../../../domains/end-users/end-users.collection.ts"
import { userMonitorTarget } from "../../../../../../domains/monitors/monitor-target.ts"
import { defaultProjectTimeWindowDays } from "../../../../../../domains/projects/default-time-window.ts"
import { useSessionsCount, useSessionsInfiniteScroll } from "../../../../../../domains/sessions/sessions.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { SessionDetailDrawer } from "../../-components/session-detail-drawer.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { TargetMonitorsMenu } from "../../monitors/-components/target-monitors-menu.tsx"
import {
  formatAgoLabel,
  formatBucketLabel,
  formatBucketTooltipLabel,
  userDisplayName,
} from "../-components/user-formatters.ts"
import { UserBehavioursSection } from "./-components/user-behaviours-section.tsx"
import { UserSignalsSection } from "./-components/user-issues-section.tsx"
import { UserNeighborNav } from "./-components/user-neighbor-nav.tsx"
import { UserSessionsTable } from "./-components/user-sessions-table.tsx"
import { UserStatStrip } from "./-components/user-stat-strip.tsx"
import { UserUsageSection } from "./-components/user-usage-section.tsx"

const DEFAULT_SESSIONS_SORTING: InfiniteTableSorting = { column: "lastActivity", direction: "desc" }

const OK_SESSIONS_COLOR = "hsl(217 91% 60%)"
const FAILED_SESSIONS_COLOR = "hsl(0 70% 55%)"
const ERROR_RATE_COLOR = "hsl(35 90% 55%)"

function UserDetailBreadcrumb() {
  const { userId } = useParams({ strict: false })
  return <BreadcrumbText variant="current">{userId ?? "User"}</BreadcrumbText>
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/users/$userId/")({
  staticData: {
    breadcrumb: UserDetailBreadcrumb,
  },
  component: UserDetailPage,
})

function UserActivityChart({
  projectId,
  userId,
  errorsOnly,
  windowDays,
}: {
  readonly projectId: string
  readonly userId: string
  readonly errorsOnly: boolean
  readonly windowDays: number
}) {
  const timeRange = useMemo(() => {
    const toMs = Date.now()
    return {
      fromIso: new Date(toMs - windowDays * 24 * 60 * 60 * 1000).toISOString(),
      toIso: new Date(toMs).toISOString(),
    }
  }, [windowDays])
  const { data: activity, isLoading } = useUserActivity({ projectId, userId, timeRange, errorsOnly })
  const bucketSeconds = activity?.bucketSeconds ?? 24 * 60 * 60
  const buckets = activity?.buckets ?? []

  const categories = useMemo(
    () => buckets.map((bucket) => formatBucketLabel(bucket.bucket, bucketSeconds)),
    [buckets, bucketSeconds],
  )

  const series = useMemo<readonly ChartSeries[]>(
    () =>
      errorsOnly
        ? [
            {
              kind: "bar",
              name: "Errored sessions",
              values: buckets.map((bucket) => bucket.count),
              color: FAILED_SESSIONS_COLOR,
              axis: "left",
            },
          ]
        : [
            {
              kind: "bar",
              name: "Errored sessions",
              values: buckets.map((bucket) => bucket.errorCount),
              color: FAILED_SESSIONS_COLOR,
              axis: "left",
              stack: "sessions",
            },
            {
              kind: "bar",
              name: "Successful sessions",
              values: buckets.map((bucket) => bucket.count - bucket.errorCount),
              color: OK_SESSIONS_COLOR,
              axis: "left",
              stack: "sessions",
            },
            {
              kind: "line",
              name: "Error rate %",
              values: buckets.map((bucket) =>
                bucket.count > 0 ? Math.round((bucket.errorCount / bucket.count) * 1000) / 10 : 0,
              ),
              color: ERROR_RATE_COLOR,
              axis: "right",
              smooth: true,
            },
          ],
    [buckets, errorsOnly],
  )

  const tooltipTitle = useMemo(
    () => (_category: string, dataIndex: number) => {
      const bucket = buckets[dataIndex]
      return bucket ? formatBucketTooltipLabel(bucket.bucket, bucketSeconds) : _category
    },
    [buckets, bucketSeconds],
  )

  if (isLoading || !activity) {
    return <HistogramSkeleton height={160} />
  }

  if (buckets.every((bucket) => bucket.count === 0)) {
    return (
      <div className="flex min-h-[80px] items-center justify-center">
        <Text.H6 color="foregroundMuted">
          {errorsOnly ? `No errors in the last ${windowDays} days` : `No activity in the last ${windowDays} days`}
        </Text.H6>
      </div>
    )
  }

  return (
    <Chart
      categories={categories}
      series={series}
      height={160}
      xAxisLabelFontSize={10}
      tooltipTitle={tooltipTitle}
      ariaLabel="User sessions over time"
    />
  )
}

function UserDetailPage() {
  const project = useRouteProject()
  const activityWindowDays = defaultProjectTimeWindowDays(project)
  const { projectSlug, userId } = Route.useParams()
  const [activeSessionId, setActiveSessionId] = useParamState("sessionId", "")
  const [errorsParam, setErrorsParam] = useParamState("errors", "")
  const errorsOnly = errorsParam === "1"
  const { data: profile, isLoading: profileLoading } = useUserProfile({ projectId: project.id, userId, errorsOnly })
  const [sessionsSorting, setSessionsSorting] = useState(DEFAULT_SESSIONS_SORTING)

  const sessionFilters: FilterSet = useMemo(
    () => ({
      userId: [{ op: "eq", value: userId }],
      ...(errorsOnly ? { status: [{ op: "eq", value: "error" }] } : {}),
    }),
    [userId, errorsOnly],
  )
  const {
    data: sessions,
    isLoading: sessionsLoading,
    infiniteScroll,
  } = useSessionsInfiniteScroll({
    projectId: project.id,
    sorting: sessionsSorting,
    filters: sessionFilters,
  })
  const { totalCount: sessionTotalCount } = useSessionsCount({ projectId: project.id, filters: sessionFilters })

  const notFound = !profileLoading && profile === null

  return (
    <Layout>
      <Layout.Content>
        <Layout.Header
          title={
            <div className="flex min-w-0 flex-row items-center gap-3">
              <Tooltip
                asChild
                side="bottom"
                trigger={
                  <Button asChild variant="ghost" className="h-8 w-8 p-0" aria-label="Back to users">
                    <Link to="/projects/$projectSlug/users" params={{ projectSlug }}>
                      <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </Button>
                }
              >
                Back to users
              </Tooltip>
              {profileLoading ? (
                <Skeleton className="h-7 w-56" />
              ) : (
                <>
                  <Avatar size="sm" name={profile ? userDisplayName(profile) : userId} imageSrc={null} />
                  <Text.H4M className="min-w-0 truncate">{profile ? userDisplayName(profile) : userId}</Text.H4M>
                </>
              )}
            </div>
          }
          description={
            profile ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex min-w-0 max-w-max">
                  <CopyableText value={profile.userId} size="sm" ellipsis tooltip="Copy user id" />
                </div>
                {profile.userEmail && profile.userEmail !== userDisplayName(profile) ? (
                  <Text.H6 color="foregroundMuted">{profile.userEmail}</Text.H6>
                ) : null}
                <Text.H6 color="foregroundMuted">
                  First seen {formatAgoLabel(profile.firstSeenAt)} · Last seen {formatAgoLabel(profile.lastSeenAt)}
                </Text.H6>
              </div>
            ) : undefined
          }
          actions={
            notFound ? undefined : (
              <>
                <UserNeighborNav
                  projectId={project.id}
                  projectSlug={projectSlug}
                  userId={userId}
                  overlayActive={Boolean(activeSessionId)}
                />
                <div className="mx-1 h-5 w-px bg-border" />
                <Label htmlFor="user-errors-only" className="cursor-pointer">
                  <Text.H6 color="foregroundMuted" noWrap>
                    Error view
                  </Text.H6>
                </Label>
                <Switch
                  id="user-errors-only"
                  checked={errorsOnly}
                  onCheckedChange={(checked) => setErrorsParam(checked ? "1" : "")}
                />
                <div className="mx-1 h-5 w-px bg-border" />
                <TargetMonitorsMenu
                  projectId={project.id}
                  projectSlug={projectSlug}
                  stream="traces"
                  filterSetContains={{ userId: [{ op: "eq", value: userId }] }}
                  createTarget={userMonitorTarget(userId)}
                />
              </>
            )
          }
        />

        {notFound ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
            <Text.H4M>User not found</Text.H4M>
            <Text.H5 color="foregroundMuted">No traces carry this user id in this project.</Text.H5>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-2">
              <UserStatStrip profile={profile} isLoading={profileLoading} />

              <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
                <Text.H6 color="foregroundMuted">
                  {errorsOnly
                    ? `Errors · last ${activityWindowDays} days`
                    : `Activity · last ${activityWindowDays} days`}
                </Text.H6>
                <UserActivityChart
                  projectId={project.id}
                  userId={userId}
                  errorsOnly={errorsOnly}
                  windowDays={activityWindowDays}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
                  <Text.H6 color="foregroundMuted">Signals affecting this user</Text.H6>
                  <UserSignalsSection projectId={project.id} projectSlug={projectSlug} userId={userId} />
                </div>
                <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
                  <Text.H6 color="foregroundMuted">Behaviors</Text.H6>
                  <UserBehavioursSection projectId={project.id} projectSlug={projectSlug} userId={userId} />
                </div>
              </div>

              <UserUsageSection projectId={project.id} userId={userId} errorsOnly={errorsOnly} />

              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Text.H5M color="foreground">
                    {sessionTotalCount > 0 ? `Sessions (${formatCount(sessionTotalCount)})` : "Sessions"}
                  </Text.H5M>
                  <Button asChild variant="outline" size="sm" className="w-auto">
                    <Link
                      to="/projects/$projectSlug"
                      params={{ projectSlug }}
                      search={{
                        filters: JSON.stringify({
                          userId: [{ op: "eq", value: userId }],
                          ...(errorsOnly ? { status: [{ op: "eq", value: "error" }] } : {}),
                        }),
                        filtersOpen: true,
                      }}
                    >
                      <Icon icon={TextAlignStartIcon} size="sm" />
                      View sessions
                    </Link>
                  </Button>
                </div>
                <UserSessionsTable
                  sessions={sessions}
                  isLoading={sessionsLoading}
                  infiniteScroll={infiniteScroll}
                  sorting={sessionsSorting}
                  onSortChange={setSessionsSorting}
                  activeSessionId={activeSessionId || undefined}
                  onSessionClick={(sessionId) => setActiveSessionId(sessionId)}
                  blankSlate={errorsOnly ? "No errored sessions for this user." : "No sessions carry this user id yet."}
                />
              </div>
            </div>
          </div>
        )}
      </Layout.Content>

      {activeSessionId ? (
        <Layout.Aside>
          <SessionDetailDrawer
            key={activeSessionId}
            sessionId={activeSessionId}
            projectId={project.id}
            onClose={() => setActiveSessionId("")}
          />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}
