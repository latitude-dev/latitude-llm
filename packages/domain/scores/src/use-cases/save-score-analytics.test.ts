import { annotationScoreSchema, ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { ChSqlClient, OrganizationId, ProjectId, ScoreId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "../testing/index.ts"
import { syncScoreAnalyticsUseCase } from "./save-score-analytics.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = ProjectId("pppppppppppppppppppppppp")
const scoreId = ScoreId("ssssssssssssssssssssssss")

const score = annotationScoreSchema.parse({
  id: scoreId,
  organizationId,
  projectId,
  sessionId: "chat-1",
  traceId: "11111111111111111111111111111111",
  spanId: "1111111111111111",
  simulationId: null,
  signalId: "iiiiiiiiiiiiiiiiiiiiiiii",
  sourceType: "annotation",
  sourceId: "API",
  value: 0,
  passed: true,
  feedback: "Incorrect response",
  metadata: { rawFeedback: "Incorrect response" },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  annotatorId: null,
  createdAt: new Date("2026-09-20T12:00:00.000Z"),
  updatedAt: new Date("2026-09-21T12:00:00.000Z"),
})

describe("syncScoreAnalyticsUseCase", () => {
  it("replaces an existing analytics row when the score was reassigned to a signal", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: analyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const deleteCalls: string[] = []
    const insertCalls: string[] = []
    scores.set(score.id, score)
    inserted.push(score.id)

    await Effect.runPromise(
      syncScoreAnalyticsUseCase({ organizationId, scoreId: score.id }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(ScoreAnalyticsRepository, {
          ...analyticsRepository,
          delete: (id) => {
            deleteCalls.push(id)
            return analyticsRepository.delete(id)
          },
          insert: (next) => {
            insertCalls.push(next.id)
            return analyticsRepository.insert(next)
          },
        }),
        Effect.provideService(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
      ),
    )

    expect(deleteCalls).toEqual([score.id])
    expect(insertCalls).toEqual([score.id])
    expect(inserted).toEqual([score.id])
  })
})
