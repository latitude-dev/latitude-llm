import { NOTIFICATION_GROUP_META, NOTIFICATION_GROUPS, type NotificationGroup } from "@domain/shared"
import { Button, CheckboxInput, Icon, Input, Text, useToast } from "@repo/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, RefreshCw, Slash } from "lucide-react"
import { useMemo, useState } from "react"
import {
  configureSlackRoute,
  listSlackChannels,
  removeSlackRoute,
  type SlackIntegrationRecord,
} from "../../../../../../domains/integrations/integrations.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

const CHANNELS_QUERY_KEY = ["slack-channels"] as const
const INTEGRATION_QUERY_KEY = ["slack-integration"] as const

/**
 * Per-notification-group channel routing picker. Shown below the
 * connected card when a Slack integration is active.
 *
 * Slack delivery is **org-level** — each group's selected channels
 * receive every notification of that group regardless of which user
 * triggered it. Per-user prefs apply only to email / in-app.
 *
 * Routes live on `slack_integration_details.routes`; reinstalling Slack
 * starts with no routes (operator reconfigures each time).
 */
export function SlackRoutesSection({ integration }: { integration: SlackIntegrationRecord }) {
  const { data: channels = [], isLoading: channelsLoading, refetch: refetchChannels, isRefetching } = useQuery({
    queryKey: CHANNELS_QUERY_KEY,
    queryFn: () => listSlackChannels(),
    staleTime: 5 * 60_000,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-center justify-between gap-2">
        <Text.H4 weight="semibold">Notification routing</Text.H4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetchChannels()}
          disabled={isRefetching}
          isLoading={isRefetching}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh channels
        </Button>
      </div>
      <Text.H6 color="foregroundMuted">
        Don't see a private channel? Invite the bot to it in Slack first, then click <em>Refresh channels</em>.
      </Text.H6>

      {channelsLoading ? (
        <div className="flex flex-row items-center gap-2">
          <Icon icon={Loader2} className="animate-spin" />
          <Text.H6 color="foregroundMuted">Loading Slack channels…</Text.H6>
        </div>
      ) : (
        NOTIFICATION_GROUPS.map((group) => (
          <SlackRouteGroupBlock
            key={group}
            group={group}
            integration={integration}
            allChannels={channels}
          />
        ))
      )}
    </div>
  )
}

function SlackRouteGroupBlock({
  group,
  integration,
  allChannels,
}: {
  group: NotificationGroup
  integration: SlackIntegrationRecord
  allChannels: ReadonlyArray<{ id: string; name: string; isPrivate: boolean; isMember: boolean }>
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const meta = NOTIFICATION_GROUP_META[group]
  const currentRoutes = integration.routes[group] ?? []
  const selectedIds = useMemo(() => new Set(currentRoutes.map((r) => r.channelId)), [currentRoutes])
  const [filter, setFilter] = useState("")

  const filteredChannels = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return allChannels
    return allChannels.filter((c) => c.name.toLowerCase().includes(q))
  }, [allChannels, filter])

  const configureMutation = useMutation({
    mutationFn: (input: { channelId: string; channelName: string; checked: boolean }) => {
      const next = input.checked
        ? [...currentRoutes, { channelId: input.channelId, channelName: input.channelName }]
        : currentRoutes.filter((r) => r.channelId !== input.channelId)
      return configureSlackRoute({ data: { group, routes: next } })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INTEGRATION_QUERY_KEY })
    },
    onError: (error) => {
      toast({ variant: "destructive", description: toUserMessage(error) })
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => removeSlackRoute({ data: { group } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INTEGRATION_QUERY_KEY })
      toast({ description: `Cleared Slack routing for ${meta.label.toLowerCase()}` })
    },
    onError: (error) => {
      toast({ variant: "destructive", description: toUserMessage(error) })
    },
  })

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <Text.H5 weight="semibold">{meta.label}</Text.H5>
          <Text.H6 color="foregroundMuted">{meta.description}</Text.H6>
        </div>
        {currentRoutes.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void clearMutation.mutateAsync()}
            disabled={clearMutation.isPending}
          >
            <Slash className="h-3 w-3" />
            Clear
          </Button>
        ) : null}
      </div>

      <Input
        type="text"
        placeholder="Filter channels…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-sm"
      />

      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
        {filteredChannels.length === 0 ? (
          <Text.H6 color="foregroundMuted" className="px-2 py-1">
            No channels match.
          </Text.H6>
        ) : (
          filteredChannels.map((channel) => (
            <CheckboxInput
              key={channel.id}
              label={`${channel.isPrivate ? "🔒 " : "#"}${channel.name}${
                channel.isPrivate && !channel.isMember ? " (bot not in channel)" : ""
              }`}
              checked={selectedIds.has(channel.id)}
              disabled={configureMutation.isPending}
              onCheckedChange={(checked) =>
                void configureMutation.mutateAsync({
                  channelId: channel.id,
                  channelName: channel.name,
                  checked: checked === true,
                })
              }
            />
          ))
        )}
      </div>
    </div>
  )
}
