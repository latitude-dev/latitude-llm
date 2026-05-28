import { NOTIFICATION_GROUP_META, type NotificationGroup } from "@domain/shared"
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
  Text,
  useToast,
} from "@repo/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Search } from "lucide-react"
import { useRef, useState } from "react"
import {
  configureSlackRoute,
  listSlackChannels,
  removeSlackRoute,
  type SlackIntegrationRecord,
} from "../../../../../../domains/integrations/integrations.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

// Shared with the onboarding step so a save here invalidates both surfaces.
export const SLACK_INTEGRATION_QUERY_KEY = ["slack-integration"] as const
export const SLACK_CHANNELS_QUERY_KEY = ["slack-channels"] as const

type ChannelOption = { readonly id: string; readonly name: string }
const DON_T_SEND: ChannelOption = { id: "", name: "Don't send" }

// Refetches on open so freshly-invited bot channels appear without waiting for `staleTime`.
export function SlackRouteRow({
  group,
  integration,
}: {
  group: NotificationGroup
  integration: SlackIntegrationRecord
}) {
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
    queryKey: SLACK_CHANNELS_QUERY_KEY,
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
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SLACK_INTEGRATION_QUERY_KEY }),
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
