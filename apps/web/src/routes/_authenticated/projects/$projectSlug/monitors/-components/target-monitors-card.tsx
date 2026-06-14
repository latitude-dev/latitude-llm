import type { MonitorTarget } from "@domain/monitors"
import type { FilterSet, MonitorStream } from "@domain/shared"
import { Skeleton, Status, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { useMonitorsForTarget } from "../../../../../../domains/monitors/monitors.collection.ts"
import { AddTargetMonitorButton } from "./add-target-monitor-button.tsx"

/**
 * In-context list of the monitors watching a specific tool/user, with an inline
 * "Add monitor" action. `filterSetContains` is the predicate that scopes the
 * match (e.g. `{toolName:[{op:"eq",value}]}`); `createTarget` seeds new monitors.
 */
export function TargetMonitorsCard({
  projectId,
  projectSlug,
  stream,
  filterSetContains,
  createTarget,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly stream: MonitorStream
  readonly filterSetContains: FilterSet
  readonly createTarget: MonitorTarget
}) {
  const { monitors, isLoading } = useMonitorsForTarget({ projectId, stream, filterSetContains })

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">Monitors</Text.H6>
        <AddTargetMonitorButton projectId={projectId} projectSlug={projectSlug} target={createTarget} />
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : monitors.length === 0 ? (
        <Text.H6 color="foregroundMuted">No monitors yet. Add one to get alerted on this target.</Text.H6>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {monitors.map((monitor) => (
            <Link
              key={monitor.id}
              to="/projects/$projectSlug/monitors/$monitorSlug"
              params={{ projectSlug, monitorSlug: monitor.slug }}
              className="flex min-w-0 items-center justify-between gap-3 py-2 hover:opacity-80"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <Text.H5 noWrap ellipsis>
                  {monitor.name}
                </Text.H5>
                {monitor.alerts[0]?.summary ? (
                  <Text.H6 color="foregroundMuted" noWrap ellipsis>
                    {monitor.alerts[0].summary}
                  </Text.H6>
                ) : null}
              </div>
              {monitor.mutedAt ? <Status variant="neutral" label="Muted" /> : <Status variant="success" label="Live" />}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
