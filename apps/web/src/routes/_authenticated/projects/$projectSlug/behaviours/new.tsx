import { stripCustomBehaviorExcludedFields } from "@domain/taxonomy"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"
import { listEnabledFeatureFlagIdentifiers } from "../../../../../domains/feature-flags/feature-flags.functions.ts"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { parseFilters } from "../-components/trace-page-state.ts"
import { useRouteProject } from "../-route-data.ts"
import { BehavioursCatalogPage } from "./-components/behaviours-catalog-page.tsx"

function NewViewBreadcrumb() {
  const { projectSlug } = Route.useParams()
  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/behaviours" params={{ projectSlug }}>
        Behaviors
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">New view</BreadcrumbText>
    </>
  )
}

/**
 * Where a saved search (or any Sessions filter) turns into a view. It doesn't know
 * which behavior the user wants to slice, so the form asks first — unless the
 * project only has the topic behavior, in which case there is nothing to ask.
 */
export const Route = createFileRoute("/_authenticated/projects/$projectSlug/behaviours/new")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.filters === "string" ? { filters: search.filters } : {},
  beforeLoad: async ({ params }) => {
    const enabled = await listEnabledFeatureFlagIdentifiers()
    if (!enabled.includes("customBehaviors")) {
      throw redirect({ to: "/projects/$projectSlug/behaviours", params: { projectSlug: params.projectSlug } })
    }
  },
  staticData: {
    breadcrumb: NewViewBreadcrumb,
  },
  component: NewViewPage,
})

function NewViewPage() {
  const project = useRouteProject()
  const navigate = useNavigate()
  const { projectSlug } = Route.useParams()
  const { filters } = Route.useSearch()
  const initialFilterSet = useMemo(
    () => (filters ? stripCustomBehaviorExcludedFields(parseFilters(filters)) : undefined),
    [filters],
  )
  return (
    <BehavioursCatalogPage
      project={project}
      newView={{ ...(initialFilterSet ? { initialFilterSet } : {}) }}
      onNewViewClose={() => void navigate({ to: "/projects/$projectSlug/behaviours", params: { projectSlug } })}
    />
  )
}
