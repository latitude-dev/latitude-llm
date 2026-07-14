import { stripCustomBehaviorExcludedFields } from "@domain/taxonomy"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMemo } from "react"
import { listEnabledFeatureFlagIdentifiers } from "../../../../../domains/feature-flags/feature-flags.functions.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { parseFilters } from "../-components/trace-page-state.ts"
import { useRouteProject } from "../-route-data.ts"
import { CustomBehavioursList } from "./-components/custom-behaviours-list.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/custom-behaviours/")({
  validateSearch: (search: Record<string, unknown>): { readonly create?: string } =>
    typeof search.create === "string" ? { create: search.create } : {},
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
  const { projectSlug } = Route.useParams()
  const { create } = Route.useSearch()
  const initialCreateFilterSet = useMemo(() => {
    if (!create) return undefined
    const parsed = stripCustomBehaviorExcludedFields(parseFilters(create))
    return Object.keys(parsed).length > 0 ? parsed : undefined
  }, [create])
  return (
    <CustomBehavioursList
      projectId={project.id}
      projectSlug={projectSlug}
      {...(initialCreateFilterSet ? { initialCreateFilterSet } : {})}
    />
  )
}
