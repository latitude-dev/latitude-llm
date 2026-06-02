import { useNavigate } from "@tanstack/react-router"
import { BookmarkIcon, DatabaseIcon, SearchIcon } from "lucide-react"
import { useMemo } from "react"
import { useDatasetsSearch } from "../../../domains/datasets/datasets.collection.ts"
import { useSavedSearchesList } from "../../../domains/saved-searches/saved-searches.collection.ts"
import type { PaletteCommand } from "../types.ts"
import { useCurrentProject } from "./use-current-project.ts"

interface ProjectSearchCommands {
  readonly datasets: readonly PaletteCommand[]
  readonly savedSearches: readonly PaletteCommand[]
  /** A single "Search traces for …" action that hands the query off to the Search page. */
  readonly tracesFallback: readonly PaletteCommand[]
}

const EMPTY: ProjectSearchCommands = { datasets: [], savedSearches: [], tracesFallback: [] }

/**
 * Entity results for the palette. Datasets are searched org-wide (across every project, each
 * result tagged with its owning project) so they surface regardless of which project — if any —
 * the user is currently viewing. Saved searches and the "Search traces for …" fallback remain
 * project-scoped: they navigate into the current project's Search page and so only render while
 * inside a project. Lists are only fetched while the user is actually searching.
 */
export function useProjectSearchCommands(query: string): ProjectSearchCommands {
  const navigate = useNavigate()
  const project = useCurrentProject()

  const trimmed = query.trim()
  const hasQuery = trimmed.length > 0
  const inProject = project !== null && hasQuery

  const { data: datasets } = useDatasetsSearch(trimmed, { enabled: hasQuery })
  const { data: savedSearches } = useSavedSearchesList(project?.id ?? "", { enabled: inProject })

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

    const savedSearchCommands = project
      ? savedSearches.map(
          (saved): PaletteCommand => ({
            id: `saved-search-result:${saved.id}`,
            title: saved.name,
            icon: BookmarkIcon,
            section: "search",
            keywords: saved.name,
            perform: () => navigate({ to: `/projects/${project.slug}/search`, search: { savedSearch: saved.slug } }),
          }),
        )
      : []

    const tracesFallback: readonly PaletteCommand[] = project
      ? [
          {
            id: "search-traces",
            title: `Search traces for "${trimmed}"`,
            icon: SearchIcon,
            section: "search",
            keywords: "search traces",
            perform: () => navigate({ to: `/projects/${project.slug}/search`, search: { q: trimmed } }),
          },
        ]
      : []

    return { datasets: datasetCommands, savedSearches: savedSearchCommands, tracesFallback }
  }, [project, datasets, savedSearches, trimmed, hasQuery, navigate])
}
