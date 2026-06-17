import { useNavigate } from "@tanstack/react-router"
import { ShieldAlertIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useSignalsOrgSearch } from "../../../domains/issues/issues.collection.ts"
import type { OrgSignalSearchRecord } from "../../../domains/issues/issues.functions.ts"
import { useDebounce } from "../../../lib/hooks/useDebounce.ts"
import type { PaletteCommand } from "../types.ts"
import { useCurrentProject } from "./use-current-project.ts"

const RESULT_LIMIT = 10
const SEMANTIC_DEBOUNCE_MS = 250

/**
 * Org-wide issue search for the palette, across every project in the organization, combining two
 * tiers from {@link useSignalsOrgSearch}:
 *
 * - **Lexical (instant):** GIN-backed full-text + name-substring match. Fires on every keystroke.
 * - **Semantic (debounced):** vector relevance, surfacing related issues whose titles don't
 *   literally contain the query (requires the embedding pipeline).
 *
 * Only active issues are returned. Lexical hits rank first, then semantic hits not already shown
 * (dedupe by id). Each result shows its owning project (plus current states) and selecting one
 * opens that project's issue drawer.
 */
export function useSignalSearchCommands(query: string): {
  readonly commands: readonly PaletteCommand[]
  readonly isLoading: boolean
} {
  const navigate = useNavigate()
  const project = useCurrentProject()

  const liveQuery = query.trim()
  const [debouncedQuery, setDebouncedQuery] = useState("")
  useDebounce(() => setDebouncedQuery(query.trim()), SEMANTIC_DEBOUNCE_MS, [query])

  // Lexical tier — instant, fires on every keystroke.
  const { data: lexicalSignals } = useSignalsOrgSearch(liveQuery, {
    semantic: false,
    enabled: liveQuery.length > 0,
    preferProjectId: project?.id,
  })

  // Semantic tier — debounced; embeds the query server-side.
  const { data: semanticSignals, isLoading: semanticLoading } = useSignalsOrgSearch(debouncedQuery, {
    semantic: true,
    enabled: debouncedQuery.length > 0,
    preferProjectId: project?.id,
  })

  const commands = useMemo<readonly PaletteCommand[]>(() => {
    if (liveQuery.length === 0) return []

    // Lexical matches first, then semantic matches not already shown; dedupe by id.
    const seen = new Set<string>()
    const merged: OrgSignalSearchRecord[] = []
    for (const issue of [...lexicalSignals, ...semanticSignals]) {
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
        perform: () => navigate({ to: `/projects/${issue.projectSlug}/issues`, search: { signalId: issue.id } }),
      }
    })
  }, [liveQuery, lexicalSignals, semanticSignals, navigate])

  return { commands, isLoading: debouncedQuery.length > 0 && semanticLoading }
}
