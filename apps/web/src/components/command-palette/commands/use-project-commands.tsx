import { extractLeadingEmoji } from "@repo/utils"
import { BoxIcon } from "lucide-react"
import { useMemo } from "react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import type { PaletteCommand } from "../types.ts"
import { useCurrentProject } from "./use-current-project.ts"

/**
 * One "switch to project" command per project in the org. Projects are eagerly loaded
 * (TanStack DB collection), so this is instant and works from anywhere. The active project is
 * identified by id from the route loader (`useCurrentProject`) rather than the URL slug, so it
 * stays correct under slug drift. Switching does a hard navigation to cleanly re-run the
 * project route's loader/context, matching the header switcher's behaviour.
 */
export function useProjectCommands(): readonly PaletteCommand[] {
  const { data: projects } = useProjectsCollection()
  const currentProject = useCurrentProject()

  return useMemo<readonly PaletteCommand[]>(() => {
    return (projects ?? [])
      .map((project): PaletteCommand => {
        const [emoji, title] = extractLeadingEmoji(project.name)
        const isCurrent = project.id === currentProject?.id
        return {
          id: `project:${project.id}`,
          title: title || project.name,
          icon: BoxIcon,
          leading: emoji ? <span className="text-base leading-none">{emoji}</span> : undefined,
          section: "projects",
          ...(isCurrent ? { subtitle: "Current project" } : {}),
          keywords: `project ${project.name} ${project.slug}`,
          perform: () => {
            if (isCurrent) return
            window.location.href = `/projects/${project.slug}`
          },
        }
      })
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [projects, currentProject])
}
