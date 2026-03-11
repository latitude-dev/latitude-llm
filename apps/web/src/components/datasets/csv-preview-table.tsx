import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "@repo/ui"
import { useMemo } from "react"
import {
  type ColumnMapping,
  type CsvTransformOptions,
  applyMapping,
} from "../../domains/datasets/datasets.functions.ts"

const PREVIEW_LIMIT = 50

interface CsvPreviewTableProps {
  csvRows: Record<string, string>[]
  totalRows: number
  mapping: ColumnMapping
  options: CsvTransformOptions
}

export function CsvPreviewTable({ csvRows, totalRows, mapping, options }: CsvPreviewTableProps) {
  const previewRows = useMemo(() => {
    const slice = csvRows.slice(0, PREVIEW_LIMIT)
    return slice.map((row) => applyMapping(row, mapping, options))
  }, [csvRows, mapping, options])

  const hasMappedColumns = mapping.input.length + mapping.output.length + mapping.metadata.length > 0

  if (!hasMappedColumns) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <PreviewHeader totalRows={totalRows} />
        <div className="flex flex-1 items-center justify-center p-8">
          <Text.H5 color="foregroundMuted">Assign columns on the right to see a preview</Text.H5>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PreviewHeader totalRows={totalRows} />
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow verticalPadding>
              <TableHead>
                <Text.H6 color="foregroundMuted">#</Text.H6>
              </TableHead>
              {mapping.input.length > 0 && (
                <TableHead>
                  <ColumnBadge label="Input" color="blue" />
                </TableHead>
              )}
              {mapping.output.length > 0 && (
                <TableHead>
                  <ColumnBadge label="Output" color="green" />
                </TableHead>
              )}
              {mapping.metadata.length > 0 && (
                <TableHead>
                  <ColumnBadge label="Metadata" color="amber" />
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewRows.map((row, i) => (
              <TableRow key={`preview-${i.toString()}`} verticalPadding>
                <TableCell>
                  <Text.H6 color="foregroundMuted">{i + 1}</Text.H6>
                </TableCell>
                {mapping.input.length > 0 && (
                  <TableCell>
                    <JsonCell value={row.input} />
                  </TableCell>
                )}
                {mapping.output.length > 0 && (
                  <TableCell>
                    <JsonCell value={row.output} />
                  </TableCell>
                )}
                {mapping.metadata.length > 0 && (
                  <TableCell>
                    <JsonCell value={row.metadata} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {csvRows.length > PREVIEW_LIMIT && (
          <div className="flex items-center justify-center py-3 border-t">
            <Text.H6 color="foregroundMuted">
              Showing {PREVIEW_LIMIT} of {totalRows} rows
            </Text.H6>
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewHeader({ totalRows }: { totalRows: number }) {
  return (
    <div className="flex flex-row items-center justify-between px-4 py-3 border-b">
      <Text.H5 weight="bold">Row Preview</Text.H5>
      <Text.H6 color="foregroundMuted">{totalRows} rows</Text.H6>
    </div>
  )
}

function ColumnBadge({
  label,
  color,
}: {
  label: string
  color: "blue" | "green" | "amber"
}) {
  const colors = {
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  }
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${colors[color]}`}>{label}</span>
}

function JsonCell({ value }: { value: Record<string, unknown> }) {
  const keys = Object.keys(value)
  if (keys.length === 0) return <Text.H6 color="foregroundMuted">—</Text.H6>

  if (keys.length === 1 && keys[0] === "value") {
    const v = value.value
    return <Text.H6 className="max-w-64 truncate">{typeof v === "string" ? v : JSON.stringify(v)}</Text.H6>
  }

  return <pre className="max-w-64 truncate text-xs font-mono text-foreground/80">{JSON.stringify(value, null, 0)}</pre>
}
