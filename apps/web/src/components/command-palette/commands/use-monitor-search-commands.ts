import { useNavigate } from "@tanstack/react-router"
import { BellRingIcon } from "lucide-react"
import { useMemo } from "react"
import { useMonitorsSearch } from "../../../domains/monitors/monitors.collection.ts"
import type { PaletteCommand } from "../types.ts"
import { useCurrentProject } from "./use-current-project.ts"

/**
 * Monitor search results across every project in the organization, each tagged with its owning
 * project. Monitors are fetched only while searching; selecting one opens that project's Monitors
 * page. The subtitle shows the project name, with a muted/system label appended.
 */
export function useMonitorSearchCommands(query: string): readonly PaletteCommand[] {
  const navigate = useNavigate()
  const project = useCurrentProject()

  const active = query.trim().length > 0

  const { data: monitors } = useMonitorsSearch(query, { enabled: active, preferProjectId: project?.id })

  return useMemo<readonly PaletteCommand[]>(() => {
    if (!active) return []
    return monitors.map((monitor): PaletteCommand => {
      const status = monitor.mutedAt ? "Muted" : monitor.system ? "System" : undefined
      const subtitle = status ? `${monitor.projectName} · ${status}` : monitor.projectName
      return {
        id: `monitor-result:${monitor.id}`,
        title: monitor.name,
        icon: BellRingIcon,
        section: "search",
        subtitle,
        keywords: `${monitor.name} ${monitor.projectName}`,
        perform: () =>
          navigate({
            to: "/projects/$projectSlug/monitors/$monitorSlug",
            params: { projectSlug: monitor.projectSlug, monitorSlug: monitor.slug },
          }),
      }
    })
  }, [active, monitors, navigate])
}
