import { Skeleton } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import {
  AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
  type AgentDispatchIntegrationRecord,
  getProjectDispatchSettings,
  listAgentDispatchIntegrations,
  projectDispatchSettingsQueryKey,
} from "../../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import type { AgentDispatchKindKey } from "../../../../../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import {
  type IntegrationKey,
  integrationEntry,
  integrationKeyFromSlug,
} from "../../../../../../../domains/integrations/integration-catalog.ts"
import { useIsOrganizationOwner } from "../../../../../../../domains/members/members.collection.ts"
import { useProjectsCollection } from "../../../../../../../domains/projects/projects.collection.ts"
import { useAuthenticatedUser } from "../../../../../-route-data.ts"
import { useRouteProject } from "../../../-route-data.ts"
import { DispatchConnectionSection, OrgDispatchBehaviorSection } from "../../-components/agent-dispatch-section.tsx"
import { GithubOrgSettings } from "../../-components/github-org-settings.tsx"
import { IntegrationDetailHeader, IntegrationNotConnected } from "../../-components/integration-detail-header.tsx"
import { SettingsPage } from "../../-components/settings-page.tsx"
import { SlackOrgSettings } from "../../-components/slack-org-settings.tsx"

export const Route = createFileRoute(
  "/_authenticated/projects/$projectSlug/settings/organization/integrations/$integrationSlug",
)({
  beforeLoad: ({ params }) => {
    if (!integrationKeyFromSlug(params.integrationSlug)) throw notFound()
  },
  component: OrganizationIntegrationDetailPage,
})

/** The organization's half of one integration: the shared connection, and the default projects inherit. */
function OrganizationIntegrationDetailPage() {
  const { projectSlug, integrationSlug: slug } = Route.useParams()
  const key = integrationKeyFromSlug(slug) as IntegrationKey

  const { data: allProjects } = useProjectsCollection()
  // The shared Showcase project is merged into this collection but isn't the org's.
  const projectCount = (allProjects ?? []).filter((row) => !row.isShowcase).length

  return (
    <SettingsPage
      title={<IntegrationDetailHeader entry={integrationEntry(key)} projectSlug={projectSlug} scope="organization" />}
      description="Connection and organization-wide defaults, shared by every project."
    >
      {key === "slack" ? (
        <SlackOrgSettings projectSlug={projectSlug} />
      ) : key === "github" ? (
        <GithubOrgSettings projectSlug={projectSlug} projectCount={projectCount} />
      ) : (
        <DispatchOrgSettings kind={key} projectSlug={projectSlug} projectCount={projectCount} />
      )}
    </SettingsPage>
  )
}

function DispatchOrgSettings({
  kind,
  projectSlug,
  projectCount,
}: {
  readonly kind: AgentDispatchKindKey
  readonly projectSlug: string
  readonly projectCount: number
}) {
  const routeProject = useRouteProject()
  const user = useAuthenticatedUser()
  const isOwner = useIsOrganizationOwner(user.id)

  const { data: integrations = [], isLoading: integrationsLoading } = useQuery({
    queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
    queryFn: () => listAgentDispatchIntegrations(),
  })
  const integration = integrations.find((row: AgentDispatchIntegrationRecord) => row.kind === kind) ?? null

  // Only for the override count in the blast radius; the config itself is the org default.
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: projectDispatchSettingsQueryKey(routeProject.id, kind),
    queryFn: () => getProjectDispatchSettings({ data: { projectId: routeProject.id, kind } }),
    enabled: integration !== null,
  })

  if (integrationsLoading) return <Skeleton className="h-32 w-full" />
  if (!integration) return <IntegrationNotConnected entry={integrationEntry(kind)} projectSlug={projectSlug} />

  return (
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
        <OrgDispatchBehaviorSection
          kind={kind}
          integrationId={integration.id}
          vendorAccountId={integration.vendorAccountId}
          projectCount={projectCount}
          overrideCount={settings?.overrideCount ?? 0}
          canEdit={isOwner}
        />
      )}
    </div>
  )
}
