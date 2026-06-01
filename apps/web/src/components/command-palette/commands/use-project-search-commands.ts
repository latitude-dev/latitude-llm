import { useNavigate, useParams } from "@tanstack/react-router"
import { BookmarkIcon, DatabaseIcon, SearchIcon } from "lucide-react"
import { useMemo } from "react"
import { useDatasetsList } from "../../../domains/datasets/datasets.collection.ts"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { useSavedSearchesList } from "../../../domains/saved-searches/saved-searches.collection.ts"
import type { PaletteCommand } from "../types.ts"

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
  const { projectSlug } = useParams({ strict: false })
  const { data: projects } = useProjectsCollection()
  const projectId = useMemo(() => projects?.find((p) => p.slug === projectSlug)?.id, [projects, projectSlug])

  const trimmed = query.trim()
  const active = Boolean(projectId) && trimmed.length > 0

  const { data: datasets } = useDatasetsList(projectId ?? "", { enabled: active })
  const { data: savedSearches } = useSavedSearchesList(projectId ?? "", { enabled: active })

  return useMemo<ProjectSearchCommands>(() => {
    if (!active || !projectSlug) return EMPTY

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
        matchesAnyQuery: true,
        keywords: "search traces",
        perform: () => navigate({ to: `/projects/${projectSlug}/search`, search: { q: trimmed } }),
      },
    ]

    return { datasets: datasetCommands, savedSearches: savedSearchCommands, tracesFallback }
  }, [active, projectSlug, datasets, savedSearches, trimmed, navigate])
}
