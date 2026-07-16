import { stripCustomBehaviorExcludedFields } from "@domain/taxonomy"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"
import { listEnabledFeatureFlagIdentifiers } from "../../../../../domains/feature-flags/feature-flags.functions.ts"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { parseFilters } from "../-components/trace-page-state.ts"
import { useRouteProject } from "../-route-data.ts"
import { BehavioursPage } from "./-components/behaviours-page.tsx"

function NewBehaviourBreadcrumb() {
  const { projectSlug } = Route.useParams()
  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/behaviours" params={{ projectSlug }}>
        Behaviors
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">New cohort</BreadcrumbText>
    </>
  )
}

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
    breadcrumb: NewBehaviourBreadcrumb,
  },
  component: NewBehaviourPage,
})

function NewBehaviourPage() {
  const project = useRouteProject()
  const navigate = useNavigate()
  const { projectSlug } = Route.useParams()
  const { filters } = Route.useSearch()
  const initialFilterSet = useMemo(
    () => (filters ? stripCustomBehaviorExcludedFields(parseFilters(filters)) : undefined),
    [filters],
  )
  return (
    <BehavioursPage
      project={project}
      initialForm={{ mode: "create", ...(initialFilterSet ? { initialFilterSet } : {}) }}
      onFormClose={() => void navigate({ to: "/projects/$projectSlug/behaviours", params: { projectSlug } })}
    />
  )
}
