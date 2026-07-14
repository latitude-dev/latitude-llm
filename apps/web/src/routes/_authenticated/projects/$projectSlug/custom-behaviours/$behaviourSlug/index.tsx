import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router"
import { listEnabledFeatureFlagIdentifiers } from "../../../../../../domains/feature-flags/feature-flags.functions.ts"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { CustomBehaviourDetail } from "../-components/custom-behaviour-detail.tsx"

const behaviourRoute = getRouteApi("/_authenticated/projects/$projectSlug/custom-behaviours/$behaviourSlug/")

function CustomBehaviourBreadcrumb() {
  const { projectSlug, behaviourSlug } = behaviourRoute.useParams()
  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/custom-behaviours" params={{ projectSlug }}>
        Custom behaviors
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">{behaviourSlug}</BreadcrumbText>
    </>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/custom-behaviours/$behaviourSlug/")({
  beforeLoad: async ({ params }) => {
    const enabled = await listEnabledFeatureFlagIdentifiers()
    if (!enabled.includes("customBehaviors")) {
      throw redirect({ to: "/projects/$projectSlug", params: { projectSlug: params.projectSlug } })
    }
  },
  staticData: {
    breadcrumb: CustomBehaviourBreadcrumb,
  },
  component: CustomBehaviourDetailPage,
})

function CustomBehaviourDetailPage() {
  const project = useRouteProject()
  const { projectSlug, behaviourSlug } = Route.useParams()
  return <CustomBehaviourDetail projectId={project.id} projectSlug={projectSlug} behaviourSlug={behaviourSlug} />
}
