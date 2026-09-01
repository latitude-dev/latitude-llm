import { relativeTime } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import {
  AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
  type AgentDispatchIntegrationRecord,
  listAgentDispatchIntegrations,
} from "../agent-dispatch/agent-dispatch.functions.ts"
import {
  GITHUB_CONFIGURED_QUERY_KEY,
  GITHUB_INTEGRATION_QUERY_KEY,
  getActiveGithubIntegration,
  isGithubIntegrationConfigured,
} from "../github/github.functions.ts"
import {
  type ConnectedIntegration,
  type IntegrationKey,
  integrationEntry,
  sortConnectedIntegrations,
} from "./integration-catalog.ts"
import {
  getActiveSlackIntegration,
  isSlackConfigured,
  SLACK_CONFIGURED_QUERY_KEY,
  SLACK_INTEGRATION_QUERY_KEY,
} from "./integrations.functions.ts"

interface ConnectedIntegrations {
  readonly connected: readonly ConnectedIntegration[]
  /** Every integration this deployment can offer, connected or not. */
  readonly available: readonly IntegrationKey[]
  readonly isLoading: boolean
}

/**
 * The organization's integration connections, flattened into catalog rows. Shared by
 * the organization and project Integrations tabs so the two can never disagree about
 * what is connected.
 */
export function useConnectedIntegrations(): ConnectedIntegrations {
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

  const connected = sortConnectedIntegrations([
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
  ])

  return {
    connected,
    available,
    isLoading:
      slackConfigured === undefined ||
      githubConfigured === undefined ||
      slackLoading ||
      githubLoading ||
      dispatchLoading,
  }
}
