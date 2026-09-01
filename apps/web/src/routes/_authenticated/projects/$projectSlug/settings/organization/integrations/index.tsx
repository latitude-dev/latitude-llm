import { Skeleton, Text, useMountEffect, useToast } from "@repo/ui"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import {
  type AgentDispatchKindKey,
  isAgentDispatchKind,
} from "../../../../../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import { useConnectedIntegrations } from "../../../../../../../domains/integrations/connected-integrations.ts"
import type { IntegrationKey } from "../../../../../../../domains/integrations/integration-catalog.ts"
import { useRouteProject } from "../../../-route-data.ts"
import { ConnectAgentDispatchModal } from "../../-components/agent-dispatch-section.tsx"
import { AvailableIntegrations } from "../../-components/available-integrations.tsx"
import { IntegrationRow } from "../../-components/integration-row.tsx"
import { SettingsPage } from "../../-components/settings-page.tsx"

const searchSchema = z.object({
  installed: z.literal("ok").optional(),
  error: z.string().optional(),
  githubInstalled: z.literal("ok").optional(),
  githubPending: z.literal("approval").optional(),
  githubError: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/organization/integrations/")({
  validateSearch: searchSchema,
  component: GlobalIntegrationsPage,
})

/**
 * Where an integration is connected, disconnected, and browsed from — the connection
 * is shared by every project, so this is the one place for it, distinct from a
 * project's own Integrations tab (which only configures that project).
 */
function GlobalIntegrationsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const search = Route.useSearch()
  const { projectSlug } = Route.useParams()
  const routeProject = useRouteProject()
  const [connectingKind, setConnectingKind] = useState<AgentDispatchKindKey | null>(null)
  const { connected, available, isLoading } = useConnectedIntegrations()

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

  const connectedKeys = new Set(connected.map((row) => row.entry.key))
  const unconnected = available.filter((key) => !connectedKeys.has(key))
  const openConnect = (key: IntegrationKey) => {
    if (!isAgentDispatchKind(key)) return
    setConnectingKind(key)
  }

  return (
    <SettingsPage title="Integrations" description="Connect Latitude to the tools your team already uses.">
      <div className="flex w-full flex-col gap-8">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            {connected.length > 0 ? (
              <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
                {connected.map((integration) => (
                  <IntegrationRow
                    key={integration.entry.key}
                    integration={integration}
                    projectSlug={projectSlug}
                    scope="organization"
                  />
                ))}
              </div>
            ) : null}

            {unconnected.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Text.H6M color="foregroundMuted">{connected.length > 0 ? "Available" : "Get started"}</Text.H6M>
                <AvailableIntegrations available={unconnected} onConnectDispatchKind={openConnect} />
              </div>
            ) : null}
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
