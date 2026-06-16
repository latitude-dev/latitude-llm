import type { MonitorTarget } from "@domain/monitors"
import { TargetMonitorsMenu } from "./target-monitors-menu.tsx"

export function AddTargetMonitorButton({
  projectId,
  projectSlug,
  target,
  label = "Add monitor",
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly target: MonitorTarget
  readonly label?: string
}) {
  return (
    <TargetMonitorsMenu
      projectId={projectId}
      projectSlug={projectSlug}
      stream={target.stream}
      filterSetContains={target.filterSet ?? {}}
      createTarget={target}
      label={label}
      matchMode="exact"
    />
  )
}
