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
  it("returns { matched: false } for an unknown slug without touching repositories or AI", async () => {
    const result = await Effect.runPromise(
      classifySessionFlaggerUseCase({ ...INPUT, flaggerSlug: "not-a-real-flagger" }).pipe(
        Effect.provide(dyingLayers()),
      ),
    )

    expect(result).toEqual({ matched: false })
  })

  it("returns { matched: false } for the legacy resource-outliers slug without touching repositories or AI", async () => {
    const result = await Effect.runPromise(
      classifySessionFlaggerUseCase({ ...INPUT, flaggerSlug: "resource-outliers" }).pipe(Effect.provide(dyingLayers())),
    )

    expect(result).toEqual({ matched: false })
  })

  it("returns { matched: false } for a deterministic-only slug without touching repositories or AI", async () => {
    const result = await Effect.runPromise(
      classifySessionFlaggerUseCase({ ...INPUT, flaggerSlug: "empty-response" }).pipe(Effect.provide(dyingLayers())),
    )

    expect(result).toEqual({ matched: false })
  })

  it("returns { matched: false } when the flagger is disabled, without loading the session or calling AI", async () => {
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

    expect(result).toEqual({ matched: false })
  })

  it("returns { matched: false } for frustration on a flagger.classify session without calling AI", async () => {
    const session = makeSessionDetail(
      [
        user("as I already asked you previously — nested prior-instruction restatement inside classify evidence"),
        assistant('{"matched":true,"feedback":"user repeated prior instruction","messageIndex":"2"}'),
      ],
      { tags: [...AI_GENERATE_TELEMETRY_TAGS.flaggerClassify] },
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
      generate: () => Effect.die("AI must not be called for user-centric reflag"),
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

    expect(result).toEqual({ matched: false })
  })
})
