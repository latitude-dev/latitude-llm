import { extractLeadingEmoji } from "@repo/utils"
import { useParams } from "@tanstack/react-router"
import { BoxIcon } from "lucide-react"
import { useMemo } from "react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import type { PaletteCommand } from "../types.ts"

/**
 * One "switch to project" command per project in the org. Projects are eagerly loaded
 * (TanStack DB collection), so this is instant and works from anywhere. Switching does a
 * hard navigation to cleanly re-run the project route's loader/context, matching the
 * header switcher's behaviour.
 */
export function useProjectCommands(): readonly PaletteCommand[] {
  const { data: projects } = useProjectsCollection()
  const { projectSlug } = useParams({ strict: false })

  return useMemo<readonly PaletteCommand[]>(() => {
    return (projects ?? [])
      .map((project): PaletteCommand => {
        const [emoji, title] = extractLeadingEmoji(project.name)
        const isCurrent = project.slug === projectSlug
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
  }, [projects, projectSlug])
}
