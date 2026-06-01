import { useNavigate, useParams } from "@tanstack/react-router"
import { ShieldAlertIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useIssues } from "../../../domains/issues/issues.collection.ts"
import type { IssueRecord } from "../../../domains/issues/issues.functions.ts"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { useDebounce } from "../../../lib/hooks/useDebounce.ts"
import type { PaletteCommand } from "../types.ts"

const RESULT_LIMIT = 8
const SEMANTIC_LIMIT = 6
// Pool of recent issues kept in cache for the instant title-substring fallback.
const RECENT_POOL_LIMIT = 50
const SEMANTIC_DEBOUNCE_MS = 250

/**
 * Issue search results for the current project, combining two strategies:
 *
 * - **Substring (instant, client-side):** title matches over a cached pool of the most
 *   recent issues. Works offline / without the embedding backend, so obvious matches like
 *   "json" → "JSON output truncated…" always surface.
 * - **Semantic (debounced, server-side):** the same `useIssues` vector search the Issues
 *   page uses, which finds related issues whose titles don't literally contain the query
 *   (requires the embedding pipeline to be available).
 *
 * Substring hits rank first (they're the obvious matches), then semantic hits not already
 * shown. Results bypass the palette's client filter and selecting one opens the issue drawer.
 */
export function useIssueSearchCommands(query: string): {
  readonly commands: readonly PaletteCommand[]
  readonly isLoading: boolean
} {
  const navigate = useNavigate()
  const { projectSlug } = useParams({ strict: false })
  const { data: projects } = useProjectsCollection()
  const projectId = useMemo(() => projects?.find((p) => p.slug === projectSlug)?.id, [projects, projectSlug])

  const liveQuery = query.trim()
  const [debouncedQuery, setDebouncedQuery] = useState("")
  useDebounce(() => setDebouncedQuery(query.trim()), SEMANTIC_DEBOUNCE_MS, [query])

  const inProjectSearch = Boolean(projectId) && liveQuery.length > 0
  const semanticEnabled = Boolean(projectId) && debouncedQuery.length > 0

  // Server-side semantic search (debounced).
  const { data: semanticIssues, isLoading: semanticLoading } = useIssues({
    projectId: projectId ?? "",
    searchQuery: debouncedQuery,
    limit: SEMANTIC_LIMIT,
    enabled: semanticEnabled,
  })

  // Recent-issues pool for the substring fallback — no searchQuery, so it's fetched once per
  // project and reused for every keystroke.
  const { data: recentIssues } = useIssues({
    projectId: projectId ?? "",
    limit: RECENT_POOL_LIMIT,
    enabled: inProjectSearch,
  })

  const commands = useMemo<readonly PaletteCommand[]>(() => {
    if (!inProjectSearch || !projectSlug) return []

    const tokens = liveQuery.toLowerCase().split(/\s+/)
    const substringMatches = recentIssues.filter((issue) => {
      const name = issue.name.toLowerCase()
      return tokens.every((token) => name.includes(token))
    })

    // Substring matches first, then semantic matches not already shown; dedupe by id.
    const seen = new Set<string>()
    const merged: IssueRecord[] = []
    for (const issue of [...substringMatches, ...semanticIssues]) {
      if (seen.has(issue.id)) continue
      seen.add(issue.id)
      merged.push(issue)
    }

    return merged.slice(0, RESULT_LIMIT).map((issue) => ({
      id: `issue-result:${issue.id}`,
      title: issue.name,
      icon: ShieldAlertIcon,
      section: "search",
      matchesAnyQuery: true,
      ...(issue.states.length > 0 ? { subtitle: issue.states.join(", ") } : {}),
      keywords: issue.name,
      perform: () => navigate({ to: `/projects/${projectSlug}/issues`, search: { issueId: issue.id } }),
    }))
  }, [inProjectSearch, projectSlug, liveQuery, recentIssues, semanticIssues, navigate])

  return { commands, isLoading: semanticEnabled && semanticLoading }
}
