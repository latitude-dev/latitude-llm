import { Button, Skeleton, Text } from "@repo/ui"
import { useQueries, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  getProjectDispatchSettings,
  projectDispatchSettingsQueryKey,
} from "../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import {
  type AgentDispatchKindKey,
  isAgentDispatchKind,
} from "../../../../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import {
  getGithubProjectConfig,
  githubProjectConfigQueryKey,
} from "../../../../../../domains/github/github.functions.ts"
import { useConnectedIntegrations } from "../../../../../../domains/integrations/connected-integrations.ts"
import {
  type ConnectedIntegration,
  hasProjectSettings,
} from "../../../../../../domains/integrations/integration-catalog.ts"
import { useRouteProject } from "../../-route-data.ts"
import { IntegrationRow } from "../-components/integration-row.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/integrations/")({
  component: IntegrationsSettingsPage,
})

const FOLLOWS_ORGANIZATION = "Following the organization default"
const OVERRIDES_ORGANIZATION = "Overrides the organization default"

/**
 * This project's half of the split: what each connected integration does *here*.
 * Connecting and disconnecting are organization-wide and live on the organization's
 * own Integrations tab, which is also why Slack — org-wide only — has no row.
 */
function IntegrationsSettingsPage() {
  const { projectSlug } = Route.useParams()
  const routeProject = useRouteProject()
  const { connected, isLoading } = useConnectedIntegrations()

  const configurable = connected.filter((integration) => hasProjectSettings(integration.entry.key))
  const dispatchKinds = configurable
    .map((integration) => integration.entry.key)
    .filter((key): key is AgentDispatchKindKey => isAgentDispatchKind(key))

  const dispatchSettings = useQueries({
    queries: dispatchKinds.map((kind) => ({
      queryKey: projectDispatchSettingsQueryKey(routeProject.id, kind),
      queryFn: () => getProjectDispatchSettings({ data: { projectId: routeProject.id, kind } }),
    })),
  })
  const { data: githubConfig } = useQuery({
    queryKey: githubProjectConfigQueryKey(routeProject.id),
    queryFn: () => getGithubProjectConfig({ data: { projectId: routeProject.id } }),
    enabled: configurable.some((integration) => integration.entry.key === "github"),
  })

  const scopeDetail = (key: ConnectedIntegration["entry"]["key"]): string | null => {
    if (key === "github") {
      if (!githubConfig) return null
      return githubConfig.hasBehaviorOverride ? OVERRIDES_ORGANIZATION : FOLLOWS_ORGANIZATION
    }
    const index = dispatchKinds.indexOf(key as AgentDispatchKindKey)
    const settings = index === -1 ? undefined : dispatchSettings[index]?.data
    if (!settings) return null
    return settings.override ? OVERRIDES_ORGANIZATION : FOLLOWS_ORGANIZATION
  }

  const rows: ConnectedIntegration[] = configurable.map((integration) => ({
    ...integration,
    detail: scopeDetail(integration.entry.key) ?? integration.detail,
  }))

  return (
    <SettingsPage title="Integrations" description="Connect Latitude to the tools your team already uses.">
      <div className="flex w-full flex-col gap-8">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
              {rows.map((integration) => (
                <IntegrationRow
                  key={integration.entry.key}
                  integration={integration}
                  projectSlug={projectSlug}
                  scope="project"
                />
              ))}
            </div>
            <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Text.H6 color="foregroundMuted">
                Connections, and the defaults these settings inherit, are organization-wide.
              </Text.H6>
              <Button asChild variant="ghost">
                <Link to="/projects/$projectSlug/settings/organization/integrations" params={{ projectSlug }}>
                  Manage for the organization →
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
            <Text.H5M>No integrations to configure yet</Text.H5M>
            <Text.H6 color="foregroundMuted">
              Integrations are connected once for the whole organization. Connect one, then come back to tune it for
              this project.
            </Text.H6>
            <Button asChild variant="outline">
              <Link to="/projects/$projectSlug/settings/organization/integrations" params={{ projectSlug }}>
                Manage for the organization
              </Link>
            </Button>
          </div>
        )}
      </div>
    </SettingsPage>
  )
}
