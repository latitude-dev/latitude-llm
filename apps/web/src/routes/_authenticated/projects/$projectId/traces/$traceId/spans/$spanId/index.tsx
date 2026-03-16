import { Button, Container, Text } from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useSpanDetail } from "../../../../../../../../domains/spans/spans.collection.ts"
import { toUserMessage } from "../../../../../../../../lib/errors.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectId/traces/$traceId/spans/$spanId/")({
  component: SpanDetailPage,
})

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H5>{value || "—"}</Text.H5>
    </div>
  )
}

function JsonBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null

  let formatted: string
  try {
    formatted = JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    formatted = value
  }

  return (
    <div className="flex flex-col gap-1">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <pre className="overflow-auto rounded bg-muted p-3 text-xs">{formatted}</pre>
    </div>
  )
}

function DataBlock({ label, data }: { label: string; data: readonly object[] | Readonly<Record<string, unknown>> }) {
  const isEmpty = Array.isArray(data) ? data.length === 0 : Object.keys(data).length === 0
  if (isEmpty) return null

  return (
    <div className="flex flex-col gap-1">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <pre className="overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

function SpanDetailPage() {
  const { projectId, traceId, spanId } = Route.useParams()
  const { data: span, isLoading, error } = useSpanDetail({ traceId, spanId })

  if (error) {
    return (
      <Container>
        <div className="flex flex-col gap-4 py-8">
          <Text.H4 color="destructive">{toUserMessage(error)}</Text.H4>
          <Link to="/projects/$projectId/traces/$traceId/spans" params={{ projectId, traceId }}>
            <Button variant="outline">Back to spans</Button>
          </Link>
        </div>
      </Container>
    )
  }

  if (isLoading || !span) {
    return (
      <Container>
        <div className="py-8">
          <Text.H4>Loading...</Text.H4>
        </div>
      </Container>
    )
  }

  return (
    <Container>
      <div className="flex flex-col gap-6 py-8">
        <div className="flex flex-row items-center gap-4">
          <Link to="/projects/$projectId/traces/$traceId/spans" params={{ projectId, traceId }}>
            <Button variant="ghost" size="sm">
              <Text.H5>Back to spans</Text.H5>
            </Button>
          </Link>
          <Text.H2>{span.name}</Text.H2>
        </div>

        <div className="flex flex-col gap-6">
          <Text.H3>Identity</Text.H3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Trace ID" value={span.traceId} />
            <Field label="Span ID" value={span.spanId} />
            <Field label="Parent Span ID" value={span.parentSpanId} />
            <Field label="Session ID" value={span.sessionId} />
            <Field label="Organization ID" value={span.organizationId} />
            <Field label="Project ID" value={span.projectId} />
            <Field label="API Key ID" value={span.apiKeyId} />
          </div>

          <Text.H3>Metadata</Text.H3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Kind" value={span.kind.toUpperCase()} />
            <Field label="Status" value={span.statusCode.toUpperCase()} />
            <Field label="Status Message" value={span.statusMessage} />
            <Field label="Service Name" value={span.serviceName} />
            <Field label="Error Type" value={span.errorType} />
            <Field label="Start Time" value={span.startTime} />
            <Field label="End Time" value={span.endTime} />
            <Field label="Ingested At" value={span.ingestedAt} />
          </div>

          <Text.H3>GenAI</Text.H3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Operation" value={span.operation} />
            <Field label="Provider" value={span.provider} />
            <Field label="Model" value={span.model} />
            <Field label="Response Model" value={span.responseModel} />
            <Field label="Response ID" value={span.responseId} />
            <Field label="Finish Reasons" value={span.finishReasons.join(", ")} />
          </div>

          <Text.H3>Tokens</Text.H3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Input" value={String(span.tokensInput)} />
            <Field label="Output" value={String(span.tokensOutput)} />
            <Field label="Cache Read" value={String(span.tokensCacheRead)} />
            <Field label="Cache Create" value={String(span.tokensCacheCreate)} />
            <Field label="Reasoning" value={String(span.tokensReasoning)} />
          </div>

          <Text.H3>Cost (microcents)</Text.H3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Input" value={String(span.costInputMicrocents)} />
            <Field label="Output" value={String(span.costOutputMicrocents)} />
            <Field label="Total" value={String(span.costTotalMicrocents)} />
            <Field label="Estimated" value={span.costIsEstimated ? "Yes" : "No"} />
          </div>

          <Text.H3>Content Payloads</Text.H3>
          <div className="flex flex-col gap-4">
            <DataBlock label="Input Messages" data={span.inputMessages} />
            <DataBlock label="Output Messages" data={span.outputMessages} />
            <JsonBlock label="System Instructions" value={span.systemInstructions} />
            <JsonBlock label="Tool Definitions" value={span.toolDefinitions} />
          </div>

          <Text.H3>Attributes</Text.H3>
          <div className="flex flex-col gap-4">
            <DataBlock label="String Attributes" data={span.attrString} />
            <DataBlock label="Int Attributes" data={span.attrInt} />
            <DataBlock label="Float Attributes" data={span.attrFloat} />
            <DataBlock label="Bool Attributes" data={span.attrBool} />
            <DataBlock label="Resource" data={span.resourceString} />
          </div>

          <Text.H3>Scope</Text.H3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Scope Name" value={span.scopeName} />
            <Field label="Scope Version" value={span.scopeVersion} />
          </div>

          {span.eventsJson && (
            <>
              <Text.H3>Events</Text.H3>
              <JsonBlock label="Events JSON" value={span.eventsJson} />
            </>
          )}

          {span.linksJson && (
            <>
              <Text.H3>Links</Text.H3>
              <JsonBlock label="Links JSON" value={span.linksJson} />
            </>
          )}

          {span.tags.length > 0 && (
            <>
              <Text.H3>Tags</Text.H3>
              <Text.H5>{span.tags.join(", ")}</Text.H5>
            </>
          )}
        </div>
      </div>
    </Container>
  )
}
