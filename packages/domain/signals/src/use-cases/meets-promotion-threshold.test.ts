import {
  CacheStore,
  type CacheStoreShape,
  ChSqlClient,
  OrganizationId,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import type { ScoreRepositoryShape } from "@domain/scores"
import { SessionRepository } from "@domain/spans"
import { createFakeSessionRepository } from "@domain/spans/testing"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { PROMOTION_MIN_SESSIONS } from "../constants.ts"
import { meetsPromotionThresholdUseCase } from "./meets-promotion-threshold.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = "ssssssssssssssssssssssss"

const run = (input: {
  readonly sessions: number
  readonly projectSessions?: number
}) => {
  const countDistinctSessionsBySignalId = vi.fn<ScoreRepositoryShape["countDistinctSessionsBySignalId"]>(() =>
    Effect.succeed(input.sessions),
  )
  const { repository: scoreRepository } = createFakeScoreRepository({ countDistinctSessionsBySignalId })
  const { repository: sessionRepository } = createFakeSessionRepository({
    countByProjectId: () => Effect.succeed({ totalCount: input.projectSessions ?? 500 }),
  })
  const cache: CacheStoreShape = {
    get: () => Effect.succeed(String(input.projectSessions ?? 500)),
    set: () => Effect.void,
    delete: () => Effect.void,
  }

  return Effect.runPromise(
    meetsPromotionThresholdUseCase({ organizationId, projectId, signalId }).pipe(
      Effect.provideService(ScoreRepository, scoreRepository),
      Effect.provideService(CacheStore, cache),
      Effect.provideService(SessionRepository, sessionRepository),
      Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
    ),
  )
}

describe("meetsPromotionThresholdUseCase", () => {
  it("passes when distinct sessions reach the threshold", async () => {
    const result = await run({ sessions: PROMOTION_MIN_SESSIONS })

    expect(result.meets).toBe(true)
    expect(result.sessions).toBe(PROMOTION_MIN_SESSIONS)
  })

  it("fails when evidence dropped below the threshold", async () => {
    const result = await run({ sessions: PROMOTION_MIN_SESSIONS - 1 })

    expect(result.meets).toBe(false)
    expect(result.sessions).toBe(PROMOTION_MIN_SESSIONS - 1)
  })
})
