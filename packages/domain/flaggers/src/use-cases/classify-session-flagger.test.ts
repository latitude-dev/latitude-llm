import { AI_GENERATE_TELEMETRY_TAGS } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { CacheStore, ChSqlClient, FlaggerId, generateId, OrganizationId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { SessionRepository, SpanRepository } from "@domain/spans"
import { createFakeSessionRepository, createFakeSpanRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Flagger } from "../entities/flagger.ts"
import { assistant, makeSessionDetail, user } from "../flagger-strategies/test-helpers.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"
import { createFakeFlaggerRepository } from "../testing/fake-flagger-repository.ts"
import { classifySessionFlaggerUseCase } from "./classify-session-flagger.ts"

const INPUT = {
  organizationId: "a".repeat(24),
  projectId: "b".repeat(24),
  sessionId: "session-1",
  flaggerSlug: "jailbreaking",
}

// Entry-point gating: these guards run before any repository or AI work, so
// every fake below dies if touched.
const dyingLayers = (flaggerRepo?: ReturnType<typeof createFakeFlaggerRepository>["repository"]) => {
  const { repository: sessionRepo } = createFakeSessionRepository({
    findBySessionId: () => Effect.die("session must not be loaded"),
  })
  const { repository: spanRepo } = createFakeSpanRepository({
    findLatestOutputTraceId: () => Effect.die("spans must not be queried"),
  })
  const { layer: aiLayer } = createFakeAI({ generate: () => Effect.die("AI must not be called") })
  const { repository: defaultFlaggerRepo } = createFakeFlaggerRepository([], {
    findByProjectAndSlug: () => Effect.die("flagger row must not be read"),
  })

  return Layer.mergeAll(
    Layer.succeed(SessionRepository, sessionRepo),
    Layer.succeed(SpanRepository, spanRepo),
    Layer.succeed(FlaggerRepository, flaggerRepo ?? defaultFlaggerRepo),
    Layer.succeed(CacheStore, {
      get: () => Effect.succeed(null),
      set: () => Effect.void,
      delete: () => Effect.void,
    }),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(INPUT.organizationId) })),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(INPUT.organizationId) })),
    aiLayer,
  )
}

describe("classifySessionFlaggerUseCase gating", () => {
  it("returns not applicable for an unknown slug without touching repositories or AI", async () => {
    const result = await Effect.runPromise(
      classifySessionFlaggerUseCase({ ...INPUT, flaggerSlug: "not-a-real-flagger" }).pipe(
        Effect.provide(dyingLayers()),
      ),
    )

    expect(result).toEqual({ matched: false, outcome: "notApplicable" })
  })

  it("returns not applicable for the legacy resource-outliers slug without touching repositories or AI", async () => {
    const result = await Effect.runPromise(
      classifySessionFlaggerUseCase({ ...INPUT, flaggerSlug: "resource-outliers" }).pipe(Effect.provide(dyingLayers())),
    )

    expect(result).toEqual({ matched: false, outcome: "notApplicable" })
  })

  it("returns not applicable for a deterministic-only slug without touching repositories or AI", async () => {
    const result = await Effect.runPromise(
      classifySessionFlaggerUseCase({ ...INPUT, flaggerSlug: "empty-response" }).pipe(Effect.provide(dyingLayers())),
    )

    expect(result).toEqual({ matched: false, outcome: "notApplicable" })
  })

  it("returns not applicable when the flagger is disabled, without loading the session or calling AI", async () => {
    const { repository: disabledFlaggerRepo } = createFakeFlaggerRepository([], {
      findByProjectAndSlug: () =>
        Effect.succeed({
          id: FlaggerId(generateId()),
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          slug: "jailbreaking",
          enabled: false,
          sampling: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Flagger),
    })

    const result = await Effect.runPromise(
      classifySessionFlaggerUseCase(INPUT).pipe(Effect.provide(dyingLayers(disabledFlaggerRepo))),
    )

    expect(result).toEqual({ matched: false, outcome: "notApplicable" })
  })

  it.each([
    { tags: [...AI_GENERATE_TELEMETRY_TAGS.flaggerClassify], label: "flagger.classify" },
    { tags: [...AI_GENERATE_TELEMETRY_TAGS.taxonomyProposeThemes], label: "taxonomy:propose-themes" },
  ])("returns not applicable for frustration on a $label session without calling AI", async ({ tags }) => {
    const session = makeSessionDetail(
      [
        user("I just honestly don't understand why you couldn't get this done for me — nested sample wording"),
        assistant('{"matched":true,"feedback":"task not completed","messageIndex":"2"}'),
      ],
      { tags },
    )
    const { repository: sessionRepo } = createFakeSessionRepository({
      findBySessionId: () => Effect.succeed(session),
    })
    const { repository: spanRepo } = createFakeSpanRepository({
      findLatestOutputTraceId: () => Effect.die("spans must not be queried for single-trace sessions"),
    })
    const { repository: flaggerRepo } = createFakeFlaggerRepository([], {
      findByProjectAndSlug: () =>
        Effect.succeed({
          id: FlaggerId(generateId()),
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          slug: "frustration",
          enabled: true,
          sampling: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Flagger),
    })
    const { layer: aiLayer } = createFakeAI({
      generate: () => Effect.die("AI must not be called for user-centric nested-sample traces"),
    })

    const result = await Effect.runPromise(
      classifySessionFlaggerUseCase({ ...INPUT, flaggerSlug: "frustration" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SessionRepository, sessionRepo),
            Layer.succeed(SpanRepository, spanRepo),
            Layer.succeed(FlaggerRepository, flaggerRepo),
            Layer.succeed(CacheStore, {
              get: () => Effect.succeed(null),
              set: () => Effect.void,
              delete: () => Effect.void,
            }),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(INPUT.organizationId) })),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(INPUT.organizationId) })),
            aiLayer,
          ),
        ),
      ),
    )

    expect(result).toEqual({ matched: false, outcome: "notApplicable" })
  })
})

describe("classifySessionFlaggerUseCase task-success verdicts", () => {
  const SESSION = makeSessionDetail(
    [
      user("Cancel my subscription and confirm the last billing date."),
      assistant("Cancelled. Your last billing date was 3 March."),
    ],
    { systemInstructions: [{ type: "text", content: "You are a billing support agent." }] },
  )

  const classify = (classification: unknown) => {
    const { repository: sessionRepo } = createFakeSessionRepository({
      findBySessionId: () => Effect.succeed(SESSION),
    })
    const { repository: spanRepo } = createFakeSpanRepository({
      findLatestOutputTraceId: () => Effect.die("spans must not be queried for single-trace sessions"),
    })
    const { repository: flaggerRepo } = createFakeFlaggerRepository([], {
      findByProjectAndSlug: () =>
        Effect.succeed({
          id: FlaggerId(generateId()),
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          slug: "task-success",
          enabled: true,
          sampling: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Flagger),
    })
    const { layer: aiLayer } = createFakeAI({
      generate: <T>(input: { readonly system?: string }) =>
        Effect.succeed({
          object: ((input.system?.includes("adversarial quality reviewer") ?? false)
            ? { annotationMakesSense: true }
            : classification) as T,
          tokens: 20,
          duration: 90_000_000,
        }),
    })

    return Effect.runPromise(
      classifySessionFlaggerUseCase({ ...INPUT, flaggerSlug: "task-success" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SessionRepository, sessionRepo),
            Layer.succeed(SpanRepository, spanRepo),
            Layer.succeed(FlaggerRepository, flaggerRepo),
            Layer.succeed(CacheStore, {
              get: () => Effect.succeed(null),
              set: () => Effect.void,
              delete: () => Effect.void,
            }),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(INPUT.organizationId) })),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(INPUT.organizationId) })),
            aiLayer,
          ),
        ),
      ),
    )
  }

  it("carries persistence anchors on success even though it writes no annotation", async () => {
    const result = await classify({
      verdict: "success",
      explanation: "The subscription was cancelled and the billing date confirmed.",
      messageIndex: "1",
    })

    expect(result).toMatchObject({
      matched: false,
      outcome: "success",
      feedback: "The subscription was cancelled and the billing date confirmed.",
      messageIndex: 1,
      simulationId: null,
    })
    expect(result).toHaveProperty("contentHash", expect.any(String))
    expect(result).toHaveProperty("latestTraceId", expect.any(String))
  })

  it("reports failure as a match so the annotation path stays unchanged", async () => {
    const result = await classify({
      verdict: "failure",
      explanation: "The cancellation never happened and the user asked twice.",
      messageIndex: "1",
    })

    expect(result).toMatchObject({ matched: true, outcome: "failure" })
    expect(result).toHaveProperty("contentHash", expect.any(String))
  })

  it.each(["indeterminate", "notApplicable"])("keeps %s free of persistence anchors", async (verdict) => {
    const result = await classify({ verdict, explanation: "Nothing to judge here." })

    expect(result).toEqual({ matched: false, outcome: verdict })
  })
})
