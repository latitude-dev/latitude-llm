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
import { Link, createFileRoute } from "@tanstack/react-router"
import { useSpansCollection } from "../../../../../domains/spans/spans.collection.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectId/spans/")({
  component: SpansPage,
})

function SpansPage() {
  const { projectId } = Route.useParams()
  const { data: spans } = useSpansCollection(projectId)

  return (
    <Container>
      <div className="flex flex-col gap-6 py-8">
        <div className="flex flex-row items-center gap-4">
          <Link to="/projects/$projectId" params={{ projectId }}>
            <Button variant="ghost" size="sm">
              <Text.H5>Back to project</Text.H5>
            </Button>
          </Link>
          <Text.H2>Spans</Text.H2>
        </div>

        <TableWithHeader
          title="Spans"
          table={
            !spans ? (
              <TableSkeleton cols={8} rows={5} />
            ) : spans.length === 0 ? (
              <TableBlankSlate description="No spans found for this project." />
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
                          to="/projects/$projectId/spans/$traceId/$spanId"
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
      </div>
    </Container>
  )
}
