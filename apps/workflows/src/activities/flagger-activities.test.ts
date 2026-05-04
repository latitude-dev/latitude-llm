import { AIError } from "@domain/ai"
import { Effect } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  draftFlaggerAnnotationUseCaseMock,
  loggerErrorMock,
  loggerInfoMock,
  runFlaggerUseCaseMock,
  saveFlaggerAnnotationUseCaseMock,
} = vi.hoisted(() => ({
  draftFlaggerAnnotationUseCaseMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  runFlaggerUseCaseMock: vi.fn(),
  saveFlaggerAnnotationUseCaseMock: vi.fn(),
}))

vi.mock("@domain/flaggers", () => ({
  draftFlaggerAnnotationUseCase: draftFlaggerAnnotationUseCaseMock,
  runFlaggerUseCase: runFlaggerUseCaseMock,
  saveFlaggerAnnotationUseCase: saveFlaggerAnnotationUseCaseMock,
}))

vi.mock("@platform/ai", () => ({
  withAi: () => (effect: unknown) => effect,
}))

vi.mock("@platform/ai-vercel", () => ({
  AIGenerateLive: {},
}))

vi.mock("@platform/db-clickhouse", () => ({
  ScoreAnalyticsRepositoryLive: {},
  SpanRepositoryLive: {},
  TraceRepositoryLive: {},
  withClickHouse: () => (effect: unknown) => effect,
}))

vi.mock("@platform/db-postgres", () => ({
  AnnotationQueueItemRepositoryLive: {},
  AnnotationQueueRepositoryLive: {},
  BillingOverrideRepositoryLive: {},
  BillingUsageEventRepositoryLive: {},
  BillingUsagePeriodRepositoryLive: {},
  OutboxEventWriterLive: {},
  ScoreRepositoryLive: {},
  StripeSubscriptionLookupLive: {},
  withPostgres: () => (effect: unknown) => effect,
}))

vi.mock("@repo/observability", () => ({
  createLogger: () => ({ info: loggerInfoMock, error: loggerErrorMock }),
  withTracing: (effect: unknown) => effect,
}))

vi.mock("../clients.ts", () => ({
  getClickhouseClient: vi.fn(() => ({})),
  getPostgresClient: vi.fn(() => ({})),
  getQueuePublisher: vi.fn(async () => ({ publish: () => Effect.void, close: () => Effect.void })),
  getRedisClient: vi.fn(() => ({})),
}))

import { draftAnnotate, runFlagger } from "./flagger-activities.ts"

describe("flagger activities", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns flagger result on success", async () => {
    runFlaggerUseCaseMock.mockReturnValueOnce(Effect.succeed({ matched: true }))

    const result = await runFlagger({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "refusal",
    })

    expect(result).toEqual({ matched: true })
    expect(loggerInfoMock).toHaveBeenCalledTimes(1)
  })

  it("propagates AI errors for retry", async () => {
    const providerError = new AIError({
      message: "AI generation failed (amazon-bedrock/amazon.nova-2-lite-v1:0): Bedrock throttled the request.",
      cause: null,
    })
    runFlaggerUseCaseMock.mockReturnValueOnce(Effect.fail(providerError))

    const error = await runFlagger({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "refusal",
    }).catch((thrown) => thrown)

    expect(error).toBe(providerError)
  })

  it("logs error on draftAnnotate failure", async () => {
    const providerError = new AIError({
      message: "AI generation failed",
      cause: null,
    })
    draftFlaggerAnnotationUseCaseMock.mockReturnValueOnce(Effect.fail(providerError))

    const error = await draftAnnotate({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "frustration",
    }).catch((thrown) => thrown)

    expect(error).toBe(providerError)
    expect(loggerErrorMock).toHaveBeenCalledTimes(1)
  })
})
