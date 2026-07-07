import { AIError } from "@domain/ai"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  authorizeBillableActionMock,
  draftFlaggerAnnotationWithBillingUseCaseMock,
  loggerErrorMock,
  loggerInfoMock,
  noCreditsRemainingErrorClass,
  runFlaggerUseCaseMock,
  saveFlaggerAnnotationUseCaseMock,
} = vi.hoisted(() => {
  class NoCreditsRemainingError extends Error {
    readonly _tag = "NoCreditsRemainingError"
  }

  return {
    authorizeBillableActionMock: vi.fn(),
    draftFlaggerAnnotationWithBillingUseCaseMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    noCreditsRemainingErrorClass: NoCreditsRemainingError,
    runFlaggerUseCaseMock: vi.fn(),
    saveFlaggerAnnotationUseCaseMock: vi.fn(),
  }
})

vi.mock("@domain/billing", () => ({
  BillingSpendReservation: { key: "BillingSpendReservation" },
  NoCreditsRemainingError: noCreditsRemainingErrorClass,
  authorizeBillableAction: authorizeBillableActionMock,
  buildBillingIdempotencyKey: (action: string, parts: readonly string[]) => [action, ...parts].join(":"),
  makeAIMeteringScope: vi.fn((input: { organizationId: string }) =>
    Effect.succeed({ organizationId: input.organizationId, record: () => Effect.void }),
  ),
  provideAIMeteringScope: () => (effect: unknown) => effect,
}))

vi.mock("@platform/cache-redis", () => ({
  RedisBillingSpendReservationLive: () => Layer.empty,
  RedisCacheStoreLive: () => Layer.empty,
}))

vi.mock("@domain/queue", () => ({
  QueuePublisher: { key: "QueuePublisher" },
}))

vi.mock("@domain/flaggers", () => ({
  draftFlaggerAnnotationWithBillingUseCase: draftFlaggerAnnotationWithBillingUseCaseMock,
  runFlaggerUseCase: runFlaggerUseCaseMock,
  saveFlaggerAnnotationUseCase: saveFlaggerAnnotationUseCaseMock,
}))

vi.mock("@platform/ai", () => ({
  AIEmbedLive: {},
  AIGenerateLive: {},
  AIRerankLive: {},
  withAi: () => (effect: unknown) => effect,
}))

vi.mock("@platform/db-clickhouse", () => ({
  ScoreAnalyticsRepositoryLive: {},
  SpanRepositoryLive: {},
  TraceRepositoryLive: {},
  withClickHouse: () => (effect: unknown) => effect,
}))

vi.mock("@platform/db-postgres", () => ({
  BillingOverrideRepositoryLive: {},
  BillingUsageEventRepositoryLive: {},
  BillingUsagePeriodRepositoryLive: {},
  FlaggerRepositoryLive: {},
  OutboxEventWriterLive: {},
  SettingsReaderLive: {},
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
    authorizeBillableActionMock.mockReturnValue(
      Effect.succeed({ allowed: true, period: null, context: { planSlug: "pro" } }),
    )
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

  it("skips the flagger run without executing when billing blocks it", async () => {
    authorizeBillableActionMock.mockReturnValueOnce(
      Effect.succeed({ allowed: false, period: null, context: { planSlug: "free" } }),
    )

    const result = await runFlagger({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "refusal",
    })

    expect(result).toEqual({ matched: false })
    expect(runFlaggerUseCaseMock).not.toHaveBeenCalled()
  })

  it("propagates AI errors for retry", async () => {
    const providerError = new AIError({
      message: "AI generation failed: Bedrock throttled the request.",
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
    draftFlaggerAnnotationWithBillingUseCaseMock.mockReturnValueOnce(Effect.fail(providerError))

    const error = await draftAnnotate({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "frustration",
    }).catch((thrown) => thrown)

    expect(error).toBe(providerError)
    expect(loggerErrorMock).toHaveBeenCalledTimes(1)
  })

  it("logs info instead of error when blocked by billing limit", async () => {
    const noCredits = new noCreditsRemainingErrorClass("Billing limit reached")
    draftFlaggerAnnotationWithBillingUseCaseMock.mockReturnValueOnce(Effect.fail(noCredits))

    const error = await draftAnnotate({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "frustration",
    }).catch((thrown) => thrown)

    expect(error).toBe(noCredits)
    expect(loggerInfoMock).toHaveBeenCalledTimes(1)
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })
})
