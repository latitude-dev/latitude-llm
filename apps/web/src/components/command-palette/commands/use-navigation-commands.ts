import { useNavigate, useParams } from "@tanstack/react-router"
import { useMemo } from "react"
import {
  PROJECT_SETTINGS_SECTION,
  useVisibleProjectSections,
  useVisibleProjectSettingsGroups,
} from "../../../domains/projects/project-sections.ts"
import type { PaletteCommand } from "../types.ts"

/**
 * Navigation commands for the project the user is currently inside: top-level sections
 * (Search, Traces, Issues, …), the Settings entry, and every settings subsection. Returns
 * an empty list when not inside a project. Sourced from the shared `project-sections`
 * module so it never drifts from the sidebar.
 */
export function useNavigationCommands(): readonly PaletteCommand[] {
  const { projectSlug } = useParams({ strict: false })
  const navigate = useNavigate()
  const sections = useVisibleProjectSections()
  const settingsGroups = useVisibleProjectSettingsGroups()

  return useMemo<readonly PaletteCommand[]>(() => {
    if (!projectSlug) return []

    const commands: PaletteCommand[] = sections.map((section) => ({
      id: `nav:${section.key}`,
      title: section.label,
      icon: section.icon,
      section: "navigation",
      keywords: "go to open",
      perform: () => navigate({ to: section.path(projectSlug) }),
    }))

    commands.push({
      id: "nav:settings",
      title: PROJECT_SETTINGS_SECTION.label,
      icon: PROJECT_SETTINGS_SECTION.icon,
      section: "navigation",
      keywords: "go to open settings",
      perform: () => navigate({ to: PROJECT_SETTINGS_SECTION.path(projectSlug) }),
    })

    for (const group of settingsGroups) {
      for (const item of group.items) {
        commands.push({
          id: `nav:settings:${item.key}`,
          title: item.label,
          subtitle: `Settings → ${group.title}`,
          icon: item.icon,
          section: "navigation",
          keywords: `settings ${group.title} ${item.label}`,
          perform: () => navigate({ to: item.path(projectSlug) }),
        })
      }
    }

    return commands
  }, [projectSlug, sections, settingsGroups, navigate])
}
