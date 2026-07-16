import { useNavigate } from "@tanstack/react-router"
import { FlaskConical } from "lucide-react"
import { useMemo } from "react"
import { useExperimentsSearch } from "../../../domains/experiments/experiments.collection.ts"
import type { PaletteCommand } from "../types.ts"
import { useCurrentProject } from "./use-current-project.ts"

/**
 * Experiment search results across every project in the organization, each tagged with its owning
 * project. Experiments are fetched only while searching; selecting one opens its detail page.
 */
export function useExperimentSearchCommands(query: string): readonly PaletteCommand[] {
  const navigate = useNavigate()
  const project = useCurrentProject()
  const active = query.trim().length > 0

  const { data: experiments } = useExperimentsSearch({
    searchQuery: query,
    enabled: active,
    ...(project?.id ? { preferProjectId: project.id } : {}),
  })

  return useMemo<readonly PaletteCommand[]>(() => {
    if (!active) return []
    return experiments.map((experiment): PaletteCommand => {
      const variantLabel = experiment.variantCount === 1 ? "1 variant" : `${experiment.variantCount} variants`
      return {
        id: `experiment-result:${experiment.id}`,
        title: experiment.name,
        icon: FlaskConical,
        section: "search",
        subtitle: variantLabel,
        keywords: `${experiment.name} experiment`,
        perform: () =>
          navigate({
            to: "/projects/$projectSlug/experiments/$experimentSlug",
            params: { projectSlug: experiment.projectSlug, experimentSlug: experiment.slug },
          }),
      }
    })
  }, [active, experiments, navigate])
}
