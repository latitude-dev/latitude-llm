import { InfiniteTable, type InfiniteTableColumn, type InfiniteTableSorting, Status, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useMemo, useState } from "react"
import type { StoreInsightsRecord } from "../../../../../../../domains/memories/memories.functions.ts"
import { recordDisplayLabel } from "../../-components/store-encoding.ts"

type StoreWriteHealthRecord = StoreInsightsRecord["writeHealth"][number]

const DEFAULT_SORTING: InfiniteTableSorting = { column: "writes", direction: "desc" }

const sortValue = (row: StoreWriteHealthRecord, column: string): number => {
  switch (column) {
    case "rewrites":
      return row.rewrites
    case "peak":
      return row.peakWritesPerTrace
    case "reverted":
      return row.reverted ? 1 : 0
    default:
      return row.writes
  }
}

const end = (value: string) => <span className="tabular-nums">{value}</span>

export function StoreWriteHealthTable({
  records,
  isLoading,
  onSelectRecord,
}: {
  readonly records: readonly StoreWriteHealthRecord[]
  readonly isLoading: boolean
  readonly onSelectRecord: (recordId: string) => void
}) {
  const [sorting, setSorting] = useState<InfiniteTableSorting>(DEFAULT_SORTING)
  const sorted = useMemo(() => {
    const direction = sorting.direction === "asc" ? 1 : -1
    return [...records].sort((a, b) => {
      const cmp = (sortValue(a, sorting.column) - sortValue(b, sorting.column)) * direction
      return cmp !== 0 ? cmp : a.recordId < b.recordId ? -1 : 1
    })
  }, [records, sorting])

  const columns: InfiniteTableColumn<StoreWriteHealthRecord>[] = [
    {
      key: "record",
      header: "Record",
      minWidth: 200,
      render: (row) => (
        <span className="min-w-0 truncate font-mono text-[13px]" title={recordDisplayLabel(row.recordId)}>
          {recordDisplayLabel(row.recordId)}
        </span>
      ),
    },
    {
      key: "writes",
      header: "Writes",
      align: "end",
      width: 92,
      sortKey: "writes",
      render: (row) => end(formatCount(row.writes)),
    },
    {
      key: "rewrites",
      header: "Rewrites",
      align: "end",
      width: 96,
      sortKey: "rewrites",
      headerTooltip: "Updates to an existing record (create excluded).",
      render: (row) => end(formatCount(row.rewrites)),
    },
    {
      key: "peak",
      header: "Peak/trace",
      align: "end",
      width: 108,
      sortKey: "peak",
      headerTooltip: "Most writes this record took in a single trace — repeated rewrites in one run (thrashing).",
      render: (row) => end(formatCount(row.peakWritesPerTrace)),
    },
    {
      key: "reverted",
      header: "Reverted",
      align: "end",
      width: 108,
      sortKey: "reverted",
      headerTooltip: "The record's content returned to an earlier value (A→B→A).",
      render: (row) =>
        row.reverted ? (
          <Status variant="warning" label="Reverted" indicator={false} />
        ) : (
          <Text.H6 color="foregroundMuted">—</Text.H6>
        ),
    },
  ]

  return (
    <InfiniteTable
      data={sorted}
      isLoading={isLoading}
      columns={columns}
      getRowKey={(row) => row.recordId}
      sorting={sorting}
      defaultSorting={DEFAULT_SORTING}
      onSortChange={setSorting}
      scrollAreaLayout="intrinsic"
      className="max-h-96"
      onRowClick={(row) => onSelectRecord(row.recordId)}
      getRowAriaLabel={(row) => `Open ${recordDisplayLabel(row.recordId)}`}
      rowInteractionRole="button"
      blankSlate="No writes in this time window"
    />
  )
}
