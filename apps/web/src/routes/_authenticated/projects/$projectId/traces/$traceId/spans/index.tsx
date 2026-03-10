import {
  Button,
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
import { formatPrice } from "@repo/utils"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useSpansByTraceCollection } from "../../../../../../../domains/spans/spans.collection.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectId/traces/$traceId/spans/")({
  component: TraceSpansPage,
})

function TraceSpansPage() {
  const { projectId, traceId } = Route.useParams()
  const { data: spans } = useSpansByTraceCollection(traceId)

  return (
    <Container>
      <div className="flex flex-col gap-6 py-8">
        <div className="flex flex-row items-center gap-4">
          <Link to="/projects/$projectId" params={{ projectId }}>
            <Button variant="ghost" size="sm">
              <Text.H5>Back to traces</Text.H5>
            </Button>
          </Link>
          <div className="flex flex-col gap-1">
            <Text.H2>Spans</Text.H2>
            <Text.H6 color="foregroundMuted">Trace {traceId.slice(0, 8)}...</Text.H6>
          </div>
        </div>

        <TableWithHeader
          title="Spans"
          table={
            !spans ? (
              <TableSkeleton cols={9} rows={5} />
            ) : spans.length === 0 ? (
              <TableBlankSlate description="No spans found for this trace." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Span ID</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Tokens (in/out)</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spans.map((span) => (
                    <TableRow key={`${span.traceId}-${span.spanId}`}>
                      <TableCell>
                        <Link
                          to="/projects/$projectId/traces/$traceId/spans/$spanId"
                          params={{
                            projectId,
                            traceId: span.traceId,
                            spanId: span.spanId,
                          }}
                          className="underline"
                        >
                          <Text.H5>{span.name}</Text.H5>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Text.H5 color="foregroundMuted">{span.spanId.slice(0, 8)}...</Text.H5>
                      </TableCell>
                      <TableCell>
                        <Text.H5 color="foregroundMuted">
                          {span.parentSpanId ? `${span.parentSpanId.slice(0, 8)}...` : "root"}
                        </Text.H5>
                      </TableCell>
                      <TableCell>
                        <Text.H5>{span.kind.toUpperCase()}</Text.H5>
                      </TableCell>
                      <TableCell>
                        <Text.H5 color={span.statusCode === "error" ? "destructive" : "foregroundMuted"}>
                          {span.statusCode.toUpperCase()}
                        </Text.H5>
                      </TableCell>
                      <TableCell>
                        <Text.H5>{span.provider || "—"}</Text.H5>
                      </TableCell>
                      <TableCell>
                        <Text.H5>{span.model || "—"}</Text.H5>
                      </TableCell>
                      <TableCell>
                        <Text.H5>
                          {span.tokensInput} / {span.tokensOutput}
                        </Text.H5>
                      </TableCell>
                      <TableCell>
                        <Text.H5>{formatPrice(span.costTotalMicrocents / 100_000_000)}</Text.H5>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }
        />
      </div>
    </Container>
  )
}
