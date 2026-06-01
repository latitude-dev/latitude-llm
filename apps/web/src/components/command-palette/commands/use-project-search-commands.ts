import { useNavigate } from "@tanstack/react-router"
import { BookmarkIcon, DatabaseIcon, SearchIcon } from "lucide-react"
import { useMemo } from "react"
import { useDatasetsList } from "../../../domains/datasets/datasets.collection.ts"
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
 * In-project entity results for the palette: datasets and saved searches (small, eagerly
 * loaded lists filtered client-side by cmdk) plus a "Search traces for …" fallback that
 * opens the Search page with the query prefilled. Everything is gated on being inside a
 * project with a non-empty query, so the lists are only fetched while the user is searching.
 */
export function useProjectSearchCommands(query: string): ProjectSearchCommands {
  const navigate = useNavigate()
  const project = useCurrentProject()

  const trimmed = query.trim()
  const active = project !== null && trimmed.length > 0

  const { data: datasets } = useDatasetsList(project?.id ?? "", { enabled: active })
  const { data: savedSearches } = useSavedSearchesList(project?.id ?? "", { enabled: active })

  return useMemo<ProjectSearchCommands>(() => {
    if (!project || trimmed.length === 0) return EMPTY
    const projectSlug = project.slug

    const datasetCommands = datasets.map(
      (dataset): PaletteCommand => ({
        id: `dataset-result:${dataset.id}`,
        title: dataset.name,
        icon: DatabaseIcon,
        section: "search",
        keywords: `${dataset.name} ${dataset.slug}`,
        perform: () => navigate({ to: `/projects/${projectSlug}/datasets/${dataset.id}` }),
      }),
    )

    const savedSearchCommands = savedSearches.map(
      (saved): PaletteCommand => ({
        id: `saved-search-result:${saved.id}`,
        title: saved.name,
        icon: BookmarkIcon,
        section: "search",
        keywords: saved.name,
        perform: () => navigate({ to: `/projects/${projectSlug}/search`, search: { savedSearch: saved.slug } }),
      }),
    )

    const tracesFallback: readonly PaletteCommand[] = [
      {
        id: "search-traces",
        title: `Search traces for "${trimmed}"`,
        icon: SearchIcon,
        section: "search",
        keywords: "search traces",
        perform: () => navigate({ to: `/projects/${projectSlug}/search`, search: { q: trimmed } }),
      },
    ]

    return { datasets: datasetCommands, savedSearches: savedSearchCommands, tracesFallback }
  }, [project, datasets, savedSearches, trimmed, navigate])
}
