import {
  Container,
  Table,
  TableBlankSlate,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  TableWithHeader,
  Text,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useTracesCollection } from "../../../../domains/spans/spans.collection.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: TracesPage,
})

function StatusBadge({ status }: { status: string }) {
  const color = status === "error" ? "destructive" : "foregroundMuted"
  return <Text.H5 color={color}>{status.toUpperCase()}</Text.H5>
}

function TracesPage() {
  const { projectId } = Route.useParams()
  const { data: traces } = useTracesCollection(projectId)

  return (
    <Container className="py-8">
      <TableWithHeader
        title="Traces"
        table={
          !traces ? (
            <TableSkeleton cols={8} rows={5} />
          ) : traces.length === 0 ? (
            <TableBlankSlate description="No traces found for this project." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Spans</TableHead>
                  <TableHead>Models</TableHead>
                  <TableHead>Tokens (in/out)</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Start Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traces.map((trace) => (
                  <TableRow key={trace.traceId}>
                    <TableCell>
                      <Link
                        to="/projects/$projectId/traces/$traceId/spans"
                        params={{ projectId, traceId: trace.traceId }}
                        className="underline"
                      >
                        <Text.H5>{trace.rootSpanName || trace.traceId.slice(0, 8)}</Text.H5>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={trace.status} />
                    </TableCell>
                    <TableCell>
                      <Text.H5>
                        {formatCount(trace.spanCount)}
                        {trace.errorCount > 0 && <Text.H6 color="destructive"> ({trace.errorCount} err)</Text.H6>}
                      </Text.H5>
                    </TableCell>
                    <TableCell>
                      <Text.H5>{trace.models.join(", ") || "—"}</Text.H5>
                    </TableCell>
                    <TableCell>
                      <Text.H5>
                        {formatCount(trace.tokensInput)} / {formatCount(trace.tokensOutput)}
                      </Text.H5>
                    </TableCell>
                    <TableCell>
                      <Text.H5>{formatPrice(trace.costTotalMicrocents / 100_000_000)}</Text.H5>
                    </TableCell>
                    <TableCell>
                      <Text.H5>{formatDuration(trace.durationNs)}</Text.H5>
                    </TableCell>
                    <TableCell>
                      <Text.H5 color="foregroundMuted">{new Date(trace.startTime).toLocaleString()}</Text.H5>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        }
      />
    </Container>
  )
}
