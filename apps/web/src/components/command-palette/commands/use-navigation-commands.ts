import { GithubIcon, SlackIcon } from "@repo/ui"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useMemo } from "react"
import {
  AGENT_DISPATCH_KIND_ICONS,
  AGENT_DISPATCH_KIND_LABELS,
  type AgentDispatchKindKey,
} from "../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import { useIsReadOnlyProjectScope } from "../../../domains/projects/project-scope.tsx"
import {
  PROJECT_SETTINGS_SECTION,
  useVisibleProjectSections,
  useVisibleProjectSettingsGroups,
} from "../../../domains/projects/project-sections.ts"
import type { PaletteCommand } from "../types.ts"

/** Integrations that live as sections on the Integrations page rather than their own route. */
const INTEGRATION_PAGE_SECTIONS = [
  { key: "slack", label: "Slack", icon: SlackIcon, keywords: "notifications channel workspace connect" },
  { key: "github", label: "GitHub", icon: GithubIcon, keywords: "repository repo pull request connect" },
] as const

const AGENT_DISPATCH_KEYWORDS: Record<AgentDispatchKindKey, string> = {
  cursor: "agent dispatch fix code connect",
  claude_code: "agent dispatch claude fix code connect",
  linear: "agent dispatch issue ticket connect",
  webhook: "agent dispatch endpoint http connect",
}

/**
 * Navigation commands for the project the user is currently inside: top-level sections
 * (Search, Traces, Signals, …), the Settings entry, every settings subsection, and each
 * integration on the Integrations page. Returns an empty list when not inside a project.
 * Sections and settings pages are sourced from the shared `project-sections` module, and
 * agent-dispatch integrations from `agent-dispatch-kinds`, so neither drifts from the UI.
 */
export function useNavigationCommands(): readonly PaletteCommand[] {
  const { projectSlug } = useParams({ strict: false })
  const navigate = useNavigate()
  const sections = useVisibleProjectSections()
  const settingsGroups = useVisibleProjectSettingsGroups()
  // Settings is the showcase org's settings (members/billing/keys) — hidden from
  // the sidebar under the read-only demo, so keep it out of Cmd+K too, otherwise
  // it's a direct path back into the exact pages the sidebar hides.
  const isReadOnly = useIsReadOnlyProjectScope()

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

    if (!isReadOnly) {
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

      for (const integration of INTEGRATION_PAGE_SECTIONS) {
        commands.push({
          id: `nav:integration:${integration.key}`,
          title: integration.label,
          subtitle: "Settings → Integrations",
          icon: integration.icon,
          section: "navigation",
          keywords: integration.keywords,
          perform: () => navigate({ to: `/projects/${projectSlug}/settings/integrations` }),
        })
      }

      for (const [kind, label] of Object.entries(AGENT_DISPATCH_KIND_LABELS) as [AgentDispatchKindKey, string][]) {
        commands.push({
          id: `nav:integration:${kind}`,
          title: label,
          subtitle: "Settings → Integrations",
          icon: AGENT_DISPATCH_KIND_ICONS[kind],
          section: "navigation",
          keywords: AGENT_DISPATCH_KEYWORDS[kind],
          perform: () => navigate({ to: `/projects/${projectSlug}/settings/integrations/${kind}` }),
        })
      }
    }

    return commands
  }, [projectSlug, sections, settingsGroups, navigate, isReadOnly])
}
