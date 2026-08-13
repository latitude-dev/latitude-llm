import { Alert, Button, Icon, Skeleton, Text, Tooltip } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import {
  type AgentDispatchIntegrationRecord,
  getProjectDispatchSettings,
  listAgentDispatchIntegrations,
} from "../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import {
  AGENT_DISPATCH_KIND_ICONS,
  AGENT_DISPATCH_KIND_LABELS,
  type AgentDispatchKindKey,
  isAgentDispatchKind,
} from "../../../../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import { useIsOrganizationOwner } from "../../../../../../domains/members/members.collection.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { useAuthenticatedUser } from "../../../../-route-data.ts"
import { useRouteProject } from "../../-route-data.ts"
import {
  AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
  DispatchConnectionSection,
  OrgDispatchDefaultCard,
  projectDispatchSettingsQueryKey,
} from "../-components/agent-dispatch-section.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"

export const Route = createFileRoute(
  "/_authenticated/projects/$projectSlug/settings/global-integrations/$integrationKind",
)({
  beforeLoad: ({ params }) => {
    if (!isAgentDispatchKind(params.integrationKind)) throw notFound()
  },
  component: GlobalIntegrationDetailPage,
})

function GlobalIntegrationDetailPage() {
  const { projectSlug, integrationKind } = Route.useParams()
  const kind = integrationKind as AgentDispatchKindKey
  const routeProject = useRouteProject()
  const user = useAuthenticatedUser()
  const isOwner = useIsOrganizationOwner(user.id)

  const { data: allProjects } = useProjectsCollection()
  // The shared Showcase project is merged into this collection but isn't the org's.
  const projectCount = (allProjects ?? []).filter((row) => !row.isShowcase).length

  const { data: integrations = [], isLoading: integrationsLoading } = useQuery({
    queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
    queryFn: () => listAgentDispatchIntegrations(),
  })
  const integration = integrations.find((row: AgentDispatchIntegrationRecord) => row.kind === kind) ?? null

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: projectDispatchSettingsQueryKey(routeProject.id, kind),
    queryFn: () => getProjectDispatchSettings({ data: { projectId: routeProject.id, kind } }),
    enabled: integration !== null,
  })

  const title = (
    <div className="flex min-w-0 flex-row items-center gap-2">
      <Tooltip
        asChild
        side="bottom"
        trigger={
          <Button asChild variant="ghost" className="h-7 w-7 p-0" aria-label="Back to global integrations">
            <Link to="/projects/$projectSlug/settings/global-integrations" params={{ projectSlug }}>
              <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
            </Link>
          </Button>
        }
      >
        Back to global integrations
      </Tooltip>
      <Icon icon={AGENT_DISPATCH_KIND_ICONS[kind]} />
      <Text.H3M>{AGENT_DISPATCH_KIND_LABELS[kind]}</Text.H3M>
    </div>
  )

  if (integrationsLoading) {
    return (
      <SettingsPage title={title} description="Connection and organization-wide default dispatch behavior.">
        <Skeleton className="h-32 w-full" />
      </SettingsPage>
    )
  }

  if (!integration) {
    return (
      <SettingsPage title={title} description="Connection and organization-wide default dispatch behavior.">
        <Alert
          variant="default"
          showIcon
          title={`${AGENT_DISPATCH_KIND_LABELS[kind]} is not connected`}
          description="Connect it from Global integrations to configure its organization-wide default."
          cta={
            <Button asChild variant="outline">
              <Link to="/projects/$projectSlug/settings/global-integrations" params={{ projectSlug }}>
                Back to global integrations
              </Link>
            </Button>
          }
        />
      </SettingsPage>
    )
  }

  return (
    <SettingsPage title={title} description="Connection and organization-wide default dispatch behavior.">
      <div className="flex w-full flex-col gap-6">
        <DispatchConnectionSection
          kind={kind}
          integration={integration}
          projectId={routeProject.id}
          projectSlug={projectSlug}
          canDisconnect
        />
        {settingsLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <OrgDispatchDefaultCard
            kind={kind}
            integrationId={integration.id}
            vendorAccountId={integration.vendorAccountId}
            projectCount={projectCount}
            overrideCount={settings?.overrideCount ?? 0}
            canEdit={isOwner}
          />
        )}
      </div>
    </SettingsPage>
  )
}
