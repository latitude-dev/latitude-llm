import { INCIDENT_NOTIFICATION_KEY_LABEL } from "@domain/shared"
import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  LatitudeLogo,
  Select,
  Skeleton,
  Status,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount } from "@repo/utils"
import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon, BellIcon, BellOffIcon, EllipsisVerticalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { type ReactNode, useMemo, useRef, useState } from "react"
import { SeverityStatus } from "../../../../../../domains/alerts/severity-selector.tsx"
import { describeMonitorTarget, targetToSessionFilters } from "../../../../../../domains/monitors/monitor-target.ts"
import { useMonitor, useMonitorIncidentStats } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorRuleRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { serializeFilters } from "../../-components/trace-page-state.ts"
import { useRouteProject } from "../../-route-data.ts"
import { MonitorDeleteConfirmModal } from "../-components/monitor-delete-confirm-modal.tsx"
import { MonitorIncidentsTable } from "../-components/monitor-incidents-table.tsx"
import { MonitorMatchingTraces } from "../-components/monitor-matching-traces.tsx"
import { MonitorMetricChart } from "../-components/monitor-metric-chart.tsx"
import { MonitorMuteConfirmModal } from "../-components/monitor-mute-confirm-modal.tsx"
import { MonitorRuleEditModal } from "../-components/monitor-rule-edit-modal.tsx"

const monitorRoute = getRouteApi("/_authenticated/projects/$projectSlug/monitors/$monitorSlug/")

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

type RangeKey = "1h" | "24h" | "7d"
const RANGE_OPTIONS: { label: string; value: RangeKey }[] = [
  { label: "Last hour", value: "1h" },
  { label: "Last 24 hours", value: "24h" },
  { label: "Last 7 days", value: "7d" },
]
const RANGE_SPEC: Record<RangeKey, { rangeMs: number; bucketMs: number }> = {
  "1h": { rangeMs: HOUR_MS, bucketMs: 2 * MINUTE_MS },
  "24h": { rangeMs: DAY_MS, bucketMs: 30 * MINUTE_MS },
  "7d": { rangeMs: 7 * DAY_MS, bucketMs: 6 * HOUR_MS },
}
const isRangeKey = (value: string): value is RangeKey => value === "1h" || value === "24h" || value === "7d"

function MonitorBreadcrumb() {
  const { projectSlug, monitorSlug } = monitorRoute.useParams()
  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/monitors/search" params={{ projectSlug }}>
        Monitors
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">{monitorSlug}</BreadcrumbText>
    </>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/monitors/$monitorSlug/")({
  staticData: { breadcrumb: MonitorBreadcrumb },
  component: MonitorDetailPage,
})

function SystemTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground select-none">
      <LatitudeLogo className="h-3 w-3" />
      System
    </span>
  )
}

function ConfigField({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-[140px] flex-col items-start gap-1">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {children}
    </div>
  )
}

function MonitorDetailPage() {
  const { projectSlug, monitorSlug } = Route.useParams()
  const project = useRouteProject()
  const navigate = useNavigate()
  const [rangeRaw, setRangeRaw] = useParamState("monitorRange", "24h")
  const range = isRangeKey(rangeRaw) ? rangeRaw : "24h"

  const { data: monitor, isLoading } = useMonitor({ projectId: project.id, slug: monitorSlug })
  const { data: incidentStats } = useMonitorIncidentStats({
    projectId: project.id,
    monitorId: monitor?.id ?? "",
    enabled: Boolean(monitor),
  })

  const [muteConfirmOpen, setMuteConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [ruleModal, setRuleModal] = useState<MonitorRuleRecord | null>(null)
  // Shared scroll container: holds the config card, metric chart, and incidents table
  // together, so scrolling moves them as one and the table's header sticks once it
  // reaches the top instead of the table scrolling alone in its own small box.
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const window = useMemo(() => {
    const spec = RANGE_SPEC[range]
    const toMs = Date.now()
    return { fromMs: toMs - spec.rangeMs, toMs, bucketMs: spec.bucketMs }
  }, [range])

  if (!isLoading && !monitor) {
    return (
      <Layout>
        <Layout.Content>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
            <Text.H4M>Monitor not found</Text.H4M>
            <Button asChild variant="outline" size="sm" className="w-auto">
              <Link to="/projects/$projectSlug/monitors/search" params={{ projectSlug }}>
                Back to monitors
              </Link>
            </Button>
          </div>
        </Layout.Content>
      </Layout>
    )
  }

  const rule = monitor?.rule
  const target = monitor?.target ?? null
  const muted = monitor?.mutedAt != null
  const description = describeMonitorTarget(target)
  const savedSearchTarget = target?.savedSearchId
    ? { slug: monitor?.targetSavedSearchSlug ?? null, name: monitor?.targetSavedSearchName ?? "Saved search" }
    : rule?.source?.type === "savedSearch"
      ? { slug: rule.sourceSlug, name: rule.sourceName ?? "Saved search" }
      : null
  const sessionTarget = target?.stream === "sessions" && !savedSearchTarget ? targetToSessionFilters(target) : null
  const sessionTargetFilters = sessionTarget ? serializeFilters(sessionTarget.filters) : undefined
  const sessionTargetSearch = sessionTarget
    ? {
        tab: "sessions" as const,
        ...(sessionTargetFilters ? { filters: sessionTargetFilters } : {}),
        ...(sessionTarget.query ? { query: sessionTarget.query } : {}),
      }
    : null
  const canEditRule = Boolean(monitor && rule)
  const canDeleteMonitor = monitor ? !monitor.system : false
  const onEditRule = () => {
    if (!rule) return
    setRuleModal(rule)
  }

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
                  <Button asChild variant="ghost" className="h-8 w-8 p-0" aria-label="Back to monitors">
                    <Link to="/projects/$projectSlug/monitors/search" params={{ projectSlug }}>
                      <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </Button>
                }
              >
                Back to monitors
              </Tooltip>
              {isLoading ? (
                <Skeleton className="h-7 w-56" />
              ) : (
                <>
                  <Text.H4M className="min-w-0 truncate">{monitor?.name}</Text.H4M>
                  {monitor?.system ? <SystemTag /> : null}
                </>
              )}
            </div>
          }
          description={rule?.summary ?? undefined}
          actions={
            monitor ? (
              <>
                <Select<RangeKey>
                  name="range"
                  width="auto"
                  options={RANGE_OPTIONS}
                  value={range}
                  onChange={setRangeRaw}
                  size="small"
                />
                <Button variant="outline" size="sm" className="w-auto" onClick={() => setMuteConfirmOpen(true)}>
                  <Icon icon={muted ? BellIcon : BellOffIcon} size="sm" />
                  {muted ? "Unmute" : "Mute"}
                </Button>
                {canEditRule || canDeleteMonitor ? (
                  <DropdownMenuRoot modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" aria-label="Monitor actions">
                        <Icon icon={EllipsisVerticalIcon} size="sm" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuContent align="end" className="w-48">
                        {canEditRule ? (
                          <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={onEditRule}>
                            <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
                            <Text.H5>Edit monitor</Text.H5>
                          </DropdownMenuItem>
                        ) : null}
                        {canEditRule ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem
                          className="cursor-pointer items-center gap-2"
                          disabled={!canDeleteMonitor}
                          onSelect={() => setDeleteConfirmOpen(true)}
                        >
                          <Icon icon={Trash2Icon} size="sm" color="destructive" />
                          <Text.H5 color="destructive">Remove monitor</Text.H5>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenuPortal>
                  </DropdownMenuRoot>
                ) : null}
              </>
            ) : undefined
          }
        />

        <div ref={scrollAreaRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {isLoading || !monitor ? (
            <div className="p-6 pt-2">
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-col gap-4 p-6 pt-2">
                <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
                  <Text.H6 color="foregroundMuted">Configuration</Text.H6>
                  <div className="flex flex-row flex-wrap content-start items-start gap-x-8 gap-y-4">
                    <ConfigField label="Status">
                      {muted ? <Status variant="neutral" label="Muted" /> : <Status variant="success" label="Live" />}
                    </ConfigField>
                    {description || savedSearchTarget ? (
                      <ConfigField label="Target">
                        {savedSearchTarget?.slug ? (
                          <Link
                            to="/projects/$projectSlug"
                            params={{ projectSlug }}
                            search={{ tab: "sessions", savedSearch: savedSearchTarget.slug }}
                            className="hover:underline"
                          >
                            <Text.H5 color="primary">{savedSearchTarget.name}</Text.H5>
                          </Link>
                        ) : sessionTargetSearch ? (
                          <Link
                            to="/projects/$projectSlug"
                            params={{ projectSlug }}
                            search={sessionTargetSearch}
                            className="hover:underline"
                          >
                            <Text.H5 color="primary">{description?.label ?? savedSearchTarget?.name}</Text.H5>
                          </Link>
                        ) : (
                          <Text.H5 color="foreground">{description?.label ?? savedSearchTarget?.name}</Text.H5>
                        )}
                      </ConfigField>
                    ) : null}
                    {rule ? (
                      <ConfigField label="Trigger">
                        <div className="flex items-center gap-2">
                          <Text.H5 color="foreground">{INCIDENT_NOTIFICATION_KEY_LABEL[rule.kind]}</Text.H5>
                          <SeverityStatus severity={rule.severity} />
                        </div>
                      </ConfigField>
                    ) : null}
                    <ConfigField label="Incidents">
                      <Text.H5 color="foreground">{incidentStats ? formatCount(incidentStats.total) : "—"}</Text.H5>
                    </ConfigField>
                  </div>
                  {monitor.description ? <Text.H6 color="foregroundMuted">{monitor.description}</Text.H6> : null}
                </div>

                {target ? (
                  <MonitorMetricChart
                    projectId={project.id}
                    projectSlug={projectSlug}
                    monitor={monitor}
                    fromMs={window.fromMs}
                    toMs={window.toMs}
                    bucketMs={window.bucketMs}
                  />
                ) : null}
              </div>

              <div className="flex min-w-0 flex-col gap-3 px-6 pb-6">
                <Text.H6 color="foregroundMuted">Incidents</Text.H6>
                <MonitorIncidentsTable
                  projectId={project.id}
                  projectSlug={projectSlug}
                  monitorId={monitor.id}
                  scrollContainerRef={scrollAreaRef}
                />
              </div>

              {target ? (
                <div className="shrink-0 px-6 pb-6">
                  <MonitorMatchingTraces projectSlug={projectSlug} projectId={project.id} target={target} />
                </div>
              ) : null}
            </>
          )}
        </div>

        <MonitorMuteConfirmModal
          projectId={project.id}
          monitor={muteConfirmOpen && monitor ? monitor : null}
          onOpenChange={(next) => setMuteConfirmOpen(next !== null)}
        />

        <MonitorDeleteConfirmModal
          projectId={project.id}
          monitor={deleteConfirmOpen && monitor ? monitor : null}
          onOpenChange={(next) => setDeleteConfirmOpen(next !== null)}
          onDeleted={() => {
            void navigate({ to: "/projects/$projectSlug/monitors/search", params: { projectSlug } })
          }}
        />

        {ruleModal && monitor ? (
          <MonitorRuleEditModal
            projectId={project.id}
            projectSlug={projectSlug}
            monitorId={monitor.id}
            rule={ruleModal}
            target={monitor.target}
            onClose={() => setRuleModal(null)}
          />
        ) : null}
      </Layout.Content>
    </Layout>
  )
}
