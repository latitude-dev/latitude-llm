import { useNavigate } from "@tanstack/react-router"
import { RadarIcon } from "lucide-react"
import { useMemo } from "react"
import { useHasFeatureFlag } from "../../../domains/feature-flags/feature-flags.collection.ts"
import { useMonitors } from "../../../domains/monitors/monitors.collection.ts"
import type { PaletteCommand } from "../types.ts"
import { useCurrentProject } from "./use-current-project.ts"

const MONITOR_SEARCH_LIMIT = 50

/**
 * Monitor search results for the current project. Gated behind the `monitors` feature flag —
 * mirroring the flag-gated Monitors page and sidebar entry — so monitors are neither fetched
 * nor listed when the flag is off. Results are the project's monitors (fetched only while
 * searching) filtered client-side by the palette; selecting one opens the monitor drawer via
 * the `monitorSlug` param. A muted/system monitor is labelled in its subtitle.
 */
export function useMonitorSearchCommands(query: string): readonly PaletteCommand[] {
  const navigate = useNavigate()
  const project = useCurrentProject()
  const monitorsEnabled = useHasFeatureFlag("monitors")

  const active = monitorsEnabled && project !== null && query.trim().length > 0

  const { monitors } = useMonitors({
    projectId: project?.id ?? "",
    limit: MONITOR_SEARCH_LIMIT,
    enabled: active,
  })

  return useMemo<readonly PaletteCommand[]>(() => {
    if (!active || !project) return []
    return monitors.map((monitor): PaletteCommand => {
      const subtitle = monitor.mutedAt ? "Muted" : monitor.system ? "System" : undefined
      return {
        id: `monitor-result:${monitor.id}`,
        title: monitor.name,
        icon: RadarIcon,
        section: "search",
        ...(subtitle ? { subtitle } : {}),
        keywords: monitor.name,
        perform: () => navigate({ to: `/projects/${project.slug}/monitors`, search: { monitorSlug: monitor.slug } }),
      }
    })
  }, [active, project, monitors, navigate])
}
