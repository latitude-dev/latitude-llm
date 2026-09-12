import { createFileRoute, redirect } from "@tanstack/react-router"
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
  staticData: {
    breadcrumb: AgentScoreBreadcrumb,
  },
  component: AgentScoreIndexPage,
})

function AgentScoreIndexPage() {
  return <AgentScorePage project={useRouteProject()} />
}
