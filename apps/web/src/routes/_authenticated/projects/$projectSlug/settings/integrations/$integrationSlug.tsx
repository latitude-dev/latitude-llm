import { createFileRoute, notFound, redirect } from "@tanstack/react-router"
import type { AgentDispatchKindKey } from "../../../../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import {
  hasProjectSettings,
  type IntegrationKey,
  integrationEntry,
  integrationKeyFromSlug,
  integrationSlug,
} from "../../../../../../domains/integrations/integration-catalog.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { useRouteProject } from "../../-route-data.ts"
import { AgentDispatchIntegrationDetails } from "../-components/agent-dispatch-section.tsx"
import { GithubProjectSettings } from "../-components/github-project-settings.tsx"
import { IntegrationDetailHeader } from "../-components/integration-detail-header.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/integrations/$integrationSlug")({
  beforeLoad: ({ params }) => {
    const key = integrationKeyFromSlug(params.integrationSlug)
    if (!key) throw notFound()
    // Slack has nothing to configure per project, so an old link lands on its org page.
    if (!hasProjectSettings(key)) {
      throw redirect({
        to: "/projects/$projectSlug/settings/organization/integrations/$integrationSlug",
        params: { projectSlug: params.projectSlug, integrationSlug: integrationSlug(key) },
      })
    }
  },
  component: ProjectIntegrationSettingsPage,
})

function ProjectIntegrationSettingsPage() {
  const { projectSlug, integrationSlug: slug } = Route.useParams()
  const key = integrationKeyFromSlug(slug) as Exclude<IntegrationKey, "slack">
  const routeProject = useRouteProject()

  const { data: allProjects } = useProjectsCollection()
  // The shared Showcase project is merged into this collection but isn't the org's.
  const projectCount = (allProjects ?? []).filter((row) => !row.isShowcase).length

  return (
    <SettingsPage
      title={<IntegrationDetailHeader entry={integrationEntry(key)} projectSlug={projectSlug} scope="project" />}
      description="What this integration does for this project, and where it follows the organization."
    >
      {key === "github" ? (
        <GithubProjectSettings projectId={routeProject.id} projectSlug={projectSlug} projectCount={projectCount} />
      ) : (
        <AgentDispatchIntegrationDetails
          projectId={routeProject.id}
          projectSlug={projectSlug}
          projectCount={projectCount}
          kind={key as AgentDispatchKindKey}
        />
      )}
    </SettingsPage>
  )
}
