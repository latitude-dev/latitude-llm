import { SLACK_FLAG } from "@domain/feature-flags"
import { NOTIFICATION_GROUP_META, NOTIFICATION_GROUPS, type NotificationGroup } from "@domain/shared"
import {
  Button,
  Combobox,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  Icon,
  Modal,
  SlackIcon,
  Text,
  useMountEffect,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Loader2, Search, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { z } from "zod"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import {
  configureSlackRoute,
  disconnectSlackIntegration,
  getActiveSlackIntegration,
  listSlackChannels,
  removeSlackRoute,
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
const CHANNELS_QUERY_KEY = ["slack-channels"] as const

type ChannelOption = { readonly id: string; readonly name: string }
const DON_T_SEND: ChannelOption = { id: "", name: "Don't send" }

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/integrations")({
  validateSearch: searchSchema,
  component: IntegrationsSettingsPage,
})

function IntegrationsSettingsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const search = Route.useSearch()

  const slackEnabled = useHasFeatureFlag(SLACK_FLAG)

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
  return (
    <IntegrationCard
      icon={SlackIcon}
      title="Slack"
      subtitle="Send Latitude notifications to your Slack workspace."
      actions={
        <Button
          onClick={() => {
            window.location.href = "/integrations/slack/install"
          }}
        >
          Connect Slack
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

function SlackRouteRow({ group, integration }: { group: NotificationGroup; integration: SlackIntegrationRecord }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const meta = NOTIFICATION_GROUP_META[group]
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [inputValue, setInputValue] = useState("")

  const {
    data: rawChannels = [],
    isFetching,
    refetch,
  } = useQuery({
    queryKey: CHANNELS_QUERY_KEY,
    queryFn: () => listSlackChannels(),
    staleTime: 30_000,
  })

  const channels: readonly ChannelOption[] = rawChannels.map((c) => ({ id: c.id, name: c.name }))
  const allOptions: readonly ChannelOption[] = [DON_T_SEND, ...channels]

  // Use the stored channelName from the integration record so the trigger
  // shows the correct label immediately, before channels finish loading.
  const currentRoute = integration.routes[group]?.[0]
  const selected: ChannelOption = currentRoute
    ? { id: currentRoute.channelId, name: currentRoute.channelName }
    : DON_T_SEND

  const mutation = useMutation({
    mutationFn: (option: ChannelOption) => {
      if (option.id === "") return removeSlackRoute({ data: { group } })
      return configureSlackRoute({ data: { group, routes: [{ channelId: option.id, channelName: option.name }] } })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SLACK_QUERY_KEY }),
    onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
  })

  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <Text.H5 color="foregroundMuted">{meta.label}</Text.H5>
      <div className="w-52 shrink-0">
        <Combobox
          modal
          value={selected}
          onValueChange={(picked) => {
            setInputValue("")
            void mutation.mutateAsync(picked ?? DON_T_SEND)
          }}
          items={allOptions}
          itemToStringValue={(item: ChannelOption) => (item.id === "" ? "Don't send" : `#${item.name}`)}
          isItemEqualToValue={(a: ChannelOption, b: ChannelOption) => a.id === b.id}
          onOpenChange={(open) => {
            if (open) void refetch()
          }}
          disabled={mutation.isPending}
        >
          <Button asChild variant="outline" size="sm" disabled={mutation.isPending} className="w-full justify-between">
            <ComboboxTrigger ref={triggerRef}>
              {selected.id === "" ? (
                <Text.H5 color="foregroundMuted">Don't send</Text.H5>
              ) : (
                <Text.H5>#{selected.name}</Text.H5>
              )}
            </ComboboxTrigger>
          </Button>
          <ComboboxContent anchor={triggerRef} className="w-64">
            <div className="flex items-center gap-2 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <ComboboxChipsInput
                placeholder="Search channels…"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground"
              />
              {isFetching ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
            <ComboboxSeparator />
            <ComboboxList>
              {(item: ChannelOption) => (
                <ComboboxItem value={item}>
                  {item.id === "" ? (
                    <Text.H5 color="foregroundMuted">Don't send</Text.H5>
                  ) : (
                    <Text.H5>#{item.name}</Text.H5>
                  )}
                </ComboboxItem>
              )}
            </ComboboxList>
            <ComboboxEmpty>No channels found.</ComboboxEmpty>
          </ComboboxContent>
        </Combobox>
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
