import type { MonitorTarget } from "@domain/monitors"
import type { FilterSet } from "@domain/shared"
import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Status,
  Text,
} from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { BellPlusIcon, ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { describeMonitorTarget } from "../../../../../../domains/monitors/monitor-target.ts"
import { useMonitorsForTarget } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { targetAlertDraft } from "./alert-form-helpers.ts"
import { MonitorCreateModal } from "./monitor-create-modal.tsx"
import { ToolMonitorCreateModal } from "./tool-monitor-create-modal.tsx"
import { UserMonitorCreateModal } from "./user-monitor-create-modal.tsx"

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "undefined"
}

const normalizeFilterSet = (filterSet: MonitorTarget["filterSet"]): FilterSet => filterSet ?? {}

function sameTargetScope(a: MonitorRecord["target"], b: MonitorTarget): boolean {
  if (!a) return false
  return (
    a.stream === b.stream &&
    stableStringify(normalizeFilterSet(a.filterSet)) === stableStringify(normalizeFilterSet(b.filterSet)) &&
    (a.query ?? null) === (b.query ?? null) &&
    (a.savedSearchId ?? null) === (b.savedSearchId ?? null)
  )
}

function ActivityDot({ live }: { readonly live: boolean }) {
  if (!live) return <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
  )
}

export function TargetMonitorsMenu({
  projectId,
  projectSlug,
  stream,
  filterSetContains,
  createTarget,
  label = "Add monitor",
  matchMode = "contains",
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly stream: MonitorTarget["stream"]
  readonly filterSetContains: NonNullable<MonitorTarget["filterSet"]>
  readonly createTarget: MonitorTarget
  readonly label?: string
  readonly matchMode?: "contains" | "exact"
}) {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const { monitors: fetchedMonitors } = useMonitorsForTarget({ projectId, stream, filterSetContains })
  const monitors =
    matchMode === "exact"
      ? fetchedMonitors.filter((monitor) => sameTargetScope(monitor.target, createTarget))
      : fetchedMonitors

  const targetDescription = describeMonitorTarget(createTarget)
  const createModal = createOpen ? (
    targetDescription?.kind === "tool" || targetDescription?.kind === "allTools" ? (
      <ToolMonitorCreateModal
        projectId={projectId}
        projectSlug={projectSlug}
        target={createTarget}
        onClose={() => setCreateOpen(false)}
      />
    ) : targetDescription?.kind === "user" || targetDescription?.kind === "allUsers" ? (
      <UserMonitorCreateModal
        projectId={projectId}
        projectSlug={projectSlug}
        target={createTarget}
        onClose={() => setCreateOpen(false)}
      />
    ) : (
      <MonitorCreateModal
        projectId={projectId}
        projectSlug={projectSlug}
        initialAlert={targetAlertDraft(createTarget)}
        onClose={() => setCreateOpen(false)}
      />
    )
  ) : null

  if (monitors.length === 0) {
    return (
      <>
        <Button variant="outline" size="sm" className="w-auto" onClick={() => setCreateOpen(true)}>
          <Icon icon={BellPlusIcon} size="sm" />
          {label}
        </Button>
        {createModal}
      </>
    )
  }

  const lead = monitors.find((monitor) => monitor.mutedAt === null) ?? monitors[0]

  return (
    <>
      <DropdownMenuRoot modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-auto max-w-56">
            <ActivityDot live={lead?.mutedAt === null} />
            <Text.H5 ellipsis noWrap>
              {lead?.name}
            </Text.H5>
            <Icon icon={ChevronDownIcon} size="sm" color="foregroundMuted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent align="end" className="w-64">
            {monitors.map((monitor) => (
              <DropdownMenuItem
                key={monitor.slug}
                className="cursor-pointer items-center gap-2"
                onSelect={() =>
                  void navigate({
                    to: "/projects/$projectSlug/monitors/$monitorSlug",
                    params: { projectSlug, monitorSlug: monitor.slug },
                  })
                }
              >
                <ActivityDot live={monitor.mutedAt === null} />
                <Text.H5 ellipsis noWrap className="min-w-0 flex-1">
                  {monitor.name}
                </Text.H5>
                {monitor.mutedAt ? <Status variant="neutral" label="Muted" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={() => setCreateOpen(true)}>
              <Icon icon={BellPlusIcon} size="sm" color="foregroundMuted" />
              <Text.H5>Add monitor</Text.H5>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
      {createModal}
    </>
  )
}
