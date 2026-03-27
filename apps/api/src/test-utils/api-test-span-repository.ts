import { ProjectId, SessionId, SpanId } from "@domain/shared"
import { SpanRepository } from "@domain/spans"
import { createFakeSpanRepository, stubListSpan } from "@domain/spans/testing"
import { Effect, Layer } from "effect"

const placeholderProjectId = ProjectId("0".repeat(24))

const { repository: apiTestSpanRepository } = createFakeSpanRepository({
  findByTraceId: (input) =>
    Effect.succeed([
      stubListSpan({
        organizationId: input.organizationId,
        projectId: placeholderProjectId,
        traceId: input.traceId,
        sessionId: SessionId("session"),
        spanId: SpanId("cccccccccccccccc"),
        operation: "chat",
        startTime: new Date("2026-03-24T00:00:00.000Z"),
        endTime: new Date("2026-03-24T00:01:00.000Z"),
      }),
    ]),
})

export const apiTestSpanRepositoryLayer = Layer.succeed(SpanRepository, apiTestSpanRepository)
