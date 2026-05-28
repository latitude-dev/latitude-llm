import { NOTIFICATION_GROUPS } from "@domain/shared"
import { Button, Icon, Modal, SlackIcon, Text, useMountEffect, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import {
  disconnectSlackIntegration,
  getActiveSlackIntegration,
  type SlackIntegrationRecord,
} from "../../../../../domains/integrations/integrations.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { IntegrationCard } from "./-components/integration-card.tsx"
import { SettingsPage } from "./-components/settings-page.tsx"
import { SLACK_INTEGRATION_QUERY_KEY, SlackRouteRow } from "./-components/slack-route-row.tsx"

const searchSchema = z.object({
  installed: z.literal("ok").optional(),
  error: z.enum(["workspace_taken", "oauth_failed"]).optional(),
})

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/integrations")({
  validateSearch: searchSchema,
  component: IntegrationsSettingsPage,
})

function IntegrationsSettingsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const search = Route.useSearch()

  const slackEnabled = useHasFeatureFlag("slack")

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
    if (search.installed || search.error) {
      void router.navigate({ to: Route.fullPath, search: {}, replace: true })
    }
  })

  if (!slackEnabled) {
    return (
      <SettingsPage title="Integrations" description="Connect Latitude to the tools your team already uses.">
        <div className="rounded-lg border border-border bg-muted/30 p-6">
          <Text.H5 color="foregroundMuted">
            Integrations aren't enabled for your organization yet. Reach out to support to turn them on.
          </Text.H5>
        </div>
      </SettingsPage>
    )
  }

  return (
    <SettingsPage title="Integrations" description="Connect Latitude to the tools your team already uses.">
      <SlackIntegrationSection />
    </SettingsPage>
  )
}

function SlackIntegrationSection() {
  const { data, isLoading } = useQuery({
    queryKey: SLACK_INTEGRATION_QUERY_KEY,
    queryFn: () => getActiveSlackIntegration(),
  })
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  if (isLoading) return null

  return (
    <>
      {data ? (
        <ConnectedSlackCard integration={data} onDisconnect={() => setDisconnectOpen(true)} />
      ) : (
        <DisconnectedSlackCard />
      )}
      {data ? <DisconnectSlackModal open={disconnectOpen} onClose={() => setDisconnectOpen(false)} /> : null}
    </>
  )
}

function DisconnectedSlackCard() {
  return (
    <IntegrationCard
      icon={SlackIcon}
      title="Slack"
      subtitle="Send Latitude notifications to your Slack workspace."
      actions={
        // `/integrations/slack/install` is a server-handler-only route
        // that 302s the browser to Slack — needs a full-page GET, not
        // client-side routing. Plain `<a>` (inside a `Button asChild`)
        // gives cmd/middle-click + copy-link affordances while keeping
        // the full-page nav.
        <Button asChild>
          <a href="/integrations/slack/install">Connect Slack</a>
        </Button>
      }
    />
  )
}

function ConnectedSlackCard({
  integration,
  onDisconnect,
}: {
  integration: SlackIntegrationRecord
  onDisconnect: () => void
}) {
  return (
    <div className="rounded-lg border border-border">
      {/* Identity row */}
      <div className="flex flex-row items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 flex-row items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon icon={SlackIcon} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text.H5 weight="semibold">{integration.teamName}</Text.H5>
            <Text.H6 color="foregroundMuted">Connected {relativeTime(new Date(integration.installedAt))}</Text.H6>
          </div>
        </div>
        <div className="shrink-0">
          <Button variant="outline" onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      </div>

      {/* Notification routing */}
      <div className="flex flex-col gap-3 border-t border-border p-4">
        <Text.H5 weight="semibold">Notifications</Text.H5>
        {NOTIFICATION_GROUPS.map((group) => (
          <SlackRouteRow key={group} group={group} integration={integration} />
        ))}
      </div>
    </div>
  )
}

function DisconnectSlackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [disconnecting, setDisconnecting] = useState(false)

  const mutation = useMutation({
    mutationFn: () => disconnectSlackIntegration(),
  })

  const handleConfirm = async () => {
    setDisconnecting(true)
    try {
      await mutation.mutateAsync()
      await queryClient.invalidateQueries({ queryKey: SLACK_INTEGRATION_QUERY_KEY })
      toast({ description: "Slack disconnected" })
      onClose()
    } catch (error) {
      setDisconnecting(false)
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!value && !disconnecting) onClose()
      }}
      title="Disconnect Slack"
      description="Disconnecting will stop all Latitude notifications to this Slack workspace and revoke the bot token. Channel routing will be reset if you reconnect."
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={disconnecting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={disconnecting}
            isLoading={disconnecting}
          >
            <Trash2 className="h-4 w-4" />
            {disconnecting ? "Disconnecting…" : "Disconnect Slack"}
          </Button>
        </div>
      }
    />
  )
}
