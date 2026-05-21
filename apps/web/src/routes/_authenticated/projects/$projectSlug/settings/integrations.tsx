import { SLACK_FLAG } from "@domain/feature-flags"
import { Badge, Button, Icon, Modal, Text, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Hash, Loader2, Trash2, Unplug } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { hasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.functions.ts"
import {
  disconnectSlackIntegration,
  getActiveSlackIntegration,
  type SlackIntegrationRecord,
} from "../../../../../domains/integrations/integrations.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
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

  // Mirrors `NotificationsSection` in account.tsx — hide the entire
  // page when the org doesn't have the integration enabled. The
  // sub-nav entry is also flag-gated; this guards deep links.
  const { data: slackEnabled = false, isLoading: flagLoading } = useQuery({
    queryKey: ["feature-flag", SLACK_FLAG],
    queryFn: () => hasFeatureFlag({ data: { identifier: SLACK_FLAG } }),
  })

  // Flash effect: surface the install / error status from the callback
  // redirect, then strip the params so a refresh doesn't re-toast.
  useEffect(() => {
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
  }, [search.installed, search.error, toast, router])

  if (flagLoading) return null
  if (!slackEnabled) {
    return (
      <SettingsPage title="Integrations" description="Connect external tools to your Latitude organization.">
        <div className="rounded-lg border border-border bg-muted/30 p-6">
          <Text.H5 color="foregroundMuted">
            Integrations aren't enabled for your organization yet. Reach out to support to turn them on.
          </Text.H5>
        </div>
      </SettingsPage>
    )
  }

  return (
    <SettingsPage title="Integrations" description="Connect external tools to your Latitude organization.">
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

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text.H5 weight="semibold">Slack</Text.H5>
        <Text.H5 color="foregroundMuted">
          Send Latitude notifications to your Slack workspace. Configure which channels receive each kind of alert from
          the notifications settings.
        </Text.H5>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-6">
        {isLoading ? (
          <Text.H5 color="foregroundMuted">Loading…</Text.H5>
        ) : data ? (
          <ConnectedSlackCard integration={data} onDisconnect={() => setDisconnectOpen(true)} />
        ) : (
          <DisconnectedSlackCard />
        )}
      </div>
      {data ? <DisconnectSlackModal open={disconnectOpen} onClose={() => setDisconnectOpen(false)} /> : null}
    </section>
  )
}

function DisconnectedSlackCard() {
  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <div className="flex flex-row items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background">
          <Icon icon={Hash} />
        </div>
        <div className="flex flex-col gap-1">
          <Text.H5 weight="semibold">Slack</Text.H5>
          <Text.H6 color="foregroundMuted">Not connected</Text.H6>
        </div>
      </div>
      <Button asChild>
        <a href="/integrations/slack/install">Connect Slack</a>
      </Button>
    </div>
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-row items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background">
            <Icon icon={Hash} />
          </div>
          <div className="flex flex-col gap-1">
            <Text.H5 weight="semibold">{integration.teamName}</Text.H5>
            <Text.H6 color="foregroundMuted">
              Connected {relativeTime(new Date(integration.installedAt))} · {integration.teamId}
            </Text.H6>
          </div>
        </div>
        <Button variant="outline" onClick={onDisconnect}>
          <Icon icon={Unplug} />
          Disconnect
        </Button>
      </div>
      {integration.botTokenScopes.length > 0 ? (
        <div className="flex flex-row flex-wrap gap-2">
          {integration.botTokenScopes.map((scope) => (
            <Badge key={scope} variant="muted">
              {scope}
            </Badge>
          ))}
        </div>
      ) : null}
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
            <Text.H5>Cancel</Text.H5>
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={disconnecting}>
            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            <Text.H5 color="white">{disconnecting ? "Disconnecting…" : "Disconnect Slack"}</Text.H5>
          </Button>
        </div>
      }
    />
  )
}
