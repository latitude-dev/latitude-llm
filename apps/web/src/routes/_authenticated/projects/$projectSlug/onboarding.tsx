import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { isSlackConfigured } from "../../../../domains/integrations/integrations.functions.ts"
import { useOrganizationsCollection } from "../../../../domains/organizations/organizations.collection.ts"
import { useAuthenticatedOrganizationId } from "../../-route-data.ts"
import { ONBOARDING_STEPS, OnboardingFlow } from "./-components/onboarding-flow.tsx"
import { useRouteProject } from "./-route-data.ts"

const searchSchema = z.object({
  step: z.enum(ONBOARDING_STEPS).optional(),
  installed: z.literal("ok").optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/onboarding")({
  validateSearch: searchSchema,
  // Loader-resolved so the visibility gate is synchronous on first render.
  loader: async () => ({ slackEnvConfigured: await isSlackConfigured() }),
  component: ProjectOnboardingPage,
})

function ProjectOnboardingPage() {
  const { projectSlug } = Route.useParams()
  const project = useRouteProject()
  const { slackEnvConfigured } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const organizationId = useAuthenticatedOrganizationId()
  const { data: organizations = [] } = useOrganizationsCollection()
  const organization = organizations.find((org) => org.id === organizationId)
  const suggestedProjectName =
    project.name === "My project" && organization ? `${organization.name}'s project` : project.name

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OnboardingFlow
        projectId={project.id}
        projectSlug={project.slug}
        projectName={suggestedProjectName}
        persistedProjectName={project.name}
        slackEnvConfigured={slackEnvConfigured}
        initialStep={search.step}
        flashInstalled={search.installed}
        flashError={search.error}
        onOpenProjectTraces={async (targetProjectId) => {
          if (targetProjectId !== project.id) return
          await navigate({ to: "/projects/$projectSlug", params: { projectSlug } })
        }}
      />
    </div>
  )
}
