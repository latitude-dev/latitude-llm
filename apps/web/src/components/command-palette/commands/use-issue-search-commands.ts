import { useNavigate } from "@tanstack/react-router"
import { ShieldAlertIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useIssuesOrgSearch } from "../../../domains/issues/issues.collection.ts"
import type { OrgIssueSearchRecord } from "../../../domains/issues/issues.functions.ts"
import { useDebounce } from "../../../lib/hooks/useDebounce.ts"
import type { PaletteCommand } from "../types.ts"
import { useCurrentProject } from "./use-current-project.ts"

const RESULT_LIMIT = 10
const SEMANTIC_DEBOUNCE_MS = 250

/**
 * Org-wide issue search for the palette, across every project in the organization, combining two
 * tiers from {@link useIssuesOrgSearch}:
 *
 * - **Lexical (instant):** GIN-backed full-text + name-substring match. Fires on every keystroke.
 * - **Semantic (debounced):** vector relevance, surfacing related issues whose titles don't
 *   literally contain the query (requires the embedding pipeline).
 *
 * Lexical hits rank first, then semantic hits not already shown (dedupe by id). Each result shows
 * its owning project (plus current states) and selecting one opens that project's issue drawer.
 */
export function useIssueSearchCommands(query: string): {
  readonly commands: readonly PaletteCommand[]
  readonly isLoading: boolean
} {
  const navigate = useNavigate()
  const project = useCurrentProject()

  const liveQuery = query.trim()
  const [debouncedQuery, setDebouncedQuery] = useState("")
  useDebounce(() => setDebouncedQuery(query.trim()), SEMANTIC_DEBOUNCE_MS, [query])

  // Lexical tier — instant, fires on every keystroke.
  const { data: lexicalIssues } = useIssuesOrgSearch(liveQuery, {
    semantic: false,
    enabled: liveQuery.length > 0,
    preferProjectId: project?.id,
  })

  // Semantic tier — debounced; embeds the query server-side.
  const { data: semanticIssues, isLoading: semanticLoading } = useIssuesOrgSearch(debouncedQuery, {
    semantic: true,
    enabled: debouncedQuery.length > 0,
    preferProjectId: project?.id,
  })

  const commands = useMemo<readonly PaletteCommand[]>(() => {
    if (liveQuery.length === 0) return []

    // Lexical matches first, then semantic matches not already shown; dedupe by id.
    const seen = new Set<string>()
    const merged: OrgIssueSearchRecord[] = []
    for (const issue of [...lexicalIssues, ...semanticIssues]) {
      if (seen.has(issue.id)) continue
      seen.add(issue.id)
      merged.push(issue)
    }

    return merged.slice(0, RESULT_LIMIT).map((issue): PaletteCommand => {
      const subtitle = issue.states.length > 0 ? `${issue.projectName} · ${issue.states.join(", ")}` : issue.projectName
      return {
        id: `issue-result:${issue.id}`,
        title: issue.name,
        icon: ShieldAlertIcon,
        section: "search",
        subtitle,
        keywords: `${issue.name} ${issue.projectName}`,
        perform: () => navigate({ to: `/projects/${issue.projectSlug}/issues`, search: { issueId: issue.id } }),
      }
    })
  }, [liveQuery, lexicalIssues, semanticIssues, navigate])

  return { commands, isLoading: debouncedQuery.length > 0 && semanticLoading }
}
