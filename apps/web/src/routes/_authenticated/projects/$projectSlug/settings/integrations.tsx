import { SLACK_FLAG } from "@domain/feature-flags"
import { Button, Modal, SlackIcon, Text, useMountEffect, useToast } from "@repo/ui"
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

const searchSchema = z.object({
  installed: z.literal("ok").optional(),
  error: z.enum(["workspace_taken", "oauth_failed"]).optional(),
})

const SLACK_QUERY_KEY = ["slack-integration"] as const

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/integrations")({
  validateSearch: searchSchema,
  component: IntegrationsSettingsPage,
})

function IntegrationsSettingsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const search = Route.useSearch()

  // The sub-nav entry is also flag-gated; this guards deep links.
  const slackEnabled = useHasFeatureFlag(SLACK_FLAG)

  // Surface the install/error status from the callback redirect, then
  // strip the params. Reads `search` once on mount (the callback lands
  // here via a full-page nav so subsequent search changes are our own
  // clean-up navigate, not new flashes to handle).
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
    queryKey: SLACK_QUERY_KEY,
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
  // The route returns a 302 to Slack's authorize URL; a full-page nav
  // is the right interaction (TanStack `<Link>` only navigates within
  // the router's known routes, and `<a href>` inside `<Button asChild>`
  // ends up stretching to fill the flex parent on a single-row card).
  const handleConnect = () => {
    window.location.href = "/integrations/slack/install"
  }

  return (
    <IntegrationCard
      icon={SlackIcon}
      title="Slack"
      subtitle="Send Latitude notifications to your Slack workspace."
      actions={<Button onClick={handleConnect}>Connect Slack</Button>}
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
    <IntegrationCard
      icon={SlackIcon}
      title={integration.teamName}
      subtitle={`Connected ${relativeTime(new Date(integration.installedAt))}`}
      actions={
        <Button variant="outline" onClick={onDisconnect}>
          Disconnect
        </Button>
      }
    />
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
      await queryClient.invalidateQueries({ queryKey: SLACK_QUERY_KEY })
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
      description="Disconnecting will stop all Latitude notifications to this Slack workspace and revoke the bot token. Channel routing you configure later will be restored if you reconnect the same workspace."
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
