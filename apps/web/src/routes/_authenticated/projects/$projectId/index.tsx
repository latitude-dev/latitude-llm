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
import { Link, createFileRoute } from "@tanstack/react-router"
import { useSpansCollection } from "../../../../domains/spans/spans.collection.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: TracesPage,
})

function TracesPage() {
  const { projectId } = Route.useParams()
  const { data: spans } = useSpansCollection(projectId)

  return (
    <Container className="pt-14">
      <TableWithHeader
        title="Traces"
        table={
          !spans ? (
            <TableSkeleton cols={8} rows={5} />
          ) : spans.length === 0 ? (
            <TableBlankSlate description="No traces found for this project." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Trace ID</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Tokens (in/out)</TableHead>
                  <TableHead>Start Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spans.map((span) => (
                  <TableRow key={`${span.traceId}-${span.spanId}`}>
                    <TableCell>
                      <Link
                        to="/projects/$projectId/traces/$traceId/$spanId"
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
                      <Text.H5 color="foregroundMuted">{span.traceId.slice(0, 8)}...</Text.H5>
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
                      <Text.H5 color="foregroundMuted">{new Date(span.startTime).toLocaleString()}</Text.H5>
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
