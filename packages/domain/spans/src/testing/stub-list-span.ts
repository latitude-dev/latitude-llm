import {
  ExternalUserId,
  type OrganizationId,
  type ProjectId,
  type SessionId,
  SimulationId,
  type SpanId,
  type TraceId,
} from "@domain/shared"
import type { Span } from "../entities/span.ts"

/** Minimal {@link Span} row for tests (list / `findByTraceId` shape). */
export function stubListSpan(input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly sessionId: SessionId
  readonly spanId: SpanId
  readonly operation: Span["operation"]
  readonly startTime: Date
  readonly endTime: Date
}): Span {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    userId: ExternalUserId("user"),
    traceId: input.traceId,
    spanId: input.spanId,
    parentSpanId: "",
    apiKeyId: "",
    simulationId: SimulationId(""),
    name: "stub",
    serviceName: "stub",
    kind: "internal",
    statusCode: "ok",
    statusMessage: "",
    traceFlags: 0,
    traceState: "",
    errorType: "",
    tags: [],
    metadata: {},
    eventsJson: "",
    linksJson: "",
    operation: input.operation,
    provider: "",
    model: "",
    responseModel: "",
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    costIsEstimated: false,
    timeToFirstTokenNs: 0,
    isStreaming: false,
    responseId: "",
    finishReasons: [],
    attrString: {},
    attrInt: {},
    attrFloat: {},
    attrBool: {},
    resourceString: {},
    scopeName: "",
    scopeVersion: "",
    ingestedAt: new Date(0),
    startTime: input.startTime,
    endTime: input.endTime,
  }
}
