import { stripCustomBehaviorExcludedFields } from "@domain/taxonomy"
import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../../-components/breadcrumb-ui.tsx"
import { parseFilters } from "../../../-components/trace-page-state.ts"
import { useRouteProject } from "../../../-route-data.ts"
import { BehaviourNotFound, BehaviourRouteLoading } from "../../-components/behaviour-route-states.tsx"
import { useBehaviourScope } from "../../-components/behaviour-scope.ts"
import { BehavioursPage } from "../../-components/behaviours-page.tsx"

const newViewRoute = getRouteApi("/_authenticated/projects/$projectSlug/behaviours/$behaviourSlug/views/new")

function NewViewBreadcrumb() {
  const project = useRouteProject()
  const { projectSlug, behaviourSlug } = newViewRoute.useParams()
  const result = useBehaviourScope(project.id, behaviourSlug)
  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/behaviours" params={{ projectSlug }}>
        Behaviors
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbLink to="/projects/$projectSlug/behaviours/$behaviourSlug" params={{ projectSlug, behaviourSlug }}>
        {result.status === "ready" ? result.scope.main.name : behaviourSlug}
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">New view</BreadcrumbText>
    </>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/behaviours/$behaviourSlug/views/new")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.filters === "string" ? { filters: search.filters } : {},
  staticData: {
    breadcrumb: NewViewBreadcrumb,
  },
  component: NewBehaviourViewPage,
})

function NewBehaviourViewPage() {
  const project = useRouteProject()
  const navigate = useNavigate()
  const { projectSlug, behaviourSlug } = Route.useParams()
  const { filters } = Route.useSearch()
  const result = useBehaviourScope(project.id, behaviourSlug)
  const initialFilterSet = useMemo(
    () => (filters ? stripCustomBehaviorExcludedFields(parseFilters(filters)) : undefined),
    [filters],
  )

  if (result.status === "loading") return <BehaviourRouteLoading />
  if (result.status !== "ready") return <BehaviourNotFound projectSlug={projectSlug} />
  return (
    <BehavioursPage
      key={result.scope.main.slug}
      project={project}
      scope={result.scope}
      initialForm={{ mode: "create", ...(initialFilterSet ? { initialFilterSet } : {}) }}
      onFormClose={() =>
        void navigate({
          to: "/projects/$projectSlug/behaviours/$behaviourSlug",
          params: { projectSlug, behaviourSlug },
        })
      }
    />
  )
}
