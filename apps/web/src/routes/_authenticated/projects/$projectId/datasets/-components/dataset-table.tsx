import type { CheckedState } from "@repo/ui"
import { Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import type { DatasetRowRecord } from "../../../../../../domains/datasets/datasets.functions.ts"

function formatCellValue(data: string | Record<string, unknown>): string {
  if (typeof data === "string") return data
  return JSON.stringify(data)
}

export function DatasetTable({
  rows,
  selectedRowId,
  onSelectRow,
  headerCheckboxState,
  onToggleAll,
  isRowSelected,
  onToggleRow,
}: {
  rows: DatasetRowRecord[]
  selectedRowId: string | null
  onSelectRow: (row: DatasetRowRecord) => void
  headerCheckboxState: CheckedState
  onToggleAll: () => void
  isRowSelected: (id: string) => boolean
  onToggleRow: (id: string, checked: CheckedState) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead className="w-10">
            <Checkbox checked={headerCheckboxState} onCheckedChange={onToggleAll} className="hit-area-3" />
          </TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Input</TableHead>
          <TableHead>Output</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.rowId}
            verticalPadding
            className={`cursor-pointer ${selectedRowId === row.rowId ? "bg-accent" : ""}`}
            onClick={() => onSelectRow(row)}
          >
            <TableCell>
              <Checkbox
                checked={isRowSelected(row.rowId)}
                onCheckedChange={(checked) => onToggleRow(row.rowId, checked)}
                onClick={(e) => e.stopPropagation()}
              />
            </TableCell>
            <TableCell>
              <Text.H6 color="foregroundMuted">{relativeTime(row.createdAt)}</Text.H6>
            </TableCell>
            <TableCell className="max-w-48">
              <Text.Mono ellipsis>{formatCellValue(row.input)}</Text.Mono>
            </TableCell>
            <TableCell className="max-w-48">
              <Text.Mono ellipsis>{formatCellValue(row.output)}</Text.Mono>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
