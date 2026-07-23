import {
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  type MenuOption,
  optionsColumn,
  type SortDirection,
  Text,
} from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import type {
  ExperimentListRow,
  ExperimentRecord,
} from "../../../../../../domains/experiments/experiments.collection.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import { ExperimentDeleteConfirmModal, ExperimentRenameModal } from "./experiment-modals.tsx"

export type ExperimentsSortColumn = "name" | "variants" | "sessions" | "users"
export interface ExperimentsSorting {
  readonly column: ExperimentsSortColumn
  readonly direction: SortDirection
}

const comparePrimary = (
  a: ExperimentListRow,
  b: ExperimentListRow,
  column: ExperimentsSortColumn,
  dir: number,
): number => {
  switch (column) {
    case "name":
      return dir * a.experiment.name.localeCompare(b.experiment.name)
    case "variants":
      return dir * (a.experiment.variants.length - b.experiment.variants.length)
    case "sessions":
      return dir * (a.sessionsDistinct - b.sessionsDistinct)
    case "users":
      return dir * (a.usersDistinct - b.usersDistinct)
  }
}

/** Sort by the chosen column (if any), then `updatedAt` desc, then id — deterministic. */
export function sortExperimentRows(
  rows: readonly ExperimentListRow[],
  sorting: ExperimentsSorting | null,
): readonly ExperimentListRow[] {
  return [...rows].sort((a, b) => {
    if (sorting) {
      const primary = comparePrimary(a, b, sorting.column, sorting.direction === "asc" ? 1 : -1)
      if (primary !== 0) return primary
    }
    const updatedDelta = Date.parse(b.experiment.updatedAt) - Date.parse(a.experiment.updatedAt)
    if (updatedDelta !== 0) return updatedDelta
    return a.experiment.id < b.experiment.id ? -1 : a.experiment.id > b.experiment.id ? 1 : 0
  })
}

export function ExperimentsView({
  rows,
  isLoading,
  infiniteScroll,
  projectId,
  projectSlug,
  sorting,
  onSortChange,
  sortable,
}: {
  readonly rows: readonly ExperimentListRow[]
  readonly isLoading: boolean
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly projectId: string
  readonly projectSlug: string
  readonly sorting: ExperimentsSorting | null
  readonly onSortChange: (sorting: ExperimentsSorting) => void
  /**
   * Sorting is client-side over the loaded rows, so it is only meaningful once every page is
   * loaded — otherwise it would rank the current page and silently omit experiments still unpaged.
   * When `false`, the sort headers are disabled (no `onSortChange` → `InfiniteTable` renders them
   * inert) and rows stay in the server's `updatedAt`-desc page order.
   */
  readonly sortable: boolean
}) {
  const [renameTarget, setRenameTarget] = useState<ExperimentRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExperimentRecord | null>(null)

  const columns: InfiniteTableColumn<ExperimentListRow>[] = [
    {
      key: "name",
      header: "Experiment",
      sortKey: "name",
      width: 340,
      minWidth: 180,
      maxWidth: 420,
      render: (row) => (
        <Text.H5 className="min-w-0" noWrap ellipsis>
          {row.experiment.name}
        </Text.H5>
      ),
    },
    {
      key: "variants",
      header: "Variants",
      sortKey: "variants",
      width: 110,
      minWidth: 90,
      render: (row) => <Text.H5>{row.experiment.variants.length}</Text.H5>,
    },
    {
      key: "sessions",
      header: "Sessions",
      sortKey: "sessions",
      width: 130,
      minWidth: 100,
      render: (row) => <Text.H5>{formatCount(row.sessionsDistinct)}</Text.H5>,
    },
    {
      key: "users",
      header: "Users",
      sortKey: "users",
      width: 130,
      minWidth: 100,
      render: (row) => <Text.H5>{formatCount(row.usersDistinct)}</Text.H5>,
    },
    optionsColumn<ExperimentListRow>({
      getOptions: (row): MenuOption[] => [
        { label: "Rename", iconProps: { icon: PencilIcon }, onClick: () => setRenameTarget(row.experiment) },
        { type: "separator" },
        {
          label: "Remove",
          type: "destructive",
          iconProps: { icon: Trash2Icon, color: "destructive" },
          onClick: () => setDeleteTarget(row.experiment),
        },
      ],
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
            getRowKey={(row) => row.experiment.id}
            infiniteScroll={infiniteScroll}
            {...(sortable && sorting ? { sorting } : {})}
            {...(sortable
              ? {
                  onSortChange: (next: { column: string; direction: SortDirection }) =>
                    onSortChange({ column: next.column as ExperimentsSortColumn, direction: next.direction }),
                }
              : {})}
            renderRowLink={(row, props) => (
              <Link
                to="/projects/$projectSlug/experiments/$experimentSlug"
                params={{ projectSlug, experimentSlug: row.experiment.slug }}
                aria-label={`Open ${row.experiment.name}`}
                {...props}
              />
            )}
          />
        </Layout.List>
      </Layout.Body>
      {renameTarget ? (
        <ExperimentRenameModal
          key={renameTarget.id}
          projectId={projectId}
          experiment={renameTarget}
          onClose={() => setRenameTarget(null)}
        />
      ) : null}
      <ExperimentDeleteConfirmModal projectId={projectId} experiment={deleteTarget} onOpenChange={setDeleteTarget} />
    </>
  )
}
