import { SLACK_ROUTABLE_NOTIFICATION_GROUPS } from "@domain/shared"
import { Alert, Button, Icon, Modal, Skeleton, SlackIcon, Text, Tooltip, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon, Trash2 } from "lucide-react"
import { useState } from "react"
import {
  disconnectSlackIntegration,
  getActiveSlackIntegration,
  type SlackIntegrationRecord,
} from "../../../../../../domains/integrations/integrations.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { ScopedSetting } from "../-components/scoped-setting.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"
import { SLACK_INTEGRATION_QUERY_KEY, SlackRouteRow } from "../-components/slack-route-row.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/integrations/slack")({
  component: SlackIntegrationPage,
})

function SlackIntegrationPage() {
  const { projectSlug } = Route.useParams()
  const { data, isLoading } = useQuery({
    queryKey: SLACK_INTEGRATION_QUERY_KEY,
    queryFn: () => getActiveSlackIntegration(),
  })

  return (
    <SettingsPage
      title={
        <div className="flex min-w-0 flex-row items-center gap-2">
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <Button asChild variant="ghost" className="h-7 w-7 p-0" aria-label="Back to integrations">
                <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
                  <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                </Link>
              </Button>
            }
          >
            Back to integrations
          </Tooltip>
          <Icon icon={SlackIcon} />
          <Text.H3M>Slack</Text.H3M>
        </div>
      }
      description="Connection and notification routing for the Slack workspace."
    >
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : data ? (
        <SlackIntegrationDetails integration={data} />
      ) : (
        <Alert
          variant="default"
          showIcon
          title="Slack is not connected"
          description="Connect Slack from the integrations page to configure it."
          cta={
            <Button asChild variant="outline">
              <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
                Back to integrations
              </Link>
            </Button>
          }
        />
      )}
    </SettingsPage>
  )
}

function SlackIntegrationDetails({ integration }: { readonly integration: SlackIntegrationRecord }) {
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  return (
    <div className="flex w-full flex-col gap-6 @[900px]:w-2/3">
      {/* Should never appear while on-use refresh is healthy; when it does, the rotation
          chain is broken (refresh token revoked) and the workspace must be reconnected. */}
      {integration.needsReconnect ? (
        <Alert
          variant="destructive"
          showIcon
          title="Slack connection expired"
          description="We couldn't refresh the Slack token. Reconnect to restore notifications."
          cta={
            <Button asChild variant="destructive">
              <a href="/integrations/slack/install">Reconnect</a>
            </Button>
          }
        />
      ) : null}

      <ScopedSetting
        idPrefix="slack-connection"
        title="Connection"
        description="Shared by every project in your organization."
        scope={{ kind: "fixed", value: "organization" }}
      >
        <div className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text.H5 weight="semibold">{integration.teamName}</Text.H5>
            <Text.H6 color="foregroundMuted">Connected {relativeTime(new Date(integration.installedAt))}</Text.H6>
          </div>
          <Button variant="destructive" onClick={() => setDisconnectOpen(true)}>
            Disconnect
          </Button>
        </div>
      </ScopedSetting>

      <ScopedSetting
        idPrefix="slack-notifications"
        title="Notifications"
        description="Which Slack channel each notification group goes to."
        scope={{ kind: "fixed", value: "organization" }}
      >
        <div className="flex w-full flex-col gap-1">
          {SLACK_ROUTABLE_NOTIFICATION_GROUPS.map((group) => (
            <SlackRouteRow key={group} group={group} integration={integration} />
          ))}
        </div>
      </ScopedSetting>

      {disconnectOpen ? <DisconnectSlackModal onClose={() => setDisconnectOpen(false)} /> : null}
    </div>
  )
}

function DisconnectSlackModal({ onClose }: { readonly onClose: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [disconnecting, setDisconnecting] = useState(false)

  const mutation = useMutation({ mutationFn: () => disconnectSlackIntegration() })

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
      open
      dismissible
      onOpenChange={(value) => {
        if (!value && !disconnecting) onClose()
      }}
      title="Disconnect Slack"
      description="Disconnecting will stop all Latitude notifications to this Slack workspace and revoke the bot token. Channel routing will be reset if you reconnect. This affects every project in the organization."
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
            <Icon icon={Trash2} size="sm" />
            {disconnecting ? "Disconnecting…" : "Disconnect Slack"}
          </Button>
        </div>
      }
    />
  )
}
