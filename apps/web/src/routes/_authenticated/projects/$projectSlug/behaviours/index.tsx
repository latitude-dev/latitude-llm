import { createFileRoute } from "@tanstack/react-router"
import { listEnabledFeatureFlagIdentifiers } from "../../../../../domains/feature-flags/feature-flags.functions.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../-route-data.ts"
import { BehavioursCatalogPage } from "./-components/behaviours-catalog-page.tsx"
import { LegacyBehavioursPage } from "./-components/legacy-behaviours-page.tsx"

function BehavioursBreadcrumb() {
  return <BreadcrumbText variant="current">Behaviors</BreadcrumbText>
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/behaviours/")({
  // Resolved here, not in the component: the flag picks the whole screen, and a
  // client-side read would paint the legacy one first.
  loader: async () => ({
    customBehaviors: (await listEnabledFeatureFlagIdentifiers()).includes("customBehaviors"),
  }),
  staticData: {
    breadcrumb: BehavioursBreadcrumb,
  },
  component: BehavioursIndexPage,
})

function BehavioursIndexPage() {
  const project = useRouteProject()
  const { customBehaviors } = Route.useLoaderData()
  if (!customBehaviors) return <LegacyBehavioursPage project={project} />
  return <BehavioursCatalogPage project={project} />
}
