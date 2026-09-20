import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"
import { agentScoreDateSchema } from "../../../../../domains/agent-score/agent-score-date.ts"
import { listEnabledFeatureFlagIdentifiers } from "../../../../../domains/feature-flags/feature-flags.functions.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../-route-data.ts"
import { AgentScorePage } from "./-components/agent-score-page.tsx"

function AgentScoreBreadcrumb() {
  return <BreadcrumbText variant="current">Agent Score</BreadcrumbText>
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/agent-score/")({
  // Resolved before the route renders, not in the component: the nav entry is flagged too, so a
  // client-side check would paint a page nobody can navigate to.
  beforeLoad: async ({ params }) => {
    if (!(await listEnabledFeatureFlagIdentifiers()).includes("agentScore")) {
      throw redirect({ to: "/projects/$projectSlug", params: { projectSlug: params.projectSlug } })
    }
  },
  validateSearch: z.object({ date: agentScoreDateSchema.optional().catch(undefined) }),
  staticData: {
    breadcrumb: AgentScoreBreadcrumb,
  },
  component: AgentScoreIndexPage,
})

function AgentScoreIndexPage() {
  const project = useRouteProject()
  const { date } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AgentScorePage
      key={`${project.id}:${date ?? "latest"}`}
      project={project}
      selectedDate={date}
      onDateChange={(date) => void navigate({ search: { date } })}
    />
  )
}
