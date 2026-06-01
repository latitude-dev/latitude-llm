import { useNavigate, useParams } from "@tanstack/react-router"
import { ShieldAlertIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useIssues } from "../../../domains/issues/issues.collection.ts"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { useDebounce } from "../../../lib/hooks/useDebounce.ts"
import type { PaletteCommand } from "../types.ts"

const ISSUE_SEARCH_LIMIT = 6
const ISSUE_SEARCH_DEBOUNCE_MS = 250

/**
 * Issue search results for the current project, fed by the same semantic `useIssues` search
 * the Issues page uses (debounced). Returns nothing when not inside a project or the query is
 * empty. Results bypass the palette's client filter (see the `search` section handling) since
 * the server already ranked them — a substring filter would hide semantic matches. Selecting a
 * result opens the issue drawer via the `issueId` search param.
 */
export function useIssueSearchCommands(query: string): {
  readonly commands: readonly PaletteCommand[]
  readonly isLoading: boolean
} {
  const navigate = useNavigate()
  const { projectSlug } = useParams({ strict: false })
  const { data: projects } = useProjectsCollection()
  const projectId = useMemo(() => projects?.find((p) => p.slug === projectSlug)?.id, [projects, projectSlug])

  const [debouncedQuery, setDebouncedQuery] = useState("")
  useDebounce(() => setDebouncedQuery(query.trim()), ISSUE_SEARCH_DEBOUNCE_MS, [query])

  const enabled = Boolean(projectId) && debouncedQuery.length > 0
  const { data: issues, isLoading } = useIssues({
    projectId: projectId ?? "",
    searchQuery: debouncedQuery,
    limit: ISSUE_SEARCH_LIMIT,
    enabled,
  })

  const commands = useMemo<readonly PaletteCommand[]>(() => {
    if (!enabled || !projectSlug) return []
    return issues.slice(0, ISSUE_SEARCH_LIMIT).map((issue) => ({
      id: `issue-result:${issue.id}`,
      title: issue.name,
      icon: ShieldAlertIcon,
      section: "search",
      matchesAnyQuery: true,
      ...(issue.states.length > 0 ? { subtitle: issue.states.join(", ") } : {}),
      keywords: issue.name,
      perform: () => navigate({ to: `/projects/${projectSlug}/issues`, search: { issueId: issue.id } }),
    }))
  }, [enabled, projectSlug, issues, navigate])

  return { commands, isLoading: enabled && isLoading }
}
