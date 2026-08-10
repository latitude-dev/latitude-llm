import { createFileRoute, getRouteApi, Navigate } from "@tanstack/react-router"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { BehaviourNotFound, BehaviourRouteLoading } from "../-components/behaviour-route-states.tsx"
import { useBehaviourScope } from "../-components/behaviour-scope.ts"
import { BehavioursPage } from "../-components/behaviours-page.tsx"

const behaviourRoute = getRouteApi("/_authenticated/projects/$projectSlug/behaviours/$behaviourSlug/")

function CustomBehaviourBreadcrumb() {
  const project = useRouteProject()
  const { projectSlug, behaviourSlug } = behaviourRoute.useParams()
  const result = useBehaviourScope(project.id, behaviourSlug)
  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/behaviours" params={{ projectSlug }}>
        Behaviors
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">
        {result.status === "ready" ? result.scope.main.name : behaviourSlug}
      </BreadcrumbText>
    </>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/behaviours/$behaviourSlug/")({
  staticData: {
    breadcrumb: CustomBehaviourBreadcrumb,
  },
  component: BehaviourPage,
})

function BehaviourPage() {
  const project = useRouteProject()
  const { projectSlug, behaviourSlug } = Route.useParams()
  const result = useBehaviourScope(project.id, behaviourSlug)

  if (result.status === "loading") return <BehaviourRouteLoading />
  if (result.status === "notFound") return <BehaviourNotFound projectSlug={projectSlug} />
  // The slug names a filtered view, which now lives one level deeper.
  if (result.status === "redirect") {
    return (
      <Navigate
        replace
        to="/projects/$projectSlug/behaviours/$behaviourSlug/views/$viewSlug"
        params={{ projectSlug, behaviourSlug: result.behaviourSlug, viewSlug: result.viewSlug }}
      />
    )
  }
  return <BehavioursPage key={result.scope.main.slug} project={project} scope={result.scope} />
}
