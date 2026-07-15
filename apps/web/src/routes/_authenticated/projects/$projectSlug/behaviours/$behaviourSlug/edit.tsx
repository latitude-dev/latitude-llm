import { Button, Text } from "@repo/ui"
import { createFileRoute, getRouteApi, Link, redirect, useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { listEnabledFeatureFlagIdentifiers } from "../../../../../../domains/feature-flags/feature-flags.functions.ts"
import { useCustomBehaviorsList } from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { BehavioursPage } from "../-components/behaviours-page.tsx"

const editRoute = getRouteApi("/_authenticated/projects/$projectSlug/behaviours/$behaviourSlug/edit")

function EditBehaviourBreadcrumb() {
  const { projectSlug } = editRoute.useParams()
  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/behaviours" params={{ projectSlug }}>
        Behaviors
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">Edit</BreadcrumbText>
    </>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/behaviours/$behaviourSlug/edit")({
  beforeLoad: async ({ params }) => {
    const enabled = await listEnabledFeatureFlagIdentifiers()
    if (!enabled.includes("customBehaviors")) {
      throw redirect({ to: "/projects/$projectSlug/behaviours", params: { projectSlug: params.projectSlug } })
    }
  },
  staticData: {
    breadcrumb: EditBehaviourBreadcrumb,
  },
  component: EditBehaviourPage,
})

function EditBehaviourPage() {
  const project = useRouteProject()
  const navigate = useNavigate()
  const { projectSlug, behaviourSlug } = Route.useParams()
  const { data: behaviours, isLoading } = useCustomBehaviorsList(project.id)
  const behaviour = behaviours.find((candidate) => candidate.slug === behaviourSlug)

  if (behaviour)
    return (
      <BehavioursPage
        key={behaviour.id}
        project={project}
        customBehaviour={behaviour}
        initialForm={{ mode: "edit" }}
        onFormClose={() =>
          void navigate({
            to: "/projects/$projectSlug/behaviours/$behaviourSlug",
            params: { projectSlug, behaviourSlug },
          })
        }
      />
    )

  return (
    <Layout>
      <Layout.Content>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <Text.H3>Custom behavior not found</Text.H3>
            <Button asChild variant="outline">
              <Link to="/projects/$projectSlug/behaviours" params={{ projectSlug }}>
                Back to behaviors
              </Link>
            </Button>
          </div>
        )}
      </Layout.Content>
    </Layout>
  )
}
