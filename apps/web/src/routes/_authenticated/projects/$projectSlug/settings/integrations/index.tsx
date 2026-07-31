import { Button, Icon, Skeleton, Text, useMountEffect, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
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
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { useRouteProject } from "../../-route-data.ts"
import {
  AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
  ConnectAgentDispatchModal,
} from "../-components/agent-dispatch-section.tsx"
import { IntegrationCatalog, IntegrationCatalogModal } from "../-components/integration-catalog.tsx"
import { IntegrationRow } from "../-components/integration-row.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"
import { SLACK_INTEGRATION_QUERY_KEY } from "../-components/slack-route-row.tsx"

const searchSchema = z.object({
  installed: z.literal("ok").optional(),
  error: z.string().optional(),
  githubInstalled: z.literal("ok").optional(),
  githubPending: z.literal("approval").optional(),
  githubError: z.string().optional(),
})

const GITHUB_CONFIGURED_QUERY_KEY = ["github-integration", "configured"] as const
const SLACK_CONFIGURED_QUERY_KEY = ["slack-integration", "configured"] as const

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/integrations/")({
  validateSearch: searchSchema,
  component: IntegrationsSettingsPage,
})

function IntegrationsSettingsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const search = Route.useSearch()
  const { projectSlug } = Route.useParams()
  const routeProject = useRouteProject()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )
  const currentProject = project ?? routeProject

  const [catalogOpen, setCatalogOpen] = useState(false)
  const [connectingKind, setConnectingKind] = useState<AgentDispatchKindKey | null>(null)

  useMountEffect(() => {
    if (search.installed === "ok") {
      toast({ description: "Slack connected" })
    } else if (search.error === "workspace_taken") {
      toast({
        variant: "destructive",
        description: "This Slack workspace is already connected to another Latitude organization.",
      })
    } else if (search.error === "oauth_failed") {
      toast({
        variant: "destructive",
        description: "Couldn't complete the Slack install. Please try again.",
      })
    }
    if (search.githubInstalled === "ok") {
      toast({ description: "GitHub connected" })
    } else if (search.githubPending === "approval") {
      toast({
        variant: "warning",
        description:
          "GitHub installation needs approval from an organization admin. Once approved, connect again to finish.",
      })
    } else if (search.githubError === "installation_taken") {
      toast({
        variant: "destructive",
        description: "This GitHub installation is already connected to another Latitude organization.",
      })
    } else if (search.githubError === "verification_failed") {
      toast({
        variant: "destructive",
        description: "Couldn't verify the GitHub installation. Please start the install from Latitude and try again.",
      })
    } else if (search.githubError === "oauth_failed") {
      toast({ variant: "destructive", description: "Couldn't complete the GitHub install. Please try again." })
    }
    if (search.installed || search.error || search.githubInstalled || search.githubPending || search.githubError) {
      void router.navigate({ to: Route.fullPath, search: {}, replace: true })
    }
  })

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
  // so they never reach the catalog.
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
    setCatalogOpen(false)
    setConnectingKind(key)
  }

  return (
    <SettingsPage
      title="Integrations"
      description="Connect Latitude to the tools your team already uses."
      actions={
        connected.length > 0 ? (
          <Button onClick={() => setCatalogOpen(true)}>
            <Icon icon={Plus} size="sm" />
            Add integration
          </Button>
        ) : null
      }
    >
      <div className="flex w-full flex-col gap-6 @[900px]:w-2/3">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : connected.length === 0 ? (
          <div className="flex flex-col gap-4">
            <Text.H6 color="foregroundMuted">No integrations connected yet. Pick one to get started.</Text.H6>
            <IntegrationCatalog available={available} connected={connectedKeys} onConnectDispatchKind={openConnect} />
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
            {connected.map((integration) => (
              <IntegrationRow key={integration.entry.key} integration={integration} projectSlug={projectSlug} />
            ))}
          </div>
        )}
      </div>

      {catalogOpen ? (
        <IntegrationCatalogModal
          available={available}
          connected={connectedKeys}
          onConnectDispatchKind={openConnect}
          onClose={() => setCatalogOpen(false)}
        />
      ) : null}

      {connectingKind ? (
        <ConnectAgentDispatchModal
          kind={connectingKind}
          projectId={currentProject.id}
          open
          onClose={() => setConnectingKind(null)}
          onWebhookSecret={() => undefined}
        />
      ) : null}
    </SettingsPage>
  )
}
