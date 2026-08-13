import { Button, Icon, Text, Tooltip } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import {
  AGENT_DISPATCH_KIND_ICONS,
  AGENT_DISPATCH_KIND_LABELS,
  type AgentDispatchKindKey,
  isAgentDispatchKind,
} from "../../../../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { useRouteProject } from "../../-route-data.ts"
import { AgentDispatchIntegrationDetails } from "../-components/agent-dispatch-section.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/integrations/$integrationKind")({
  beforeLoad: ({ params }) => {
    if (!isAgentDispatchKind(params.integrationKind)) throw notFound()
  },
  component: AgentDispatchIntegrationSettingsPage,
})

function AgentDispatchIntegrationSettingsPage() {
  const { projectSlug, integrationKind } = Route.useParams()
  const kind = integrationKind as AgentDispatchKindKey
  const routeProject = useRouteProject()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )
  const currentProject = project ?? routeProject

  return (
    <SettingsPage
      title={
        <div className="flex min-w-0 flex-row items-center gap-2">
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <Button asChild variant="ghost" className="h-7 w-7 p-0" aria-label="Back to integrations">
                <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
                  <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                </Link>
              </Button>
            }
          >
            Back to integrations
          </Tooltip>
          <Icon icon={AGENT_DISPATCH_KIND_ICONS[kind]} />
          <Text.H3M>{AGENT_DISPATCH_KIND_LABELS[kind]}</Text.H3M>
        </div>
      }
      description="Connection, dispatch behavior, and history for this integration."
    >
      <AgentDispatchIntegrationDetails projectId={currentProject.id} projectSlug={currentProject.slug} kind={kind} />
    </SettingsPage>
  )
}
