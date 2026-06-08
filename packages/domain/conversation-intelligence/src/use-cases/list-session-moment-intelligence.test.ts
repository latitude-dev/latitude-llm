import { ChSqlClient, OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { TaxonomyObservationRepository, type TaxonomyObservationRepositoryShape } from "@domain/taxonomy"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { SessionAnalysis } from "../entities/session-analysis.ts"
import type { SessionSemanticMoment } from "../entities/session-semantic-moment.ts"
import { SessionAnalysisRepository } from "../ports/session-analysis-repository.ts"
import { SessionMomentLabelRepository } from "../ports/session-moment-label-repository.ts"
import { SessionSemanticMomentRepository } from "../ports/session-semantic-moment-repository.ts"
import {
  createFakeSessionAnalysisRepository,
  createFakeSessionMomentLabelRepository,
  createFakeSessionSemanticMomentRepository,
} from "../testing/index.ts"
import { listSessionMomentIntelligenceUseCase } from "./list-session-moment-intelligence.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const sessionId = SessionId("session-1")
const now = new Date("2026-06-01T12:00:00.000Z")

const CURRENT_HASH = "a".repeat(64)
const STALE_HASH = "b".repeat(64)

const makeAnalysis = (overrides: Partial<SessionAnalysis> = {}): SessionAnalysis => ({
  organizationId,
  projectId,
  sessionId,
  startTime: now,
  endTime: now,
  traceIds: [TraceId("t".repeat(32))],
  analysisHash: CURRENT_HASH,
  analysisStatus: "analyzed",
  statusReason: "",
  retentionDays: 90,
  indexedAt: now,
  ...overrides,
})

const makeMoment = (analysisHash: string, momentId: string): SessionSemanticMoment => ({
  organizationId,
  projectId,
  sessionId,
  analysisHash,
  momentId,
  traceId: TraceId("t".repeat(32)),
  startTime: now,
  endTime: now,
  firstMessageIndex: 0,
  lastMessageIndex: 1,
  boundaryReason: "session_start",
  embedding: [],
  coherenceScore: 1,
  retentionDays: 90,
  indexedAt: now,
})

const run = (analyses: readonly SessionAnalysis[], moments: readonly SessionSemanticMoment[]) =>
  Effect.runPromise(
    listSessionMomentIntelligenceUseCase({ organizationId, projectId, sessionId }).pipe(
      Effect.provide(
        Layer.succeed(SessionAnalysisRepository, createFakeSessionAnalysisRepository(analyses).repository),
      ),
      Effect.provide(
        Layer.succeed(SessionSemanticMomentRepository, createFakeSessionSemanticMomentRepository(moments).repository),
      ),
      Effect.provide(Layer.succeed(SessionMomentLabelRepository, createFakeSessionMomentLabelRepository().repository)),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      Effect.provide(
        Layer.succeed(TaxonomyObservationRepository, {
          listBySession: () => Effect.succeed([]),
        } as Partial<TaxonomyObservationRepositoryShape> as TaxonomyObservationRepositoryShape),
      ),
    ),
  )

describe("listSessionMomentIntelligenceUseCase generation pinning", () => {
  const bothGenerations = [makeMoment(STALE_HASH, "stale-moment"), makeMoment(CURRENT_HASH, "current-moment")]

  it("returns only the latest analyzed generation's moments", async () => {
    const result = await run([makeAnalysis()], bothGenerations)
    expect(result.moments.map((row) => row.moment.momentId)).toEqual(["current-moment"])
  })

  it("returns no moments when the latest analysis failed", async () => {
    // Prior generations are stale by definition once the content changed; a
    // failed re-analysis must not surface the union of every old run.
    const result = await run(
      [makeAnalysis({ analysisStatus: "failed", analysisHash: "0".repeat(64) })],
      bothGenerations,
    )
    expect(result.moments).toEqual([])
  })

  it("returns no moments when the latest analysis was skipped", async () => {
    const result = await run([makeAnalysis({ analysisStatus: "skipped_too_short" })], bothGenerations)
    expect(result.moments).toEqual([])
  })

  it("falls through unfiltered only when no analysis row exists", async () => {
    const result = await run([], bothGenerations)
    expect(result.moments).toHaveLength(2)
  })
})
