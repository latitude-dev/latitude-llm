import { createFileRoute, getRouteApi } from "@tanstack/react-router"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../../../-route-data.ts"
import { BehaviourNotFound, BehaviourRouteLoading } from "../../../-components/behaviour-route-states.tsx"
import { useBehaviourScope } from "../../../-components/behaviour-scope.ts"
import { BehavioursPage } from "../../../-components/behaviours-page.tsx"

const viewRoute = getRouteApi("/_authenticated/projects/$projectSlug/behaviours/$behaviourSlug/views/$viewSlug/")

function ViewBreadcrumb() {
  const project = useRouteProject()
  const { projectSlug, behaviourSlug, viewSlug } = viewRoute.useParams()
  const result = useBehaviourScope(project.id, behaviourSlug, viewSlug)
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
      <BreadcrumbText variant="current">
        {result.status === "ready" ? (result.scope.view?.name ?? viewSlug) : viewSlug}
      </BreadcrumbText>
    </>
  )
}

export const Route = createFileRoute(
  "/_authenticated/projects/$projectSlug/behaviours/$behaviourSlug/views/$viewSlug/",
)({
  staticData: {
    breadcrumb: ViewBreadcrumb,
  },
  component: BehaviourViewPage,
})

function BehaviourViewPage() {
  const project = useRouteProject()
  const { projectSlug, behaviourSlug, viewSlug } = Route.useParams()
  const result = useBehaviourScope(project.id, behaviourSlug, viewSlug)

  if (result.status === "loading") return <BehaviourRouteLoading />
  if (result.status !== "ready" || !result.scope.view) return <BehaviourNotFound projectSlug={projectSlug} />
  return <BehavioursPage key={result.scope.view.id} project={project} scope={result.scope} />
}
