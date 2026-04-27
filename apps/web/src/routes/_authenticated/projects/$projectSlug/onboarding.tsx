import { createFileRoute } from "@tanstack/react-router"
import { OnboardingFlow } from "./-components/onboarding-flow.tsx"
import { useRouteProject } from "./-route-data.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/onboarding")({
  component: ProjectOnboardingPage,
})

function ProjectOnboardingPage() {
  const project = useRouteProject()
  const navigate = Route.useNavigate()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OnboardingFlow
        projectId={project.id}
        onOpenProjectTraces={async (targetProjectId) => {
          if (targetProjectId !== project.id) return
          await navigate({ to: "/projects/$projectSlug", params: { projectSlug: project.slug } })
        }}
      />
    </div>
  )
}
