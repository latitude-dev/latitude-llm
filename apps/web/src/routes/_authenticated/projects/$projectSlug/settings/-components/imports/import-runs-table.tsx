import { Status, type StatusProps, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import type { ImportRunRecord } from "../../../../../../../domains/imports/imports.functions.ts"

const RUN_STATUS_BADGE: Record<ImportRunRecord["status"], { label: string; variant: StatusProps["variant"] }> = {
  succeeded: { label: "Succeeded", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
}

const numberFormatter = new Intl.NumberFormat("en-US")

const formatDuration = (run: ImportRunRecord) => {
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/**
 * The job's page history — newest first, capped at whatever the ring buffer holds.
 * Read straight off the job row, so there is nothing to paginate.
 */
export function ImportRunsTable({ runs }: { readonly runs: readonly ImportRunRecord[] }) {
  if (runs.length === 0) return <Text.H6M color="foregroundMuted">No pages processed yet.</Text.H6M>

  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Page</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Took</TableHead>
          <TableHead>Read</TableHead>
          <TableHead>Traces</TableHead>
          <TableHead>Spans</TableHead>
          <TableHead>Skipped</TableHead>
          <TableHead>Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run, index) => (
          // Entries carry no id — the array is an ordered, immutable snapshot, so the
          // position within it is the stable key.
          <TableRow key={`${run.startedAt}-${index}`} verticalPadding hoverable={false}>
            <TableCell>
              <span className="text-muted-foreground text-xs" title={new Date(run.startedAt).toLocaleString()}>
                {relativeTime(new Date(run.startedAt))}
              </span>
            </TableCell>
            <TableCell>
              <Status variant={RUN_STATUS_BADGE[run.status].variant} label={RUN_STATUS_BADGE[run.status].label} />
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground text-xs tabular-nums">{formatDuration(run)}</span>
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground text-xs tabular-nums">
                {numberFormatter.format(run.stats.recordsFetched)}
              </span>
            </TableCell>
            <TableCell>
              <span className="text-xs tabular-nums">{numberFormatter.format(run.stats.tracesImported)}</span>
            </TableCell>
            <TableCell>
              <span className="text-xs tabular-nums">{numberFormatter.format(run.stats.spansImported)}</span>
            </TableCell>
            <TableCell>
              <span
                className={
                  run.stats.spansSkipped > 0
                    ? "text-xs tabular-nums text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground text-xs tabular-nums"
                }
              >
                {numberFormatter.format(run.stats.spansSkipped)}
              </span>
            </TableCell>
            <TableCell>
              <span className="block min-w-0 truncate text-muted-foreground text-xs" title={run.error ?? undefined}>
                {run.error ?? "—"}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
