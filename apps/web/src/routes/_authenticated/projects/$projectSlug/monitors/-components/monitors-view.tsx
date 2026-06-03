import {
  Badge,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  LatitudeLogo,
  type MenuOption,
  optionsColumn,
  type SortDirection,
  Status,
  Text,
  Tooltip,
} from "@repo/ui"
import { BellIcon, BellOffIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import type { MonitorListRowRecord, MonitorRecord } from "../../../../../../domains/monitors/monitors.collection.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import { IncidentStatus } from "./incident-status.tsx"
import { MonitorDeleteConfirmModal } from "./monitor-delete-confirm-modal.tsx"
import { MonitorMuteConfirmModal } from "./monitor-mute-confirm-modal.tsx"
import { MonitorRenameModal } from "./monitor-rename-modal.tsx"

export type MonitorsTableRow = MonitorListRowRecord

export type MonitorsSortColumn = "name" | "status" | "lastIncident"
export interface MonitorsTableSorting {
  readonly column: MonitorsSortColumn
  readonly direction: SortDirection
}
export const DEFAULT_MONITORS_SORTING: MonitorsTableSorting = { column: "lastIncident", direction: "desc" }

const lastIncidentMs = (row: MonitorsTableRow): number | null =>
  row.lastIncident ? Date.parse(row.lastIncident.startedAtIso) : null

const comparePrimary = (
  a: MonitorsTableRow,
  b: MonitorsTableRow,
  sorting: MonitorsTableSorting,
  dir: number,
): number => {
  if (sorting.column === "name") return dir * a.monitor.name.localeCompare(b.monitor.name)
  // Rank Live above Muted so "desc" (the louder state first) leads with live monitors.
  if (sorting.column === "status") return dir * ((a.monitor.mutedAt ? 0 : 1) - (b.monitor.mutedAt ? 0 : 1))
  // lastIncident: most-recent first, monitors with no incident always last.
  const at = lastIncidentMs(a)
  const bt = lastIncidentMs(b)
  if (at === bt) return 0
  if (at === null) return 1
  if (bt === null) return -1
  return dir * (at - bt)
}

/** Fixed `createdAt` desc then `id` tiebreaks keep the order deterministic. */
export function sortMonitorRows(
  rows: readonly MonitorsTableRow[],
  sorting: MonitorsTableSorting,
): readonly MonitorsTableRow[] {
  const dir = sorting.direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const primary = comparePrimary(a, b, sorting, dir)
    if (primary !== 0) return primary
    const createdDelta = Date.parse(b.monitor.createdAt) - Date.parse(a.monitor.createdAt)
    if (createdDelta !== 0) return createdDelta
    return a.monitor.id < b.monitor.id ? -1 : a.monitor.id > b.monitor.id ? 1 : 0
  })
}

function LastIncidentCell({ summary }: { readonly summary: MonitorsTableRow["lastIncident"] }) {
  if (!summary) {
    return (
      <Text.H6 color="foregroundMuted" noWrap>
        —
      </Text.H6>
    )
  }
  return <IncidentStatus startedAtIso={summary.startedAtIso} endedAtIso={summary.endedAtIso} />
}

function ConditionCell({ alerts }: { readonly alerts: MonitorRecord["alerts"] }) {
  const [first, ...rest] = alerts
  if (!first) {
    return (
      <Text.H6 color="foregroundMuted" noWrap>
        —
      </Text.H6>
    )
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Text.H5 className="min-w-0" noWrap ellipsis>
        {first.summary}
      </Text.H5>
      {rest.length > 0 ? (
        <Badge variant="noBorderMuted" className="shrink-0" aria-label={`${rest.length} more alerts`}>
          +{rest.length}
        </Badge>
      ) : null}
    </div>
  )
}

export function MonitorsView({
  rows,
  isLoading,
  infiniteScroll,
  activeMonitorSlug,
  onActiveMonitorChange,
  projectId,
  sorting,
  onSortChange,
}: {
  readonly rows: readonly MonitorsTableRow[]
  readonly isLoading: boolean
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly activeMonitorSlug: string | undefined
  readonly onActiveMonitorChange: (slug: string | undefined) => void
  readonly projectId: string
  readonly sorting: MonitorsTableSorting
  readonly onSortChange: (sorting: MonitorsTableSorting) => void
}) {
  const [pendingMute, setPendingMute] = useState<MonitorRecord | null>(null)
  const [renameTarget, setRenameTarget] = useState<MonitorRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MonitorRecord | null>(null)
  const activeRowKey = activeMonitorSlug
    ? rows.find((r) => r.monitor.slug === activeMonitorSlug)?.monitor.id
    : undefined
  const columns: InfiniteTableColumn<MonitorsTableRow>[] = [
    {
      key: "name",
      header: "Monitor",
      sortKey: "name",
      width: 315,
      minWidth: 180,
      maxWidth: 315,
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Text.H5 className="min-w-0" noWrap ellipsis>
            {row.monitor.name}
          </Text.H5>
          {row.monitor.system ? (
            <Tooltip
              asChild
              trigger={
                <Badge
                  variant="white"
                  size="small"
                  className="shrink-0"
                  aria-label="This monitor is managed by the system"
                >
                  <LatitudeLogo className="h-3 w-3" />
                </Badge>
              }
            >
              This monitor is managed by the system
            </Tooltip>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortKey: "status",
      width: 80,
      minWidth: 80,
      render: (row) =>
        row.monitor.mutedAt ? <Status variant="neutral" label="Muted" /> : <Status variant="success" label="Live" />,
    },
    {
      key: "lastIncident",
      header: "Last incident",
      sortKey: "lastIncident",
      width: 187,
      minWidth: 153,
      render: (row) => <LastIncidentCell summary={row.lastIncident} />,
    },
    {
      key: "condition",
      header: "Condition",
      width: 340,
      minWidth: 200,
      maxWidth: 340,
      render: (row) => <ConditionCell alerts={row.monitor.alerts} />,
    },
    optionsColumn<MonitorsTableRow>({
      getOptions: (row): MenuOption[] => {
        const isUser = !row.monitor.system
        return [
          // Rename + Remove only apply to user monitors; system monitors are locked.
          {
            label: "Rename",
            iconProps: { icon: PencilIcon },
            ...(isUser ? { onClick: () => setRenameTarget(row.monitor) } : { disabled: true }),
          },
          {
            label: row.monitor.mutedAt ? "Unmute" : "Mute",
            iconProps: { icon: row.monitor.mutedAt ? BellIcon : BellOffIcon },
            onClick: () => setPendingMute(row.monitor),
          },
          { type: "separator" },
          {
            label: "Remove",
            type: "destructive",
            iconProps: { icon: Trash2Icon, color: "destructive" },
            ...(isUser ? { onClick: () => setDeleteTarget(row.monitor) } : { disabled: true }),
          },
        ]
      },
    }),
  ]

  return (
    <>
      <Layout.Body>
        <Layout.List>
          <InfiniteTable
            {...listingLayoutIntrinsicScroll.infiniteTable}
            data={rows}
            isLoading={isLoading}
            columns={columns}
            getRowKey={(row) => row.monitor.id}
            infiniteScroll={infiniteScroll}
            sorting={sorting}
            defaultSorting={DEFAULT_MONITORS_SORTING}
            onSortChange={(next) =>
              onSortChange({ column: next.column as MonitorsSortColumn, direction: next.direction })
            }
            {...(activeRowKey ? { activeRowKey } : {})}
            onRowClick={(row) =>
              onActiveMonitorChange(row.monitor.slug === activeMonitorSlug ? undefined : row.monitor.slug)
            }
            getRowAriaLabel={(row) =>
              row.monitor.slug === activeMonitorSlug ? `Close ${row.monitor.name}` : `Open ${row.monitor.name}`
            }
          />
        </Layout.List>
      </Layout.Body>
      <MonitorMuteConfirmModal projectId={projectId} monitor={pendingMute} onOpenChange={setPendingMute} />
      {renameTarget ? (
        <MonitorRenameModal
          key={renameTarget.id}
          projectId={projectId}
          monitor={renameTarget}
          onClose={() => setRenameTarget(null)}
        />
      ) : null}
      <MonitorDeleteConfirmModal
        projectId={projectId}
        monitor={deleteTarget}
        onOpenChange={setDeleteTarget}
        onDeleted={() => {
          if (deleteTarget && deleteTarget.slug === activeMonitorSlug) onActiveMonitorChange(undefined)
        }}
      />
    </>
  )
}
