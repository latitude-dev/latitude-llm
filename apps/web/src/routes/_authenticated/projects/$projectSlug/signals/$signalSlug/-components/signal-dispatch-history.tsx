import { Button, cn, Icon, Popover, PopoverContent, PopoverTrigger, Status, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { ExternalLink, History } from "lucide-react"
import type { AgentDispatchRecord } from "../../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import {
  AGENT_DISPATCH_KIND_ICONS,
  AGENT_DISPATCH_KIND_LABELS,
  DISPATCH_ERROR_TITLES,
  DISPATCH_TRIGGER_TITLES,
} from "../../../settings/-components/agent-dispatch-section.tsx"

const kindLabel = (kind: AgentDispatchRecord["kind"]): string => (kind ? AGENT_DISPATCH_KIND_LABELS[kind] : "an agent")

function statusVariant(status: string) {
  if (status === "dispatched") return "success" as const
  if (status === "failed") return "destructive" as const
  return "neutral" as const
}

function DispatchRow({ dispatch }: { readonly dispatch: AgentDispatchRecord }) {
  const label = dispatch.kind ? AGENT_DISPATCH_KIND_LABELS[dispatch.kind] : "Agent"
  const KindIcon = dispatch.kind ? AGENT_DISPATCH_KIND_ICONS[dispatch.kind] : History
  const trigger = DISPATCH_TRIGGER_TITLES[dispatch.trigger] ?? dispatch.trigger.replaceAll(".", " ")
  const errorTitle = dispatch.errorCategory
    ? (DISPATCH_ERROR_TITLES[dispatch.errorCategory] ?? dispatch.errorCategory)
    : null
  const href = dispatch.externalUrl ?? dispatch.routineUrl

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon icon={KindIcon} size="sm" className="shrink-0" />
          <Text.H5 weight="semibold" ellipsis>
            {label}
          </Text.H5>
        </div>
        <Status variant={statusVariant(dispatch.status)} label={dispatch.status} className="shrink-0 capitalize" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">{trigger}</Text.H6>
        <Text.H6 color="foregroundMuted">{relativeTime(new Date(dispatch.claimedAt))}</Text.H6>
      </div>
      {errorTitle ? <Text.H6 color="destructive">{errorTitle}</Text.H6> : null}
    </>
  )

  const baseClassName = "flex flex-col gap-1 px-2 py-3 first:pt-2 last:pb-2"

  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cn(baseClassName, "cursor-pointer hover:bg-muted")}>
      {content}
    </a>
  ) : (
    <div className={baseClassName}>{content}</div>
  )
}

export function SignalDispatchHistory({
  dispatches,
  projectSlug,
  triggerClassName,
}: {
  readonly dispatches: readonly AgentDispatchRecord[]
  readonly projectSlug: string
  readonly triggerClassName?: string
}) {
  const latest = dispatches[0]

  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("text-sm", triggerClassName)}>
          <Icon icon={latest?.kind ? AGENT_DISPATCH_KIND_ICONS[latest.kind] : History} size="sm" />
          {`Sent to ${kindLabel(latest?.kind ?? null)}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-w-72 p-2">
        <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
          <Text.H6 weight="semibold">Dispatch history</Text.H6>
          <Link
            to="/projects/$projectSlug/settings/integrations"
            params={{ projectSlug }}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
            <Icon icon={ExternalLink} size="xs" />
          </Link>
        </div>
        <div className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
          {dispatches.map((dispatch) => (
            <DispatchRow key={dispatch.id} dispatch={dispatch} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
