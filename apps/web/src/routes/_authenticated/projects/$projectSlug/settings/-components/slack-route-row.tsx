import type { SlackRoute } from "@domain/integrations"
import { NOTIFICATION_GROUP_META, NOTIFICATION_TOPIC_META, type NotificationGroup } from "@domain/shared"
import {
  Button,
  Checkbox,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  Label,
  Text,
} from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { minSeverityHint, SeveritySelector } from "../../../../../../domains/alerts/severity-selector.tsx"
import {
  configureSlackRoute,
  listSlackChannels,
  removeSlackRoute,
  SLACK_CHANNELS_QUERY_KEY,
} from "../../../../../../domains/integrations/integrations.functions.ts"

type ChannelOption = { readonly id: string; readonly name: string }
const DON_T_SEND: ChannelOption = { id: "", name: "Don't send" }

/** Writes one group's routing. Callers decide when — on change, or behind a save. */
export const persistSlackRoute = (group: NotificationGroup, route: SlackRoute | null) =>
  route === null
    ? removeSlackRoute({ data: { group } })
    : configureSlackRoute({ data: { group, routes: [{ ...route }] } })

// Refetches on open so freshly-invited bot channels appear without waiting for `staleTime`.
export function SlackRouteRow({
  group,
  route,
  onChange,
  disabled = false,
}: {
  readonly group: NotificationGroup
  readonly route: SlackRoute | null
  readonly onChange: (next: SlackRoute | null) => void
  readonly disabled?: boolean
}) {
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

  // Use the stored channelName rather than the channel list so the trigger shows
  // the correct label immediately, before channels finish loading.
  const selected: ChannelOption = route ? { id: route.channelId, name: route.channelName } : DON_T_SEND

  const pick = (option: ChannelOption) => {
    if (option.id === "") return onChange(null)
    // Re-picking the channel keeps the configured filters.
    onChange({
      channelId: option.id,
      channelName: option.name,
      ...(route?.minSeverity ? { minSeverity: route.minSeverity } : {}),
      ...(route?.topics ? { topics: route.topics } : {}),
    })
  }

  return (
    // Mirrors the email-notification group cards in account settings; the only
    // difference is the channel picker where email has a switch.
    <div className="flex w-full flex-col gap-3 rounded-lg bg-muted/30 p-4">
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Text.H5M>{meta.label}</Text.H5M>
          <Text.H6 color="foregroundMuted">{meta.description}</Text.H6>
        </div>
        <div className="ml-auto w-52 max-w-full shrink-0">
          <Combobox
            modal
            value={selected}
            onValueChange={(picked) => {
              setInputValue("")
              pick(picked ?? DON_T_SEND)
            }}
            items={allOptions}
            itemToStringValue={(item: ChannelOption) => (item.id === "" ? "Don't send" : `#${item.name}`)}
            isItemEqualToValue={(a: ChannelOption, b: ChannelOption) => a.id === b.id}
            onOpenChange={(open) => {
              if (open) void refetch()
            }}
            disabled={disabled}
          >
            <Button asChild variant="outline" size="sm" disabled={disabled} className="w-full justify-between">
              <ComboboxTrigger
                ref={triggerRef}
                className="min-w-0"
                title={selected.id === "" ? undefined : `#${selected.name}`}
              >
                {selected.id === "" ? (
                  <Text.H5 color="foregroundMuted">Don't send</Text.H5>
                ) : (
                  <Text.H5 ellipsis className="min-w-0">
                    #{selected.name}
                  </Text.H5>
                )}
              </ComboboxTrigger>
            </Button>
            <ComboboxContent anchor={triggerRef} className="w-64">
              <ComboboxInput
                placeholder="Search channels…"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                loading={isFetching}
              />
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
      {route && meta.topics.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg bg-muted/80 px-3 py-2.5">
          {meta.topics.map((topic) => {
            const topicMeta = NOTIFICATION_TOPIC_META[topic]
            const topicId = `slack-route-${group}-${topic}`
            return (
              <div key={topic} className="flex flex-row items-start gap-3">
                <Checkbox
                  id={topicId}
                  checked={route.topics?.[topic] ?? true}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({ ...route, topics: { ...(route.topics ?? {}), [topic]: checked === true } })
                  }
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Label htmlFor={topicId}>{topicMeta.label}</Label>
                  <Text.H6 color="foregroundMuted">{topicMeta.description}</Text.H6>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
      {route && meta.severityFiltered ? (
        <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-muted/80 px-3 py-2">
          <Text.H6 color="foregroundMuted" className="min-w-0 flex-1">
            Severity · {minSeverityHint(route.minSeverity ?? "low")}
          </Text.H6>
          <SeveritySelector
            variant="bordered"
            value={route.minSeverity ?? "low"}
            onSelect={(minSeverity) => onChange({ ...route, minSeverity })}
            disabled={disabled}
          />
        </div>
      ) : null}
    </div>
  )
}
