import { useNavigate } from "@tanstack/react-router"
import { BookmarkIcon, DatabaseIcon, SearchIcon } from "lucide-react"
import { useMemo } from "react"
import { useDatasetsSearch } from "../../../domains/datasets/datasets.collection.ts"
import { useSavedSearchesSearch } from "../../../domains/saved-searches/saved-searches.collection.ts"
import type { PaletteCommand } from "../types.ts"
import { useCurrentProject } from "./use-current-project.ts"

interface ProjectSearchCommands {
  readonly datasets: readonly PaletteCommand[]
  readonly savedSearches: readonly PaletteCommand[]
  /** A single "Search traces for … in <project>" action that hands the query off to the Search page. */
  readonly tracesFallback: readonly PaletteCommand[]
}

const EMPTY: ProjectSearchCommands = { datasets: [], savedSearches: [], tracesFallback: [] }

/**
 * Entity results for the palette. Datasets and saved searches are searched org-wide (across every
 * project, each result tagged with its owning project) so they surface regardless of which
 * project — if any — the user is currently viewing, and selecting one navigates into that result's
 * project. The "Search traces for … in <project>" fallback stays project-scoped: it opens the
 * current project's Search page (and names it, so the narrower scope is explicit), so it only
 * renders while inside a project. Lists are only fetched while searching.
 */
export function useProjectSearchCommands(query: string): ProjectSearchCommands {
  const navigate = useNavigate()
  const project = useCurrentProject()

  const trimmed = query.trim()
  const hasQuery = trimmed.length > 0

  const { data: datasets } = useDatasetsSearch(trimmed, { enabled: hasQuery, preferProjectId: project?.id })
  const { data: savedSearches } = useSavedSearchesSearch(trimmed, { enabled: hasQuery, preferProjectId: project?.id })

  return useMemo<ProjectSearchCommands>(() => {
    if (!hasQuery) return EMPTY

    const datasetCommands = datasets.map(
      (dataset): PaletteCommand => ({
        id: `dataset-result:${dataset.id}`,
        title: dataset.name,
        icon: DatabaseIcon,
        section: "search",
        subtitle: dataset.projectName,
        keywords: `${dataset.name} ${dataset.slug} ${dataset.projectName}`,
        perform: () => navigate({ to: `/projects/${dataset.projectSlug}/datasets/${dataset.id}` }),
      }),
    )

    const savedSearchCommands = savedSearches.map(
      (saved): PaletteCommand => ({
        id: `saved-search-result:${saved.id}`,
        title: saved.name,
        icon: BookmarkIcon,
        section: "search",
        subtitle: saved.projectName,
        keywords: `${saved.name} ${saved.projectName}`,
        perform: () => navigate({ to: `/projects/${saved.projectSlug}`, search: { savedSearch: saved.slug } }),
      }),
    )

    const tracesFallback: readonly PaletteCommand[] = project
      ? [
          {
            id: "search-traces",
            // Plain-text title kept for the matcher / a11y; `titleNode` is what renders. The
            // scaffolding ("Search traces for" / "in") is muted while the two dynamic values — the
            // query and the destination project — are emphasized, so they read first.
            title: `Search traces for "${trimmed}" in ${project.name}`,
            titleNode: (
              <span className="truncate">
                <span className="text-muted-foreground">Search traces for </span>
                <span className="font-medium text-foreground">"{trimmed}"</span>
                <span className="text-muted-foreground"> in </span>
                <span className="font-medium text-foreground">{project.name}</span>
              </span>
            ),
            icon: SearchIcon,
            section: "search",
            keywords: "search traces",
            perform: () => navigate({ to: `/projects/${project.slug}`, search: { query: trimmed } }),
          },
        ]
      : []

    return { datasets: datasetCommands, savedSearches: savedSearchCommands, tracesFallback }
  }, [project, datasets, savedSearches, trimmed, hasQuery, navigate])
}
