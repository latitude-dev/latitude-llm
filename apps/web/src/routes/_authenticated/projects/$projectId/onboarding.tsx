import { createFileRoute } from "@tanstack/react-router"
import { OnboardingFlow } from "./-components/onboarding-flow.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectId/onboarding")({
  component: ProjectOnboardingPage,
})

function ProjectOnboardingPage() {
  const { projectId } = Route.useParams()
  const navigate = Route.useNavigate()

  return (
    <OnboardingFlow
      projectId={projectId}
      onOpenProjectTraces={async (targetProjectId) => {
        await navigate({ to: "/projects/$projectId", params: { projectId: targetProjectId } })
      }}
    />
  )
}
