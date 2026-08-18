import { Button, Icon, Label, Skeleton, Status, Switch, Text, Tooltip } from "@repo/ui"
import { formatCount, formatDuration, relativeTime } from "@repo/utils"
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { ArrowLeftIcon, TextAlignStartIcon, WrenchIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { toolMonitorTarget } from "../../../../../../domains/monitors/monitor-target.ts"
import { defaultProjectTimeWindowSeconds } from "../../../../../../domains/projects/default-time-window.ts"
import { useToolDetail } from "../../../../../../domains/tools/tools.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { TargetMonitorsMenu } from "../../monitors/-components/target-monitors-menu.tsx"
import { formatPercent, pickToolTrendBucketSeconds, TOOL_DETAIL_ROW_GRID } from "../-components/tool-formatters.ts"
import { ToolActivityRow } from "./-components/tool-activity-row.tsx"
import { ToolContextPanel } from "./-components/tool-context-panel.tsx"
import { ToolDefiningTraces } from "./-components/tool-defining-traces.tsx"
import { ToolDescription } from "./-components/tool-description.tsx"
import { ToolNeighborNav } from "./-components/tool-neighbor-nav.tsx"
import { ToolParametersExplorer } from "./-components/tool-parameters-explorer.tsx"
import { ToolRecentCalls } from "./-components/tool-recent-calls.tsx"

const toolDetailRoute = getRouteApi("/_authenticated/projects/$projectSlug/tools/$toolName/")

function ToolDetailBreadcrumb() {
  const { projectSlug, toolName } = toolDetailRoute.useParams()
  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/tools" params={{ projectSlug }}>
        Tools
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">{toolName}</BreadcrumbText>
    </>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/tools/$toolName/")({
  staticData: {
    breadcrumb: ToolDetailBreadcrumb,
  },
  component: ToolDetailPageContent,
})

function Tile({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {children}
    </div>
  )
}

function MetricTile({
  label,
  value,
  tooltip,
  isLoading,
}: {
  readonly label: string
  readonly value: string
  readonly tooltip?: ReactNode
  readonly isLoading: boolean
}) {
  if (isLoading) {
    return (
      <Tile label={label}>
        <Skeleton className="h-5 w-16" />
      </Tile>
    )
  }
  return (
    <Tile label={label}>
      {tooltip ? (
        <Tooltip asChild trigger={<Text.H5 color="foreground">{value}</Text.H5>}>
          {tooltip}
        </Tooltip>
      ) : (
        <Text.H5 color="foreground">{value}</Text.H5>
      )}
    </Tile>
  )
}

function ToolDetailPageContent() {
  const { projectSlug, toolName } = Route.useParams()
  const project = useRouteProject()
  const [timeFrom] = useParamState("toolsTimeFrom", "")
  const [timeTo] = useParamState("toolsTimeTo", "")
  const [errorsParam, setErrorsParam] = useParamState("toolErrors", "")
  const errorsOnly = errorsParam === "1"
  const [overlayActive, setOverlayActive] = useState(false)

  const range = useMemo(() => {
    const toMs = timeTo ? Date.parse(timeTo) : Date.now()
    const fromMs = timeFrom ? Date.parse(timeFrom) : toMs - defaultProjectTimeWindowSeconds(project) * 1000
    return { fromIso: new Date(fromMs).toISOString(), toIso: new Date(toMs).toISOString() }
  }, [timeFrom, timeTo, project])
  const trendBucketSeconds = useMemo(
    () => pickToolTrendBucketSeconds(Date.parse(range.toIso) - Date.parse(range.fromIso)),
    [range],
  )

  const { data: detail, isLoading } = useToolDetail({ projectId: project.id, toolName, range, errorsOnly })
  const usage = detail?.usage ?? null
  const errorsUsage = detail?.errorsUsage ?? null
  const definition = detail?.definition ?? null
  const notFound = !isLoading && detail !== undefined && usage === null && definition === null
  const definedButNeverCalled = !isLoading && detail !== undefined && usage === null && definition !== null

  return (
    <Layout>
      <Layout.Content>
        <Layout.Header
          title={
            <div className="flex min-w-0 flex-col gap-3">
              <Tooltip
                asChild
                side="bottom"
                trigger={
                  <Button asChild variant="ghost" size="sm" className="w-fit" aria-label="Back to tools">
                    <Link to="/projects/$projectSlug/tools" params={{ projectSlug }}>
                      <Icon icon={ArrowLeftIcon} size="sm" />
                      Back
                    </Link>
                  </Button>
                }
              >
                Back to tools
              </Tooltip>
              <div className="flex min-w-0 items-center gap-3">
                <WrenchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Text.H4M className="min-w-0 truncate font-mono">{notFound ? "Tool not found" : toolName}</Text.H4M>
              </div>
            </div>
          }
          actions={
            <>
              <ToolNeighborNav
                projectId={project.id}
                projectSlug={projectSlug}
                toolName={toolName}
                range={range}
                trendBucketSeconds={trendBucketSeconds}
                overlayActive={overlayActive}
              />
              <div className="mx-1 h-5 w-px bg-border" />
              <Label htmlFor="tool-errors-only" className="cursor-pointer">
                <Text.H6 color="foregroundMuted" noWrap>
                  Error view
                </Text.H6>
              </Label>
              <Switch
                id="tool-errors-only"
                checked={errorsOnly}
                onCheckedChange={(checked) => setErrorsParam(checked ? "1" : "")}
              />
              <div className="mx-1 h-5 w-px bg-border" />
              {/* w-auto: asChild lands the face's w-full on the Link, stretching it. */}
              <Button asChild variant="outline" size="sm" className="w-auto">
                <Link
                  to="/projects/$projectSlug"
                  params={{ projectSlug }}
                  search={{
                    tab: "sessions",
                    filters: JSON.stringify({
                      ...(definedButNeverCalled
                        ? { definedTools: [{ op: "in", value: [toolName] }] }
                        : { tools: [{ op: "in", value: [toolName] }] }),
                      startTime: [
                        { op: "gte", value: range.fromIso },
                        { op: "lte", value: range.toIso },
                      ],
                    }),
                    filtersOpen: true,
                  }}
                >
                  <Icon icon={TextAlignStartIcon} size="sm" />
                  View sessions
                </Link>
              </Button>
              {notFound ? null : (
                <>
                  <div className="mx-1 h-5 w-px bg-border" />
                  <TargetMonitorsMenu
                    projectId={project.id}
                    projectSlug={projectSlug}
                    stream="spans"
                    filterSetContains={{ toolName: [{ op: "eq", value: toolName }] }}
                    createTarget={toolMonitorTarget(toolName)}
                  />
                </>
              )}
            </>
          }
          description={
            isLoading ? undefined : definition?.definition?.description ? (
              <ToolDescription key={toolName} toolName={toolName} description={definition.definition.description} />
            ) : (
              <Text.H5 color="foregroundMuted" italic>
                {notFound
                  ? "No definition or calls were found for this tool in the selected time window."
                  : "Definition not found. This tool was called, but no chat span in this window carried its definition."}
              </Text.H5>
            )
          }
        />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6 pt-2">
          {/* Usage — headline call metrics, scoped to failures when the
              errors-only switch is on (error rate stays global). */}
          <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
            <div className="flex items-center gap-2">
              <Text.H6 color="foregroundMuted">Usage</Text.H6>
              {errorsOnly ? <Status variant="destructive" label="failed calls only" /> : null}
            </div>
            {!isLoading && usage === null ? (
              <Text.H5 color="foregroundMuted">
                No calls in this window.
                {definition
                  ? ` It was offered to the model ${formatCount(definition.offeredCount)} times but never selected.`
                  : ""}
              </Text.H5>
            ) : !isLoading && errorsOnly && errorsUsage === null ? (
              <Text.H5 color="foregroundMuted">
                No failed calls in this window. All {usage ? formatCount(usage.calls) : ""} succeeded.
              </Text.H5>
            ) : errorsOnly ? (
              <div className="flex flex-row flex-wrap gap-x-8 gap-y-4">
                <MetricTile
                  label="Failed calls"
                  value={errorsUsage ? formatCount(errorsUsage.calls) : "-"}
                  isLoading={isLoading}
                />
                <MetricTile
                  label="Affected traces"
                  value={
                    errorsUsage
                      ? `${formatCount(errorsUsage.tracesUsed)} · ${formatPercent(errorsUsage.traceUsageRate)}`
                      : "-"
                  }
                  tooltip="Distinct traces with at least one FAILED call of this tool, and their share of all traces in the window."
                  isLoading={isLoading}
                />
                <MetricTile
                  label="Affected sessions"
                  value={
                    errorsUsage
                      ? `${formatCount(errorsUsage.sessionsUsed)} · ${formatPercent(errorsUsage.sessionUsageRate)}`
                      : "-"
                  }
                  isLoading={isLoading}
                />
                <MetricTile
                  label="Error rate"
                  value={usage ? formatPercent(usage.errorRate) : "-"}
                  tooltip={
                    usage
                      ? `Across ALL calls in this window: ${formatCount(usage.errors)} of ${formatCount(usage.calls)} failed.`
                      : null
                  }
                  isLoading={isLoading}
                />
                <MetricTile
                  label="Duration"
                  value={
                    errorsUsage
                      ? `${formatDuration(errorsUsage.p50DurationNs)} / ${formatDuration(errorsUsage.p95DurationNs)}`
                      : "-"
                  }
                  tooltip={
                    errorsUsage ? `p50 / p95 of failed calls (avg ${formatDuration(errorsUsage.avgDurationNs)})` : null
                  }
                  isLoading={isLoading}
                />
                <MetricTile
                  label="Last failed"
                  value={errorsUsage ? relativeTime(new Date(errorsUsage.lastUsed)) : "-"}
                  tooltip={errorsUsage ? new Date(errorsUsage.lastUsed).toLocaleString() : null}
                  isLoading={isLoading}
                />
              </div>
            ) : (
              <div className="flex flex-row flex-wrap gap-x-8 gap-y-4">
                <MetricTile label="Calls" value={usage ? formatCount(usage.calls) : "-"} isLoading={isLoading} />
                <MetricTile
                  label="Traces using it"
                  value={usage ? `${formatCount(usage.tracesUsed)} · ${formatPercent(usage.traceUsageRate)}` : "-"}
                  tooltip="Distinct traces with at least one call of this tool, and their share of all traces in the window."
                  isLoading={isLoading}
                />
                <MetricTile
                  label="Sessions using it"
                  value={usage ? `${formatCount(usage.sessionsUsed)} · ${formatPercent(usage.sessionUsageRate)}` : "-"}
                  isLoading={isLoading}
                />
                <MetricTile
                  label="Calls per offer"
                  value={
                    definition && usage
                      ? formatPercent(definition.offeredCount > 0 ? usage.calls / definition.offeredCount : 0)
                      : "-"
                  }
                  tooltip={
                    definition
                      ? `How often the model picks this tool when it's available, across ${formatCount(definition.offeredCount)} offers. Can exceed 100% when one turn calls it multiple times.`
                      : "Calls per offer needs tool definitions on chat spans."
                  }
                  isLoading={isLoading}
                />
                <MetricTile
                  label="Error rate"
                  value={usage ? formatPercent(usage.errorRate) : "-"}
                  tooltip={usage ? `${formatCount(usage.errors)} of ${formatCount(usage.calls)} calls failed.` : null}
                  isLoading={isLoading}
                />
                <MetricTile
                  label="Duration"
                  value={
                    usage ? `${formatDuration(usage.p50DurationNs)} / ${formatDuration(usage.p95DurationNs)}` : "-"
                  }
                  tooltip={usage ? `p50 / p95 (avg ${formatDuration(usage.avgDurationNs)})` : null}
                  isLoading={isLoading}
                />
                <MetricTile
                  label="Last called"
                  value={usage ? relativeTime(new Date(usage.lastUsed)) : "-"}
                  tooltip={usage ? new Date(usage.lastUsed).toLocaleString() : null}
                  isLoading={isLoading}
                />
              </div>
            )}
          </div>

          {/* Charts only make sense once the tool has calls. */}
          {usage !== null || isLoading ? (
            <ToolActivityRow
              projectId={project.id}
              toolName={toolName}
              range={range}
              bucketSeconds={trendBucketSeconds}
              errorsOnly={errorsOnly}
              failedCalls={errorsUsage?.calls ?? 0}
            />
          ) : null}
          <div className={TOOL_DETAIL_ROW_GRID}>
            {/* Parameters render even for never-called tools — the definition
                alone still lists what the tool accepts. */}
            <ToolParametersExplorer
              projectId={project.id}
              toolName={toolName}
              range={range}
              errorsOnly={errorsOnly}
              definitionJson={definition?.definitionJson ?? ""}
            />
            {usage !== null || isLoading ? (
              <ToolContextPanel
                projectId={project.id}
                projectSlug={projectSlug}
                toolName={toolName}
                range={range}
                toolTracesUsed={(errorsOnly ? errorsUsage?.tracesUsed : usage?.tracesUsed) ?? 0}
                errorsOnly={errorsOnly}
              />
            ) : null}
          </div>
          {usage !== null || isLoading ? (
            <ToolRecentCalls
              projectId={project.id}
              toolName={toolName}
              range={range}
              errorsOnly={errorsOnly}
              onOverlayActiveChange={setOverlayActive}
              headerAction={
                <Button asChild variant="outline" size="sm" className="w-auto">
                  <Link
                    to="/projects/$projectSlug"
                    params={{ projectSlug }}
                    search={{
                      tab: "sessions",
                      filters: JSON.stringify({
                        tools: [{ op: "in", value: [toolName] }],
                        startTime: [
                          { op: "gte", value: range.fromIso },
                          { op: "lte", value: range.toIso },
                        ],
                        ...(errorsOnly ? { status: [{ op: "in", value: ["error"] }] } : {}),
                      }),
                      filtersOpen: true,
                    }}
                  >
                    <Icon icon={TextAlignStartIcon} size="sm" />
                    View sessions
                  </Link>
                </Button>
              }
            />
          ) : definedButNeverCalled ? (
            <ToolDefiningTraces
              projectId={project.id}
              toolName={toolName}
              range={range}
              onOverlayActiveChange={setOverlayActive}
            />
          ) : null}
        </div>
      </Layout.Content>
    </Layout>
  )
}
