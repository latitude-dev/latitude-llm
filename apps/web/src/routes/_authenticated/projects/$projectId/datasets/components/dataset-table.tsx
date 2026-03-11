import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import type { DatasetRowRecord } from "../../../../../../domains/datasets/datasets.functions.ts"

function truncateJson(data: Record<string, unknown>, maxLen = 30): string {
  const values = Object.values(data)
  if (values.length === 0) return "{}"
  const first = String(values[0])
  return first.length > maxLen ? `${first.slice(0, maxLen)}…` : first
}

export function DatasetTable({
  rows,
  selectedRowId,
  onSelectRow,
}: {
  rows: DatasetRowRecord[]
  selectedRowId: string | null
  onSelectRow: (row: DatasetRowRecord) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>#</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Input</TableHead>
          <TableHead>Output</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow
            key={row.rowId}
            verticalPadding
            className={`cursor-pointer ${selectedRowId === row.rowId ? "bg-accent" : ""}`}
            onClick={() => onSelectRow(row)}
          >
            <TableCell>
              <Text.H6 color="foregroundMuted">{index + 1}</Text.H6>
            </TableCell>
            <TableCell>
              <Text.H6 color="foregroundMuted">{relativeTime(row.createdAt)}</Text.H6>
            </TableCell>
            <TableCell>
              <Text.H6 className="font-mono truncate max-w-48">{truncateJson(row.input)}</Text.H6>
            </TableCell>
            <TableCell>
              <Text.H6 className="font-mono truncate max-w-48">{truncateJson(row.output)}</Text.H6>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
