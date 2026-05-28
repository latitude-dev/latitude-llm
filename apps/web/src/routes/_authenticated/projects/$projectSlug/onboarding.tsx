import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { isSlackConfigured } from "../../../../domains/integrations/integrations.functions.ts"
import { ONBOARDING_STEPS, OnboardingFlow } from "./-components/onboarding-flow.tsx"
import { useRouteProject } from "./-route-data.ts"

const searchSchema = z.object({
  step: z.enum(ONBOARDING_STEPS).optional(),
  installed: z.literal("ok").optional(),
  error: z.enum(["workspace_taken", "oauth_failed"]).optional(),
})

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/onboarding")({
  validateSearch: searchSchema,
  // Resolve the env probe at load time so the slack step's visibility
  // gate is synchronous on first render. A client `useQuery` defaults
  // to `false` while loading, which would race with the user clicking
  // "Continue" on the flaggers step and silently skip the slack step
  // even when it should be shown.
  loader: async () => ({ slackEnvConfigured: await isSlackConfigured() }),
  component: ProjectOnboardingPage,
})

function ProjectOnboardingPage() {
  const { projectSlug } = Route.useParams()
  const project = useRouteProject()
  const { slackEnvConfigured } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OnboardingFlow
        projectId={project.id}
        projectSlug={project.slug}
        onboardingType={project.settings.onboardingType}
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
