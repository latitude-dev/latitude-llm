import {
  type SessionAnalysis,
  SessionAnalysisRepository,
  type SessionMomentLabel,
  SessionMomentLabelRepository,
  type SessionSemanticMoment,
  SessionSemanticMomentRepository,
} from "@domain/conversation-intelligence"
import { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import {
  SessionAnalysisRepositoryLive,
  SessionMomentLabelRepositoryLive,
  SessionSemanticMomentRepositoryLive,
} from "./session-intelligence-repositories.ts"

const ch = setupTestClickHouse()
const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const sessionId = SessionId("bulk-session")
const traceId = TraceId("t".repeat(32))
const cutoff = new Date("2026-01-02T00:00:00.000Z")

const analysis = (analysisHash: string, analysisStatus: SessionAnalysis["analysisStatus"], indexedAt: Date) => ({
  organizationId,
  projectId,
  sessionId,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  traceIds: [traceId],
  analysisHash,
  analysisStatus,
  statusReason: "",
  retentionDays: 90,
  indexedAt,
})

const moment = (momentId: string, indexedAt: Date): SessionSemanticMoment => ({
  organizationId,
  projectId,
  sessionId,
  analysisHash: "a".repeat(64),
  momentId,
  traceId,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  firstMessageIndex: 0,
  lastMessageIndex: 1,
  boundaryReason: "session_end",
  embedding: [],
  coherenceScore: 1,
  retentionDays: 90,
  indexedAt,
})

const label = (labelId: string, momentId: string, indexedAt: Date): SessionMomentLabel => ({
  organizationId,
  projectId,
  sessionId,
  analysisHash: "a".repeat(64),
  labelId,
  momentId,
  kind: "resolution",
  actor: "assistant",
  firstMessageIndex: 0,
  lastMessageIndex: 1,
  summary: "Resolved",
  evidence: "Done",
  confidence: 1,
  retentionDays: 90,
  indexedAt,
})

describe("session intelligence bulk reads", () => {
  it("reads all requested sessions at the calculation cutoff", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const analyses = yield* SessionAnalysisRepository
        const moments = yield* SessionSemanticMomentRepository
        const labels = yield* SessionMomentLabelRepository
        yield* analyses.upsert(analysis("a".repeat(64), "analyzed", new Date("2026-01-01T00:00:00.000Z")))
        yield* analyses.upsert(analysis("b".repeat(64), "failed", new Date("2026-01-03T00:00:00.000Z")))
        yield* moments.upsertMany([
          moment("before", new Date("2026-01-01T00:00:00.000Z")),
          moment("after", new Date("2026-01-03T00:00:00.000Z")),
        ])
        yield* labels.upsertMany([
          label("before", "before", new Date("2026-01-01T00:00:00.000Z")),
          label("after", "after", new Date("2026-01-03T00:00:00.000Z")),
        ])
        return yield* Effect.all({
          analyses: analyses.listLatestBySessions({
            organizationId,
            projectId,
            sessionIds: [sessionId],
            indexedAtTo: cutoff,
          }),
          moments: moments.listBySessions({ organizationId, projectId, sessionIds: [sessionId], indexedAtTo: cutoff }),
          labels: labels.listBySessions({ organizationId, projectId, sessionIds: [sessionId], indexedAtTo: cutoff }),
        })
      }).pipe(
        withClickHouse(
          Layer.mergeAll(
            SessionAnalysisRepositoryLive,
            SessionSemanticMomentRepositoryLive,
            SessionMomentLabelRepositoryLive,
          ),
          ch.client,
          organizationId,
        ),
      ),
    )

    expect(result.analyses.map(({ analysisHash }) => analysisHash)).toEqual(["a".repeat(64)])
    expect(result.moments.map(({ momentId }) => momentId)).toEqual(["before"])
    expect(result.labels.map(({ labelId }) => labelId)).toEqual(["before"])
  })
})
