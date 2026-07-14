import { createFileRoute, redirect } from "@tanstack/react-router"
import { listEnabledFeatureFlagIdentifiers } from "../../../../../domains/feature-flags/feature-flags.functions.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../-route-data.ts"
import { CustomBehavioursList } from "./-components/custom-behaviours-list.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/custom-behaviours/")({
  beforeLoad: async ({ params }) => {
    const enabled = await listEnabledFeatureFlagIdentifiers()
    if (!enabled.includes("customBehaviors")) {
      throw redirect({ to: "/projects/$projectSlug", params: { projectSlug: params.projectSlug } })
    }
  },
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Custom behaviors</BreadcrumbText>,
  },
  component: CustomBehavioursPage,
})

function CustomBehavioursPage() {
  const project = useRouteProject()
  return <CustomBehavioursList projectId={project.id} />
}
