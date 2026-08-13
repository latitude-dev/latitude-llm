import { Skeleton, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  type AgentDispatchIntegrationRecord,
  listAgentDispatchIntegrations,
} from "../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import {
  type AgentDispatchKindKey,
  isAgentDispatchKind,
} from "../../../../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import {
  GITHUB_INTEGRATION_QUERY_KEY,
  getActiveGithubIntegration,
  isGithubIntegrationConfigured,
} from "../../../../../../domains/github/github.functions.ts"
import {
  type ConnectedIntegration,
  type IntegrationKey,
  integrationEntry,
  sortConnectedIntegrations,
} from "../../../../../../domains/integrations/integration-catalog.ts"
import {
  getActiveSlackIntegration,
  isSlackConfigured,
} from "../../../../../../domains/integrations/integrations.functions.ts"
import { useRouteProject } from "../../-route-data.ts"
import {
  AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
  ConnectAgentDispatchModal,
} from "../-components/agent-dispatch-section.tsx"
import { AvailableIntegrations } from "../-components/available-integrations.tsx"
import { IntegrationRow } from "../-components/integration-row.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"
import { SLACK_INTEGRATION_QUERY_KEY } from "../-components/slack-route-row.tsx"

const GITHUB_CONFIGURED_QUERY_KEY = ["github-integration", "configured"] as const
const SLACK_CONFIGURED_QUERY_KEY = ["slack-integration", "configured"] as const

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/global-integrations/")({
  component: GlobalIntegrationsPage,
})

/**
 * Where an org-wide integration is connected, disconnected, and browsed from —
 * the connection itself is shared by every project, so this is the one place
 * for it, distinct from a project's own Integrations tab (which only shows
 * status and links back here for anything org-wide).
 */
function GlobalIntegrationsPage() {
  const { projectSlug } = Route.useParams()
  const routeProject = useRouteProject()
  const [connectingKind, setConnectingKind] = useState<AgentDispatchKindKey | null>(null)

  const { data: slackConfigured } = useQuery({
    queryKey: SLACK_CONFIGURED_QUERY_KEY,
    queryFn: () => isSlackConfigured(),
  })
  const { data: githubConfigured } = useQuery({
    queryKey: GITHUB_CONFIGURED_QUERY_KEY,
    queryFn: () => isGithubIntegrationConfigured(),
  })
  const { data: slack, isLoading: slackLoading } = useQuery({
    queryKey: SLACK_INTEGRATION_QUERY_KEY,
    queryFn: () => getActiveSlackIntegration(),
    enabled: slackConfigured === true,
  })
  const { data: github, isLoading: githubLoading } = useQuery({
    queryKey: GITHUB_INTEGRATION_QUERY_KEY,
    queryFn: () => getActiveGithubIntegration(),
    enabled: githubConfigured === true,
  })
  const { data: dispatchIntegrations = [], isLoading: dispatchLoading } = useQuery({
    queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
    queryFn: () => listAgentDispatchIntegrations(),
  })

  const isLoading =
    slackConfigured === undefined || githubConfigured === undefined || slackLoading || githubLoading || dispatchLoading

  // A deployment without the Slack or GitHub app configured can't connect them at all,
  // so they are never offered.
  const available: IntegrationKey[] = [
    ...(slackConfigured === true ? (["slack"] as const) : []),
    ...(githubConfigured === true ? (["github"] as const) : []),
    "cursor",
    "claude_code",
    "linear",
    "webhook",
  ]

  const connectedRows: ConnectedIntegration[] = [
    ...(slack
      ? [
          {
            entry: integrationEntry("slack"),
            identity: slack.teamName,
            detail: `Connected ${relativeTime(new Date(slack.installedAt))}`,
            needsAttention: slack.needsReconnect,
            attentionLabel: slack.needsReconnect ? "Reconnect needed" : undefined,
          },
        ]
      : []),
    ...(github
      ? [
          {
            entry: integrationEntry("github"),
            identity: github.accountLogin,
            detail: `${github.repositorySelection === "all" ? "All repositories" : "Selected repositories"} · Connected ${relativeTime(new Date(github.installedAt))}`,
            needsAttention: github.suspendedAt !== null,
            attentionLabel: github.suspendedAt !== null ? "Suspended" : undefined,
          },
        ]
      : []),
    ...dispatchIntegrations.map((integration: AgentDispatchIntegrationRecord) => ({
      entry: integrationEntry(integration.kind),
      identity: integration.vendorAccountId,
      detail: `Connected ${relativeTime(new Date(integration.installedAt))}`,
      needsAttention: false,
    })),
  ]

  const connected = sortConnectedIntegrations(connectedRows)
  const connectedKeys = new Set(connected.map((row) => row.entry.key))
  const openConnect = (key: IntegrationKey) => {
    if (!isAgentDispatchKind(key)) return
    setConnectingKind(key)
  }

  return (
    <SettingsPage
      title="Global integrations"
      description="Connections shared by every project, and their organization-wide default behavior."
    >
      <div className="flex w-full flex-col gap-8">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            {connected.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Text.H6M color="foregroundMuted">Connected</Text.H6M>
                <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {connected.map((integration) => (
                    <IntegrationRow
                      key={integration.entry.key}
                      integration={integration}
                      projectSlug={projectSlug}
                      toGlobalIntegrations
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <Text.H6M color="foregroundMuted">{connected.length > 0 ? "Available" : "Get started"}</Text.H6M>
              <AvailableIntegrations
                available={available}
                connected={connectedKeys}
                onConnectDispatchKind={openConnect}
              />
            </div>
          </>
        )}
      </div>

      {connectingKind ? (
        <ConnectAgentDispatchModal
          kind={connectingKind}
          projectId={routeProject.id}
          open
          onClose={() => setConnectingKind(null)}
          onWebhookSecret={() => undefined}
        />
      ) : null}
    </SettingsPage>
  )
}
