import { Button, CodeBlock, Icon, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount, formatDuration, relativeTime } from "@repo/utils"
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { ArrowLeftIcon, LockIcon, TextAlignStartIcon, WrenchIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { useHasFeatureFlag } from "../../../../../../domains/feature-flags/feature-flags.collection.ts"
import { useToolDetail } from "../../../../../../domains/tools/tools.collection.ts"
import type { ToolDetailRecord } from "../../../../../../domains/tools/tools.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import {
  DEFAULT_TOOLS_RANGE_SECONDS,
  formatPercent,
  pickToolTrendBucketSeconds,
} from "../-components/tool-formatters.ts"
import { ToolActivityRow } from "./-components/tool-activity-row.tsx"
import { ToolContextPanel } from "./-components/tool-context-panel.tsx"
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
  component: ToolDetailPage,
})

function ToolDetailPage() {
  const toolsEnabled = useHasFeatureFlag("tools")

  if (!toolsEnabled) {
    return (
      <Layout>
        <Layout.Content>
          <div className="h-full w-full flex items-center justify-center p-8">
            <div className="max-w-lg flex flex-col items-center gap-6 text-center">
              <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
                <Icon icon={LockIcon} size="lg" color="foregroundMuted" />
              </div>
              <Text.H3 centered>Tools aren't available yet</Text.H3>
            </div>
          </div>
        </Layout.Content>
      </Layout>
    )
  }

  return <ToolDetailPageContent />
}

/** Single metric tile, sized like the issue summary tiles. */
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

/** Pretty-printed lossless definition; the raw payload is the source of truth. */
function definitionPretty(detail: ToolDetailRecord | undefined): string | null {
  const json = detail?.definition?.definitionJson
  if (!json) return null
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

function ToolDetailPageContent() {
  const { projectSlug, toolName } = Route.useParams()
  const project = useRouteProject()
  const [timeFrom] = useParamState("toolsTimeFrom", "")
  const [timeTo] = useParamState("toolsTimeTo", "")
  // A trace sheet being open suppresses the J/K prev/next-tool hotkeys.
  const [overlayActive, setOverlayActive] = useState(false)

  const range = useMemo(() => {
    const toMs = timeTo ? Date.parse(timeTo) : Date.now()
    const fromMs = timeFrom ? Date.parse(timeFrom) : toMs - DEFAULT_TOOLS_RANGE_SECONDS * 1000
    return { fromIso: new Date(fromMs).toISOString(), toIso: new Date(toMs).toISOString() }
  }, [timeFrom, timeTo])
  const trendBucketSeconds = useMemo(
    () => pickToolTrendBucketSeconds(Date.parse(range.toIso) - Date.parse(range.fromIso)),
    [range],
  )

  const { data: detail, isLoading } = useToolDetail({ projectId: project.id, toolName, range })
  const usage = detail?.usage ?? null
  const definition = detail?.definition ?? null
  const prettyDefinition = definitionPretty(detail)
  const notFound = !isLoading && detail !== undefined && usage === null && definition === null

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
                  <Button asChild variant="ghost" className="h-8 w-8 p-0" aria-label="Back to tools">
                    <Link to="/projects/$projectSlug/tools" params={{ projectSlug }}>
                      <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </Button>
                }
              >
                Back to tools
              </Tooltip>
              <WrenchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Text.H4M className="min-w-0 truncate font-mono">{notFound ? "Tool not found" : toolName}</Text.H4M>
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
              <Button asChild variant="outline" size="sm">
                <Link
                  to="/projects/$projectSlug"
                  params={{ projectSlug }}
                  search={{
                    // Traces page filter param: this tool + the same window.
                    filters: JSON.stringify({
                      tools: [{ op: "in", value: [toolName] }],
                      startTime: [
                        { op: "gte", value: range.fromIso },
                        { op: "lte", value: range.toIso },
                      ],
                    }),
                  }}
                >
                  <Icon icon={TextAlignStartIcon} size="sm" />
                  View traces
                </Link>
              </Button>
            </>
          }
          description={
            isLoading ? undefined : (
              <Text.H5 color="foregroundMuted">
                {definition?.definition?.description ??
                  (notFound
                    ? "No definition or calls were found for this tool in the selected time window."
                    : "Definition not found — this tool was called but no chat span in this window carried its definition.")}
              </Text.H5>
            )
          }
        />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6 pt-2">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
            {/* Usage — headline call metrics. */}
            <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4 xl:flex-1">
              <Text.H6 color="foregroundMuted">Usage</Text.H6>
              {!isLoading && usage === null ? (
                <Text.H5 color="foregroundMuted">
                  No calls in this window.
                  {definition
                    ? ` It was offered to the model ${formatCount(definition.offeredCount)} times — the model never selected it.`
                    : ""}
                </Text.H5>
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
                    value={
                      usage ? `${formatCount(usage.sessionsUsed)} · ${formatPercent(usage.sessionUsageRate)}` : "-"
                    }
                    isLoading={isLoading}
                  />
                  <MetricTile
                    label="Selection rate"
                    value={
                      definition && usage
                        ? formatPercent(definition.offeredCount > 0 ? usage.calls / definition.offeredCount : 0)
                        : "-"
                    }
                    tooltip={
                      definition
                        ? `Calls per offer — offered ${formatCount(definition.offeredCount)} times. Can exceed 100% when one turn calls it multiple times.`
                        : "Selection rate needs tool definitions on chat spans."
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
                    tooltip={usage ? `p50 / p95 — avg ${formatDuration(usage.avgDurationNs)}` : null}
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
            {/* Definition — the lossless payload as the agent ships it. */}
            <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4 xl:w-[500px]">
              <div className="flex items-center justify-between">
                <Text.H6 color="foregroundMuted">Definition</Text.H6>
                {definition ? (
                  <Text.H6 color="foregroundMuted">last seen {relativeTime(new Date(definition.lastOffered))}</Text.H6>
                ) : null}
              </div>
              {isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : prettyDefinition ? (
                <div className="max-h-[320px] min-h-0 overflow-y-auto">
                  <CodeBlock value={prettyDefinition} className="bg-secondary" />
                </div>
              ) : (
                <Text.H5 color="foregroundMuted">
                  Definition not found — this tool was called but no chat span in this window carried its definition.
                </Text.H5>
              )}
            </div>
          </div>

          {/* The deeper sections only make sense once the tool has calls. */}
          {usage !== null || isLoading ? (
            <>
              <ToolActivityRow
                projectId={project.id}
                toolName={toolName}
                range={range}
                bucketSeconds={trendBucketSeconds}
              />
              <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
                <ToolParametersExplorer projectId={project.id} toolName={toolName} range={range} />
                <ToolContextPanel
                  projectId={project.id}
                  projectSlug={projectSlug}
                  toolName={toolName}
                  range={range}
                  toolTracesUsed={usage?.tracesUsed ?? 0}
                />
              </div>
              <ToolRecentCalls
                projectId={project.id}
                toolName={toolName}
                range={range}
                onOverlayActiveChange={setOverlayActive}
              />
            </>
          ) : null}
        </div>
      </Layout.Content>
    </Layout>
  )
}
