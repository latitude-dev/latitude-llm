import {
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  LatitudeLogo,
  type MenuOption,
  optionsColumn,
  Status,
  Text,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { BellIcon, BellOffIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import type { MonitorRecord } from "../../../../../../domains/monitors/monitors.collection.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import { MonitorDeleteConfirmModal } from "./monitor-delete-confirm-modal.tsx"
import { MonitorMuteConfirmModal } from "./monitor-mute-confirm-modal.tsx"
import { MonitorRenameModal } from "./monitor-rename-modal.tsx"

/** Latest-incident summary per row; `null` until incidents land (M3+) → em dash. */
export interface MonitorLastIncidentSummary {
  readonly startedAtIso: string
  readonly endedAtIso: string | null
}

export interface MonitorsTableRow {
  readonly monitor: MonitorRecord
  readonly lastIncident: MonitorLastIncidentSummary | null
}

function LastIncidentCell({ summary }: { readonly summary: MonitorLastIncidentSummary | null }) {
  if (!summary) {
    return (
      <Text.H6 color="foregroundMuted" noWrap>
        —
      </Text.H6>
    )
  }
  if (summary.endedAtIso) {
    return <Status variant="warning" label={`Closed ${relativeTime(new Date(summary.endedAtIso))}`} />
  }
  return <Status variant="destructive" label={`Ongoing since ${relativeTime(new Date(summary.startedAtIso))}`} />
}

export function MonitorsView({
  rows,
  isLoading,
  infiniteScroll,
  activeMonitorSlug,
  onActiveMonitorChange,
  projectId,
}: {
  readonly rows: readonly MonitorsTableRow[]
  readonly isLoading: boolean
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly activeMonitorSlug: string | undefined
  readonly onActiveMonitorChange: (slug: string | undefined) => void
  readonly projectId: string
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
      header: "Name",
      width: 420,
      minWidth: 240,
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          {row.monitor.system ? (
            <span className="shrink-0">
              <LatitudeLogo className="h-4 w-4" />
            </span>
          ) : null}
          <Text.H5 className="min-w-0 flex-1" noWrap ellipsis>
            {row.monitor.name}
          </Text.H5>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 110,
      minWidth: 110,
      render: (row) =>
        row.monitor.mutedAt ? <Status variant="neutral" label="Muted" /> : <Status variant="success" label="Live" />,
    },
    {
      key: "lastIncident",
      header: "Last incident",
      width: 220,
      minWidth: 180,
      render: (row) => <LastIncidentCell summary={row.lastIncident} />,
    },
    optionsColumn<MonitorsTableRow>({
      getOptions: (row): MenuOption[] => {
        const isUser = !row.monitor.system
        return [
          {
            label: row.monitor.mutedAt ? "Unmute" : "Mute",
            iconProps: { icon: row.monitor.mutedAt ? BellIcon : BellOffIcon },
            onClick: () => setPendingMute(row.monitor),
          },
          { type: "separator" },
          // Rename + Delete only apply to user monitors; system monitors are locked.
          {
            label: "Rename",
            iconProps: { icon: PencilIcon },
            ...(isUser ? { onClick: () => setRenameTarget(row.monitor) } : { disabled: true }),
          },
          {
            label: "Delete",
            type: "destructive",
            iconProps: { icon: Trash2Icon },
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
